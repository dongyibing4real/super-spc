"""
Derived control chart factors computed from the d2/d3/c4/c5 tables.

All factors follow the standard SPC textbook formulas.
"""
import math

from .tables import c4, c5, d2, d3


def A2(n: int) -> float:
    """Factor for X-bar chart control limits using ranges.

    A2(n) = 3 / (d2(n) * sqrt(n))
    """
    return 3.0 / (d2(n) * math.sqrt(n))


def A3(n: int) -> float:
    """Factor for X-bar chart control limits using standard deviations.

    A3(n) = 3 / (c4(n) * sqrt(n))
    """
    return 3.0 / (c4(n) * math.sqrt(n))


def D3(n: int) -> float:
    """Lower control limit factor for R chart (clamped to 0).

    D3(n) = max(1 - 3 * d3(n) / d2(n), 0)
    """
    return max(1.0 - 3.0 * d3(n) / d2(n), 0.0)


def D4(n: int) -> float:
    """Upper control limit factor for R chart.

    D4(n) = 1 + 3 * d3(n) / d2(n)
    """
    return 1.0 + 3.0 * d3(n) / d2(n)


def B3(n: int) -> float:
    """Lower control limit factor for S chart (clamped to 0).

    B3(n) = max(1 - 3 * c5(n) / c4(n), 0)
    """
    return max(1.0 - 3.0 * c5(n) / c4(n), 0.0)


def B4(n: int) -> float:
    """Upper control limit factor for S chart.

    B4(n) = 1 + 3 * c5(n) / c4(n)
    """
    return 1.0 + 3.0 * c5(n) / c4(n)
