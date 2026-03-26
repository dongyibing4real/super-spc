"""
Tests for algo/common/zones.py.

Tests standard zones, zero sigma, and negative CL.
"""
import pytest

from algo.common.zones import compute_zones


class TestComputeZones:
    def test_standard_zones_cl_zero_sigma_one(self):
        """With CL=0, sigma=1: zones are at ±1, ±2, 0."""
        z = compute_zones(cl=0.0, sigma_hat=1.0)
        assert z.cl == pytest.approx(0.0)
        assert z.zone_b_upper == pytest.approx(1.0)
        assert z.zone_a_upper == pytest.approx(2.0)
        assert z.zone_b_lower == pytest.approx(-1.0)
        assert z.zone_a_lower == pytest.approx(-2.0)

    def test_standard_zones_cl_100_sigma_10(self):
        """With CL=100, sigma=10: zone boundaries at 110, 120, 90, 80."""
        z = compute_zones(cl=100.0, sigma_hat=10.0)
        assert z.cl == pytest.approx(100.0)
        assert z.zone_b_upper == pytest.approx(110.0)
        assert z.zone_a_upper == pytest.approx(120.0)
        assert z.zone_b_lower == pytest.approx(90.0)
        assert z.zone_a_lower == pytest.approx(80.0)

    def test_zones_are_symmetric_around_cl(self):
        z = compute_zones(cl=50.0, sigma_hat=5.0)
        assert z.zone_a_upper - z.cl == pytest.approx(z.cl - z.zone_a_lower)
        assert z.zone_b_upper - z.cl == pytest.approx(z.cl - z.zone_b_lower)

    def test_ordering(self):
        z = compute_zones(cl=10.0, sigma_hat=2.0)
        assert z.zone_a_upper > z.zone_b_upper > z.cl
        assert z.cl > z.zone_b_lower > z.zone_a_lower

    def test_zero_sigma(self):
        """Zero sigma: all zone boundaries equal CL."""
        z = compute_zones(cl=5.0, sigma_hat=0.0)
        assert z.zone_a_upper == pytest.approx(5.0)
        assert z.zone_b_upper == pytest.approx(5.0)
        assert z.cl == pytest.approx(5.0)
        assert z.zone_b_lower == pytest.approx(5.0)
        assert z.zone_a_lower == pytest.approx(5.0)

    def test_negative_cl(self):
        """Negative CL is valid (e.g., a chart centred below zero)."""
        z = compute_zones(cl=-10.0, sigma_hat=2.0)
        assert z.cl == pytest.approx(-10.0)
        assert z.zone_a_upper == pytest.approx(-6.0)
        assert z.zone_a_lower == pytest.approx(-14.0)

    def test_zone_b_is_one_sigma_from_cl(self):
        z = compute_zones(cl=0.0, sigma_hat=3.0)
        assert z.zone_b_upper == pytest.approx(3.0)
        assert z.zone_b_lower == pytest.approx(-3.0)

    def test_zone_a_is_two_sigma_from_cl(self):
        z = compute_zones(cl=0.0, sigma_hat=3.0)
        assert z.zone_a_upper == pytest.approx(6.0)
        assert z.zone_a_lower == pytest.approx(-6.0)
