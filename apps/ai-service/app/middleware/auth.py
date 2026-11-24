"""
Authentication middleware for the AI service.
Verifies that incoming requests from the Node.js backend carry
the correct shared secret in the X-AI-Service-Secret header.
"""

import hmac
from typing import Optional

from fastapi import Header, HTTPException, status

from app.config import settings


async def verify_service_auth(
    x_ai_service_secret: Optional[str] = Header(default=None, alias="X-AI-Service-Secret"),
) -> str:
    """
    FastAPI dependency that validates the shared secret header.
    Returns 401 when the header is missing or does not match
    (constant-time comparison to avoid timing attacks).
    """
    if not x_ai_service_secret or not hmac.compare_digest(
        x_ai_service_secret.encode(), settings.AI_SERVICE_SECRET.encode()
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing AI service secret",
        )
    return x_ai_service_secret
