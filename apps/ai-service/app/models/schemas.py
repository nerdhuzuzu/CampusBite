"""
Pydantic request / response models for every AI-service endpoint.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


# ── Recommendations ──────────────────────────────────────────────────────────

class RecommendationRequest(BaseModel):
    user_id: str
    preferences: Optional[dict[str, Any]] = None
    dietary_type: Optional[str] = None  # veg, non-veg, vegan, etc.
    budget: Optional[float] = None
    limit: int = Field(default=10, ge=1, le=50)


class RecommendationItem(BaseModel):
    item_id: str
    item_name: str
    outlet: str
    price: float
    score: float = Field(ge=0.0, le=1.0)
    explanation: str


class RecommendationResponse(BaseModel):
    recommendations: list[RecommendationItem]
    is_fallback: bool = False


# ── Demand Forecasting ───────────────────────────────────────────────────────

class ForecastRequest(BaseModel):
    outlet_id: str
    item_id: Optional[str] = None
    days: int = Field(default=7, ge=1, le=30)


class ForecastItem(BaseModel):
    outlet_id: str
    date: str
    predicted_demand: int
    confidence: float = Field(ge=0.0, le=1.0)
    is_synthetic: bool = True  # True when model is trained on synthetic data


class ForecastResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    forecasts: list[ForecastItem]
    model_version: str = "synthetic-v1"


class PeakHourItem(BaseModel):
    hour: int
    predicted_demand: float
    label: str  # e.g. "11 AM - 12 PM"


class PeakHourResponse(BaseModel):
    outlet_id: Optional[str] = None
    peak_hours: list[PeakHourItem]
    is_synthetic: bool = True


# ── Crowd Detection ──────────────────────────────────────────────────────────

class CrowdDetectionRequest(BaseModel):
    outlet_id: str
    image_base64: Optional[str] = None
    video_path: Optional[str] = None


class CrowdDetectionResponse(BaseModel):
    outlet_id: str
    people_count: int
    crowd_level: str  # LOW, MEDIUM, HIGH
    is_simulated: bool = False
    timestamp: datetime = Field(default_factory=datetime.utcnow)


# ── Queue / Wait-time Prediction ─────────────────────────────────────────────

class QueuePredictionRequest(BaseModel):
    outlet_id: str
    active_orders: int = Field(ge=0)
    avg_prep_time: float = Field(ge=0.0, description="Average prep time in minutes")
    active_counters: int = Field(ge=1)


class QueuePredictionResponse(BaseModel):
    outlet_id: str
    estimated_wait: float  # minutes
    queue_length: int
    confidence: float = Field(ge=0.0, le=1.0)
    is_estimate: bool = True


# ── Chatbot ──────────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str  # user | assistant
    content: str


class ChatRequest(BaseModel):
    user_id: str
    message: str
    conversation_history: Optional[list[ChatMessage]] = None


class ToolCall(BaseModel):
    name: str
    arguments: dict[str, Any]
    result: Optional[Any] = None


class ChatResponse(BaseModel):
    response: str
    tool_calls: Optional[list[ToolCall]] = None
    suggested_questions: Optional[list[str]] = None


# ── Health ───────────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    status: str
    version: str
    models_loaded: dict[str, bool]
