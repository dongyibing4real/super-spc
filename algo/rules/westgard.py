"""
Westgard rules for quality control chart violation detection.

Each function returns a boolean ndarray mask where True indicates
the corresponding point triggered the rule.
"""
from __future__ import annotations

import numpy as np

from ..common.types import ZoneBreakdown


def test_1_2s(
    values: np.ndarray,
    zones: ZoneBreakdown,
) -> np.ndarray:
    """1_2s — 1 point beyond ±2σ (Zone A or beyond).

    Triggers when a point exceeds zone_a_upper or falls below zone_a_lower.

    Parameters
    ----------
    values:
        Observed process values.
    zones:
        Zone boundary object.

    Returns
    -------
    Boolean ndarray mask.
    """
    values = np.asarray(values, dtype=float)
    return (values > zones.zone_a_upper) | (values < zones.zone_a_lower)


def test_1_3s(
    values: np.ndarray,
    zones: ZoneBreakdown,
) -> np.ndarray:
    """1_3s — 1 point beyond ±3σ.

    Computes the 3σ boundary from the zone breakdown:
        upper_3s = cl + 3 * (zone_b_upper - cl)   [i.e., cl + 3 * sigma]
        lower_3s = cl - 3 * (cl - zone_b_lower)

    Parameters
    ----------
    values:
        Observed process values.
    zones:
        Zone boundary object.

    Returns
    -------
    Boolean ndarray mask.
    """
    values = np.asarray(values, dtype=float)
    sigma = zones.zone_b_upper - zones.cl
    upper_3s = zones.cl + 3.0 * sigma
    lower_3s = zones.cl - 3.0 * sigma
    return (values > upper_3s) | (values < lower_3s)


def test_2_2s(
    values: np.ndarray,
    zones: ZoneBreakdown,
) -> np.ndarray:
    """2_2s — 2 consecutive points beyond ±2σ, same side.

    Both points must be on the same side (both above zone_a_upper or
    both below zone_a_lower). The flagged index is the second point.

    Parameters
    ----------
    values:
        Observed process values.
    zones:
        Zone boundary object.

    Returns
    -------
    Boolean ndarray mask.
    """
    values = np.asarray(values, dtype=float)
    mask = np.zeros(len(values), dtype=bool)
    if len(values) < 2:
        return mask

    # Classify each point: +1 = above zone_a_upper, -1 = below zone_a_lower, 0 = neither
    zone_class = np.zeros(len(values), dtype=int)
    zone_class[values > zones.zone_a_upper] = 1
    zone_class[values < zones.zone_a_lower] = -1

    for i in range(1, len(values)):
        if zone_class[i] != 0 and zone_class[i] == zone_class[i - 1]:
            mask[i] = True

    return mask


def test_r_4s(
    values: np.ndarray,
    zones: ZoneBreakdown,
) -> np.ndarray:
    """R_4s — consecutive points spanning more than 4σ.

    For each consecutive pair, if the range between them exceeds 4σ,
    the second point is flagged.

    sigma is derived as: zone_b_upper - cl

    Parameters
    ----------
    values:
        Observed process values.
    zones:
        Zone boundary object.

    Returns
    -------
    Boolean ndarray mask.
    """
    values = np.asarray(values, dtype=float)
    mask = np.zeros(len(values), dtype=bool)
    if len(values) < 2:
        return mask

    sigma = zones.zone_b_upper - zones.cl
    threshold = 4.0 * sigma

    for i in range(1, len(values)):
        if abs(values[i] - values[i - 1]) > threshold:
            mask[i] = True

    return mask


def test_4_1s(
    values: np.ndarray,
    zones: ZoneBreakdown,
) -> np.ndarray:
    """4_1s — 4 consecutive points beyond ±1σ (Zone B or beyond), same side.

    The flagged index is the 4th point.

    Parameters
    ----------
    values:
        Observed process values.
    zones:
        Zone boundary object.

    Returns
    -------
    Boolean ndarray mask.
    """
    values = np.asarray(values, dtype=float)
    mask = np.zeros(len(values), dtype=bool)

    # +1 = above zone_b_upper (1σ), -1 = below zone_b_lower (-1σ), 0 = in zone C
    zone_class = np.zeros(len(values), dtype=int)
    zone_class[values > zones.zone_b_upper] = 1
    zone_class[values < zones.zone_b_lower] = -1

    run_above = 0
    run_below = 0
    for i, cls in enumerate(zone_class):
        if cls == 1:
            run_above += 1
            run_below = 0
        elif cls == -1:
            run_below += 1
            run_above = 0
        else:
            run_above = 0
            run_below = 0
        if run_above >= 4 or run_below >= 4:
            mask[i] = True

    return mask


def test_10_x(
    values: np.ndarray,
    cl: float,
) -> np.ndarray:
    """10_x — 10 consecutive points on the same side of the center line.

    Parameters
    ----------
    values:
        Observed process values.
    cl:
        Center line value.

    Returns
    -------
    Boolean ndarray mask.
    """
    values = np.asarray(values, dtype=float)
    mask = np.zeros(len(values), dtype=bool)

    run_above = 0
    run_below = 0
    for i, v in enumerate(values):
        if v > cl:
            run_above += 1
            run_below = 0
        elif v < cl:
            run_below += 1
            run_above = 0
        else:
            run_above = 0
            run_below = 0
        if run_above >= 10 or run_below >= 10:
            mask[i] = True

    return mask
