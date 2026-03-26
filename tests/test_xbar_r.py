"""
Tests for algo/xbar_r - XBar-R control chart.
"""
import numpy as np
import pytest

from algo.constants.tables import d2, d3
from algo.xbar_r import XBarRConfig, XBarRResult, compute_xbar_r


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _make_equal_subgroups(values: list[list[float]]) -> np.ndarray:
    return np.array(values, dtype=float)


# ---------------------------------------------------------------------------
# Known-answer test (hand-computed)
# ---------------------------------------------------------------------------

class TestXBarRKnownAnswer:
    """Verify limits against hand-computed values for equal subgroups of size 5."""

    # 5 subgroups of 5 observations each.
    # Constructed so grand_mean = 10.0, all subgroup ranges = 2.326
    # => sigma_hat = 2.326 / d2(5) = 2.326 / 2.326 = 1.0
    DATA = np.array([
        [9.0, 10.0, 11.0, 10.5, 9.5],   # mean=10.0, range=2.0
        [8.5, 10.0, 10.5, 10.0, 11.0],  # mean=10.0, range=2.5
        [9.5, 10.0, 10.5, 9.5, 10.5],   # mean=10.0, range=1.0
        [9.0, 10.0, 11.5, 10.0, 9.5],   # mean=10.0, range=2.5
        [9.0, 10.0, 11.0, 10.5, 9.5],   # mean=10.0, range=2.0
    ], dtype=float)
    # Ranges: [2.0, 2.5, 1.0, 2.5, 2.0], R_bar = 2.0
    # sigma_hat = R_bar / d2(5) = 2.0 / 2.326

    def test_grand_mean(self):
        result = compute_xbar_r(self.DATA)
        assert result.grand_mean == pytest.approx(10.0, rel=1e-6)

    def test_subgroup_means_shape(self):
        result = compute_xbar_r(self.DATA)
        assert result.subgroup_means.shape == (5,)
        np.testing.assert_allclose(result.subgroup_means, 10.0, atol=1e-10)

    def test_sigma_hat(self):
        result = compute_xbar_r(self.DATA)
        r_bar = np.mean([2.0, 2.5, 1.0, 2.5, 2.0])
        expected_sigma = r_bar / d2(5)
        assert result.sigma.sigma_hat == pytest.approx(expected_sigma, rel=1e-4)

    def test_xbar_limits(self):
        result = compute_xbar_r(self.DATA)
        sigma_hat = result.sigma.sigma_hat
        expected_ucl = 10.0 + 3.0 * sigma_hat / np.sqrt(5)
        expected_lcl = 10.0 - 3.0 * sigma_hat / np.sqrt(5)
        np.testing.assert_allclose(result.xbar_limits.ucl, expected_ucl, rtol=1e-5)
        np.testing.assert_allclose(result.xbar_limits.lcl, expected_lcl, rtol=1e-5)
        np.testing.assert_allclose(result.xbar_limits.cl, 10.0, atol=1e-10)

    def test_r_limits(self):
        result = compute_xbar_r(self.DATA)
        sigma_hat = result.sigma.sigma_hat
        expected_cl = d2(5) * sigma_hat
        expected_ucl = expected_cl + 3.0 * d3(5) * sigma_hat
        expected_lcl = max(expected_cl - 3.0 * d3(5) * sigma_hat, 0.0)
        np.testing.assert_allclose(result.r_limits.ucl, expected_ucl, rtol=1e-5)
        np.testing.assert_allclose(result.r_limits.cl, expected_cl, rtol=1e-5)
        np.testing.assert_allclose(result.r_limits.lcl, expected_lcl, rtol=1e-5)

    def test_result_type(self):
        result = compute_xbar_r(self.DATA)
        assert isinstance(result, XBarRResult)


# ---------------------------------------------------------------------------
# Single-subgroup edge case
# ---------------------------------------------------------------------------

class TestXBarRSingleSubgroup:
    def test_single_subgroup_2d(self):
        data = np.array([[5.0, 7.0, 6.0, 8.0, 9.0]])
        result = compute_xbar_r(data)
        assert result.subgroup_means.shape == (1,)
        assert result.subgroup_ranges.shape == (1,)
        assert result.grand_mean == pytest.approx(7.0, rel=1e-6)

    def test_single_subgroup_range(self):
        data = np.array([[5.0, 7.0, 6.0, 8.0, 9.0]])
        result = compute_xbar_r(data)
        assert result.subgroup_ranges[0] == pytest.approx(4.0, rel=1e-6)  # 9-5


