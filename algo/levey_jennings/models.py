"""
Data models for the Levey-Jennings control chart.
"""
import attrs
import numpy as np

from ..common.types import ControlLimits, SigmaResult, ZoneBreakdown
from ..common.validators import validate_positive


@attrs.define(slots=True)
class LeveyJenningsConfig:
    """Configuration for a Levey-Jennings chart."""

    k_sigma: float = attrs.field(default=3.0)

    @k_sigma.validator
    def _validate_k_sigma(self, attribute: attrs.Attribute, value: float) -> None:  # type: ignore[type-arg]
        validate_positive(value, "k_sigma")


@attrs.define(slots=True)
class LeveyJenningsResult:
    """Result of computing a Levey-Jennings chart."""

    values: np.ndarray
    limits: ControlLimits
    sigma: SigmaResult
    zones: ZoneBreakdown
    process_mean: float
