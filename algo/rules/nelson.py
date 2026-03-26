"""
Nelson rules for control chart violation detection.

Each function returns a boolean ndarray mask where True indicates
the corresponding point triggered the rule.
"""
from __future__ import annotations

import numpy as np

from ..common.types import ZoneBreakdown


# ---------------------------------------------------------------------------
# Test 1: Point beyond control limits
# ---------------------------------------------------------------------------

def test_beyond_limits(
    values: np.ndarray,
    ucl: np.ndarray | float,
    lcl: np.ndarray | float,
) -> np.ndarray:
    """Test 1 — point STRICTLY beyond control limits.

    A point triggers if it is strictly greater than UCL or strictly less
    than LCL. Points exactly AT the limit do NOT trigger.

    Parameters
    ----------
    values:
        Observed process values.
    ucl:
        Upper control limit (scalar or same-length array).
    lcl:
        Lower control limit (scalar or same-length array).

    Returns
    -------
    Boolean ndarray of same length as ``values``.
    """
    values = np.asarray(values, dtype=float)
    ucl = np.asarray(ucl, dtype=float)
    lcl = np.asarray(lcl, dtype=float)
    return (values > ucl) | (values < lcl)


# ---------------------------------------------------------------------------
# Test 2: n consecutive points on same side of center line
# ---------------------------------------------------------------------------

def test_same_side(
    values: np.ndarray,
    cl: float,
    n: int = 9,
) -> np.ndarray:
    """Test 2 — n consecutive points on the same side of the center line.

    Points exactly ON the center line reset both counts (neither side).

    Parameters
    ----------
    values:
        Observed process values.
    cl:
        Center line value.
    n:
        Run length required to trigger (default 9).

    Returns
    -------
    Boolean ndarray; the *last* point of each qualifying run is flagged,
    as well as any continuation points beyond the run of n.
    """
    values = np.asarray(values, dtype=float)
    mask = np.zeros(len(values), dtype=bool)
    above_run = 0
    below_run = 0
    for i, v in enumerate(values):
        if v > cl:
            above_run += 1
            below_run = 0
        elif v < cl:
            below_run += 1
            above_run = 0
        else:
            # exactly on CL — reset both
            above_run = 0
            below_run = 0
        if above_run >= n or below_run >= n:
            mask[i] = True
    return mask


# ---------------------------------------------------------------------------
# Test 3: n consecutive strictly increasing or decreasing
# ---------------------------------------------------------------------------

def test_trending(
    values: np.ndarray,
    n: int = 6,
) -> np.ndarray:
    """Test 3 — n consecutive strictly increasing or strictly decreasing points.

    Equal consecutive values break the trend (reset the run count).

    Parameters
    ----------
    values:
        Observed process values.
    n:
        Number of points required (including the first point of the run)
        to constitute a trend. Default 6.

    Returns
    -------
    Boolean ndarray; the last point of each qualifying trend is flagged,
    as well as continuations.
    """
    values = np.asarray(values, dtype=float)
    mask = np.zeros(len(values), dtype=bool)
    if len(values) < 2:
        return mask

    # run_len counts consecutive steps in the same direction (inc or dec).
    # A run of length k means k+1 consecutive points in the same direction.
    inc_run = 0  # consecutive increasing steps so far
    dec_run = 0

    for i in range(1, len(values)):
        diff = values[i] - values[i - 1]
        if diff > 0:
            inc_run += 1
            dec_run = 0
        elif diff < 0:
            dec_run += 1
            inc_run = 0
        else:
            inc_run = 0
            dec_run = 0
        # n points in a row means n-1 consecutive steps
        if inc_run >= n - 1 or dec_run >= n - 1:
            mask[i] = True
    return mask


# ---------------------------------------------------------------------------
# Test 4: n consecutive alternating up/down
# ---------------------------------------------------------------------------

def test_alternating(
    values: np.ndarray,
    n: int = 14,
) -> np.ndarray:
    """Test 4 — n consecutive points alternating up/down.

    Parameters
    ----------
    values:
        Observed process values.
    n:
        Number of points in the alternating run (default 14).

    Returns
    -------
    Boolean ndarray; the last point of each qualifying run is flagged.
    """
    values = np.asarray(values, dtype=float)
    mask = np.zeros(len(values), dtype=bool)
    if len(values) < 2:
        return mask

    # alt_run counts the length of the current alternating sequence
    # (in terms of number of points, starting at 2 when we have 1 valid alternation)
    alt_run = 1  # the first point is always the start

    last_dir: int | None = None  # +1 or -1

    for i in range(1, len(values)):
        diff = values[i] - values[i - 1]
        if diff > 0:
            cur_dir = 1
        elif diff < 0:
            cur_dir = -1
        else:
            # equal — not alternating
            alt_run = 1
            last_dir = None
            continue

        if last_dir is None or cur_dir != last_dir:
            alt_run += 1
            last_dir = cur_dir
        else:
            # same direction twice in a row
            alt_run = 2
            last_dir = cur_dir

        if alt_run >= n:
            mask[i] = True

    return mask


