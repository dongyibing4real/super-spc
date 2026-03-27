"""
Data models for the standalone MR (Moving Range) control chart.
"""
import attrs
import numpy as np

from ..common.enums import SigmaMethod
from ..common.types import ControlLimits, SigmaResult, ZoneBreakdown
from ..common.validators import validate_positive

_VALID_MR_METHODS = {SigmaMethod.MOVING_RANGE, SigmaMethod.MEDIAN_MOVING_RANGE}


@attrs.define(slots=True)
class MRChartConfig:
    """Configuration for a standalone MR chart."""

    k_sigma: float = attrs.field(default=3.0)
    sigma_method: SigmaMethod = attrs.field(default=SigmaMethod.MOVING_RANGE)
    span: int = attrs.field(default=2)

    @k_sigma.validator
    def _validate_k_sigma(self, attribute: attrs.Attribute, value: float) -> None:  # type: ignore[type-arg]
        validate_positive(value, "k_sigma")

    @sigma_method.validator
    def _validate_sigma_method(self, attribute: attrs.Attribute, value: SigmaMethod) -> None:  # type: ignore[type-arg]
        if value not in _VALID_MR_METHODS:
            raise ValueError(
                f"sigma_method must be one of {_VALID_MR_METHODS}, got {value!r}"
            )

    @span.validator
    def _validate_span(self, attribute: attrs.Attribute, value: int) -> None:  # type: ignore[type-arg]
        if value < 2:
            raise ValueError(f"span must be >= 2, got {value!r}")


@attrs.define(slots=True)
class MRChartResult:
    """Result of computing a standalone MR chart."""

    moving_ranges: np.ndarray
    limits: ControlLimits
    sigma: SigmaResult
    zones: ZoneBreakdown
    mr_bar: float
