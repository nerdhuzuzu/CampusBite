"""
Configuration settings for the Campus Canteen AI Service.
Uses pydantic-settings for environment variable management.
"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables or .env file."""

    # Authentication
    AI_SERVICE_SECRET: str = "change-me"

    # Backend connection
    BACKEND_URL: str = "http://localhost:5000"

    # LLM configuration (optional)
    LLM_API_KEY: str = ""
    LLM_PROVIDER: str = ""  # gemini, openai, or empty for rule-based
    LLM_MODEL: str = ""

    # Crowd detection thresholds
    CROWD_LOW_THRESHOLD: int = 5
    CROWD_HIGH_THRESHOLD: int = 15

    # Model storage directory
    MODEL_DIR: str = "models"

    class Config:
        env_file = ".env"


settings = Settings()
