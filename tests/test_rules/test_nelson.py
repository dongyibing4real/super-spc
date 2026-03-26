"""Tests for Nelson rules 1-8."""
import numpy as np
import pytest

import algo.rules.nelson as nelson
from algo.common.types import ZoneBreakdown

# Aliases to avoid pytest collecting the imported functions as tests
beyond_limits = nelson.test_beyond_limits
same_side = nelson.test_same_side
trending = nelson.test_trending
alternating = nelson.test_alternating
zone_a = nelson.test_zone_a
zone_b = nelson.test_zone_b
in_zone_c = nelson.test_in_zone_c
outside_zone_c = nelson.test_outside_zone_c


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_zones(cl=0.0, sigma=1.0) -> ZoneBreakdown:
    return ZoneBreakdown(
        zone_a_upper=cl + 2 * sigma,
        zone_b_upper=cl + 1 * sigma,
        cl=cl,
        zone_b_lower=cl - 1 * sigma,
        zone_a_lower=cl - 2 * sigma,
    )


# ===========================================================================
# Test 1: test_beyond_limits
# ===========================================================================

class TestBeyondLimits:
    def test_point_above_ucl_triggers(self):
        values = np.array([0.0, 0.0, 5.0])
        mask = beyond_limits(values, ucl=3.0, lcl=-3.0)
        assert mask.tolist() == [False, False, True]

    def test_point_below_lcl_triggers(self):
        values = np.array([0.0, -4.0, 0.0])
        mask = beyond_limits(values, ucl=3.0, lcl=-3.0)
        assert mask.tolist() == [False, True, False]

    def test_point_at_ucl_does_not_trigger(self):
        values = np.array([3.0])
        mask = beyond_limits(values, ucl=3.0, lcl=-3.0)
        assert mask.tolist() == [False]

    def test_point_at_lcl_does_not_trigger(self):
        values = np.array([-3.0])
        mask = beyond_limits(values, ucl=3.0, lcl=-3.0)
        assert mask.tolist() == [False]

    def test_no_violations(self):
        values = np.array([0.0, 1.0, -1.0, 2.9])
        mask = beyond_limits(values, ucl=3.0, lcl=-3.0)
        assert not mask.any()

    def test_all_violations(self):
        values = np.array([4.0, -4.0])
        mask = beyond_limits(values, ucl=3.0, lcl=-3.0)
        assert mask.all()

    def test_empty_input(self):
        values = np.array([])
        mask = beyond_limits(values, ucl=3.0, lcl=-3.0)
        assert len(mask) == 0

    def test_array_limits(self):
        values = np.array([4.0, 4.0, 4.0])
        ucl = np.array([3.0, 5.0, 3.0])
        lcl = np.array([-3.0, -5.0, -3.0])
        mask = beyond_limits(values, ucl=ucl, lcl=lcl)
        assert mask.tolist() == [True, False, True]


# ===========================================================================
# Test 2: test_same_side
# ===========================================================================

class TestSameSide:
    def test_nine_above_triggers_last(self):
        # 9 above CL=0
        values = np.array([1.0] * 9)
        mask = same_side(values, cl=0.0, n=9)
        assert mask[-1] == True
        assert not mask[:-1].any()

    def test_nine_below_triggers_last(self):
        values = np.array([-1.0] * 9)
        mask = same_side(values, cl=0.0, n=9)
        assert mask[-1] == True

    def test_eight_above_does_not_trigger(self):
        values = np.array([1.0] * 8)
        mask = same_side(values, cl=0.0, n=9)
        assert not mask.any()

    def test_point_on_cl_resets(self):
        # 8 above, then CL, then 8 above — should NOT trigger
        values = np.array([1.0] * 8 + [0.0] + [1.0] * 8)
        mask = same_side(values, cl=0.0, n=9)
        assert not mask.any()

    def test_run_continues_past_n(self):
        # 11 above: positions 8,9,10 all flagged
        values = np.array([1.0] * 11)
        mask = same_side(values, cl=0.0, n=9)
        assert mask[8] == True
        assert mask[9] == True
        assert mask[10] == True

    def test_empty_input(self):
        mask = same_side(np.array([]), cl=0.0)
        assert len(mask) == 0

    def test_mixed_sides_no_trigger(self):
        values = np.array([1.0, -1.0, 1.0, -1.0, 1.0, -1.0, 1.0, -1.0, 1.0])
        mask = same_side(values, cl=0.0, n=9)
        assert not mask.any()

    def test_n_equals_1(self):
        # Every non-CL point triggers with n=1
        values = np.array([1.0, 0.0, -1.0])
        mask = same_side(values, cl=0.0, n=1)
        assert mask.tolist() == [True, False, True]


