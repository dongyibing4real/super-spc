"""
Sigma estimators for variable and attribute control charts.

Variable chart estimators return SigmaResult.
Attribute chart estimators return numpy arrays (per-subgroup sigmas).
"""
import numpy as np

from ..constants.tables import c4, d2
from .enums import SigmaMethod
from .types import SigmaResult

# ---------------------------------------------------------------------------
# Variable Chart Sigma Estimators
# ---------------------------------------------------------------------------


def sigma_from_ranges(
    ranges: np.ndarray,
    subgroup_sizes: np.ndarray,
) -> SigmaResult:
    """Estimate sigma from subgroup ranges.

    sigma_hat = mean(Ri / d2(ni)) for each subgroup i with ni >= 2.

    Parameters
    ----------
    ranges:
        1-D array of subgroup ranges.
    subgroup_sizes:
        1-D integer array of subgroup sizes (ni >= 2).

    Returns
    -------
    SigmaResult with method=RANGE and n_used = len(ranges).
    """
    ranges = np.asarray(ranges, dtype=float)
    subgroup_sizes = np.asarray(subgroup_sizes, dtype=int)
    unbiased = np.array([r / d2(int(n)) for r, n in zip(ranges, subgroup_sizes)])
    return SigmaResult(
        sigma_hat=float(np.mean(unbiased)),
        method=SigmaMethod.RANGE,
        n_used=len(ranges),
    )


def sigma_from_stddevs(
    stddevs: np.ndarray,
    subgroup_sizes: np.ndarray,
) -> SigmaResult:
    """Estimate sigma from subgroup standard deviations.

    sigma_hat = mean(si / c4(ni)) for each subgroup i with ni >= 2.

    Parameters
    ----------
    stddevs:
        1-D array of subgroup sample standard deviations.
    subgroup_sizes:
        1-D integer array of subgroup sizes (ni >= 2).

    Returns
    -------
    SigmaResult with method=STDDEV and n_used = len(stddevs).
    """
    stddevs = np.asarray(stddevs, dtype=float)
    subgroup_sizes = np.asarray(subgroup_sizes, dtype=int)
    unbiased = np.array([s / c4(int(n)) for s, n in zip(stddevs, subgroup_sizes)])
    return SigmaResult(
        sigma_hat=float(np.mean(unbiased)),
        method=SigmaMethod.STDDEV,
        n_used=len(stddevs),
    )


def sigma_from_moving_range(
    values: np.ndarray,
    span: int = 2,
) -> SigmaResult:
    """Estimate sigma from the moving range of individual values.

    For span=2: MR_i = |x_i - x_{i-1}|.
    For span>2: MR_i = range of the window [x_{i-span+1} .. x_i].

    sigma_hat = mean(MR) / d2(span)

    Parameters
    ----------
    values:
        1-D array of individual observations.
    span:
        Moving range span (default 2). Must be >= 2.

    Returns
    -------
    SigmaResult with method=MOVING_RANGE and n_used = len(MR).
    """
    values = np.asarray(values, dtype=float)
    if span == 2:
        mr = np.abs(np.diff(values))
    else:
        # Range within each rolling window of size `span`
        mr = np.array(
            [values[i : i + span].max() - values[i : i + span].min()
             for i in range(len(values) - span + 1)]
        )
    sigma_hat = float(np.mean(mr)) / d2(span)
    return SigmaResult(
        sigma_hat=sigma_hat,
        method=SigmaMethod.MOVING_RANGE,
        n_used=len(mr),
    )


def sigma_from_median_moving_range(
    values: np.ndarray,
    span: int = 2,
) -> SigmaResult:
    """Estimate sigma from the median moving range.

    sigma_hat = median(|x_i - x_{i-1}|) / 0.954

    The constant 0.954 = d2(2) * correction for median vs mean (approximately
    equal to d2(2) = 1.128 * 0.8462 ≈ 0.954, the standard Shewhart constant
    for the median MR with span=2).

    Parameters
    ----------
    values:
        1-D array of individual observations.
    span:
        Moving range span (default 2). Only span=2 is currently supported
        for the 0.954 constant.

    Returns
    -------
    SigmaResult with method=MEDIAN_MOVING_RANGE and n_used = len(MR).
    """
    values = np.asarray(values, dtype=float)
    mr = np.abs(np.diff(values))
    sigma_hat = float(np.median(mr)) / 0.954
    return SigmaResult(
        sigma_hat=sigma_hat,
        method=SigmaMethod.MEDIAN_MOVING_RANGE,
        n_used=len(mr),
    )


def sigma_from_levey_jennings(values: np.ndarray) -> SigmaResult:
    """Estimate sigma using the Levey-Jennings method (sample std dev).

    sigma_hat = std(values, ddof=1)

    Parameters
    ----------
    values:
        1-D array of observations.

    Returns
    -------
    SigmaResult with method=LEVEY_JENNINGS and n_used = len(values).
    """
    values = np.asarray(values, dtype=float)
    return SigmaResult(
        sigma_hat=float(np.std(values, ddof=1)),
        method=SigmaMethod.LEVEY_JENNINGS,
        n_used=len(values),
    )


# ---------------------------------------------------------------------------
# Attribute Chart Sigma Estimators (Task 8)
# ---------------------------------------------------------------------------


def sigma_binomial(p_bar: float, n_trials: np.ndarray) -> np.ndarray:
    """Per-subgroup sigma for a p-chart (binomial).

    sigma_i = sqrt(p_bar * (1 - p_bar) / n_i)

    Parameters
    ----------
    p_bar:
        Overall proportion defective (scalar).
    n_trials:
        1-D array of subgroup sample sizes.

    Returns
    -------
    1-D numpy array of per-subgroup sigma values.
    """
    n_trials = np.asarray(n_trials, dtype=float)
    return np.sqrt(p_bar * (1.0 - p_bar) / n_trials)


def sigma_poisson(u_bar: float, n_units: np.ndarray) -> np.ndarray:
    """Per-subgroup sigma for a u-chart (Poisson).

    sigma_i = sqrt(u_bar / n_i)

    Parameters
    ----------
    u_bar:
        Overall average defects per unit (scalar).
    n_units:
        1-D array of subgroup inspection unit counts.

    Returns
    -------
    1-D numpy array of per-subgroup sigma values.
    """
    n_units = np.asarray(n_units, dtype=float)
    return np.sqrt(u_bar / n_units)


def sigma_laney_adjustment(standardized_residuals: np.ndarray) -> float:
    """Compute the Laney overdispersion adjustment factor.

    The adjustment is sigma_z = MR_bar(residuals) / d2(2),
    which accounts for between-subgroup variation beyond the
    within-subgroup model.

    Parameters
    ----------
    standardized_residuals:
        1-D array of standardized residuals z_i = (p_i - p_bar) / sigma_i.

    Returns
    -------
    float: The Laney sigma_z adjustment value.
    """
    residuals = np.asarray(standardized_residuals, dtype=float)
    mr = np.abs(np.diff(residuals))
    return float(np.mean(mr)) / d2(2)
