"""Tests for Westgard rules."""
import numpy as np
import pytest

import algo.rules.westgard as westgard
from algo.common.types import ZoneBreakdown

# Avoid pytest collecting source functions
rule_1_2s = westgard.test_1_2s
rule_1_3s = westgard.test_1_3s
rule_2_2s = westgard.test_2_2s
rule_r_4s = westgard.test_r_4s
rule_4_1s = westgard.test_4_1s
rule_10_x = westgard.test_10_x


def make_zones(cl=0.0, sigma=1.0) -> ZoneBreakdown:
    return ZoneBreakdown(
        zone_a_upper=cl + 2 * sigma,
        zone_b_upper=cl + 1 * sigma,
        cl=cl,
        zone_b_lower=cl - 1 * sigma,
        zone_a_lower=cl - 2 * sigma,
    )


# ===========================================================================
# test_1_2s
# ===========================================================================

class Test1_2s:
    def test_above_2sigma_triggers(self):
        zones = make_zones(cl=0.0, sigma=1.0)
        values = np.array([0.0, 2.1])
        mask = rule_1_2s(values, zones)
        assert mask.tolist() == [False, True]

    def test_below_minus_2sigma_triggers(self):
        zones = make_zones(cl=0.0, sigma=1.0)
        values = np.array([0.0, -2.1])
        mask = rule_1_2s(values, zones)
        assert mask.tolist() == [False, True]

    def test_exactly_at_2sigma_triggers(self):
        zones = make_zones(cl=0.0, sigma=1.0)
        # zone_a_upper=2.0, value > 2.0 triggers; value=2.0 does NOT
        values = np.array([2.0])
        mask = rule_1_2s(values, zones)
        assert mask.tolist() == [False]

    def test_just_above_2sigma_triggers(self):
        zones = make_zones(cl=0.0, sigma=1.0)
        values = np.array([2.0001])
        mask = rule_1_2s(values, zones)
        assert mask.tolist() == [True]

    def test_no_violation(self):
        zones = make_zones(cl=0.0, sigma=1.0)
        values = np.array([0.0, 1.0, -1.0, 1.9])
        mask = rule_1_2s(values, zones)
        assert not mask.any()

    def test_empty(self):
        zones = make_zones()
        mask = rule_1_2s(np.array([]), zones)
        assert len(mask) == 0


# ===========================================================================
# test_1_3s
# ===========================================================================

class Test1_3s:
    def test_above_3sigma_triggers(self):
        zones = make_zones(cl=0.0, sigma=1.0)
        # 3sigma boundary = 3.0
        values = np.array([3.1])
        mask = rule_1_3s(values, zones)
        assert mask.tolist() == [True]

    def test_exactly_at_3sigma_does_not_trigger(self):
        zones = make_zones(cl=0.0, sigma=1.0)
        values = np.array([3.0])
        mask = rule_1_3s(values, zones)
        assert mask.tolist() == [False]

    def test_below_minus_3sigma_triggers(self):
        zones = make_zones(cl=0.0, sigma=1.0)
        values = np.array([-3.1])
        mask = rule_1_3s(values, zones)
        assert mask.tolist() == [True]

    def test_between_2s_and_3s_no_trigger(self):
        zones = make_zones(cl=0.0, sigma=1.0)
        values = np.array([2.5])
        mask = rule_1_3s(values, zones)
        assert mask.tolist() == [False]

    def test_no_violation(self):
        zones = make_zones(cl=0.0, sigma=1.0)
        values = np.array([0.0, 1.0, -1.0, 2.9])
        mask = rule_1_3s(values, zones)
        assert not mask.any()

    def test_empty(self):
        zones = make_zones()
        mask = rule_1_3s(np.array([]), zones)
        assert len(mask) == 0

    def test_non_zero_cl(self):
        zones = make_zones(cl=10.0, sigma=2.0)
        # 3sigma boundary = 10+6=16, 10-6=4
        values = np.array([16.1, 3.9])
        mask = rule_1_3s(values, zones)
        assert mask.tolist() == [True, True]


# ===========================================================================
# test_2_2s
# ===========================================================================

class Test2_2s:
    def test_two_consecutive_above_2s(self):
        zones = make_zones(cl=0.0, sigma=1.0)
        values = np.array([0.0, 2.5, 2.5])
        mask = rule_2_2s(values, zones)
        assert mask.tolist() == [False, False, True]

    def test_two_consecutive_below_2s(self):
        zones = make_zones(cl=0.0, sigma=1.0)
        values = np.array([0.0, -2.5, -2.5])
        mask = rule_2_2s(values, zones)
        assert mask.tolist() == [False, False, True]

    def test_opposite_sides_no_trigger(self):
        zones = make_zones(cl=0.0, sigma=1.0)
        values = np.array([2.5, -2.5])
        mask = rule_2_2s(values, zones)
        assert not mask.any()

    def test_one_above_no_trigger(self):
        zones = make_zones(cl=0.0, sigma=1.0)
        values = np.array([2.5, 0.5])
        mask = rule_2_2s(values, zones)
        assert not mask.any()

    def test_exactly_at_2s_no_trigger(self):
        zones = make_zones(cl=0.0, sigma=1.0)
        values = np.array([2.0, 2.0])
        mask = rule_2_2s(values, zones)
        # 2.0 == zone_a_upper, not strictly beyond -> no trigger
        assert not mask.any()

    def test_empty(self):
        zones = make_zones()
        mask = rule_2_2s(np.array([]), zones)
        assert len(mask) == 0

    def test_single_point(self):
        zones = make_zones()
        mask = rule_2_2s(np.array([3.0]), zones)
        assert not mask.any()


