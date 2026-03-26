"""
Computation logic for the Levey-Jennings control chart.
"""
from __future__ import annotations

import numpy as np

from ..common.sigma import sigma_from_levey_jennings
from ..common.types import ControlLimits
from ..common.zones import compute_zones
from .models import LeveyJenningsConfig, LeveyJenningsResult


def compute_levey_jennings(
    data: np.ndarray,
    config: LeveyJenningsConfig | None = None,
) -> LeveyJenningsResult:
    """Compute Levey-Jennings control chart limits.

    Uses the overall sample standard deviation (ddof=1) as the sigma estimate.
    UCL = mean + K * sigma
    LCL = mean - K * sigma

    Parameters
    ----------
    data:
        1-D array of observations.
    config:
        Chart configuration. Defaults to LeveyJenningsConfig().

    Returns
    -------
    LeveyJenningsResult
    """
    if config is None:
        config = LeveyJenningsConfig()

    data = np.asarray(data, dtype=float)
    if data.ndim != 1:
        raise ValueError("data must be a 1-D array for a Levey-Jennings chart")

    process_mean = float(np.mean(data))
    sigma_result = sigma_from_levey_jennings(data)
    sigma_hat = sigma_result.sigma_hat

    cl = np.full(len(data), process_mean)
    ucl = cl + config.k_sigma * sigma_hat
    lcl = cl - config.k_sigma * sigma_hat

    limits = ControlLimits(
        ucl=ucl,
        cl=cl,
        lcl=lcl,
        k_sigma=config.k_sigma,
    )

    zones = compute_zones(process_mean, sigma_hat)

    return LeveyJenningsResult(
        values=data,
        limits=limits,
        sigma=sigma_result,
        zones=zones,
        process_mean=process_mean,
    )
