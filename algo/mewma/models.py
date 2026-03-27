"""
MEWMA (Multivariate Exponentially Weighted Moving Average) control chart — data models.

References
----------
Lowry, C.A., Woodall, W.H., Champ, C.W., Rigdon, S.E. (1992).
A Multivariate Exponentially Weighted Moving Average Control Chart.
Technometrics, 34(1), 46-53.

Montgomery, D.C. (2020). Introduction to Statistical Quality Control, 8th ed.,
Section 11.5.
"""
from __future__ import annotations

import attrs
import numpy as np

from algo.common.validators import validate_range


def _check_lambda(instance: object, attribute: attrs.Attribute, value: float) -> None:
    validate_range(value, 0.0, 1.0, "lambda_")
    if value == 0.0:
        raise ValueError("lambda_ must be > 0")


def _check_alpha(instance: object, attribute: attrs.Attribute, value: float) -> None:
    validate_range(value, 0.0, 1.0, "alpha")


@attrs.define(slots=True)
class MEWMAConfig:
    """Configuration for a MEWMA control chart.

    Parameters
    ----------
    lambda_:
        Smoothing parameter in (0, 1]. lambda_=1 gives the Hotelling T²
        chart on raw observations. Typical values: 0.05 to 0.25.
    alpha:
        Type I error rate. Default 0.0027 ≈ 3-sigma equivalent.
    use_exact_covariance:
        If True (default), use the time-varying exact covariance of Z_i.
        If False, use the asymptotic constant covariance.
    """

    lambda_: float = attrs.field(default=0.2, validator=_check_lambda)
    alpha: float = attrs.field(default=0.0027, validator=_check_alpha)
    use_exact_covariance: bool = attrs.field(default=True)


@attrs.define(slots=True)
class MEWMAResult:
    """Result of a MEWMA control chart computation.

    Parameters
    ----------
    mewma_values:
        Smoothed (EWMA) vectors at each time point, shape (n, p).
    t2_values:
        T² statistic at each time point, shape (n,).
    ucl:
        Upper control limit (chi-square based, scalar).
    mean_vector:
        Process mean (target), shape (p,).
    covariance_matrix:
        Original data covariance estimate, shape (p, p).
    violations:
        Boolean mask; True where T²_i > UCL.
    p:
        Number of quality variables.
    n:
        Number of observations.
    """

    mewma_values: np.ndarray
    t2_values: np.ndarray
    ucl: float
    mean_vector: np.ndarray
    covariance_matrix: np.ndarray
    violations: np.ndarray
    p: int
    n: int