# ===========================================================================
# test_r_4s
# ===========================================================================

class TestR_4s:
    def test_range_exceeds_4sigma(self):
        zones = make_zones(cl=0.0, sigma=1.0)
        # sigma=1, threshold=4, pair spanning 5
        values = np.array([0.0, 2.5, -2.5])
        mask = rule_r_4s(values, zones)
        # |2.5 - 0.0| = 2.5 < 4, no trigger at index 1
        # |-2.5 - 2.5| = 5.0 > 4, trigger at index 2
        assert mask.tolist() == [False, False, True]

    def test_range_exactly_4sigma_no_trigger(self):
        zones = make_zones(cl=0.0, sigma=1.0)
        # |2.0 - (-2.0)| = 4.0, NOT strictly > 4
        values = np.array([2.0, -2.0])
        mask = rule_r_4s(values, zones)
        assert not mask.any()

    def test_range_just_over_4sigma(self):
        zones = make_zones(cl=0.0, sigma=1.0)
        values = np.array([2.0, -2.0001])
        mask = rule_r_4s(values, zones)
        assert mask[1] == True

    def test_no_violation(self):
        zones = make_zones(cl=0.0, sigma=1.0)
        values = np.array([0.0, 1.0, -1.0, 0.5])
        mask = rule_r_4s(values, zones)
        assert not mask.any()

    def test_empty(self):
        zones = make_zones()
        mask = rule_r_4s(np.array([]), zones)
        assert len(mask) == 0

    def test_single_point(self):
        zones = make_zones()
        mask = rule_r_4s(np.array([5.0]), zones)
        assert not mask.any()


# ===========================================================================
# test_4_1s
# ===========================================================================

class Test4_1s:
    def test_four_above_1sigma_triggers(self):
        zones = make_zones(cl=0.0, sigma=1.0)
        # zone_b_upper=1.0, values > 1.0 are in zone B+
        values = np.array([0.0, 1.5, 1.5, 1.5, 1.5])
        mask = rule_4_1s(values, zones)
        assert mask[4] == True
        assert not mask[:4].any()

    def test_four_below_minus_1sigma_triggers(self):
        zones = make_zones(cl=0.0, sigma=1.0)
        values = np.array([0.0, -1.5, -1.5, -1.5, -1.5])
        mask = rule_4_1s(values, zones)
        assert mask[4] == True

    def test_three_above_no_trigger(self):
        zones = make_zones(cl=0.0, sigma=1.0)
        values = np.array([1.5, 1.5, 1.5])
        mask = rule_4_1s(values, zones)
        assert not mask.any()

    def test_mixed_sides_resets(self):
        zones = make_zones(cl=0.0, sigma=1.0)
        values = np.array([1.5, 1.5, -1.5, 1.5, 1.5, 1.5, 1.5])
        mask = rule_4_1s(values, zones)
        # After -1.5 resets above_run, need 4 more above -> indices 3,4,5,6
        assert mask[6] == True

    def test_exactly_at_1sigma_no_trigger(self):
        zones = make_zones(cl=0.0, sigma=1.0)
        # zone_b_upper=1.0, requires STRICTLY >
        values = np.array([1.0, 1.0, 1.0, 1.0])
        mask = rule_4_1s(values, zones)
        assert not mask.any()

    def test_empty(self):
        zones = make_zones()
        mask = rule_4_1s(np.array([]), zones)
        assert len(mask) == 0


# ===========================================================================
# test_10_x
# ===========================================================================

class Test10x:
    def test_ten_above_cl_triggers(self):
        values = np.array([1.0] * 10)
        mask = rule_10_x(values, cl=0.0)
        assert mask[-1] == True
        assert not mask[:-1].any()

    def test_ten_below_cl_triggers(self):
        values = np.array([-1.0] * 10)
        mask = rule_10_x(values, cl=0.0)
        assert mask[-1] == True

    def test_nine_above_no_trigger(self):
        values = np.array([1.0] * 9)
        mask = rule_10_x(values, cl=0.0)
        assert not mask.any()

    def test_on_cl_resets(self):
        values = np.array([1.0] * 9 + [0.0] + [1.0] * 9)
        mask = rule_10_x(values, cl=0.0)
        assert not mask.any()

    def test_run_continues_past_10(self):
        values = np.array([1.0] * 12)
        mask = rule_10_x(values, cl=0.0)
        assert mask[9] == True
        assert mask[10] == True
        assert mask[11] == True

    def test_empty(self):
        mask = rule_10_x(np.array([]), cl=0.0)
        assert len(mask) == 0
