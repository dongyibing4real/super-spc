"""
Computation logic for the standalone MR (Moving Range) control chart.
"""
from __future__ import annotations

import numpy as np

from ..common.enums import SigmaMethod
from ..common.sigma import sigma_from_median_moving_range, sigma_from_moving_range
from ..common.types import ControlLimits
from ..common.zones import compute_zones
from ..constants.tables import d2, d3
from .models import MRChartConfig, MRChartResult


def compute_mr_chart(
    data: np.ndarray,
    config: MRChartConfig | None = None,
) -> MRChartResult:
    """Compute a standalone MR (Moving Range) control chart.

    Parameters
    ----------
    data:
        1-D array of individual observations.
    config:
        Chart configuration. Defaults to MRChartConfig().

    Returns
    -------
    MRChartResult
    """
    if config is None:
        config = MRChartConfig()

    data = np.asarray(data, dtype=float)
    if data.ndim != 1:
        raise ValueError("data must be a 1-D array for an MR chart")

    span = config.span

    # Compute moving ranges
    if span == 2:
        moving_ranges = np.abs(np.diff(data))
    else:
        # Range of each rolling window of size `span`
        moving_ranges = np.array(
            [data[i : i + span].max() - data[i : i + span].min()
             for i in range(len(data) - span + 1)]
        )

    mr_bar = float(np.mean(moving_ranges))

    # Sigma estimation
    if config.sigma_method == SigmaMethod.MOVING_RANGE:
        sigma_result = sigma_from_moving_range(data, span=span)
    else:
        # MEDIAN_MOVING_RANGE
        sigma_result = sigma_from_median_moving_range(data, span=span)

    sigma_hat = sigma_result.sigma_hat

    # MR limits using d2(span) and d3(span)
    # CL  = d2(span) * sigma_hat
    # UCL = d2(span)*sigma_hat + K*d3(span)*sigma_hat
    # LCL = max(d2(span)*sigma_hat - K*d3(span)*sigma_hat, 0)
    cl_val = d2(span) * sigma_hat
    half_width = config.k_sigma * d3(span) * sigma_hat
    cl_arr = np.full(len(moving_ranges), cl_val)
    ucl_arr = cl_arr + half_width
    lcl_arr = np.maximum(cl_arr - half_width, 0.0)

    limits = ControlLimits(
        ucl=ucl_arr,
        cl=cl_arr,
        lcl=lcl_arr,
        k_sigma=config.k_sigma,
    )

    zone_sigma = d3(span) * sigma_hat
    zones = compute_zones(mr_bar, zone_sigma)

    return MRChartResult(
        moving_ranges=moving_ranges,
        limits=limits,
        sigma=sigma_result,
        zones=zones,
        mr_bar=mr_bar,
    )
