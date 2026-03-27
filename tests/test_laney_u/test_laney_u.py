"""
Tests for algo/laney_u/laney_u.py.

Tests: no overdispersion -> sigma_z~1, overdispersion -> wider limits,
UCL not clamped to 1, LCL>=0.
"""
import numpy as np
import pytest

from algo.laney_u import LaneyUConfig, LaneyUResult, laney_u_chart
from algo.u_chart import u_chart


class TestLaneyUConfig:
    def test_default_k_sigma(self):
        cfg = LaneyUConfig()
        assert cfg.k_sigma == 3.0

    def test_custom_k_sigma(self):
        cfg = LaneyUConfig(k_sigma=2.0)
        assert cfg.k_sigma == 2.0

    def test_invalid_k_sigma_zero(self):
        with pytest.raises(ValueError, match="k_sigma"):
            LaneyUConfig(k_sigma=0.0)

    def test_invalid_k_sigma_negative(self):
        with pytest.raises(ValueError, match="k_sigma"):
            LaneyUConfig(k_sigma=-1.0)


class TestLaneyUNoOverdispersion:
    def test_sigma_z_approx_1_when_no_overdispersion(self):
        """For in-control Poisson data, sigma_z should be near 1."""
        rng = np.random.default_rng(seed=42)
        u_bar = 4.0
        n = np.full(50, 10)
        # Draw defects from the Poisson distribution
        defects = rng.poisson(u_bar * n).astype(float)

        result = laney_u_chart(defects, n.astype(float))

        # For in-control Poisson data, sigma_z should be close to 1
        assert result.sigma_z == pytest.approx(1.0, abs=0.5)

    def test_rates_computed_correctly(self):
        defects = np.array([4.0, 8.0, 12.0])
        n_units = np.array([2.0, 4.0, 6.0])
        result = laney_u_chart(defects, n_units)
        expected = defects / n_units
        np.testing.assert_allclose(result.rates, expected)

    def test_u_bar_matches_compute_u_bar(self):
        defects = np.array([4.0, 8.0, 12.0])
        n_units = np.array([2.0, 4.0, 6.0])
        result = laney_u_chart(defects, n_units)
        expected_u_bar = np.sum(defects) / np.sum(n_units)
        assert result.u_bar == pytest.approx(expected_u_bar)


class TestLaneyUOverdispersion:
    def test_overdispersion_gives_wider_limits_than_u_chart(self):
        """Overdispersed data should produce wider limits than a standard u-chart."""
        rng = np.random.default_rng(seed=200)
        n = np.full(30, 10)
        # Mix two Poisson rates -> overdispersion
        half = len(n) // 2
        defects = np.concatenate([
            rng.poisson(2.0 * n[:half]),
            rng.poisson(8.0 * n[half:]),
        ]).astype(float)

        laney_result = laney_u_chart(defects, n.astype(float))
        u_result = u_chart(defects, n.astype(float))

        # Laney sigma_z > 1 for overdispersed data
        assert laney_result.sigma_z > 1.1

        # Laney UCL should be wider (>=) than standard u-chart UCL
        assert np.all(laney_result.limits.ucl >= u_result.limits.ucl - 1e-10)


class TestLaneyUBoundaries:
    def test_ucl_not_clamped_to_1(self):
        """Unlike Laney P', UCL is not clamped at 1.0 for U chart."""
        defects = np.array([100.0, 100.0, 100.0, 100.0, 100.0])
        n_units = np.ones(5)
        result = laney_u_chart(defects, n_units)
        # UCL should be well above 1 for high defect rates
        assert np.any(result.limits.ucl > 1.0)

    def test_lcl_clamped_to_0(self):
        """LCL must never be negative."""
        defects = np.array([1.0, 1.0, 1.0, 1.0, 1.0])
        n_units = np.ones(5)
        result = laney_u_chart(defects, n_units)
        assert np.all(result.limits.lcl >= 0.0)

    def test_ucl_gte_cl(self):
        defects = np.array([4.0, 9.0, 16.0])
        n_units = np.ones(3)
        result = laney_u_chart(defects, n_units)
        assert np.all(result.limits.ucl >= result.limits.cl)

    def test_cl_is_u_bar(self):
        """Center line should always be u_bar."""
        defects = np.array([4.0, 8.0, 12.0])
        n_units = np.array([2.0, 4.0, 6.0])
        result = laney_u_chart(defects, n_units)
        np.testing.assert_allclose(result.limits.cl, np.full(3, result.u_bar))

    def test_result_has_sigma_z(self):
        """Result must include sigma_z attribute."""
        defects = np.array([4.0, 4.0, 4.0])
        n_units = np.ones(3)
        result = laney_u_chart(defects, n_units)
        assert isinstance(result, LaneyUResult)
        assert hasattr(result, "sigma_z")
        assert isinstance(result.sigma_z, float)

    def test_default_config_none(self):
        defects = np.array([4.0, 4.0, 4.0])
        n_units = np.ones(3)
        result = laney_u_chart(defects, n_units, config=None)
        assert result.limits.k_sigma == 3.0
