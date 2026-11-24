"""
Queue / waiting-time predictor for the Campus Canteen.
Uses basic queuing theory (M/M/c model approximation) with
optional historical-data adjustments.
"""

from __future__ import annotations

import logging
import math
from typing import Any

from app.models.schemas import QueuePredictionResponse

logger = logging.getLogger(__name__)


class QueuePredictor:
    """Estimates customer wait time based on queue state and service rates."""

    def __init__(self) -> None:
        logger.info("QueuePredictor initialised")

    def predict_wait_time(
        self,
        outlet_id: str,
        active_orders: int,
        avg_prep_time: float,
        active_counters: int,
        historical_service_times: list[float] | None = None,
    ) -> QueuePredictionResponse:
        """
        Estimate wait time using simple queuing theory:
            base_wait = (active_orders × avg_prep_time) / active_counters

        When *historical_service_times* are provided, the average is
        blended in to refine the estimate.

        Parameters
        ----------
        outlet_id : str
        active_orders : int   – orders currently in the queue
        avg_prep_time : float – average prep time per order in **minutes**
        active_counters : int – number of active service counters (≥1)
        historical_service_times : list[float] | None
            Recent real service durations (minutes) for adjustment.

        Returns
        -------
        QueuePredictionResponse
        """
        active_counters = max(active_counters, 1)
        avg_prep = avg_prep_time

        # Blend with historical data when available
        if historical_service_times and len(historical_service_times) >= 5:
            hist_avg = sum(historical_service_times) / len(historical_service_times)
            # 60 % historical, 40 % supplied average
            avg_prep = 0.6 * hist_avg + 0.4 * avg_prep_time
            confidence = min(0.9, 0.5 + 0.05 * len(historical_service_times))
        else:
            confidence = 0.5

        # Simple multi-server queue formula
        # Each counter handles orders in parallel
        orders_per_counter = math.ceil(active_orders / active_counters)
        estimated_wait = round(orders_per_counter * avg_prep, 1)

        # Apply a small variability buffer (+10 %)
        estimated_wait = round(estimated_wait * 1.1, 1)

        return QueuePredictionResponse(
            outlet_id=outlet_id,
            estimated_wait=estimated_wait,
            queue_length=active_orders,
            confidence=round(confidence, 2),
            is_estimate=True,
        )
