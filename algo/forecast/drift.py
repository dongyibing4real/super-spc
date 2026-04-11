"""
Drift score computation and OOC estimation.

Ported from src/prediction/drift-score.js.

drift_score = min(1, |slope| / (sigma / sqrt(n)))
Thresholds: < 0.3 = green, 0.3-0.7 = amber, > 0.7 = red
"""
from __future__ import annotations

import math


def compute_drift_score(slope: float, sigma: float, n: int) -> float:
    """Compute drift score as capped t-statistic magnitude."""
    if sigma == 0 or n < 2:
        return 0.0
    sem = sigma / math.sqrt(n)
    return min(1.0, abs(slope) / sem)


def estimate_ooc(
    projected: list[dict],
    ucl: float | None,
    lcl: float | None,
) -> int | None:
    """Estimate samples until projection crosses UCL or LCL.

    Returns the 1-based index of the first breach, or None.
    """
    if ucl is None or lcl is None:
        return None
    for i, pt in enumerate(projected):
        y = pt["y"]
        if y >= ucl or y <= lcl:
            return i + 1
    return None
