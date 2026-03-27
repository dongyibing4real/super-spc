"""
Computation logic for the standalone R (range) control chart.
"""
from __future__ import annotations

from statistics import mode

import numpy as np

from ..common.sigma import sigma_from_ranges
from ..common.types import ControlLimits
from ..common.zones import compute_zones
from ..constants.tables import d2, d3
from .models import RChartConfig, RChartResult


def compute_r_chart(
    data: np.ndarray,
    subgroup_sizes: np.ndarray | None = None,
    config: RChartConfig | None = None,
) -> RChartResult:
    """Compute a standalone R (range) control chart.

    Parameters
    ----------
    data:
        Either a 2-D array of shape (n_subgroups, subgroup_size) for equal
        subgroup sizes, or a 1-D array of individual observations when
        ``subgroup_sizes`` is provided.
    subgroup_sizes:
        1-D integer array of subgroup sizes. Required when ``data`` is 1-D.
        When ``data`` is 2-D this argument is ignored.
    config:
        Chart configuration. Defaults to RChartConfig().

    Returns
    -------
    RChartResult
    """
    if config is None:
        config = RChartConfig()

    data = np.asarray(data, dtype=float)

    if data.ndim == 2:
        n_subgroups, n_each = data.shape
        sizes = np.full(n_subgroups, n_each, dtype=int)
        ranges = data.max(axis=1) - data.min(axis=1)
    elif data.ndim == 1:
        if subgroup_sizes is None:
            raise ValueError("subgroup_sizes must be provided when data is 1-D")
        subgroup_sizes = np.asarray(subgroup_sizes, dtype=int)
        if subgroup_sizes.sum() != len(data):
            raise ValueError("sum(subgroup_sizes) must equal len(data)")
        sizes = subgroup_sizes
        splits = np.split(data, np.cumsum(sizes)[:-1])
        ranges = np.array([sg.max() - sg.min() for sg in splits])
    else:
        raise ValueError("data must be 1-D or 2-D")

    sigma_result = sigma_from_ranges(ranges, sizes)
    sigma_hat = sigma_result.sigma_hat

    r_bar = float(np.mean(ranges))

    # Per-subgroup limits
    # CL  = d2(ni) * sigma_hat
    # UCL = d2(ni)*sigma_hat + K*d3(ni)*sigma_hat
    # LCL = max(d2(ni)*sigma_hat - K*d3(ni)*sigma_hat, 0)
    cl_arr = np.array([d2(int(ni)) * sigma_hat for ni in sizes])
    half_width = np.array([config.k_sigma * d3(int(ni)) * sigma_hat for ni in sizes])
    ucl_arr = cl_arr + half_width
    lcl_arr = np.maximum(cl_arr - half_width, 0.0)

    limits = ControlLimits(
        ucl=ucl_arr,
        cl=cl_arr,
        lcl=lcl_arr,
        k_sigma=config.k_sigma,
    )

    # Zones use the mode subgroup size (typical_n)
    typical_n = int(mode(sizes.tolist()))
    zone_sigma = d3(typical_n) * sigma_hat
    zones = compute_zones(r_bar, zone_sigma)

    return RChartResult(
        subgroup_ranges=ranges,
        limits=limits,
        sigma=sigma_result,
        zones=zones,
        r_bar=r_bar,
    )
