"""
Attribute chart helper functions.

Provides p-bar and u-bar aggregation, and per-subgroup control limit
computation for p-charts (binomial) and u-charts (Poisson).
"""
import numpy as np

from .sigma import sigma_binomial, sigma_poisson
from .types import ControlLimits


def compute_p_bar(defectives: np.ndarray, n_trials: np.ndarray) -> float:
    """Compute the overall proportion defective p-bar.

    p_bar = sum(Xi) / sum(ni)

    Parameters
    ----------
    defectives:
        1-D array of defective counts per subgroup.
    n_trials:
        1-D array of sample sizes per subgroup.

    Returns
    -------
    float: The pooled proportion defective.
    """
    defectives = np.asarray(defectives, dtype=float)
    n_trials = np.asarray(n_trials, dtype=float)
    return float(np.sum(defectives) / np.sum(n_trials))


def compute_u_bar(defects: np.ndarray, n_units: np.ndarray) -> float:
    """Compute the overall average defects per unit u-bar.

    u_bar = sum(ci) / sum(ni)

    Parameters
    ----------
    defects:
        1-D array of defect counts per subgroup.
    n_units:
        1-D array of inspection unit counts per subgroup.

    Returns
    -------
    float: The pooled defects-per-unit rate.
    """
    defects = np.asarray(defects, dtype=float)
    n_units = np.asarray(n_units, dtype=float)
    return float(np.sum(defects) / np.sum(n_units))


def compute_binomial_limits(
    p_bar: float,
    n_trials: np.ndarray,
    k_sigma: float = 3.0,
) -> ControlLimits:
    """Compute per-subgroup control limits for a p-chart.

    UCL = min(p_bar + k * sigma_i, 1.0)
    CL  = p_bar (broadcast to match shape of n_trials)
    LCL = max(p_bar - k * sigma_i, 0.0)

    where sigma_i = sqrt(p_bar * (1 - p_bar) / n_i).

    Parameters
    ----------
    p_bar:
        Overall proportion defective.
    n_trials:
        1-D array of subgroup sample sizes.
    k_sigma:
        Number of sigma multiples for limits (default 3).

    Returns
    -------
    ControlLimits with per-subgroup UCL, CL, LCL arrays.
    """
    n_trials = np.asarray(n_trials, dtype=float)
    sigma = sigma_binomial(p_bar, n_trials)
    cl = np.full_like(sigma, fill_value=p_bar)
    ucl = np.minimum(cl + k_sigma * sigma, 1.0)
    lcl = np.maximum(cl - k_sigma * sigma, 0.0)
    return ControlLimits(ucl=ucl, cl=cl, lcl=lcl, k_sigma=k_sigma)


def compute_poisson_limits(
    u_bar: float,
    n_units: np.ndarray,
    k_sigma: float = 3.0,
) -> ControlLimits:
    """Compute per-subgroup control limits for a u-chart.

    UCL = u_bar + k * sigma_i
    CL  = u_bar (broadcast to match shape of n_units)
    LCL = max(u_bar - k * sigma_i, 0.0)

    where sigma_i = sqrt(u_bar / n_i).

    Parameters
    ----------
    u_bar:
        Overall average defects per unit.
    n_units:
        1-D array of subgroup inspection unit counts.
    k_sigma:
        Number of sigma multiples for limits (default 3).

    Returns
    -------
    ControlLimits with per-subgroup UCL, CL, LCL arrays.
    """
    n_units = np.asarray(n_units, dtype=float)
    sigma = sigma_poisson(u_bar, n_units)
    cl = np.full_like(sigma, fill_value=u_bar)
    ucl = cl + k_sigma * sigma
    lcl = np.maximum(cl - k_sigma * sigma, 0.0)
    return ControlLimits(ucl=ucl, cl=cl, lcl=lcl, k_sigma=k_sigma)
