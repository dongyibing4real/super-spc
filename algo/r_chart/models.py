"""
Data models for the standalone R (range) control chart.
"""
import attrs
import numpy as np

from ..common.types import ControlLimits, SigmaResult, ZoneBreakdown
from ..common.validators import validate_positive


@attrs.define(slots=True)
class RChartConfig:
    """Configuration for a standalone R chart."""

    k_sigma: float = attrs.field(default=3.0)

    @k_sigma.validator
    def _validate_k_sigma(self, attribute: attrs.Attribute, value: float) -> None:  # type: ignore[type-arg]
        validate_positive(value, "k_sigma")


@attrs.define(slots=True)
class RChartResult:
    """Result of computing a standalone R chart."""

    subgroup_ranges: np.ndarray
    limits: ControlLimits
    sigma: SigmaResult
    zones: ZoneBreakdown
    r_bar: float