# ===========================================================================
# Test 3: test_trending
# ===========================================================================

class TestTrending:
    def test_six_increasing_triggers(self):
        values = np.array([1.0, 2.0, 3.0, 4.0, 5.0, 6.0])
        mask = trending(values, n=6)
        assert mask[-1] == True
        assert not mask[:-1].any()

    def test_six_decreasing_triggers(self):
        values = np.array([6.0, 5.0, 4.0, 3.0, 2.0, 1.0])
        mask = trending(values, n=6)
        assert mask[-1] == True

    def test_five_increasing_does_not_trigger(self):
        values = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
        mask = trending(values, n=6)
        assert not mask.any()

    def test_equal_values_break_trend(self):
        # 5 increasing, then equal, then 5 more — should not trigger for 10 points
        values = np.array([1.0, 2.0, 3.0, 4.0, 5.0, 5.0, 6.0, 7.0, 8.0, 9.0])
        mask = trending(values, n=6)
        # The equal at index 5 resets. After that only 4 increasing steps (indices 5-9)
        # which is n-1=5 steps needed but only 4 available -> no trigger with 10 points
        assert not mask.any()

    def test_equal_values_break_but_enough_after(self):
        # equal breaks run, but then enough points after to trigger
        values = np.array([1.0, 2.0, 3.0, 4.0, 5.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0])
        mask = trending(values, n=6)
        # After reset at index 5, 5 increasing steps reach index 10 -> trigger
        assert mask[10] == True

    def test_empty_input(self):
        mask = trending(np.array([]), n=6)
        assert len(mask) == 0

    def test_single_point(self):
        mask = trending(np.array([1.0]), n=6)
        assert not mask.any()

    def test_trend_continues_past_n(self):
        values = np.array([1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0])
        mask = trending(values, n=6)
        assert mask[5] == True
        assert mask[6] == True

    def test_n_equals_2(self):
        # Any strictly increasing or decreasing pair triggers
        values = np.array([1.0, 2.0, 1.0])
        mask = trending(values, n=2)
        assert mask[1] == True  # 1->2 increasing
        assert mask[2] == True  # 2->1 decreasing


# ===========================================================================
# Test 4: test_alternating
# ===========================================================================

class TestAlternating:
    def test_14_alternating_triggers(self):
        # Up-down-up-down pattern of 14 points
        values = np.zeros(14)
        for i in range(14):
            values[i] = 1.0 if i % 2 == 0 else 0.0
        mask = alternating(values, n=14)
        assert mask[-1] == True

    def test_thirteen_alternating_does_not_trigger(self):
        values = np.zeros(13)
        for i in range(13):
            values[i] = 1.0 if i % 2 == 0 else 0.0
        mask = alternating(values, n=14)
        assert not mask.any()

    def test_equal_consecutive_breaks_alternating(self):
        # 7 alternating, then equal, then 14 alternating
        values = [1, 0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1]
        values = np.array(values, dtype=float)
        mask = alternating(values, n=14)
        # After the equal pair at indices 6,7, restart count
        # check last point
        assert mask[-1] == True

    def test_empty_input(self):
        mask = alternating(np.array([]), n=14)
        assert len(mask) == 0

    def test_single_point(self):
        mask = alternating(np.array([1.0]), n=14)
        assert not mask.any()

    def test_n_equals_3(self):
        # up-down-up = 3 alternating points
        values = np.array([0.0, 1.0, 0.0, 1.0])
        mask = alternating(values, n=3)
        assert mask[2] == True
        assert mask[3] == True

    def test_monotone_not_alternating(self):
        values = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
        mask = alternating(values, n=3)
        assert not mask.any()


