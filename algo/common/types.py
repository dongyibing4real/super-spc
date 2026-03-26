"""
Core data types for control chart computations.
"""
import attrs
import numpy as np

from .enums import SigmaMethod


@attrs.define(slots=True)
class ControlLimits:
    """Upper control limit, center line, and lower control limit arrays."""

    ucl: np.ndarray
    cl: np.ndarray
    lcl: np.ndarray
    k_sigma: float


@attrs.define(slots=True)
class ZoneBreakdown:
    """Zone boundaries for Western Electric rule detection."""

    zone_a_upper: float
    zone_b_upper: float
    cl: float
    zone_b_lower: float
    zone_a_lower: float


@attrs.define(slots=True)
class SigmaResult:
    """Result of a sigma estimation."""

    sigma_hat: float
    method: SigmaMethod
    n_used: int
