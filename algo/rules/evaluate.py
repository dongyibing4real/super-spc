"""
Orchestrator for evaluating Nelson and Westgard rules against a data series.
"""
from __future__ import annotations

import numpy as np

from ..common.types import ControlLimits, ZoneBreakdown
from .models import RuleConfig, RuleViolation
from . import nelson, westgard


_NELSON_DESCRIPTIONS = {
    1: "Point beyond control limits (Test 1)",
    2: "9 consecutive points on same side of CL (Test 2)",
    3: "6 consecutive points trending (Test 3)",
    4: "14 consecutive alternating points (Test 4)",
    5: "2 of 3 in Zone A or beyond, same side (Test 5)",
    6: "4 of 5 in Zone B or beyond, same side (Test 6)",
    7: "15 consecutive in Zone C (Test 7)",
    8: "8 consecutive outside Zone C (Test 8)",
}

_WESTGARD_DESCRIPTIONS = {
    "1_2s": "1 point beyond ±2σ (1_2s)",
    "1_3s": "1 point beyond ±3σ (1_3s)",
    "2_2s": "2 consecutive beyond ±2σ same side (2_2s)",
    "r_4s": "Consecutive points spanning >4σ (R_4s)",
    "4_1s": "4 consecutive beyond ±1σ same side (4_1s)",
    "10_x": "10 consecutive on same side of CL (10_x)",
}


def evaluate_rules(
    values: np.ndarray,
    limits: ControlLimits,
    zones: ZoneBreakdown,
    config: RuleConfig | None = None,
) -> list[RuleViolation]:
    """Evaluate all configured rules against a data series.

    Parameters
    ----------
    values:
        Observed process values (1-D array).
    limits:
        Control limits for the chart.
    zones:
        Zone breakdown for Western Electric / Nelson zone tests.
    config:
        Rule configuration. Defaults to RuleConfig() (Nelson tests 1-5).

    Returns
    -------
    List of RuleViolation objects, one per triggered rule (empty if none).
    """
    if config is None:
        config = RuleConfig()

    values = np.asarray(values, dtype=float)
    violations: list[RuleViolation] = []

    # --- Nelson tests ---
    for test_num in config.nelson_tests:
        params = config.custom_params.get(test_num, {})
        mask: np.ndarray | None = None

        if test_num == 1:
            # Use scalar limits (first element) if limits are arrays
            ucl = limits.ucl[0] if limits.ucl.ndim > 0 else float(limits.ucl)
            lcl = limits.lcl[0] if limits.lcl.ndim > 0 else float(limits.lcl)
            # Use full arrays for proper per-point evaluation
            mask = nelson.test_beyond_limits(values, ucl=limits.ucl, lcl=limits.lcl)
        elif test_num == 2:
            n = params.get("n", 9)
            mask = nelson.test_same_side(values, cl=zones.cl, n=n)
        elif test_num == 3:
            n = params.get("n", 6)
            mask = nelson.test_trending(values, n=n)
        elif test_num == 4:
            n = params.get("n", 14)
            mask = nelson.test_alternating(values, n=n)
        elif test_num == 5:
            n = params.get("n", 2)
            window = params.get("window", 3)
            mask = nelson.test_zone_a(values, zones, n=n, window=window)
        elif test_num == 6:
            n = params.get("n", 4)
            window = params.get("window", 5)
            mask = nelson.test_zone_b(values, zones, n=n, window=window)
        elif test_num == 7:
            n = params.get("n", 15)
            mask = nelson.test_in_zone_c(values, zones, n=n)
        elif test_num == 8:
            n = params.get("n", 8)
            mask = nelson.test_outside_zone_c(values, zones, n=n)
        else:
            raise ValueError(f"Unknown Nelson test number: {test_num}")

        if mask is not None and mask.any():
            violations.append(
                RuleViolation(
                    test_id=test_num,
                    point_indices=np.where(mask)[0],
                    description=_NELSON_DESCRIPTIONS.get(
                        test_num, f"Nelson Test {test_num}"
                    ),
                )
            )

    # --- Westgard rules ---
    for rule_name in config.westgard_rules:
        mask = None

        if rule_name == "1_2s":
            mask = westgard.test_1_2s(values, zones)
        elif rule_name == "1_3s":
            mask = westgard.test_1_3s(values, zones)
        elif rule_name == "2_2s":
            mask = westgard.test_2_2s(values, zones)
        elif rule_name == "r_4s":
            mask = westgard.test_r_4s(values, zones)
        elif rule_name == "4_1s":
            mask = westgard.test_4_1s(values, zones)
        elif rule_name == "10_x":
            mask = westgard.test_10_x(values, cl=zones.cl)
        else:
            raise ValueError(f"Unknown Westgard rule: {rule_name}")

        if mask is not None and mask.any():
            violations.append(
                RuleViolation(
                    test_id=rule_name,
                    point_indices=np.where(mask)[0],
                    description=_WESTGARD_DESCRIPTIONS.get(
                        rule_name, f"Westgard {rule_name}"
                    ),
                )
            )

    return violations
