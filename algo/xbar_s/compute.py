"""
Computation logic for the XBar-S (mean and standard deviation) control chart.
"""
from __future__ import annotations

import numpy as np

from ..common.sigma import sigma_from_stddevs
from ..common.types import ControlLimits
from ..common.zones import compute_zones
from ..constants.tables import c4, c5
from .models import XBarSConfig, XBarSResult


def compute_xbar_s(
    data: np.ndarray,
    subgroup_sizes: np.ndarray | None = None,
    config: XBarSConfig | None = None,
) -> XBarSResult:
    """Compute XBar-S control chart limits.

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
        Chart configuration. Defaults to XBarSConfig().

    Returns
    -------
    XBarSResult
    """
    if config is None:
        config = XBarSConfig()

    data = np.asarray(data, dtype=float)

    if data.ndim == 2:
        n_subgroups, n_each = data.shape
        sizes = np.full(n_subgroups, n_each, dtype=int)
        means = data.mean(axis=1)
        # Sample std dev (ddof=1) per subgroup
        stddevs = data.std(axis=1, ddof=1)
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
        splits = np.split(data, np.cumsum(sizes)[:-1])
        means = np.array([sg.mean() for sg in splits])
        stddevs = np.array([sg.std(ddof=1) for sg in splits])
    else:
        raise ValueError("data must be 1-D or 2-D")

    grand_mean = float(means.mean())
    sigma_result = sigma_from_stddevs(stddevs, sizes)
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

    # S limits: CL = c4(ni) * sigma_hat
    #           UCL = c4(ni)*sigma_hat + K*c5(ni)*sigma_hat
    #           LCL = max(c4(ni)*sigma_hat - K*c5(ni)*sigma_hat, 0)
    s_cl = np.array([c4(int(ni)) * sigma_hat for ni in sizes])
    s_half_width = np.array([config.k_sigma * c5(int(ni)) * sigma_hat for ni in sizes])
    s_ucl = s_cl + s_half_width
    s_lcl = np.maximum(s_cl - s_half_width, 0.0)

    s_limits = ControlLimits(
        ucl=s_ucl,
        cl=s_cl,
        lcl=s_lcl,
        k_sigma=config.k_sigma,
    )

    zones = compute_zones(grand_mean, sigma_hat)

    return XBarSResult(
        subgroup_means=means,
        subgroup_stddevs=stddevs,
        xbar_limits=xbar_limits,
        s_limits=s_limits,
        sigma=sigma_result,
        zones=zones,
        grand_mean=grand_mean,
    )
