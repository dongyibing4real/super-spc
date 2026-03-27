"""
Data models for the CUSUM V-Mask control chart.
"""
import attrs
import numpy as np

from ..common.validators import validate_positive


def _validate_sigma(instance: object, attribute: attrs.Attribute, value: float) -> None:  # type: ignore[type-arg]
    validate_positive(value, "sigma")


def _validate_h(instance: object, attribute: attrs.Attribute, value: float) -> None:  # type: ignore[type-arg]
    validate_positive(value, "h")


def _validate_k(instance: object, attribute: attrs.Attribute, value: float) -> None:  # type: ignore[type-arg]
    validate_positive(value, "k")


def _validate_d_units(instance: object, attribute: attrs.Attribute, value: float) -> None:  # type: ignore[type-arg]
    validate_positive(value, "d_units")


@attrs.define(slots=True)
class CUSUMVMaskConfig:
    """Configuration for a CUSUM V-Mask control chart.

    Parameters
    ----------
    target:
        Reference (target) value for the process mean. Default 0.0.
    sigma:
        Known or estimated process standard deviation. Must be positive.
    h:
        Decision interval (half-height of V-Mask in standardised units).
        Signal when any prior cumulative sum falls outside the V-Mask arms.
        Must be positive.
    k:
        Reference value (allowable slack). Slope of each arm of the V-Mask
        in standardised units. Must be positive.
    d_units:
        Horizontal scale factor (data units per sample interval). Used to
        compute the lead distance and half-angle. Default 1.0.
    """

    target: float = attrs.field(default=0.0)
    sigma: float = attrs.field(default=1.0, validator=_validate_sigma)
    h: float = attrs.field(default=5.0, validator=_validate_h)
    k: float = attrs.field(default=0.5, validator=_validate_k)
    d_units: float = attrs.field(default=1.0, validator=_validate_d_units)


@attrs.define(slots=True)
class CUSUMVMaskResult:
    """Result of a CUSUM V-Mask computation.

    Parameters
    ----------
    cumulative_sums:
        S_i = sum_{j=0}^{i} (x_j - target) / sigma for each observation.
    mask_vertex_x:
        X-coordinates of the V-Mask vertex placed at each point i: x = i + d.
    mask_vertex_y:
        Y-coordinates of the V-Mask vertex at each point (= cumulative_sums).
    upper_arm:
        Slope of the upper arm at each point: +k (constant array).
    lower_arm:
        Slope of the lower arm at each point: -k (constant array).
    lead_distance:
        d = h / (2 * k) in sample units.
    half_angle:
        theta = atan(k / d_units) in radians.
    violations:
        Boolean mask of length n; True at index i if C_plus[i] > h or
        C_minus[i] < -h (equivalent to a tabular CUSUM violation).
    violation_indices:
        Indices where violations[i] is True.
    """

    cumulative_sums: np.ndarray
    mask_vertex_x: np.ndarray
    mask_vertex_y: np.ndarray
    upper_arm: np.ndarray
    lower_arm: np.ndarray
    lead_distance: float
    half_angle: float
    violations: np.ndarray
    violation_indices: np.ndarray
