"""
Data models for the Individuals and Moving Range (IMR) control chart.
"""
import attrs
import numpy as np

from ..common.enums import SigmaMethod
from ..common.types import ControlLimits, SigmaResult, ZoneBreakdown
from ..common.validators import validate_positive

_VALID_IMR_METHODS = {SigmaMethod.MOVING_RANGE, SigmaMethod.MEDIAN_MOVING_RANGE}


@attrs.define(slots=True)
class IMRConfig:
    """Configuration for an IMR chart."""

    k_sigma: float = attrs.field(default=3.0)
    sigma_method: SigmaMethod = attrs.field(default=SigmaMethod.MOVING_RANGE)

    @k_sigma.validator
    def _validate_k_sigma(self, attribute: attrs.Attribute, value: float) -> None:  # type: ignore[type-arg]
        validate_positive(value, "k_sigma")

    @sigma_method.validator
    def _validate_sigma_method(self, attribute: attrs.Attribute, value: SigmaMethod) -> None:  # type: ignore[type-arg]
        if value not in _VALID_IMR_METHODS:
            raise ValueError(
                f"sigma_method must be one of {_VALID_IMR_METHODS}, got {value!r}"
            )


@attrs.define(slots=True)
class IMRResult:
    """Result of computing an IMR chart."""

    individuals: np.ndarray
    moving_ranges: np.ndarray
    i_limits: ControlLimits
    mr_limits: ControlLimits
    sigma: SigmaResult
    zones: ZoneBreakdown
    process_mean: float
