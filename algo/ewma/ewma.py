"""
EWMA (Exponentially Weighted Moving Average) control chart algorithm.

Implements both exact (time-varying) and asymptotic control limits.

References
----------
Roberts, S.W. (1959). Control chart tests based on geometric moving averages.
Technometrics, 1(3), 239-250.

Montgomery, D.C. (2020). Introduction to Statistical Quality Control, 8th ed.,
Section 9.2.
"""
from __future__ import annotations

import attrs
import numpy as np

from algo.common.validators import validate_positive, validate_range


def _validate_sigma(instance: object, attribute: attrs.Attribute, value: float) -> None:
    validate_positive(value, "sigma")


def _validate_lambda(instance: object, attribute: attrs.Attribute, value: float) -> None:
    # lambda_ must be in (0, 1]
    if value <= 0 or value > 1:
        raise ValueError(
            f"lambda_ must be in (0, 1], got {value!r}"
        )


def _validate_k_sigma(instance: object, attribute: attrs.Attribute, value: float) -> None:
    validate_positive(value, "k_sigma")


@attrs.define(slots=True)
class EWMAConfig:
    """Configuration for an EWMA control chart.

    Parameters
    ----------
    target:
        Process target (reference) value mu_0.
    sigma:
        Known or estimated process standard deviation (must be positive).
    lambda_:
        Smoothing parameter in (0, 1]. lambda_=1 gives the Shewhart chart.
        Typical values: 0.05 to 0.25.
    k_sigma:
        Control limit multiplier (sigma multiple). Must be positive.
        Default 3.0 for 3-sigma limits.
    use_exact_limits:
        If True (default), compute time-varying exact limits using the
        recursive variance formula. If False, use the asymptotic limits
        (constant across all observations).
    """

    target: float = attrs.field(default=0.0)
    sigma: float = attrs.field(default=1.0, validator=_validate_sigma)
    lambda_: float = attrs.field(default=0.2, validator=_validate_lambda)
    k_sigma: float = attrs.field(default=3.0, validator=_validate_k_sigma)
    use_exact_limits: bool = attrs.field(default=True)


@attrs.define(slots=True)
class EWMAResult:
    """Result of an EWMA control chart computation.

    Parameters
    ----------
    ewma:
        The EWMA statistic at each time point.
    ucl:
        Upper control limit at each time point (constant for asymptotic,
        time-varying for exact).
    lcl:
        Lower control limit at each time point.
    center:
        Center line (= target) at each time point.
    violations:
        Boolean array; True where EWMA < LCL or EWMA > UCL.
    forecast:
        One-step-ahead forecast: the last EWMA value (EWMA_{n}).
    residuals:
        One-step-ahead prediction errors.
        residuals[0] = x[0] - target
        residuals[i] = x[i] - EWMA[i-1]  for i > 0
    """

    ewma: np.ndarray
    ucl: np.ndarray
    lcl: np.ndarray
    center: np.ndarray
    violations: np.ndarray
    forecast: float
    residuals: np.ndarray


def compute_ewma(
    values: np.ndarray,
    config: EWMAConfig,
    subgroup_sizes: np.ndarray | None = None,
) -> EWMAResult:
    """Compute an EWMA control chart.

    Algorithm
    ---------
    EWMA statistic:
        EWMA_0 = target
        EWMA_i = lambda * x_i + (1 - lambda) * EWMA_{i-1}

    Residuals:
        residuals[0] = x[0] - target
        residuals[i] = x[i] - EWMA[i-1]  (one-step-ahead prediction error)

    Exact (time-varying) variance, using the recursive formula:
        var_i = lambda^2 * var_{i-1} + lambda^2 / n_i
        var_0 = 0   (initialisation)
        UCL_i = target + k * sigma * sqrt(var_i)
        LCL_i = target - k * sigma * sqrt(var_i)

    Asymptotic (constant) variance:
        var_inf = lambda / (n_avg * (2 - lambda))
        UCL = target + k * sigma * sqrt(var_inf)  [constant]

    Forecast:
        The last EWMA value is the best one-step-ahead forecast.

    Parameters
    ----------
    values:
        1-D array of observed process values (individual measurements or
        subgroup means).
    config:
        EWMA configuration.
    subgroup_sizes:
        Optional 1-D array of subgroup sizes (integers >= 1), one per
        observation. If None, all subgroups are assumed to have size 1.

    Returns
    -------
    EWMAResult
    """
    x = np.asarray(values, dtype=float)
    if x.ndim != 1:
        raise ValueError("values must be a 1-D array")
    n = len(x)

    if subgroup_sizes is not None:
        ni = np.asarray(subgroup_sizes, dtype=float)
        if ni.ndim != 1 or len(ni) != n:
            raise ValueError("subgroup_sizes must be a 1-D array with the same length as values")
    else:
        ni = np.ones(n)

    target = config.target
    sigma = config.sigma
    lam = config.lambda_
    k = config.k_sigma
    use_exact = config.use_exact_limits

    # --- EWMA statistic and residuals ---
    ewma = np.empty(n)
    residuals = np.empty(n)

    ewma_prev = target
    for i in range(n):
        if i == 0:
            residuals[0] = x[0] - target
        else:
            residuals[i] = x[i] - ewma_prev
        ewma_i = lam * x[i] + (1.0 - lam) * ewma_prev
        ewma[i] = ewma_i
        ewma_prev = ewma_i

    # --- Control limits ---
    if use_exact:
        # Exact time-varying variance (Montgomery 2020, eq. 9.26):
        #   Var(EWMA_i) = (sigma^2 / n_i) * (lambda / (2 - lambda))
        #                 * (1 - (1 - lambda)^{2(i+1)})
        # For varying subgroup sizes, we approximate n_i as the subgroup size
        # at each step.  This is the standard closed-form expression (not the
        # recursive one, which has a different starting condition).
        ucl = np.empty(n)
        lcl = np.empty(n)
        asym_factor = lam / (2.0 - lam)
        for i in range(n):
            decay = 1.0 - (1.0 - lam) ** (2 * (i + 1))
            var_i = (1.0 / ni[i]) * asym_factor * decay
            half_width = k * sigma * np.sqrt(var_i)
            ucl[i] = target + half_width
            lcl[i] = target - half_width
    else:
        # Asymptotic constant limits
        n_avg = float(np.mean(ni))
        var_inf = lam / (n_avg * (2.0 - lam))
        half_width = k * sigma * np.sqrt(var_inf)
        ucl = np.full(n, target + half_width)
        lcl = np.full(n, target - half_width)

    center = np.full(n, target)
    violations = (ewma > ucl) | (ewma < lcl)
    forecast = float(ewma[-1])

    return EWMAResult(
        ewma=ewma,
        ucl=ucl,
        lcl=lcl,
        center=center,
        violations=violations,
        forecast=forecast,
        residuals=residuals,
    )