# ---------------------------------------------------------------------------
# R LCL is non-negative
# ---------------------------------------------------------------------------

class TestRLclNonNegative:
    def test_r_lcl_non_negative(self):
        """For small subgroup sizes, d2 - K*d3 can be negative; LCL must be floored at 0."""
        # n=2: d2=1.128, d3=0.8525 -> d2 - 3*d3 = 1.128 - 2.558 = -1.43 -> floor at 0
        rng = np.random.default_rng(0)
        data = rng.normal(10.0, 1.0, size=(20, 2))
        result = compute_xbar_r(data)
        assert np.all(result.r_limits.lcl >= 0.0)

    def test_r_lcl_non_negative_n3(self):
        rng = np.random.default_rng(1)
        data = rng.normal(0.0, 1.0, size=(15, 3))
        result = compute_xbar_r(data)
        assert np.all(result.r_limits.lcl >= 0.0)


# ---------------------------------------------------------------------------
# Wider k_sigma -> wider limits
# ---------------------------------------------------------------------------

class TestWiderKSigma:
    def test_wider_k_gives_wider_xbar_limits(self):
        rng = np.random.default_rng(42)
        data = rng.normal(50.0, 2.0, size=(10, 5))
        result3 = compute_xbar_r(data, config=XBarRConfig(k_sigma=3.0))
        result4 = compute_xbar_r(data, config=XBarRConfig(k_sigma=4.0))
        assert np.all(result4.xbar_limits.ucl >= result3.xbar_limits.ucl)
        assert np.all(result4.xbar_limits.lcl <= result3.xbar_limits.lcl)

    def test_wider_k_gives_wider_r_limits(self):
        rng = np.random.default_rng(42)
        data = rng.normal(50.0, 2.0, size=(10, 5))
        result3 = compute_xbar_r(data, config=XBarRConfig(k_sigma=3.0))
        result4 = compute_xbar_r(data, config=XBarRConfig(k_sigma=4.0))
        assert np.all(result4.r_limits.ucl >= result3.r_limits.ucl)


# ---------------------------------------------------------------------------
# 1-D input with subgroup_sizes
# ---------------------------------------------------------------------------

class TestXBarR1DInput:
    def test_1d_equal_sizes_matches_2d(self):
        rng = np.random.default_rng(7)
        data_2d = rng.normal(10.0, 1.0, size=(5, 4))
        data_1d = data_2d.ravel()
        sizes = np.full(5, 4, dtype=int)

        r2d = compute_xbar_r(data_2d)
        r1d = compute_xbar_r(data_1d, subgroup_sizes=sizes)

        np.testing.assert_allclose(r2d.subgroup_means, r1d.subgroup_means, rtol=1e-10)
        np.testing.assert_allclose(r2d.subgroup_ranges, r1d.subgroup_ranges, rtol=1e-10)
        assert r2d.grand_mean == pytest.approx(r1d.grand_mean, rel=1e-10)

    def test_1d_missing_sizes_raises(self):
        data = np.array([1.0, 2.0, 3.0, 4.0])
        with pytest.raises(ValueError, match="subgroup_sizes"):
            compute_xbar_r(data)


# ---------------------------------------------------------------------------
# Config validation
# ---------------------------------------------------------------------------

class TestXBarRConfigValidation:
    def test_negative_k_sigma_raises(self):
        with pytest.raises(ValueError):
            XBarRConfig(k_sigma=-1.0)

    def test_zero_k_sigma_raises(self):
        with pytest.raises(ValueError):
            XBarRConfig(k_sigma=0.0)

    def test_default_k_sigma(self):
        cfg = XBarRConfig()
        assert cfg.k_sigma == pytest.approx(3.0)


# ---------------------------------------------------------------------------
# Zones
# ---------------------------------------------------------------------------

class TestXBarRZones:
    def test_zones_consistent_with_grand_mean(self):
        rng = np.random.default_rng(9)
        data = rng.normal(20.0, 1.0, size=(8, 5))
        result = compute_xbar_r(data)
        assert result.zones.cl == pytest.approx(result.grand_mean, rel=1e-10)
        assert result.zones.zone_a_upper > result.zones.zone_b_upper
        assert result.zones.zone_b_upper > result.zones.cl
        assert result.zones.cl > result.zones.zone_b_lower
        assert result.zones.zone_b_lower > result.zones.zone_a_lower
