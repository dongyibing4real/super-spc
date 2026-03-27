"""
Computation logic for the Presummarize control chart.

For repeated measures — multiple measurements per unit, summarized before
charting. Uses known process parameters (target and sigma) rather than
estimating them from data.
"""
from __future__ import annotations

import math

import numpy as np

from ..common.enums import SigmaMethod
from ..common.types import ControlLimits, SigmaResult
from ..common.zones import compute_zones
from .models import PresummarizeConfig, PresummarizeResult


def compute_presummarize(
    data: np.ndarray,
    subgroup_sizes: list[int] | None = None,
    config: PresummarizeConfig | None = None,
) -> PresummarizeResult:
    """Compute a Presummarize control chart.

    Accepts either:
    - A 2-D array of shape (n_subgroups, subgroup_size), or
    - A 1-D array plus a list of subgroup_sizes that partition it, or
    - A 1-D array with summary_stat="individual" (one point per subgroup).

    Parameters
    ----------
    data:
        Array of observed values. Either 2-D (subgroups x observations) or
        1-D (all observations concatenated, partitioned by subgroup_sizes).
    subgroup_sizes:
        List of integers giving the size of each subgroup when data is 1-D.
        Ignored when data is 2-D or summary_stat is "individual".
    config:
        Chart configuration. Defaults to PresummarizeConfig(target=0, sigma=1).

    Returns
    -------
    PresummarizeResult
    """
    if config is None:
        config = PresummarizeConfig(target=0.0, sigma=1.0)

    data = np.asarray(data, dtype=float)

    target = config.target
    sigma = config.sigma
    k = config.k_sigma
    stat = config.summary_stat

    if stat not in ("mean", "median", "individual"):
        raise ValueError(
            f"summary_stat must be 'mean', 'median', or 'individual', got {stat!r}"
        )

    # --- Build subgroups ---
    if stat == "individual":
        # Each data point is its own "subgroup" of size 1
        if data.ndim == 2:
            # Flatten to 1-D
            data = data.ravel()
        subgroups = [np.array([v]) for v in data]
    elif data.ndim == 2:
        # 2-D input: each row is a subgroup
        subgroups = [data[i] for i in range(data.shape[0])]
    elif data.ndim == 1:
        if subgroup_sizes is None:
            raise ValueError(
                "subgroup_sizes must be provided when data is 1-D and "
                "summary_stat is not 'individual'"
            )
        if sum(subgroup_sizes) != len(data):
            raise ValueError(
                f"sum(subgroup_sizes)={sum(subgroup_sizes)} does not match "
                f"len(data)={len(data)}"
            )
        subgroups = []
        idx = 0
        for n in subgroup_sizes:
            subgroups.append(data[idx : idx + n])
            idx += n
    else:
        raise ValueError("data must be 1-D or 2-D")

    n_subgroups = len(subgroups)

    # --- Compute summary values ---
    if stat == "mean":
        summary_values = np.array([float(np.mean(g)) for g in subgroups])
    elif stat == "median":
        summary_values = np.array([float(np.median(g)) for g in subgroups])
    else:  # individual
        summary_values = np.array([float(g[0]) for g in subgroups])

    # --- Compute per-subgroup limits using known parameters ---
    cl_arr = np.full(n_subgroups, target)
    ucl_arr = np.empty(n_subgroups)
    lcl_arr = np.empty(n_subgroups)

    for i, g in enumerate(subgroups):
        ni = len(g)
        half_width = k * sigma / math.sqrt(ni)
        ucl_arr[i] = target + half_width
        lcl_arr[i] = target - half_width

    limits = ControlLimits(
        ucl=ucl_arr,
        cl=cl_arr,
        lcl=lcl_arr,
        k_sigma=k,
    )

    # --- Sigma result: externally provided, treated as Levey-Jennings ---
    sigma_result = SigmaResult(
        sigma_hat=sigma,
        method=SigmaMethod.LEVEY_JENNINGS,
        n_used=0,
    )

    # --- Zone boundaries (based on known target and sigma) ---
    zones = compute_zones(target, sigma)

    return PresummarizeResult(
        summary_values=summary_values,
        limits=limits,
        sigma=sigma_result,
        zones=zones,
        target=target,
    )