# ===========================================================================
# Test 5: test_zone_a
# ===========================================================================

class TestZoneA:
    def test_two_of_three_zone_a_upper_triggers(self):
        zones = make_zones(cl=0.0, sigma=1.0)
        # Zone A upper: >= 2.0
        # indices 0,1,2: [2.5, 0.5, 2.5] -> 2 of 3 in zone A upper
        values = np.array([2.5, 0.5, 2.5])
        mask = zone_a(values, zones, n=2, window=3)
        assert mask[2] == True

    def test_two_of_three_zone_a_lower_triggers(self):
        zones = make_zones(cl=0.0, sigma=1.0)
        values = np.array([-2.5, -0.5, -2.5])
        mask = zone_a(values, zones, n=2, window=3)
        assert mask[2] == True

    def test_one_of_three_zone_a_does_not_trigger(self):
        zones = make_zones(cl=0.0, sigma=1.0)
        values = np.array([2.5, 0.5, 0.5])
        mask = zone_a(values, zones, n=2, window=3)
        # Only 1 of 3 is zone A; index 2 is not zone A
        assert not mask.any()

    def test_current_point_must_be_zone_a(self):
        zones = make_zones(cl=0.0, sigma=1.0)
        # 2 zone A points but current point is zone B
        values = np.array([2.5, 2.5, 1.5])
        mask = zone_a(values, zones, n=2, window=3)
        # index 2 is in zone B (1.5), not zone A, so no flag at index 2
        assert not mask[2]

    def test_opposite_sides_do_not_mix(self):
        zones = make_zones(cl=0.0, sigma=1.0)
        # One upper zone A, one lower zone A
        values = np.array([2.5, -2.5, 2.5])
        mask = zone_a(values, zones, n=2, window=3)
        # At index 2: current=upper(+1), window=[+1, -1, +1], count of +1 = 2 >= 2 -> triggers
        # This is correct: two upper zone A in window of 3 is a valid trigger
        assert mask[2] == True

    def test_opposite_sides_truly_different(self):
        zones = make_zones(cl=0.0, sigma=1.0)
        # Only one upper zone A point in window of 3 with n=2 required
        values = np.array([-2.5, -2.5, 2.5])
        mask = zone_a(values, zones, n=2, window=3)
        # At index 2: current=+1, window=[-1,-1,+1], count of +1 = 1 < 2 -> no trigger
        assert not mask[2]

    def test_boundary_exactly_at_zone_a(self):
        zones = make_zones(cl=0.0, sigma=1.0)
        # Exactly at zone_a_upper (=2.0) should be in zone A
        values = np.array([2.0, 0.5, 2.0])
        mask = zone_a(values, zones, n=2, window=3)
        assert mask[2] == True

    def test_empty_input(self):
        zones = make_zones()
        mask = zone_a(np.array([]), zones)
        assert len(mask) == 0


# ===========================================================================
# Test 6: test_zone_b
# ===========================================================================

class TestZoneB:
    def test_four_of_five_zone_b_upper_triggers(self):
        zones = make_zones(cl=0.0, sigma=1.0)
        # Zone B+ upper: >= 1.0
        values = np.array([1.5, 1.5, 0.0, 1.5, 1.5])
        mask = zone_b(values, zones, n=4, window=5)
        assert mask[4] == True

    def test_four_of_five_zone_b_lower_triggers(self):
        zones = make_zones(cl=0.0, sigma=1.0)
        values = np.array([-1.5, -1.5, 0.0, -1.5, -1.5])
        mask = zone_b(values, zones, n=4, window=5)
        assert mask[4] == True

    def test_three_of_five_does_not_trigger(self):
        zones = make_zones(cl=0.0, sigma=1.0)
        values = np.array([1.5, 0.0, 0.0, 1.5, 1.5])
        mask = zone_b(values, zones, n=4, window=5)
        assert not mask.any()

    def test_current_point_must_be_zone_b(self):
        zones = make_zones(cl=0.0, sigma=1.0)
        # 4 zone B+ but current is zone C
        values = np.array([1.5, 1.5, 1.5, 1.5, 0.5])
        mask = zone_b(values, zones, n=4, window=5)
        assert not mask[4]

    def test_boundary_at_zone_b(self):
        zones = make_zones(cl=0.0, sigma=1.0)
        values = np.array([1.0, 1.0, 0.5, 1.0, 1.0])
        mask = zone_b(values, zones, n=4, window=5)
        assert mask[4] == True

    def test_empty_input(self):
        zones = make_zones()
        mask = zone_b(np.array([]), zones)
        assert len(mask) == 0


