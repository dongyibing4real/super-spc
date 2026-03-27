"""
Computation logic for the CUSUM V-Mask control chart.

The V-Mask CUSUM is geometrically equivalent to the tabular CUSUM. A V-shaped
template is placed at each new point; if any prior cumulative sum falls outside
the V-Mask arms, a signal is raised. Internally this reuses the tabular CUSUM
algorithm for violation detection.

References
----------
Montgomery, D.C. (2020). Introduction to Statistical Quality Control, 8th ed.,
Section 9.1.3 (V-Mask CUSUM).
"""
from __future__ import annotations

import math

import numpy as np

from ..cusum.cusum import CUSUMConfig, compute_cusum
from .models import CUSUMVMaskConfig, CUSUMVMaskResult


def compute_cusum_vmask(
    values: np.ndarray,
    config: CUSUMVMaskConfig | None = None,
) -> CUSUMVMaskResult:
    """Compute a CUSUM V-Mask control chart.

    The V-Mask is geometrically equivalent to the tabular CUSUM:
    violation at point i iff C_plus[i] > h or C_minus[i] < -h.

    Cumulative sums:
        S_i = sum_{j=0}^{i} (x_j - target) / sigma

    Lead distance (in sample units):
        d = h / (2 * k)

    Half-angle:
        theta = atan(k / d_units)

    Parameters
    ----------
    values:
        1-D array of observed process values.
    config:
        V-Mask configuration. Defaults to CUSUMVMaskConfig().

    Returns
    -------
    CUSUMVMaskResult
    """
    if config is None:
        config = CUSUMVMaskConfig()

    x = np.asarray(values, dtype=float)
    if x.ndim != 1:
        raise ValueError("values must be a 1-D array")

    n = len(x)
    target = config.target
    sigma = config.sigma
    h = config.h
    k = config.k
    d_units = config.d_units

    # --- Cumulative sums ---
    cumulative_sums = np.cumsum((x - target) / sigma)

    # --- V-Mask geometry ---
    lead_distance = h / (2.0 * k)                    # in sample units
    half_angle = math.atan(k / d_units)              # radians

    indices = np.arange(n, dtype=float)
    mask_vertex_x = indices + lead_distance           # vertex placed d ahead
    mask_vertex_y = cumulative_sums                   # y = S_i at point i
    upper_arm = np.full(n, k)                         # constant slope +k
    lower_arm = np.full(n, -k)                        # constant slope -k

    # --- Violation detection via tabular CUSUM (mathematically equivalent) ---
    tab_config = CUSUMConfig(
        target=target,
        sigma=sigma,
        h=h,
        k=k,
        head_start=0.0,
        data_units=False,
    )
    tab_result = compute_cusum(x, tab_config)
    violations = tab_result.violations_upper | tab_result.violations_lower
    violation_indices = np.where(violations)[0]

    return CUSUMVMaskResult(
        cumulative_sums=cumulative_sums,
        mask_vertex_x=mask_vertex_x,
        mask_vertex_y=mask_vertex_y,
        upper_arm=upper_arm,
        lower_arm=lower_arm,
        lead_distance=float(lead_distance),
        half_angle=float(half_angle),
        violations=violations,
        violation_indices=violation_indices,
    )
