"""
Data models for the standalone S (standard deviation) control chart.
"""
import attrs
import numpy as np

from ..common.types import ControlLimits, SigmaResult, ZoneBreakdown
from ..common.validators import validate_positive


@attrs.define(slots=True)
class SChartConfig:
    """Configuration for a standalone S chart."""

    k_sigma: float = attrs.field(default=3.0)

    @k_sigma.validator
    def _validate_k_sigma(self, attribute: attrs.Attribute, value: float) -> None:  # type: ignore[type-arg]
        validate_positive(value, "k_sigma")


@attrs.define(slots=True)
class SChartResult:
    """Result of computing a standalone S chart."""

    subgroup_stddevs: np.ndarray
    limits: ControlLimits
    sigma: SigmaResult
    zones: ZoneBreakdown
    s_bar: float
