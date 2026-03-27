"""
Computation logic for the standalone S (standard deviation) control chart.
"""
from __future__ import annotations

from statistics import mode

import numpy as np

from ..common.sigma import sigma_from_stddevs
from ..common.types import ControlLimits
from ..common.zones import compute_zones
from ..constants.tables import c4, c5
from .models import SChartConfig, SChartResult


def compute_s_chart(
    data: np.ndarray,
    subgroup_sizes: np.ndarray | None = None,
    config: SChartConfig | None = None,
) -> SChartResult:
    """Compute a standalone S (standard deviation) control chart.

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
        Chart configuration. Defaults to SChartConfig().

    Returns
    -------
    SChartResult
    """
    if config is None:
        config = SChartConfig()

    data = np.asarray(data, dtype=float)

    if data.ndim == 2:
        n_subgroups, n_each = data.shape
        sizes = np.full(n_subgroups, n_each, dtype=int)
        stddevs = np.array([np.std(row, ddof=1) for row in data])
    elif data.ndim == 1:
        if subgroup_sizes is None:
            raise ValueError("subgroup_sizes must be provided when data is 1-D")
        subgroup_sizes = np.asarray(subgroup_sizes, dtype=int)
        if subgroup_sizes.sum() != len(data):
            raise ValueError("sum(subgroup_sizes) must equal len(data)")
        sizes = subgroup_sizes
        splits = np.split(data, np.cumsum(sizes)[:-1])
        stddevs = np.array([np.std(sg, ddof=1) for sg in splits])
    else:
        raise ValueError("data must be 1-D or 2-D")

    sigma_result = sigma_from_stddevs(stddevs, sizes)
    sigma_hat = sigma_result.sigma_hat

    s_bar = float(np.mean(stddevs))

    # Per-subgroup limits
    # CL  = c4(ni) * sigma_hat
    # UCL = c4(ni)*sigma_hat + K*c5(ni)*sigma_hat
    # LCL = max(c4(ni)*sigma_hat - K*c5(ni)*sigma_hat, 0)
    cl_arr = np.array([c4(int(ni)) * sigma_hat for ni in sizes])
    half_width = np.array([config.k_sigma * c5(int(ni)) * sigma_hat for ni in sizes])
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
    zone_sigma = c5(typical_n) * sigma_hat
    zones = compute_zones(s_bar, zone_sigma)

    return SChartResult(
        subgroup_stddevs=stddevs,
        limits=limits,
        sigma=sigma_result,
        zones=zones,
        s_bar=s_bar,
    )
