"""
Data models for rule evaluation configuration and results.
"""
from __future__ import annotations

import attrs
import numpy as np


@attrs.define(slots=True)
class RuleConfig:
    """Configuration specifying which rules to evaluate.

    Parameters
    ----------
    nelson_tests:
        Tuple of Nelson test numbers to run (1-8). Default: (1, 2, 3, 4, 5).
    westgard_rules:
        Tuple of Westgard rule names to run (e.g. "1_2s", "1_3s", "2_2s",
        "r_4s", "4_1s", "10_x"). Default: empty tuple.
    custom_params:
        Dict of extra parameters keyed by rule identifier. Allows overriding
        default n / window values.
    """

    nelson_tests: tuple[int, ...] = (1, 2, 3, 4, 5)
    westgard_rules: tuple[str, ...] = ()
    custom_params: dict = attrs.Factory(dict)


@attrs.define(slots=True)
class RuleViolation:
    """A detected rule violation.

    Parameters
    ----------
    test_id:
        Nelson test number (int) or Westgard rule name (str).
    point_indices:
        Indices of the flagged data points.
    description:
        Human-readable description of the violation.
    """

    test_id: int | str
    point_indices: np.ndarray
    description: str