# ---------------------------------------------------------------------------
# Test 5: 2 of 3 in Zone A or beyond, same side
# ---------------------------------------------------------------------------

def test_zone_a(
    values: np.ndarray,
    zones: ZoneBreakdown,
    n: int = 2,
    window: int = 3,
) -> np.ndarray:
    """Test 5 — n of window consecutive points in Zone A or beyond, same side.

    The flagged point itself must be in Zone A (or beyond).

    Zone A upper: >= zone_a_upper
    Zone A lower: <= zone_a_lower

    Parameters
    ----------
    values:
        Observed process values.
    zones:
        Zone boundary object.
    n:
        Number of Zone A+ points required within the window (default 2).
    window:
        Window size (default 3).

    Returns
    -------
    Boolean ndarray mask.
    """
    values = np.asarray(values, dtype=float)
    mask = np.zeros(len(values), dtype=bool)

    # Zone A+ classification: +1 = upper side, -1 = lower side, 0 = neither
    zone_class = np.zeros(len(values), dtype=int)
    zone_class[values >= zones.zone_a_upper] = 1
    zone_class[values <= zones.zone_a_lower] = -1

    for i in range(window - 1, len(values)):
        window_slice = zone_class[i - window + 1 : i + 1]
        current = zone_class[i]
        # current point must be in Zone A+
        if current == 0:
            continue
        # count same-side Zone A+ points in window
        count = int(np.sum(window_slice == current))
        if count >= n:
            mask[i] = True

    return mask


# ---------------------------------------------------------------------------
# Test 6: 4 of 5 in Zone B or beyond, same side
# ---------------------------------------------------------------------------

def test_zone_b(
    values: np.ndarray,
    zones: ZoneBreakdown,
    n: int = 4,
    window: int = 5,
) -> np.ndarray:
    """Test 6 — n of window consecutive points in Zone B or beyond, same side.

    The flagged point itself must be in Zone B+.

    Zone B+ upper: >= zone_b_upper
    Zone B+ lower: <= zone_b_lower

    Parameters
    ----------
    values:
        Observed process values.
    zones:
        Zone boundary object.
    n:
        Number of Zone B+ points required within the window (default 4).
    window:
        Window size (default 5).

    Returns
    -------
    Boolean ndarray mask.
    """
    values = np.asarray(values, dtype=float)
    mask = np.zeros(len(values), dtype=bool)

    zone_class = np.zeros(len(values), dtype=int)
    zone_class[values >= zones.zone_b_upper] = 1
    zone_class[values <= zones.zone_b_lower] = -1

    for i in range(window - 1, len(values)):
        window_slice = zone_class[i - window + 1 : i + 1]
        current = zone_class[i]
        if current == 0:
            continue
        count = int(np.sum(window_slice == current))
        if count >= n:
            mask[i] = True

    return mask


# ---------------------------------------------------------------------------
# Test 7: n consecutive in Zone C
# ---------------------------------------------------------------------------

def test_in_zone_c(
    values: np.ndarray,
    zones: ZoneBreakdown,
    n: int = 15,
) -> np.ndarray:
    """Test 7 — n consecutive points within Zone C (between ±1σ).

    Zone C: zone_b_lower < value < zone_b_upper (exclusive).

    Parameters
    ----------
    values:
        Observed process values.
    zones:
        Zone boundary object.
    n:
        Run length required (default 15).

    Returns
    -------
    Boolean ndarray mask.
    """
    values = np.asarray(values, dtype=float)
    mask = np.zeros(len(values), dtype=bool)

    in_c = (values > zones.zone_b_lower) & (values < zones.zone_b_upper)

    run = 0
    for i, v in enumerate(in_c):
        if v:
            run += 1
            if run >= n:
                mask[i] = True
        else:
            run = 0

    return mask


# ---------------------------------------------------------------------------
# Test 8: n consecutive outside Zone C
# ---------------------------------------------------------------------------

def test_outside_zone_c(
    values: np.ndarray,
    zones: ZoneBreakdown,
    n: int = 8,
) -> np.ndarray:
    """Test 8 — n consecutive points outside Zone C (beyond ±1σ).

    Outside Zone C: value >= zone_b_upper or value <= zone_b_lower.

    Parameters
    ----------
    values:
        Observed process values.
    zones:
        Zone boundary object.
    n:
        Run length required (default 8).

    Returns
    -------
    Boolean ndarray mask.
    """
    values = np.asarray(values, dtype=float)
    mask = np.zeros(len(values), dtype=bool)

    outside_c = (values >= zones.zone_b_upper) | (values <= zones.zone_b_lower)

    run = 0
    for i, v in enumerate(outside_c):
        if v:
            run += 1
            if run >= n:
                mask[i] = True
        else:
            run = 0

    return mask
