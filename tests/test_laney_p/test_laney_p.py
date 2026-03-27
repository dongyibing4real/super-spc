"""
Tests for algo/laney_p/laney_p.py.

Tests: no overdispersion -> sigma_z~1, overdispersion -> wider limits,
UCL<=1, LCL>=0.
"""
import numpy as np
import pytest

from algo.laney_p import LaneyPConfig, LaneyPResult, laney_p_chart
from algo.p_chart import p_chart


class TestLaneyPConfig:
    def test_default_k_sigma(self):
        cfg = LaneyPConfig()
        assert cfg.k_sigma == 3.0

    def test_custom_k_sigma(self):
        cfg = LaneyPConfig(k_sigma=2.0)
        assert cfg.k_sigma == 2.0

    def test_invalid_k_sigma_zero(self):
        with pytest.raises(ValueError, match="k_sigma"):
            LaneyPConfig(k_sigma=0.0)

    def test_invalid_k_sigma_negative(self):
        with pytest.raises(ValueError, match="k_sigma"):
            LaneyPConfig(k_sigma=-1.0)


class TestLaneyPNoOverdispersion:
    def test_sigma_z_approx_1_when_no_overdispersion(self):
        """When data is perfectly binomial (all proportions equal p_bar),
        the standardized residuals are all zero so sigma_z should be ~0.
        But with realistic variation close to binomial, sigma_z ~ 1.

        Use a deterministic dataset where proportions vary exactly as
        binomial model predicts -> sigma_z near 1.
        """
        rng = np.random.default_rng(seed=42)
        p_bar = 0.1
        n = np.full(50, 200)
        # Draw defectives from the binomial distribution
        defectives = rng.binomial(n, p_bar).astype(float)

        result = laney_p_chart(defectives, n.astype(float))

        # For in-control binomial data, sigma_z should be close to 1
        assert result.sigma_z == pytest.approx(1.0, abs=0.4)

    def test_proportions_computed_correctly(self):
        defectives = np.array([5.0, 10.0, 15.0])
        n_trials = np.array([50.0, 100.0, 150.0])
        result = laney_p_chart(defectives, n_trials)
        expected = defectives / n_trials
        np.testing.assert_allclose(result.proportions, expected)

    def test_p_bar_matches_compute_p_bar(self):
        defectives = np.array([5.0, 10.0, 15.0])
        n_trials = np.array([50.0, 100.0, 150.0])
        result = laney_p_chart(defectives, n_trials)
        expected_p_bar = np.sum(defectives) / np.sum(n_trials)
        assert result.p_bar == pytest.approx(expected_p_bar)


class TestLaneyPOverdispersion:
    def test_overdispersion_gives_wider_limits_than_p_chart(self):
        """Overdispersed data should produce wider limits than a standard p-chart."""
        rng = np.random.default_rng(seed=100)
        # Simulate overdispersion: mix two populations with different p
        p_bar_nominal = 0.1
        n = np.full(30, 200)
        # Half subgroups draw from p=0.05, half from p=0.15 -> overdispersion
        half = len(n) // 2
        defectives = np.concatenate([
            rng.binomial(n[:half], 0.05),
            rng.binomial(n[half:], 0.15),
        ]).astype(float)

        laney_result = laney_p_chart(defectives, n.astype(float))
        p_result = p_chart(defectives, n.astype(float))

        # Laney sigma_z > 1 for overdispersed data
        assert laney_result.sigma_z > 1.1

        # Laney UCL should be wider (>=) than standard p-chart UCL
        assert np.all(laney_result.limits.ucl >= p_result.limits.ucl - 1e-10)


class TestLaneyPBoundaries:
    def test_ucl_clamped_to_1(self):
        """UCL must never exceed 1.0."""
        defectives = np.array([9.0, 9.0, 9.0, 9.0, 9.0])
        n_trials = np.array([10.0, 10.0, 10.0, 10.0, 10.0])
        result = laney_p_chart(defectives, n_trials)
        assert np.all(result.limits.ucl <= 1.0)

    def test_lcl_clamped_to_0(self):
        """LCL must never be negative."""
        defectives = np.array([1.0, 1.0, 1.0, 1.0, 1.0])
        n_trials = np.array([100.0, 100.0, 100.0, 100.0, 100.0])
        result = laney_p_chart(defectives, n_trials)
        assert np.all(result.limits.lcl >= 0.0)

    def test_ucl_gte_lcl(self):
        defectives = np.array([5.0, 10.0, 15.0])
        n_trials = np.array([50.0, 100.0, 150.0])
        result = laney_p_chart(defectives, n_trials)
        assert np.all(result.limits.ucl >= result.limits.lcl)

    def test_cl_is_p_bar(self):
        """Center line should always be p_bar."""
        defectives = np.array([5.0, 10.0, 15.0])
        n_trials = np.array([50.0, 100.0, 150.0])
        result = laney_p_chart(defectives, n_trials)
        np.testing.assert_allclose(result.limits.cl, np.full(3, result.p_bar))

    def test_result_has_sigma_z(self):
        """Result must include sigma_z attribute."""
        defectives = np.array([5.0, 5.0, 5.0])
        n_trials = np.array([50.0, 50.0, 50.0])
        result = laney_p_chart(defectives, n_trials)
        assert isinstance(result, LaneyPResult)
        assert hasattr(result, "sigma_z")
        assert isinstance(result.sigma_z, float)

    def test_default_config_none(self):
        defectives = np.array([5.0])
        n_trials = np.array([100.0])
        result = laney_p_chart(defectives, n_trials, config=None)
        assert result.limits.k_sigma == 3.0
