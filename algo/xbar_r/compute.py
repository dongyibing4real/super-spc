"""
Computation logic for the XBar-R (mean and range) control chart.
"""
from __future__ import annotations

import numpy as np

from ..common.sigma import sigma_from_ranges
from ..common.types import ControlLimits
from ..common.zones import compute_zones
from ..constants.tables import d2, d3
from .models import XBarRConfig, XBarRResult


def compute_xbar_r(
    data: np.ndarray,
    subgroup_sizes: np.ndarray | None = None,
    config: XBarRConfig | None = None,
) -> XBarRResult:
    """Compute XBar-R control chart limits.

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
        Chart configuration. Defaults to XBarRConfig().

    Returns
    -------
    XBarRResult
    """
    if config is None:
        config = XBarRConfig()

    data = np.asarray(data, dtype=float)

    if data.ndim == 2:
        # Equal subgroup sizes from 2-D array
        n_subgroups, n_each = data.shape
        sizes = np.full(n_subgroups, n_each, dtype=int)
        means = data.mean(axis=1)
        ranges = data.max(axis=1) - data.min(axis=1)
    elif data.ndim == 1:
        if subgroup_sizes is None:
            raise ValueError(
                "subgroup_sizes must be provided when data is 1-D"
            )
        subgroup_sizes = np.asarray(subgroup_sizes, dtype=int)
        if subgroup_sizes.sum() != len(data):
            raise ValueError(
                "sum(subgroup_sizes) must equal len(data)"
            )
        sizes = subgroup_sizes
        # Split 1-D data into ragged subgroups
        splits = np.split(data, np.cumsum(sizes)[:-1])
        means = np.array([sg.mean() for sg in splits])
        ranges = np.array([sg.max() - sg.min() for sg in splits])
    else:
        raise ValueError("data must be 1-D or 2-D")

    grand_mean = float(means.mean())
    sigma_result = sigma_from_ranges(ranges, sizes)
    sigma_hat = sigma_result.sigma_hat

    # XBar limits: UCL/LCL = grand_mean +/- K * sigma_hat / sqrt(ni)
    xbar_cl = np.full(len(means), grand_mean)
    xbar_half_width = config.k_sigma * sigma_hat / np.sqrt(sizes.astype(float))
    xbar_ucl = xbar_cl + xbar_half_width
    xbar_lcl = xbar_cl - xbar_half_width

    xbar_limits = ControlLimits(
        ucl=xbar_ucl,
        cl=xbar_cl,
        lcl=xbar_lcl,
        k_sigma=config.k_sigma,
    )

    # R limits: CL = d2(ni) * sigma_hat
    #           UCL = d2(ni)*sigma_hat + K*d3(ni)*sigma_hat
    #           LCL = max(d2(ni)*sigma_hat - K*d3(ni)*sigma_hat, 0)
    r_cl = np.array([d2(int(ni)) * sigma_hat for ni in sizes])
    r_half_width = np.array([config.k_sigma * d3(int(ni)) * sigma_hat for ni in sizes])
    r_ucl = r_cl + r_half_width
    r_lcl = np.maximum(r_cl - r_half_width, 0.0)

    r_limits = ControlLimits(
        ucl=r_ucl,
        cl=r_cl,
        lcl=r_lcl,
        k_sigma=config.k_sigma,
    )

    zones = compute_zones(grand_mean, sigma_hat)

    return XBarRResult(
        subgroup_means=means,
        subgroup_ranges=ranges,
        xbar_limits=xbar_limits,
        r_limits=r_limits,
        sigma=sigma_result,
        zones=zones,
        grand_mean=grand_mean,
    )
