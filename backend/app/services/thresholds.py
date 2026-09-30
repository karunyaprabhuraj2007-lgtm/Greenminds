"""Threshold-based classification driven by `config/thresholds.yaml`.

Thresholds are indicative and configurable, not agronomically certified.
"""
from __future__ import annotations

from typing import Any

from app.core.config import load_yaml_config
from app.db.models.enums import HealthClass


def load_thresholds() -> dict[str, Any]:
    return load_yaml_config("thresholds")


def classify_health(ndvi_mean: float, thresholds: dict[str, Any] | None = None) -> HealthClass:
    """healthy if NDVI > healthy_min; moderate if >= moderate_min; else severe."""
    health = (thresholds or load_thresholds())["health"]
    if ndvi_mean > health["ndvi_healthy_min"]:
        return HealthClass.healthy
    if ndvi_mean >= health["ndvi_moderate_min"]:
        return HealthClass.moderate
    return HealthClass.severe
