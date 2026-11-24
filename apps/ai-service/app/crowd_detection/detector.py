"""
Crowd detection module for the Campus Canteen.
Uses YOLO (yolov8n) when available; falls back to clearly-labelled
simulation otherwise.
"""

from __future__ import annotations

import base64
import logging
import random
from datetime import datetime
from typing import Any

import numpy as np

from app.config import settings
from app.models.schemas import CrowdDetectionResponse

logger = logging.getLogger(__name__)

# Lazy-import heavy CV libs
_cv2 = None
_YOLO = None


def _load_cv2():
    global _cv2
    if _cv2 is None:
        try:
            import cv2
            _cv2 = cv2
        except ImportError:
            pass
    return _cv2


def _load_yolo():
    global _YOLO
    if _YOLO is None:
        try:
            from ultralytics import YOLO
            _YOLO = YOLO
        except ImportError:
            pass
    return _YOLO


class CrowdDetector:
    """YOLO-based crowd detector with simulation fallback."""

    # COCO class ID for 'person'
    PERSON_CLASS_ID = 0
    # Input size for YOLO inference (smaller = faster on low-end hardware)
    INFERENCE_SIZE = 416

    def __init__(self) -> None:
        self.model = None
        self.using_simulation = True

        YOLO = _load_yolo()
        cv2 = _load_cv2()

        if YOLO is not None and cv2 is not None:
            try:
                self.model = YOLO("yolov8n.pt")
                self.using_simulation = False
                logger.info("YOLO model loaded successfully (yolov8n)")
            except Exception as exc:
                logger.warning("Failed to load YOLO model: %s — using simulation", exc)
        else:
            logger.info(
                "OpenCV/Ultralytics not installed — crowd detection will use simulation"
            )

    # ── Public API ───────────────────────────────────────────────────────

    def detect_from_image(
        self, image_bytes: bytes, outlet_id: str
    ) -> CrowdDetectionResponse:
        """Detect people count from raw image bytes."""
        if self.using_simulation:
            return self.simulate_crowd(outlet_id)

        cv2 = _load_cv2()
        arr = np.frombuffer(image_bytes, dtype=np.uint8)
        frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)

        if frame is None:
            logger.error("Failed to decode image for outlet %s", outlet_id)
            return self.simulate_crowd(outlet_id)

        return self.detect_from_frame(frame, outlet_id)

    def detect_from_base64(
        self, image_b64: str, outlet_id: str
    ) -> CrowdDetectionResponse:
        """Convenience wrapper that decodes a base-64 image string first."""
        try:
            image_bytes = base64.b64decode(image_b64)
        except Exception:
            logger.error("Invalid base64 image for outlet %s", outlet_id)
            return self.simulate_crowd(outlet_id)
        return self.detect_from_image(image_bytes, outlet_id)

    def detect_from_frame(
        self, frame: np.ndarray, outlet_id: str
    ) -> CrowdDetectionResponse:
        """
        Run YOLO inference on a BGR numpy frame.
        Only counts detections of class 'person'.
        """
        if self.using_simulation or self.model is None:
            return self.simulate_crowd(outlet_id)

        cv2 = _load_cv2()
        # Resize for performance on constrained hardware
        resized = cv2.resize(
            frame, (self.INFERENCE_SIZE, self.INFERENCE_SIZE)
        )

        try:
            results = self.model(resized, verbose=False, classes=[self.PERSON_CLASS_ID])
            people_count = 0
            for r in results:
                people_count += len(r.boxes)
        except Exception as exc:
            logger.error("YOLO inference failed: %s", exc)
            return self.simulate_crowd(outlet_id)

        crowd_level = self._classify_crowd(people_count)

        return CrowdDetectionResponse(
            outlet_id=outlet_id,
            people_count=people_count,
            crowd_level=crowd_level,
            is_simulated=False,
            timestamp=datetime.utcnow(),
        )

    def simulate_crowd(self, outlet_id: str) -> CrowdDetectionResponse:
        """
        Return a *clearly labelled* simulated crowd reading.
        Uses time-aware randomness so demos look realistic.
        """
        hour = datetime.utcnow().hour

        # Time-based base counts
        if 11 <= hour <= 14:  # Lunch rush
            base = random.randint(10, 25)
        elif 17 <= hour <= 20:  # Dinner rush
            base = random.randint(8, 20)
        elif 8 <= hour <= 10:  # Breakfast
            base = random.randint(3, 12)
        else:
            base = random.randint(0, 5)

        people_count = max(0, base + random.randint(-2, 2))
        crowd_level = self._classify_crowd(people_count)

        return CrowdDetectionResponse(
            outlet_id=outlet_id,
            people_count=people_count,
            crowd_level=crowd_level,
            is_simulated=True,  # ← clearly labelled as simulated
            timestamp=datetime.utcnow(),
        )

    # ── Helpers ──────────────────────────────────────────────────────────

    def _classify_crowd(self, count: int) -> str:
        """Classify people count into LOW / MEDIUM / HIGH."""
        if count <= settings.CROWD_LOW_THRESHOLD:
            return "LOW"
        elif count <= settings.CROWD_HIGH_THRESHOLD:
            return "MEDIUM"
        else:
            return "HIGH"
