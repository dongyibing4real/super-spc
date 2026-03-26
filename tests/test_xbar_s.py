"""
Tests for algo/xbar_s - XBar-S control chart.
"""
import numpy as np
import pytest

from algo.constants.tables import c4, c5
from algo.xbar_s import XBarSConfig, XBarSResult, compute_xbar_s


# ---------------------------------------------------------------------------
# Known-answer test (hand-computed)
# ---------------------------------------------------------------------------

class TestXBarSKnownAnswer:
    """Verify limits against hand-computed values for equal subgroups of size 5."""

    # 5 subgroups of 5; each subgroup is mean=10, std varies
    # We'll use data where each std is exactly c4(5)*1.0 = 0.9400
    # so sigma_hat = mean(si/c4(5)) = 1.0
    # Construct subgroups that have sample stddev ~0.94 each
    # Simpler: use subgroups of [8,9,10,11,12] -> mean=10, std=1.5811
    DATA = np.array([
        [8.0, 9.0, 10.0, 11.0, 12.0],
        [8.0, 9.0, 10.0, 11.0, 12.0],
        [8.0, 9.0, 10.0, 11.0, 12.0],
        [8.0, 9.0, 10.0, 11.0, 12.0],
        [8.0, 9.0, 10.0, 11.0, 12.0],
    ], dtype=float)
    # All subgroups identical -> mean=10, std=std([8..12], ddof=1)
    # std([8,9,10,11,12], ddof=1) = sqrt(10/4) = sqrt(2.5) ~ 1.5811
    S_EACH = np.std(np.array([8.0, 9.0, 10.0, 11.0, 12.0]), ddof=1)

    def test_grand_mean(self):
        result = compute_xbar_s(self.DATA)
        assert result.grand_mean == pytest.approx(10.0, rel=1e-6)

    def test_subgroup_stddevs_shape(self):
        result = compute_xbar_s(self.DATA)
        assert result.subgroup_stddevs.shape == (5,)
        np.testing.assert_allclose(result.subgroup_stddevs, self.S_EACH, rtol=1e-6)

    def test_sigma_hat(self):
        result = compute_xbar_s(self.DATA)
        # sigma_hat = mean(si / c4(5))
        expected_sigma = self.S_EACH / c4(5)
        assert result.sigma.sigma_hat == pytest.approx(expected_sigma, rel=1e-4)

    def test_xbar_limits(self):
        result = compute_xbar_s(self.DATA)
        sigma_hat = result.sigma.sigma_hat
        expected_ucl = 10.0 + 3.0 * sigma_hat / np.sqrt(5)
        expected_lcl = 10.0 - 3.0 * sigma_hat / np.sqrt(5)
        np.testing.assert_allclose(result.xbar_limits.ucl, expected_ucl, rtol=1e-5)
        np.testing.assert_allclose(result.xbar_limits.lcl, expected_lcl, rtol=1e-5)

    def test_s_limits(self):
        result = compute_xbar_s(self.DATA)
        sigma_hat = result.sigma.sigma_hat
        expected_cl = c4(5) * sigma_hat
        expected_ucl = expected_cl + 3.0 * c5(5) * sigma_hat
        expected_lcl = max(expected_cl - 3.0 * c5(5) * sigma_hat, 0.0)
        np.testing.assert_allclose(result.s_limits.cl, expected_cl, rtol=1e-5)
        np.testing.assert_allclose(result.s_limits.ucl, expected_ucl, rtol=1e-5)
        np.testing.assert_allclose(result.s_limits.lcl, expected_lcl, rtol=1e-5)

    def test_result_type(self):
        result = compute_xbar_s(self.DATA)
        assert isinstance(result, XBarSResult)


# ---------------------------------------------------------------------------
# S LCL is non-negative
# ---------------------------------------------------------------------------

