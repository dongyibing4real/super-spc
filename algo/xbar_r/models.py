"""
Data models for the XBar-R (mean and range) control chart.
"""
import attrs
import numpy as np

from ..common.types import ControlLimits, SigmaResult, ZoneBreakdown
from ..common.validators import validate_positive


@attrs.define(slots=True)
class XBarRConfig:
    """Configuration for an XBar-R chart."""

    k_sigma: float = attrs.field(default=3.0)

    @k_sigma.validator
    def _validate_k_sigma(self, attribute: attrs.Attribute, value: float) -> None:  # type: ignore[type-arg]
        validate_positive(value, "k_sigma")


@attrs.define(slots=True)
class XBarRResult:
    """Result of computing an XBar-R chart."""

    subgroup_means: np.ndarray
    subgroup_ranges: np.ndarray
    xbar_limits: ControlLimits
    r_limits: ControlLimits
    sigma: SigmaResult
    zones: ZoneBreakdown
    grand_mean: float
