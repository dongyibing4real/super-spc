"""Data models for time series forecasting."""
from __future__ import annotations

import attrs
import numpy as np


@attrs.define(slots=True)
class ForecastConfig:
    """Configuration for FLAML time series forecasting."""

    horizon: int = attrs.field(default=6)
    confidence_level: float = attrs.field(default=0.95)
    period: int | None = attrs.field(default=None)
    time_budget: int = attrs.field(default=3)

    @horizon.validator
    def _validate_horizon(self, attribute: attrs.Attribute, value: int) -> None:  # type: ignore[type-arg]
        if value < 1:
            raise ValueError(f"horizon must be >= 1, got {value}")

    @confidence_level.validator
    def _validate_confidence(self, attribute: attrs.Attribute, value: float) -> None:  # type: ignore[type-arg]
        if not (0 < value < 1):
            raise ValueError(f"confidence_level must be in (0, 1), got {value}")

    @time_budget.validator
    def _validate_time_budget(self, attribute: attrs.Attribute, value: int) -> None:  # type: ignore[type-arg]
        if value < 1:
            raise ValueError(f"time_budget must be >= 1, got {value}")


@attrs.define(slots=True)
class ForecastResult:
    """Result of a forecast computation."""

    projected: list[dict]       # [{x: int, y: float}, ...]
    confidence: list[dict]      # [{x: int, upper: float, lower: float}, ...]
    drift_score: float
    ooc_estimate: int | None
    model_name: str
    fit_time_ms: int
