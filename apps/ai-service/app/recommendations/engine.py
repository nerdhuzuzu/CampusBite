"""
Recommendation engine for the Campus Canteen.
Combines popularity-based, content-based, and collaborative filtering
approaches in a hybrid strategy with graceful fallbacks.
"""

from __future__ import annotations

import logging
from typing import Any

from app.models.schemas import RecommendationItem

logger = logging.getLogger(__name__)


class RecommendationEngine:
    """Hybrid food recommendation engine."""

    # Default blending weights: popularity, content-based, collaborative
    DEFAULT_WEIGHTS = (0.3, 0.5, 0.2)

    def __init__(self) -> None:
        logger.info("RecommendationEngine initialised")

    # ── Public API ───────────────────────────────────────────────────────

    def get_recommendations(
        self,
        user_data: dict[str, Any] | None,
        menu_items: list[dict[str, Any]],
        order_history: list[dict[str, Any]] | None = None,
        preferences: dict[str, Any] | None = None,
        dietary_type: str | None = None,
        budget: float | None = None,
        limit: int = 10,
    ) -> tuple[list[RecommendationItem], bool]:
        """
        Return up to *limit* recommendations and a flag indicating
        whether the result is a pure-fallback (no personalisation).
        """
        # Filter out unavailable items first
        available = [m for m in menu_items if m.get("available", True)]

        if not available:
            return [], True

        # Apply hard filters (dietary, budget)
        filtered = self._apply_hard_filters(available, dietary_type, budget)
        if not filtered:
            # If hard filters eliminated everything, relax and use all available
            filtered = available

        pop = self._popularity_based(filtered, limit)
        content = self._content_based(preferences, dietary_type, budget, filtered)
        collab = self._collaborative_filter(
            user_data.get("user_id") if user_data else None,
            order_history,
            [],  # all_orders – will be populated when backend sends data
        )

        is_fallback = not order_history and not preferences
        if is_fallback:
            # Pure popularity fallback
            results = pop[:limit]
        else:
            results = self._hybrid_combine(
                pop, content, collab, self.DEFAULT_WEIGHTS
            )[:limit]

        return results, is_fallback

    # ── Private helpers ──────────────────────────────────────────────────

    @staticmethod
    def _apply_hard_filters(
        items: list[dict], dietary_type: str | None, budget: float | None
    ) -> list[dict]:
        """Remove items that violate hard constraints."""
        filtered = items
        if dietary_type:
            dt = dietary_type.lower()
            filtered = [
                i
                for i in filtered
                if i.get("dietary_type", "").lower() == dt
                or i.get("is_veg", False) and dt in ("veg", "vegetarian")
            ]
        if budget is not None:
            filtered = [i for i in filtered if i.get("price", 0) <= budget]
        return filtered

    @staticmethod
    def _popularity_based(
        menu_items: list[dict], limit: int = 10
    ) -> list[RecommendationItem]:
        """
        Rank by a composite popularity score (order count + avg rating).
        """
        scored: list[tuple[float, dict]] = []
        for item in menu_items:
            order_count = item.get("order_count", 0)
            avg_rating = item.get("avg_rating", 3.0)
            # Normalise order_count to 0-1 range (soft cap at 500)
            norm_orders = min(order_count / 500, 1.0)
            norm_rating = avg_rating / 5.0
            score = 0.6 * norm_orders + 0.4 * norm_rating
            scored.append((score, item))

        scored.sort(key=lambda x: x[0], reverse=True)

        return [
            RecommendationItem(
                item_id=str(item.get("_id", item.get("id", ""))),
                item_name=item.get("name", "Unknown"),
                outlet=item.get("outlet_name", item.get("outlet", "Unknown")),
                price=float(item.get("price", 0)),
                score=round(score, 4),
                explanation="Popular among students",
            )
            for score, item in scored[:limit]
        ]

    @staticmethod
    def _content_based(
        preferences: dict[str, Any] | None,
        dietary_type: str | None,
        budget: float | None,
        menu_items: list[dict],
    ) -> list[RecommendationItem]:
        """
        Score items based on attribute similarity to user preferences.
        """
        if not preferences and not dietary_type:
            return []

        pref_categories = set(
            c.lower() for c in (preferences or {}).get("categories", [])
        )
        pref_spice = (preferences or {}).get("spice_level", "medium")

        results: list[RecommendationItem] = []
        for item in menu_items:
            score = 0.5  # base

            # Category match
            item_cat = item.get("category", "").lower()
            if item_cat and item_cat in pref_categories:
                score += 0.25

            # Dietary match
            if dietary_type and item.get("dietary_type", "").lower() == dietary_type.lower():
                score += 0.15

            # Budget proximity (bonus for items well within budget)
            if budget is not None:
                price = item.get("price", 0)
                if price <= budget * 0.6:
                    score += 0.1

            score = min(score, 1.0)

            explanation_parts: list[str] = []
            if item_cat in pref_categories:
                explanation_parts.append(f"Matches your preference for {item_cat}")
            if dietary_type:
                explanation_parts.append(f"Fits your {dietary_type} diet")
            explanation = "; ".join(explanation_parts) or "Matches your profile"

            results.append(
                RecommendationItem(
                    item_id=str(item.get("_id", item.get("id", ""))),
                    item_name=item.get("name", "Unknown"),
                    outlet=item.get("outlet_name", item.get("outlet", "Unknown")),
                    price=float(item.get("price", 0)),
                    score=round(score, 4),
                    explanation=explanation,
                )
            )

        results.sort(key=lambda r: r.score, reverse=True)
        return results

    @staticmethod
    def _collaborative_filter(
        user_id: str | None,
        order_history: list[dict[str, Any]] | None,
        all_orders: list[dict[str, Any]],
    ) -> list[RecommendationItem]:
        """
        Simple user-item collaborative filtering.
        Returns empty list when there is insufficient data to build
        a meaningful co-occurrence matrix.
        """
        if not user_id or not order_history or len(all_orders) < 20:
            return []

        # Build user-item co-occurrence counts
        user_items: dict[str, set[str]] = {}
        for order in all_orders:
            uid = str(order.get("user_id", ""))
            iid = str(order.get("item_id", ""))
            user_items.setdefault(uid, set()).add(iid)

        my_items = user_items.get(user_id, set())
        if not my_items:
            return []

        # Find similar users (Jaccard similarity)
        similar_items: dict[str, float] = {}
        for other_uid, other_items in user_items.items():
            if other_uid == user_id:
                continue
            intersection = my_items & other_items
            union = my_items | other_items
            if not union:
                continue
            sim = len(intersection) / len(union)
            if sim < 0.1:
                continue
            # Recommend items the similar user ordered that I haven't
            for item_id in other_items - my_items:
                similar_items[item_id] = max(similar_items.get(item_id, 0), sim)

        # Convert to RecommendationItem (we only have IDs here, details
        # would be enriched by the caller)
        results = [
            RecommendationItem(
                item_id=item_id,
                item_name="",  # To be enriched by caller
                outlet="",
                price=0.0,
                score=round(sim_score, 4),
                explanation="Students with similar tastes ordered this",
            )
            for item_id, sim_score in sorted(
                similar_items.items(), key=lambda x: x[1], reverse=True
            )
        ]
        return results

    @staticmethod
    def _hybrid_combine(
        popularity: list[RecommendationItem],
        content: list[RecommendationItem],
        collaborative: list[RecommendationItem],
        weights: tuple[float, float, float],
    ) -> list[RecommendationItem]:
        """
        Merge three ranked lists into one using weighted score combination.
        De-duplicate by item_id; keep highest score per item.
        """
        w_pop, w_cont, w_coll = weights

        combined: dict[str, RecommendationItem] = {}

        def _add(items: list[RecommendationItem], weight: float) -> None:
            for item in items:
                weighted_score = item.score * weight
                existing = combined.get(item.item_id)
                if existing is None:
                    combined[item.item_id] = item.model_copy(
                        update={"score": round(weighted_score, 4)}
                    )
                else:
                    new_score = round(existing.score + weighted_score, 4)
                    combined[item.item_id] = existing.model_copy(
                        update={"score": min(new_score, 1.0)}
                    )

        _add(popularity, w_pop)
        _add(content, w_cont)
        _add(collaborative, w_coll)

        merged = sorted(combined.values(), key=lambda r: r.score, reverse=True)
        return merged
