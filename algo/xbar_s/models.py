"""
Data models for the XBar-S (mean and standard deviation) control chart.
"""
import attrs
import numpy as np

from ..common.types import ControlLimits, SigmaResult, ZoneBreakdown
from ..common.validators import validate_positive


@attrs.define(slots=True)
class XBarSConfig:
    """Configuration for an XBar-S chart."""

    k_sigma: float = attrs.field(default=3.0)

    @k_sigma.validator
    def _validate_k_sigma(self, attribute: attrs.Attribute, value: float) -> None:  # type: ignore[type-arg]
        validate_positive(value, "k_sigma")


@attrs.define(slots=True)
class XBarSResult:
    """Result of computing an XBar-S chart."""

    subgroup_means: np.ndarray
    subgroup_stddevs: np.ndarray
    xbar_limits: ControlLimits
    s_limits: ControlLimits
    sigma: SigmaResult
    zones: ZoneBreakdown
    grand_mean: float
