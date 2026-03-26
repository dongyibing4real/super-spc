"""
Computation logic for the Individuals and Moving Range (IMR) control chart.
"""
from __future__ import annotations

import numpy as np

from ..common.enums import SigmaMethod
from ..common.sigma import sigma_from_median_moving_range, sigma_from_moving_range
from ..common.types import ControlLimits
from ..common.zones import compute_zones
from ..constants.tables import d2, d3
from .models import IMRConfig, IMRResult


def compute_imr(
    data: np.ndarray,
    config: IMRConfig | None = None,
) -> IMRResult:
    """Compute IMR (Individuals and Moving Range) control chart limits.

    Parameters
    ----------
    data:
        1-D array of individual observations.
    config:
        Chart configuration. Defaults to IMRConfig().

    Returns
    -------
    IMRResult
    """
    if config is None:
        config = IMRConfig()

    data = np.asarray(data, dtype=float)
    if data.ndim != 1:
        raise ValueError("data must be a 1-D array for an IMR chart")

    # Moving ranges: |xi - xi-1|
    moving_ranges = np.abs(np.diff(data))

    process_mean = float(np.mean(data))

    # Sigma estimation
    if config.sigma_method == SigmaMethod.MOVING_RANGE:
        sigma_result = sigma_from_moving_range(data, span=2)
    else:
        # MEDIAN_MOVING_RANGE
        sigma_result = sigma_from_median_moving_range(data, span=2)

    sigma_hat = sigma_result.sigma_hat

    # Individuals limits: mean +/- K * sigma_hat
    i_cl = np.full(len(data), process_mean)
    i_ucl = i_cl + config.k_sigma * sigma_hat
    i_lcl = i_cl - config.k_sigma * sigma_hat

    i_limits = ControlLimits(
        ucl=i_ucl,
        cl=i_cl,
        lcl=i_lcl,
        k_sigma=config.k_sigma,
    )

    # MR limits (span=2, so ni=2 always):
    #   CL  = d2(2) * sigma_hat
    #   UCL = d2(2)*sigma_hat + K*d3(2)*sigma_hat
    #   LCL = max(d2(2)*sigma_hat - K*d3(2)*sigma_hat, 0)
    mr_cl_val = d2(2) * sigma_hat
    mr_half_width = config.k_sigma * d3(2) * sigma_hat
    mr_cl_arr = np.full(len(moving_ranges), mr_cl_val)
    mr_ucl = mr_cl_arr + mr_half_width
    mr_lcl = np.maximum(mr_cl_arr - mr_half_width, 0.0)

    mr_limits = ControlLimits(
        ucl=mr_ucl,
        cl=mr_cl_arr,
        lcl=mr_lcl,
        k_sigma=config.k_sigma,
    )

    zones = compute_zones(process_mean, sigma_hat)

    return IMRResult(
        individuals=data,
        moving_ranges=moving_ranges,
        i_limits=i_limits,
        mr_limits=mr_limits,
        sigma=sigma_result,
        zones=zones,
        process_mean=process_mean,
    )
