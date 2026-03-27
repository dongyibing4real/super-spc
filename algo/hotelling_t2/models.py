"""
Hotelling T² multivariate control chart — data models.

References
----------
Hotelling, H. (1947). Multivariate Quality Control. Techniques of
Statistical Analysis. McGraw-Hill.

Montgomery, D.C. (2020). Introduction to Statistical Quality Control, 8th ed.,
Chapter 11.
"""
from __future__ import annotations

import attrs
import numpy as np

from algo.common.validators import validate_range


def _check_alpha(instance: object, attribute: attrs.Attribute, value: float) -> None:
    validate_range(value, 0.0, 1.0, "alpha")


def _check_phase(instance: object, attribute: attrs.Attribute, value: int) -> None:
    if value not in (1, 2):
        raise ValueError("phase must be 1 or 2")


@attrs.define(slots=True)
class HotellingT2Config:
    """Configuration for a Hotelling T² control chart.

    Parameters
    ----------
    alpha:
        Type I error rate (significance level). Default 0.0027 ≈ 3-sigma
        equivalent for normally distributed data.
    phase:
        1 = Phase I (retrospective analysis of historical data).
        2 = Phase II (prospective monitoring of new observations).
    """

    alpha: float = attrs.field(default=0.0027, validator=_check_alpha)
    phase: int = attrs.field(default=1, validator=_check_phase)


@attrs.define(slots=True)
class HotellingT2Result:
    """Result of a Hotelling T² control chart computation.

    Parameters
    ----------
    t2_values:
        T² statistic for each observation, shape (n,).
    ucl:
        Upper control limit (scalar).
    mean_vector:
        Estimated (or provided) mean vector, shape (p,).
    covariance_matrix:
        Estimated (or provided) covariance matrix, shape (p, p).
    violations:
        Boolean mask; True where T²_i > UCL.
    p:
        Number of quality variables.
    n:
        Number of observations.
    contributions:
        Per-variable contribution to T² for each observation, shape (n, p).
        contributions[i].sum() ≈ t2_values[i] for each i.
    """

    t2_values: np.ndarray
    ucl: float
    mean_vector: np.ndarray
    covariance_matrix: np.ndarray
    violations: np.ndarray
    p: int
    n: int
    contributions: np.ndarray
