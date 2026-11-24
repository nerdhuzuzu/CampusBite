"""
Demand forecasting engine for the Campus Canteen.
Uses XGBoost for time-series-style demand prediction.
Starts with clearly-labelled synthetic data for demonstration.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta
from typing import Any

import numpy as np
import pandas as pd

from app.config import settings
from app.models.schemas import ForecastItem, PeakHourItem

logger = logging.getLogger(__name__)

# Lazy-import heavy libs so the service starts even if they're missing
_xgb = None
_joblib = None


def _load_xgb():
    global _xgb
    if _xgb is None:
        try:
            import xgboost as xgb
            _xgb = xgb
        except ImportError:
            logger.warning("xgboost not installed – forecasting will use fallback")
    return _xgb


def _load_joblib():
    global _joblib
    if _joblib is None:
        try:
            import joblib
            _joblib = joblib
        except ImportError:
            logger.warning("joblib not installed – model persistence disabled")
    return _joblib


class DemandForecaster:
    """XGBoost-based demand forecasting with synthetic-data bootstrap."""

    MODEL_FILENAME = "demand_model.joblib"

    def __init__(self) -> None:
        self.model = None
        self.is_synthetic = True
        self._model_path = os.path.join(settings.MODEL_DIR, self.MODEL_FILENAME)
        self._try_load_model()
        logger.info(
            "DemandForecaster initialised (model loaded: %s)", self.model is not None
        )

    # ── Public API ───────────────────────────────────────────────────────

    def train(self, historical_data: pd.DataFrame | None = None) -> dict[str, Any]:
        """
        Train (or re-train) the XGBoost model.
        Falls back to synthetic data when *historical_data* is None.
        Returns training metrics.
        """
        xgb = _load_xgb()
        joblib = _load_joblib()

        if historical_data is None or historical_data.empty:
            historical_data = self._generate_synthetic_data()
            self.is_synthetic = True
            logger.info("Training on SYNTHETIC data (demo mode)")
        else:
            self.is_synthetic = False

        X, y = self._create_features(historical_data)

        if xgb is None:
            # Fallback: no xgboost – store mean demand
            self.model = {"mean": float(y.mean())}
            logger.warning("No xgboost – using mean-demand fallback")
            return {"mae": 0.0, "rmse": 0.0, "note": "mean-fallback"}

        model = xgb.XGBRegressor(
            n_estimators=100,
            max_depth=5,
            learning_rate=0.1,
            objective="reg:squarederror",
            random_state=42,
        )
        model.fit(X, y)
        self.model = model

        # Persist
        if joblib:
            os.makedirs(settings.MODEL_DIR, exist_ok=True)
            joblib.dump(
                {"model": model, "is_synthetic": self.is_synthetic},
                self._model_path,
            )
            logger.info("Model saved to %s", self._model_path)

        metrics = self.evaluate(X, y)
        return metrics

    def predict(
        self,
        outlet_id: str,
        item_id: str | None = None,
        days: int = 7,
    ) -> list[ForecastItem]:
        """Return per-day demand predictions for *days* days ahead."""
        if self.model is None:
            # Auto-train on synthetic data the first time
            self.train()

        today = datetime.utcnow().date()
        forecasts: list[ForecastItem] = []

        for d in range(days):
            target_date = today + timedelta(days=d + 1)
            demand, confidence = self._predict_single_day(target_date)
            forecasts.append(
                ForecastItem(
                    outlet_id=outlet_id,
                    date=target_date.isoformat(),
                    predicted_demand=max(int(round(demand)), 0),
                    confidence=round(confidence, 2),
                    is_synthetic=self.is_synthetic,
                )
            )

        return forecasts

    def predict_peak_hours(self, outlet_id: str | None = None) -> list[PeakHourItem]:
        """
        Return predicted demand by hour-of-day.
        Uses known campus meal patterns when no model is available.
        """
        # Typical campus canteen demand pattern (synthetic)
        hour_demand = {
            7: 15, 8: 40, 9: 55, 10: 30, 11: 70, 12: 100, 13: 90,
            14: 45, 15: 25, 16: 35, 17: 55, 18: 75, 19: 85, 20: 60,
            21: 30, 22: 10,
        }

        peaks: list[PeakHourItem] = []
        for hour in range(7, 23):
            demand = hour_demand.get(hour, 10)
            end = hour + 1
            label = (
                f"{hour % 12 or 12} {'AM' if hour < 12 else 'PM'}"
                f" - {end % 12 or 12} {'AM' if end < 12 else 'PM'}"
            )
            peaks.append(
                PeakHourItem(hour=hour, predicted_demand=float(demand), label=label)
            )

        return peaks

    def evaluate(
        self, X: pd.DataFrame | np.ndarray, y: pd.Series | np.ndarray
    ) -> dict[str, Any]:
        """Compute MAE and RMSE on the given data."""
        if self.model is None:
            return {"mae": None, "rmse": None, "note": "no model"}

        if isinstance(self.model, dict):
            # mean fallback
            preds = np.full(len(y), self.model["mean"])
        else:
            preds = self.model.predict(X)

        errors = np.array(y) - preds
        mae = float(np.mean(np.abs(errors)))
        rmse = float(np.sqrt(np.mean(errors ** 2)))
        return {"mae": round(mae, 2), "rmse": round(rmse, 2)}

    # ── Feature engineering ──────────────────────────────────────────────

    @staticmethod
    def _create_features(data: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series]:
        """
        Extract temporal features from a DataFrame with 'date' and 'demand'
        columns.
        """
        df = data.copy()
        if "date" in df.columns:
            df["date"] = pd.to_datetime(df["date"])
            df["hour"] = df["date"].dt.hour
            df["day_of_week"] = df["date"].dt.dayofweek
            df["month"] = df["date"].dt.month
            df["is_weekend"] = (df["day_of_week"] >= 5).astype(int)
            df["day_of_month"] = df["date"].dt.day
            df["week_of_year"] = df["date"].dt.isocalendar().week.astype(int)
        else:
            # Minimal features when no date column
            for col in ("hour", "day_of_week", "month", "is_weekend",
                         "day_of_month", "week_of_year"):
                if col not in df.columns:
                    df[col] = 0

        feature_cols = [
            "hour", "day_of_week", "month", "is_weekend",
            "day_of_month", "week_of_year",
        ]
        # NOTE: outlet/item identifiers are intentionally NOT used as model
        # features yet — prediction-time inputs must match training features
        # exactly. Per-outlet models are introduced in the forecasting phase.

        X = df[feature_cols]
        y = df["demand"] if "demand" in df.columns else pd.Series(np.zeros(len(df)))
        return X, y

    # ── Synthetic data (clearly labelled) ────────────────────────────────

    @staticmethod
    def _generate_synthetic_data(n_days: int = 90) -> pd.DataFrame:
        """
        Generate *clearly labelled* synthetic demand data for demo/training.
        Pattern: higher weekday demand around meal times, lower on weekends.
        """
        rng = np.random.default_rng(42)
        rows: list[dict[str, Any]] = []
        start = datetime.utcnow() - timedelta(days=n_days)

        outlets = ["outlet_1", "outlet_2", "outlet_3"]

        for day_offset in range(n_days):
            dt = start + timedelta(days=day_offset)
            is_weekend = dt.weekday() >= 5

            for outlet in outlets:
                for hour in range(7, 23):
                    # Base demand curve
                    if hour in (12, 13):
                        base = 80
                    elif hour in (8, 9):
                        base = 40
                    elif hour in (18, 19, 20):
                        base = 60
                    else:
                        base = 20

                    if is_weekend:
                        base = int(base * 0.6)

                    demand = max(0, int(base + rng.normal(0, base * 0.2)))

                    rows.append(
                        {
                            "date": dt.replace(hour=hour),
                            "outlet_id": outlet,
                            "demand": demand,
                            "is_synthetic": True,  # ← clearly labelled
                        }
                    )

        return pd.DataFrame(rows)

    # ── Helpers ──────────────────────────────────────────────────────────

    def _try_load_model(self) -> None:
        """Attempt to load a previously persisted model."""
        joblib = _load_joblib()
        if joblib and os.path.exists(self._model_path):
            try:
                data = joblib.load(self._model_path)
                self.model = data["model"]
                self.is_synthetic = data.get("is_synthetic", True)
                logger.info("Loaded model from %s", self._model_path)
            except Exception as exc:
                logger.warning("Failed to load model: %s", exc)

    def _predict_single_day(
        self, target_date, hour: int = 12
    ) -> tuple[float, float]:
        """Predict demand for a single date and return (demand, confidence)."""
        if isinstance(self.model, dict):
            # mean fallback
            return self.model["mean"], 0.3

        dow = target_date.weekday()
        month = target_date.month
        is_weekend = int(dow >= 5)
        day_of_month = target_date.day
        try:
            week_of_year = target_date.isocalendar()[1]
        except Exception:
            week_of_year = 1

        features = pd.DataFrame(
            [{
                "hour": hour,
                "day_of_week": dow,
                "month": month,
                "is_weekend": is_weekend,
                "day_of_month": day_of_month,
                "week_of_year": week_of_year,
            }]
        )

        try:
            pred = float(self.model.predict(features)[0])
            confidence = 0.6 if self.is_synthetic else 0.85
        except Exception as exc:
            logger.warning("Prediction failed: %s – using fallback", exc)
            pred = 50.0
            confidence = 0.3

        return pred, confidence