# ===========================================================================
# Test 7: test_in_zone_c
# ===========================================================================

class TestInZoneC:
    def test_fifteen_in_zone_c_triggers(self):
        zones = make_zones(cl=0.0, sigma=1.0)
        # Zone C: -1.0 < v < 1.0
        values = np.array([0.5] * 15)
        mask = in_zone_c(values, zones, n=15)
        assert mask[-1] == True
        assert not mask[:-1].any()

    def test_fourteen_in_zone_c_does_not_trigger(self):
        zones = make_zones(cl=0.0, sigma=1.0)
        values = np.array([0.5] * 14)
        mask = in_zone_c(values, zones, n=15)
        assert not mask.any()

    def test_point_at_zone_b_boundary_breaks_run(self):
        zones = make_zones(cl=0.0, sigma=1.0)
        # Exactly at zone_b_upper (=1.0) is NOT in zone C (zone C is strictly inside)
        # 8 zone_c + 1 boundary + 15 zone_c points
        values = np.array([0.5] * 8 + [1.0] + [0.5] * 15)
        mask = in_zone_c(values, zones, n=15)
        # After the boundary at index 8, zone_c run starts at index 9
        # index 9 + 15 - 1 = index 23 is the first triggered point
        assert mask[23] == True
        assert not mask[:9].any()

    def test_negative_zone_c(self):
        zones = make_zones(cl=0.0, sigma=1.0)
        values = np.array([-0.5] * 15)
        mask = in_zone_c(values, zones, n=15)
        assert mask[-1] == True

    def test_empty_input(self):
        zones = make_zones()
        mask = in_zone_c(np.array([]), zones)
        assert len(mask) == 0

    def test_run_continues_past_n(self):
        zones = make_zones(cl=0.0, sigma=1.0)
        values = np.array([0.5] * 17)
        mask = in_zone_c(values, zones, n=15)
        assert mask[14] == True
        assert mask[15] == True
        assert mask[16] == True


# ===========================================================================
# Test 8: test_outside_zone_c
# ===========================================================================

class TestOutsideZoneC:
    def test_eight_outside_zone_c_triggers(self):
        zones = make_zones(cl=0.0, sigma=1.0)
        # Outside zone C: >= 1.0 or <= -1.0
        values = np.array([1.5] * 8)
        mask = outside_zone_c(values, zones, n=8)
        assert mask[-1] == True
        assert not mask[:-1].any()

    def test_seven_outside_does_not_trigger(self):
        zones = make_zones(cl=0.0, sigma=1.0)
        values = np.array([1.5] * 7)
        mask = outside_zone_c(values, zones, n=8)
        assert not mask.any()

    def test_mixed_upper_lower_outside_triggers(self):
        zones = make_zones(cl=0.0, sigma=1.0)
        # Alternating upper and lower, both outside zone C
        values = np.array([1.5, -1.5] * 4)
        mask = outside_zone_c(values, zones, n=8)
        assert mask[-1] == True

    def test_point_in_zone_c_breaks_run(self):
        zones = make_zones(cl=0.0, sigma=1.0)
        # 5 outside, then zone_c (breaks), then 8 outside -> trigger at last
        values = np.array([1.5] * 5 + [0.5] + [1.5] * 8)
        mask = outside_zone_c(values, zones, n=8)
        assert not mask[:7].any()
        assert mask[-1] == True

    def test_boundary_exactly_at_zone_b(self):
        zones = make_zones(cl=0.0, sigma=1.0)
        # Exactly at zone_b_upper (=1.0) is outside zone C
        values = np.array([1.0] * 8)
        mask = outside_zone_c(values, zones, n=8)
        assert mask[-1] == True

    def test_empty_input(self):
        zones = make_zones()
        mask = outside_zone_c(np.array([]), zones)
        assert len(mask) == 0
