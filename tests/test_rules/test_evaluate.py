"""Tests for the evaluate_rules orchestrator."""
import numpy as np
import pytest

from algo.rules import RuleConfig, RuleViolation, evaluate_rules
from algo.common.types import ControlLimits, ZoneBreakdown


def make_limits(n: int = 10, ucl: float = 3.0, lcl: float = -3.0) -> ControlLimits:
    cl_arr = np.zeros(n)
    return ControlLimits(
        ucl=np.full(n, ucl),
        cl=cl_arr,
        lcl=np.full(n, lcl),
        k_sigma=3.0,
    )


def make_zones(cl: float = 0.0, sigma: float = 1.0) -> ZoneBreakdown:
    return ZoneBreakdown(
        zone_a_upper=cl + 2 * sigma,
        zone_b_upper=cl + sigma,
        cl=cl,
        zone_b_lower=cl - sigma,
        zone_a_lower=cl - 2 * sigma,
    )


class TestEvaluateRules:
    def test_default_config_fires_test_1(self):
        """Default config includes Test 1; a beyond-limits point should be found."""
        values = np.array([0.0] * 9 + [4.0])  # last point beyond UCL=3.0
        limits = make_limits(n=10)
        zones = make_zones()
        violations = evaluate_rules(values, limits, zones)
        test_ids = [v.test_id for v in violations]
        assert 1 in test_ids
        # Verify the flagged index
        v1 = next(v for v in violations if v.test_id == 1)
        assert 9 in v1.point_indices

    def test_empty_config_returns_no_violations(self):
        """Empty config (no rules) returns an empty list."""
        values = np.array([4.0] * 20)  # would trigger many rules
        limits = make_limits(n=20)
        zones = make_zones()
        config = RuleConfig(nelson_tests=(), westgard_rules=())
        violations = evaluate_rules(values, limits, zones, config=config)
        assert violations == []

    def test_in_control_data_no_violations(self):
        """Data well within limits with no patterns should return no violations."""
        rng = np.random.default_rng(42)
        values = rng.normal(0, 0.3, size=30)  # tight, within 1 sigma
        limits = make_limits(n=30)
        zones = make_zones()
        config = RuleConfig(nelson_tests=(1,), westgard_rules=())
        violations = evaluate_rules(values, limits, zones, config=config)
        assert violations == []

    def test_multiple_rules_same_point(self):
        """A single data point can trigger multiple rules."""
        # 9 above + last well above UCL triggers both Test 1 and Test 2
        values = np.array([0.5] * 8 + [4.0, 4.0])
        limits = make_limits(n=10)
        zones = make_zones()
        config = RuleConfig(nelson_tests=(1, 2), westgard_rules=())
        violations = evaluate_rules(values, limits, zones, config=config)
        test_ids = {v.test_id for v in violations}
        assert 1 in test_ids
        assert 2 in test_ids

    def test_westgard_rules_dispatched(self):
        """Westgard rules are dispatched correctly."""
        # 10 points above CL triggers 10_x
        values = np.array([1.0] * 10)
        limits = make_limits(n=10)
        zones = make_zones()
        config = RuleConfig(nelson_tests=(), westgard_rules=("10_x",))
        violations = evaluate_rules(values, limits, zones, config=config)
        assert len(violations) == 1
        assert violations[0].test_id == "10_x"

    def test_violation_has_correct_indices(self):
        """RuleViolation.point_indices correctly identifies flagged points."""
        values = np.array([0.0] * 5 + [4.0] * 3)  # last 3 beyond UCL
        limits = make_limits(n=8)
        zones = make_zones()
        config = RuleConfig(nelson_tests=(1,), westgard_rules=())
        violations = evaluate_rules(values, limits, zones, config=config)
        assert len(violations) == 1
        np.testing.assert_array_equal(violations[0].point_indices, [5, 6, 7])

    def test_violation_has_description(self):
        """RuleViolation.description is a non-empty string."""
        values = np.array([4.0])
        limits = make_limits(n=1)
        zones = make_zones()
        config = RuleConfig(nelson_tests=(1,), westgard_rules=())
        violations = evaluate_rules(values, limits, zones, config=config)
        assert len(violations) == 1
        assert isinstance(violations[0].description, str)
        assert len(violations[0].description) > 0

    def test_unknown_nelson_test_raises(self):
        """Unknown Nelson test number raises ValueError."""
        values = np.array([1.0])
        limits = make_limits(n=1)
        zones = make_zones()
        config = RuleConfig(nelson_tests=(99,), westgard_rules=())
        with pytest.raises(ValueError, match="Unknown Nelson test"):
            evaluate_rules(values, limits, zones, config=config)

    def test_unknown_westgard_rule_raises(self):
        """Unknown Westgard rule name raises ValueError."""
        values = np.array([1.0])
        limits = make_limits(n=1)
        zones = make_zones()
        config = RuleConfig(nelson_tests=(), westgard_rules=("bogus_rule",))
        with pytest.raises(ValueError, match="Unknown Westgard rule"):
            evaluate_rules(values, limits, zones, config=config)

    def test_custom_params_override_defaults(self):
        """custom_params can override default n for Nelson tests."""
        # Test 2 with n=3: 3 consecutive above CL should trigger
        values = np.array([1.0, 1.0, 1.0])
        limits = make_limits(n=3)
        zones = make_zones()
        config = RuleConfig(nelson_tests=(2,), custom_params={2: {"n": 3}})
        violations = evaluate_rules(values, limits, zones, config=config)
        assert len(violations) == 1
        assert violations[0].test_id == 2

    def test_default_config_no_trigger_on_clean_data(self):
        """Default config (tests 1-5) returns empty on perfectly in-control data."""
        values = np.array([0.0] * 20)
        limits = make_limits(n=20)
        zones = make_zones()
        violations = evaluate_rules(values, limits, zones)
        # All zeros on CL: Test 1 no (on limit? no, within), Test 2 no (on CL resets),
        # Test 3 no (equal), Test 4 no (not alternating), Test 5 no (not in zone A)
        assert violations == []