class TestSLclNonNegative:
    def test_s_lcl_non_negative_n2(self):
        """For very small subgroups the S LCL formula can go negative; floor at 0."""
        rng = np.random.default_rng(0)
        data = rng.normal(0.0, 1.0, size=(20, 2))
        result = compute_xbar_s(data)
        assert np.all(result.s_limits.lcl >= 0.0)

    def test_s_lcl_non_negative_n3(self):
        rng = np.random.default_rng(1)
        data = rng.normal(0.0, 1.0, size=(20, 3))
        result = compute_xbar_s(data)
        assert np.all(result.s_limits.lcl >= 0.0)


# ---------------------------------------------------------------------------
# Wider k_sigma -> wider limits
# ---------------------------------------------------------------------------

class TestWiderKSigma:
    def test_wider_k_gives_wider_xbar_limits(self):
        rng = np.random.default_rng(42)
        data = rng.normal(50.0, 2.0, size=(10, 5))
        r3 = compute_xbar_s(data, config=XBarSConfig(k_sigma=3.0))
        r4 = compute_xbar_s(data, config=XBarSConfig(k_sigma=4.0))
        assert np.all(r4.xbar_limits.ucl >= r3.xbar_limits.ucl)
        assert np.all(r4.xbar_limits.lcl <= r3.xbar_limits.lcl)

    def test_wider_k_gives_wider_s_limits(self):
        rng = np.random.default_rng(42)
        data = rng.normal(50.0, 2.0, size=(10, 5))
        r3 = compute_xbar_s(data, config=XBarSConfig(k_sigma=3.0))
        r4 = compute_xbar_s(data, config=XBarSConfig(k_sigma=4.0))
        assert np.all(r4.s_limits.ucl >= r3.s_limits.ucl)


# ---------------------------------------------------------------------------
# 1-D input with subgroup_sizes
# ---------------------------------------------------------------------------

class TestXBarS1DInput:
    def test_1d_equal_sizes_matches_2d(self):
        rng = np.random.default_rng(7)
        data_2d = rng.normal(10.0, 1.0, size=(5, 4))
        data_1d = data_2d.ravel()
        sizes = np.full(5, 4, dtype=int)

        r2d = compute_xbar_s(data_2d)
        r1d = compute_xbar_s(data_1d, subgroup_sizes=sizes)

        np.testing.assert_allclose(r2d.subgroup_means, r1d.subgroup_means, rtol=1e-10)
        np.testing.assert_allclose(r2d.subgroup_stddevs, r1d.subgroup_stddevs, rtol=1e-10)
        assert r2d.grand_mean == pytest.approx(r1d.grand_mean, rel=1e-10)

    def test_1d_missing_sizes_raises(self):
        data = np.array([1.0, 2.0, 3.0, 4.0])
        with pytest.raises(ValueError, match="subgroup_sizes"):
            compute_xbar_s(data)


# ---------------------------------------------------------------------------
# Config validation
# ---------------------------------------------------------------------------

class TestXBarSConfigValidation:
    def test_negative_k_sigma_raises(self):
        with pytest.raises(ValueError):
            XBarSConfig(k_sigma=-1.0)

    def test_zero_k_sigma_raises(self):
        with pytest.raises(ValueError):
            XBarSConfig(k_sigma=0.0)

    def test_default_k_sigma(self):
        cfg = XBarSConfig()
        assert cfg.k_sigma == pytest.approx(3.0)


# ---------------------------------------------------------------------------
# Single subgroup edge case
# ---------------------------------------------------------------------------

class TestXBarSSingleSubgroup:
    def test_single_subgroup(self):
        data = np.array([[5.0, 7.0, 6.0, 8.0, 9.0]])
        result = compute_xbar_s(data)
        assert result.subgroup_means.shape == (1,)
        assert result.grand_mean == pytest.approx(7.0, rel=1e-6)


# ---------------------------------------------------------------------------
# Zones
# ---------------------------------------------------------------------------

class TestXBarSZones:
    def test_zones_cl_equals_grand_mean(self):
        rng = np.random.default_rng(99)
        data = rng.normal(15.0, 2.0, size=(8, 5))
        result = compute_xbar_s(data)
        assert result.zones.cl == pytest.approx(result.grand_mean, rel=1e-10)
