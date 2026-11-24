"""
Chatbot engine for the Campus Canteen.
Provides a rule-based fallback with optional LLM integration
(Gemini / OpenAI) when configured.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from app.config import settings
from app.models.schemas import ChatResponse, ToolCall

logger = logging.getLogger(__name__)


class ChatbotEngine:
    """Rule-based chatbot with optional LLM enhancement."""

    def __init__(self) -> None:
        self.llm_available = bool(settings.LLM_API_KEY and settings.LLM_PROVIDER)
        if self.llm_available:
            logger.info(
                "LLM configured: provider=%s model=%s",
                settings.LLM_PROVIDER,
                settings.LLM_MODEL,
            )
        else:
            logger.info("No LLM configured — using rule-based chatbot only")

    # ── Public API ───────────────────────────────────────────────────────

    async def process_message(
        self,
        message: str,
        user_id: str,
        conversation_history: list[dict[str, str]] | None = None,
        context: dict[str, Any] | None = None,
    ) -> ChatResponse:
        """
        Process an incoming user message and return a response.
        Uses LLM when available, otherwise falls back to rule-based.
        """
        if self.llm_available:
            try:
                return await self._llm_response(message, context, conversation_history)
            except Exception as exc:
                logger.warning("LLM call failed (%s), falling back to rules", exc)

        return self._rule_based_response(message, context)

    # ── Rule-based engine ────────────────────────────────────────────────

    def _rule_based_response(
        self, message: str, context: dict[str, Any] | None = None
    ) -> ChatResponse:
        """
        Pattern-match the user message and return a canned but useful
        response. Supports common canteen queries.
        """
        msg = message.lower().strip()
        tool_calls: list[ToolCall] = []
        response = ""
        suggested = self.get_suggested_questions()

        # ── Price queries ────────────────────────────────────────────
        price_match = re.search(
            r"(?:under|below|less than|within)\s*₹?\s*(\d+)", msg
        )
        if price_match:
            budget = int(price_match.group(1))
            response = (
                f"Let me find items under ₹{budget} for you. "
                "I'll check the menu and get back with options within your budget!"
            )
            tool_calls.append(
                ToolCall(
                    name="filter_by_price",
                    arguments={"max_price": budget},
                )
            )
            return ChatResponse(
                response=response,
                tool_calls=tool_calls,
                suggested_questions=suggested,
            )

        # ── Dietary queries ──────────────────────────────────────────
        if any(w in msg for w in ("veg", "vegetarian", "veggie")):
            if "non" in msg or "non-" in msg:
                response = (
                    "Looking for non-vegetarian options! "
                    "Let me check which outlets have non-veg items available right now."
                )
                tool_calls.append(
                    ToolCall(name="filter_dietary", arguments={"type": "non-veg"})
                )
            else:
                response = (
                    "Looking for vegetarian options! "
                    "Let me find the best veg items available for you."
                )
                tool_calls.append(
                    ToolCall(name="filter_dietary", arguments={"type": "veg"})
                )
            return ChatResponse(
                response=response,
                tool_calls=tool_calls,
                suggested_questions=suggested,
            )

        if "vegan" in msg:
            response = (
                "Looking for vegan options! Let me check what's available."
            )
            tool_calls.append(
                ToolCall(name="filter_dietary", arguments={"type": "vegan"})
            )
            return ChatResponse(
                response=response,
                tool_calls=tool_calls,
                suggested_questions=suggested,
            )

        # ── Availability ─────────────────────────────────────────────
        if any(w in msg for w in ("available", "open", "serving")):
            response = (
                "Let me check which outlets are currently open and what's being served!"
            )
            tool_calls.append(
                ToolCall(name="check_availability", arguments={})
            )
            return ChatResponse(
                response=response,
                tool_calls=tool_calls,
                suggested_questions=suggested,
            )

        # ── Order status ─────────────────────────────────────────────
        if any(w in msg for w in ("order status", "my order", "track order", "where is my order")):
            response = (
                "Let me check your recent order status for you!"
            )
            tool_calls.append(
                ToolCall(name="check_order_status", arguments={})
            )
            return ChatResponse(
                response=response,
                tool_calls=tool_calls,
                suggested_questions=suggested,
            )

        # ── Recommendations ──────────────────────────────────────────
        if any(w in msg for w in ("recommend", "suggestion", "suggest", "what should i")):
            response = (
                "Great! Let me find some personalized food recommendations for you "
                "based on what's popular and your preferences!"
            )
            tool_calls.append(
                ToolCall(name="get_recommendations", arguments={})
            )
            return ChatResponse(
                response=response,
                tool_calls=tool_calls,
                suggested_questions=suggested,
            )

        # ── Cheapest ─────────────────────────────────────────────────
        if any(w in msg for w in ("cheapest", "lowest price", "most affordable")):
            response = (
                "Let me find the most affordable options available right now!"
            )
            tool_calls.append(
                ToolCall(name="sort_by_price", arguments={"order": "asc"})
            )
            return ChatResponse(
                response=response,
                tool_calls=tool_calls,
                suggested_questions=suggested,
            )

        # ── Popular ──────────────────────────────────────────────────
        if any(w in msg for w in ("popular", "trending", "best seller", "top rated")):
            response = (
                "Here are the most popular items students are ordering right now!"
            )
            tool_calls.append(
                ToolCall(name="get_popular", arguments={})
            )
            return ChatResponse(
                response=response,
                tool_calls=tool_calls,
                suggested_questions=suggested,
            )

        # ── Queue / Wait / Crowd ─────────────────────────────────────
        if any(w in msg for w in ("wait", "queue", "crowd", "busy", "how long")):
            response = (
                "Let me check the current crowd levels and estimated waiting times "
                "at the canteen outlets!"
            )
            tool_calls.append(
                ToolCall(name="check_queue", arguments={})
            )
            return ChatResponse(
                response=response,
                tool_calls=tool_calls,
                suggested_questions=suggested,
            )

        # ── Greeting ─────────────────────────────────────────────────
        if any(w in msg for w in ("hi", "hello", "hey", "good morning", "good afternoon")):
            response = (
                "Hey there! 👋 Welcome to the Campus Canteen assistant! "
                "I can help you find food, check prices, track orders, "
                "see crowd levels, and more. What would you like to know?"
            )
            return ChatResponse(
                response=response,
                suggested_questions=suggested,
            )

        # ── Help ─────────────────────────────────────────────────────
        if any(w in msg for w in ("help", "what can you do", "how to")):
            response = (
                "I'm your Campus Canteen assistant! Here's what I can do:\n\n"
                "🍽️ **Find food** — search by dietary type, budget, or cuisine\n"
                "⭐ **Recommendations** — personalized suggestions based on your taste\n"
                "💰 **Check prices** — find items within your budget\n"
                "📦 **Track orders** — check your order status\n"
                "👥 **Crowd info** — see how busy each outlet is\n"
                "⏱️ **Wait times** — estimated queue waiting time\n\n"
                "Just type your question naturally!"
            )
            return ChatResponse(
                response=response,
                suggested_questions=suggested,
            )

        # ── Default fallback ─────────────────────────────────────────
        response = (
            "I can help you find food, check prices, track orders, "
            "see crowd levels, and get personalized recommendations. "
            "Try asking something like 'What's popular today?' or "
            "'Show me veg items under ₹100'!"
        )
        return ChatResponse(
            response=response,
            suggested_questions=suggested,
        )

    # ── LLM integration ─────────────────────────────────────────────────

    async def _llm_response(
        self,
        message: str,
        context: dict[str, Any] | None,
        conversation_history: list[dict[str, str]] | None = None,
    ) -> ChatResponse:
        """
        Call the configured Gemini API endpoint for natural-language synthesis,
        falling back to the deterministic rule-based response on error.
        """
        import httpx

        rule_fallback = self._rule_based_response(message, context)
        model = settings.LLM_MODEL or "gemini-2.0-flash"
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

        prompt = (
            "You are CampusBite AI, the campus canteen assistant. "
            f"Context: {context or {}}. "
            f"Baseline grounded response: {rule_fallback.response}\n\n"
            f"User question: {message}"
        )

        async with httpx.AsyncClient(timeout=6.0) as client:
            resp = await client.post(
                url,
                headers={
                    "Content-Type": "application/json",
                    "x-goog-api-key": settings.LLM_API_KEY,
                },
                json={
                    "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                    "generationConfig": {"temperature": 0.25, "maxOutputTokens": 500},
                },
            )
            resp.raise_for_status()
            data = resp.json()
            text = (
                data.get("candidates", [{}])[0]
                .get("content", {})
                .get("parts", [{}])[0]
                .get("text", "")
                .strip()
            )
            if text:
                return ChatResponse(
                    response=text,
                    tool_calls=rule_fallback.tool_calls,
                    suggested_questions=rule_fallback.suggested_questions,
                )
        return rule_fallback

    # ── Helpers ──────────────────────────────────────────────────────────

    @staticmethod
    def get_suggested_questions() -> list[str]:
        """Return a list of starter / follow-up questions for the UI."""
        return [
            "What's popular today?",
            "Show me veg items under ₹100",
            "How crowded is the canteen?",
            "Recommend something for lunch",
            "What are the cheapest options?",
            "Track my order",
        ]
