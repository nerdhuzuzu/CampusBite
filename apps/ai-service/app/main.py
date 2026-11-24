"""
Campus Canteen AI Service — FastAPI Application Entry Point.

Provides endpoints for:
- Food recommendations
- Demand forecasting
- Crowd detection
- Queue/wait-time prediction
- AI chatbot
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.middleware.auth import verify_service_auth
from app.models.schemas import (
    ChatRequest,
    ChatResponse,
    CrowdDetectionRequest,
    CrowdDetectionResponse,
    ForecastRequest,
    ForecastResponse,
    HealthResponse,
    PeakHourResponse,
    QueuePredictionRequest,
    QueuePredictionResponse,
    RecommendationRequest,
    RecommendationResponse,
)
from app.recommendations.engine import RecommendationEngine
from app.forecasting.engine import DemandForecaster
from app.crowd_detection.detector import CrowdDetector
from app.queue_prediction.predictor import QueuePredictor
from app.chatbot.engine import ChatbotEngine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Global engine instances ──────────────────────────────────────────────────

recommendation_engine: RecommendationEngine | None = None
demand_forecaster: DemandForecaster | None = None
crowd_detector: CrowdDetector | None = None
queue_predictor: QueuePredictor | None = None
chatbot_engine: ChatbotEngine | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize ML engines on startup."""
    global recommendation_engine, demand_forecaster, crowd_detector
    global queue_predictor, chatbot_engine

    logger.info("Initializing AI engines...")
    recommendation_engine = RecommendationEngine()
    demand_forecaster = DemandForecaster()
    crowd_detector = CrowdDetector()
    queue_predictor = QueuePredictor()
    chatbot_engine = ChatbotEngine()
    logger.info("All AI engines initialized successfully")

    yield

    logger.info("Shutting down AI service")


# ── FastAPI app ──────────────────────────────────────────────────────────────

app = FastAPI(
    title="Campus Canteen AI Service",
    description="AI/ML microservice for food recommendations, demand forecasting, crowd detection, queue prediction, and chatbot.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Backend-to-service; not directly exposed to browsers
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health ───────────────────────────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint (no auth required)."""
    return HealthResponse(
        status="healthy",
        version="1.0.0",
        models_loaded={
            "recommendation": recommendation_engine is not None,
            "forecasting": demand_forecaster is not None,
            "crowd_detection": crowd_detector is not None and not crowd_detector.using_simulation,
            "queue_prediction": queue_predictor is not None,
            "chatbot": chatbot_engine is not None,
        },
    )


# ── Recommendations ─────────────────────────────────────────────────────────

@app.post(
    "/recommendations",
    response_model=RecommendationResponse,
    dependencies=[Depends(verify_service_auth)],
)
async def get_recommendations(req: RecommendationRequest):
    """Get personalized food recommendations."""
    # In production, the backend would send menu_items and order_history
    # For now, return fallback recommendations
    items, is_fallback = recommendation_engine.get_recommendations(
        user_data={"user_id": req.user_id},
        menu_items=[],  # Will be populated by backend
        order_history=None,
        preferences=req.preferences,
        dietary_type=req.dietary_type,
        budget=req.budget,
        limit=req.limit,
    )
    return RecommendationResponse(
        recommendations=items,
        is_fallback=is_fallback,
    )


# ── Forecasting ─────────────────────────────────────────────────────────────

@app.get(
    "/forecast/outlet/{outlet_id}",
    response_model=ForecastResponse,
    dependencies=[Depends(verify_service_auth)],
)
async def forecast_outlet(outlet_id: str, days: int = 7):
    """Get demand forecast for a specific outlet."""
    forecasts = demand_forecaster.predict(
        outlet_id=outlet_id,
        days=min(days, 30),
    )
    return ForecastResponse(
        forecasts=forecasts,
        model_version="synthetic-v1" if demand_forecaster.is_synthetic else "trained-v1",
    )


@app.get(
    "/forecast/item/{item_id}",
    response_model=ForecastResponse,
    dependencies=[Depends(verify_service_auth)],
)
async def forecast_item(item_id: str, outlet_id: str = "unknown", days: int = 7):
    """Get demand forecast for a specific menu item."""
    forecasts = demand_forecaster.predict(
        outlet_id=outlet_id,
        item_id=item_id,
        days=min(days, 30),
    )
    return ForecastResponse(
        forecasts=forecasts,
        model_version="synthetic-v1" if demand_forecaster.is_synthetic else "trained-v1",
    )


@app.get(
    "/forecast/peak-hours",
    response_model=PeakHourResponse,
    dependencies=[Depends(verify_service_auth)],
)
async def forecast_peak_hours(outlet_id: str | None = None):
    """Get predicted peak hours."""
    peaks = demand_forecaster.predict_peak_hours(outlet_id)
    return PeakHourResponse(
        outlet_id=outlet_id,
        peak_hours=peaks,
        is_synthetic=demand_forecaster.is_synthetic,
    )


# ── Crowd Detection ─────────────────────────────────────────────────────────

@app.post(
    "/crowd/detect",
    response_model=CrowdDetectionResponse,
    dependencies=[Depends(verify_service_auth)],
)
async def detect_crowd(req: CrowdDetectionRequest):
    """Detect crowd level from image or return simulation."""
    if req.image_base64:
        return crowd_detector.detect_from_base64(req.image_base64, req.outlet_id)
    return crowd_detector.simulate_crowd(req.outlet_id)


@app.get(
    "/crowd/{outlet_id}",
    response_model=CrowdDetectionResponse,
    dependencies=[Depends(verify_service_auth)],
)
async def get_crowd(outlet_id: str):
    """Get current crowd level for an outlet (simulated if no camera)."""
    return crowd_detector.simulate_crowd(outlet_id)


# ── Queue Prediction ────────────────────────────────────────────────────────

@app.post(
    "/queue/predict",
    response_model=QueuePredictionResponse,
    dependencies=[Depends(verify_service_auth)],
)
async def predict_queue(req: QueuePredictionRequest):
    """Predict queue wait time for an outlet."""
    return queue_predictor.predict_wait_time(
        outlet_id=req.outlet_id,
        active_orders=req.active_orders,
        avg_prep_time=req.avg_prep_time,
        active_counters=req.active_counters,
    )


@app.get(
    "/queue/{outlet_id}",
    response_model=QueuePredictionResponse,
    dependencies=[Depends(verify_service_auth)],
)
async def get_queue(outlet_id: str):
    """Get queue prediction with default values (for dashboard widgets)."""
    return queue_predictor.predict_wait_time(
        outlet_id=outlet_id,
        active_orders=0,
        avg_prep_time=10.0,
        active_counters=1,
    )


# ── Chatbot ──────────────────────────────────────────────────────────────────

@app.post(
    "/chat",
    response_model=ChatResponse,
    dependencies=[Depends(verify_service_auth)],
)
async def chat(req: ChatRequest):
    """Process a chatbot message."""
    history = None
    if req.conversation_history:
        history = [
            {"role": m.role, "content": m.content}
            for m in req.conversation_history
        ]
    return await chatbot_engine.process_message(
        message=req.message,
        user_id=req.user_id,
        conversation_history=history,
    )
