"""
CUSUM (Cumulative Sum) control chart algorithm.

Implements the tabular CUSUM for detecting mean shifts in a process.

References
----------
Montgomery, D.C. (2020). Introduction to Statistical Quality Control, 8th ed.
"""
from __future__ import annotations

import attrs
import numpy as np

from algo.common.validators import validate_non_negative, validate_positive


def _validate_sigma(instance: object, attribute: attrs.Attribute, value: float) -> None:
    validate_positive(value, "sigma")


def _validate_h(instance: object, attribute: attrs.Attribute, value: float) -> None:
    validate_positive(value, "h")


def _validate_k(instance: object, attribute: attrs.Attribute, value: float) -> None:
    validate_positive(value, "k")


def _validate_head_start(instance: object, attribute: attrs.Attribute, value: float) -> None:
    validate_non_negative(value, "head_start")


@attrs.define(slots=True)
class CUSUMConfig:
    """Configuration for a CUSUM control chart.

    Parameters
    ----------
    target:
        Reference (target) value T for the process mean.
    sigma:
        Known or estimated process standard deviation. Must be positive.
    h:
        Decision interval (control limit multiplier times sigma).
        Signal when C+ > h or C- < -h. Must be positive.
    k:
        Allowable slack (reference value). Typically 0.5 for a 1-sigma shift.
        Must be positive.
    head_start:
        Fast Initial Response (FIR) head-start value. Sets C0+ = head_start
        and C0- = -head_start. Must be non-negative (typically h/2).
    data_units:
        If True, values are in the original data units; the algorithm
        normalises by sigma internally. If False (default), values are
        assumed already standardised relative to sigma (i.e. the caller
        passes (xi - T) / sigma or the algorithm uses target and sigma).
    """

    target: float = attrs.field(default=0.0)
    sigma: float = attrs.field(default=1.0, validator=_validate_sigma)
    h: float = attrs.field(default=5.0, validator=_validate_h)
    k: float = attrs.field(default=0.5, validator=_validate_k)
    head_start: float = attrs.field(default=0.0, validator=_validate_head_start)
    data_units: bool = attrs.field(default=False)


@attrs.define(slots=True)
class CUSUMResult:
    """Result of a CUSUM computation.

    Parameters
    ----------
    c_plus:
        Upper cumulative sum statistic (>= 0) for each observation.
    c_minus:
        Lower cumulative sum statistic (<= 0) for each observation.
    upper_limit:
        Decision interval (positive): signal when C+ exceeds this.
    lower_limit:
        Decision interval (negative): signal when C- falls below this.
    violations_upper:
        Boolean array; True where C+ > h.
    violations_lower:
        Boolean array; True where C- < -h.
    shift_starts_upper:
        Array of indices marking the start of the current upward run at
        the time each upper violation is first raised. Contains one entry
        per contiguous block of upper violations.
    shift_starts_lower:
        Array of indices marking the start of each downward shift block.
    """

    c_plus: np.ndarray
    c_minus: np.ndarray
    upper_limit: float
    lower_limit: float
    violations_upper: np.ndarray
    violations_lower: np.ndarray
    shift_starts_upper: np.ndarray
    shift_starts_lower: np.ndarray


def compute_cusum(
    values: np.ndarray,
    config: CUSUMConfig,
) -> CUSUMResult:
    """Compute a CUSUM control chart.

    Algorithm
    ---------
    Standardised input:
        z_i = (x_i - T) / sigma     (always performed internally)

    Recursive statistics:
        C_i+ = max(0, z_i - k + C_{i-1}+),  C_0+ = head_start
        C_i- = min(0, z_i + k + C_{i-1}-),  C_0- = -head_start

    Violations:
        upper: C_i+ > h
        lower: C_i- < -h

    Shift starts:
        The index of the last zero-crossing of C+ (or C-) before the
        current point. This is the estimated start of the current shift.

    Parameters
    ----------
    values:
        1-D array of observed process values.
    config:
        CUSUM configuration.

    Returns
    -------
    CUSUMResult
    """
    x = np.asarray(values, dtype=float)
    if x.ndim != 1:
        raise ValueError("values must be a 1-D array")
    n = len(x)

    target = config.target
    sigma = config.sigma
    h = config.h
    k = config.k
    head_start = config.head_start

    # Standardise
    z = (x - target) / sigma

    c_plus = np.empty(n)
    c_minus = np.empty(n)

    cp_prev = head_start
    cm_prev = -head_start

    for i in range(n):
        cp = max(0.0, z[i] - k + cp_prev)
        cm = min(0.0, z[i] + k + cm_prev)
        c_plus[i] = cp
        c_minus[i] = cm
        cp_prev = cp
        cm_prev = cm

    upper_limit = float(h)
    lower_limit = float(-h)

    violations_upper = c_plus > h
    violations_lower = c_minus < -h

    # --- shift_starts: one entry per contiguous violation block ---
    # The shift start is the index right after the most recent zero
    # (or the beginning of the series) when the first point of each
    # violation block was reached.

    def _find_shift_starts(stat: np.ndarray, violations: np.ndarray, direction: str) -> np.ndarray:
        """Return start indices for each contiguous violation block."""
        starts: list[int] = []
        in_violation = False
        for i in range(n):
            if violations[i] and not in_violation:
                # Find the most recent index where stat was 0
                # (i.e. the last reset before index i)
                if direction == "upper":
                    zeros = np.where(stat[:i] == 0.0)[0]
                else:
                    zeros = np.where(stat[:i] == 0.0)[0]
                if len(zeros) > 0:
                    shift_start = int(zeros[-1]) + 1
                else:
                    shift_start = 0
                starts.append(shift_start)
                in_violation = True
            elif not violations[i]:
                in_violation = False
        return np.array(starts, dtype=int)

    shift_starts_upper = _find_shift_starts(c_plus, violations_upper, "upper")
    shift_starts_lower = _find_shift_starts(c_minus, violations_lower, "lower")

    return CUSUMResult(
        c_plus=c_plus,
        c_minus=c_minus,
        upper_limit=upper_limit,
        lower_limit=lower_limit,
        violations_upper=violations_upper,
        violations_lower=violations_lower,
        shift_starts_upper=shift_starts_upper,
        shift_starts_lower=shift_starts_lower,
    )
