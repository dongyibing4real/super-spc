"""
Computation logic for the Run Chart.

A run chart is a simple sequence plot with a center line (median or mean).
It includes a runs test to check for non-random patterns.
"""
from __future__ import annotations

import math

import numpy as np
from scipy.stats import norm

from .models import RunChartConfig, RunChartResult


def compute_run_chart(
    data: np.ndarray,
    config: RunChartConfig | None = None,
) -> RunChartResult:
    """Compute a Run Chart with runs test statistics.

    Parameters
    ----------
    data:
        1-D array of observed values.
    config:
        Chart configuration. Defaults to RunChartConfig() (median center).

    Returns
    -------
    RunChartResult
    """
    if config is None:
        config = RunChartConfig()

    data = np.asarray(data, dtype=float)
    if data.ndim != 1:
        raise ValueError("data must be a 1-D array for a Run Chart")

    # Compute center line
    if config.center_method == "median":
        center = float(np.median(data))
    elif config.center_method == "mean":
        center = float(np.mean(data))
    else:
        raise ValueError(
            f"center_method must be 'median' or 'mean', got {config.center_method!r}"
        )

    # Exclude points exactly on the center line
    above = data > center
    below = data < center

    n1 = int(np.sum(above))  # count above
    n2 = int(np.sum(below))  # count below

    # Count runs: consecutive sequences all above or all below center
    # Only consider non-center points
    n_runs = 0
    if n1 + n2 > 0:
        # Build sequence of A/B ignoring on-center points
        signs = np.where(above, 1, np.where(below, -1, 0))
        non_center = signs[signs != 0]
        if len(non_center) > 0:
            n_runs = 1 + int(np.sum(non_center[1:] != non_center[:-1]))

    # Expected runs and variance under null hypothesis
    if n1 + n2 == 0:
        expected_runs = 0.0
        p_value = 1.0
    elif n1 == 0 or n2 == 0:
        expected_runs = 1.0
        p_value = 1.0
    else:
        total = n1 + n2
        expected_runs = (2.0 * n1 * n2) / total + 1.0
        var_runs = (2.0 * n1 * n2 * (2.0 * n1 * n2 - total)) / (
            total ** 2 * (total - 1)
        )
        if var_runs <= 0.0:
            p_value = 1.0
        else:
            z = (n_runs - expected_runs) / math.sqrt(var_runs)
            p_value = float(2.0 * (1.0 - norm.cdf(abs(z))))
            # Clamp to [0, 1] to handle floating-point edge cases
            p_value = max(0.0, min(1.0, p_value))

    return RunChartResult(
        values=data,
        center=center,
        n_runs=n_runs,
        expected_runs=expected_runs,
        p_value=p_value,
    )
