"""
Tests for algo/p_chart/p_chart.py.

Tests known answer, variable width, UCL<=1, LCL>=0.
"""
import numpy as np
import pytest

from algo.p_chart import PChartConfig, PChartResult, p_chart


class TestPChartConfig:
    def test_default_k_sigma(self):
        cfg = PChartConfig()
        assert cfg.k_sigma == 3.0

    def test_custom_k_sigma(self):
        cfg = PChartConfig(k_sigma=2.0)
        assert cfg.k_sigma == 2.0

    def test_invalid_k_sigma_zero(self):
        with pytest.raises(ValueError, match="k_sigma"):
            PChartConfig(k_sigma=0.0)

    def test_invalid_k_sigma_negative(self):
        with pytest.raises(ValueError, match="k_sigma"):
            PChartConfig(k_sigma=-1.0)


class TestPChartKnownAnswer:
    def test_equal_subgroups_known_answer(self):
        """p_bar=0.1, n=100 for all subgroups, k=3."""
        # 5 subgroups each with n=100, 10 defectives -> p_bar = 0.1
        defectives = np.array([10.0, 10.0, 10.0, 10.0, 10.0])
        n_trials = np.full(5, 100.0)

        result = p_chart(defectives, n_trials)

        assert isinstance(result, PChartResult)
        assert result.p_bar == pytest.approx(0.1)

        # proportions
        np.testing.assert_allclose(result.proportions, np.full(5, 0.1))

        # sigma_i = sqrt(0.1 * 0.9 / 100) = sqrt(0.0009) = 0.03
        expected_sigma = np.sqrt(0.1 * 0.9 / 100.0)
        np.testing.assert_allclose(result.sigma, np.full(5, expected_sigma))

        # UCL = 0.1 + 3 * 0.03 = 0.19
        expected_ucl = 0.1 + 3 * expected_sigma
        np.testing.assert_allclose(result.limits.ucl, np.full(5, expected_ucl))

        # CL = 0.1
        np.testing.assert_allclose(result.limits.cl, np.full(5, 0.1))

        # LCL = max(0.1 - 3 * 0.03, 0) = max(0.01, 0) = 0.01
        expected_lcl = max(0.1 - 3 * expected_sigma, 0.0)
        np.testing.assert_allclose(result.limits.lcl, np.full(5, expected_lcl))

    def test_proportions_computed_correctly(self):
        defectives = np.array([5.0, 10.0, 20.0])
        n_trials = np.array([100.0, 200.0, 100.0])
        result = p_chart(defectives, n_trials)
        expected = defectives / n_trials
        np.testing.assert_allclose(result.proportions, expected)


class TestPChartVariableWidth:
    def test_variable_n_limits_differ(self):
        """With different n_i, UCL and LCL vary per subgroup."""
        defectives = np.array([5.0, 10.0, 20.0])
        n_trials = np.array([50.0, 100.0, 200.0])
        result = p_chart(defectives, n_trials)

        # Larger n -> tighter limits (smaller sigma)
        assert result.limits.ucl[0] > result.limits.ucl[1] > result.limits.ucl[2]
        # LCL increases (less negative so more visible) with larger n
        assert result.limits.lcl[0] < result.limits.lcl[1] < result.limits.lcl[2]

    def test_cl_constant_at_p_bar(self):
        """Center line is constant p_bar regardless of subgroup size."""
        defectives = np.array([5.0, 10.0, 20.0])
        n_trials = np.array([50.0, 100.0, 200.0])
        result = p_chart(defectives, n_trials)
        np.testing.assert_allclose(result.limits.cl, np.full(3, result.p_bar))


class TestPChartBoundaries:
    def test_ucl_clamped_to_1(self):
        """UCL must never exceed 1.0."""
        # Very high p_bar or small n pushes UCL above 1
        defectives = np.array([9.0, 9.0, 9.0])
        n_trials = np.array([10.0, 10.0, 10.0])
        result = p_chart(defectives, n_trials)
        assert np.all(result.limits.ucl <= 1.0)

    def test_lcl_clamped_to_0(self):
        """LCL must never be negative."""
        defectives = np.array([1.0, 1.0, 1.0])
        n_trials = np.array([50.0, 50.0, 50.0])
        result = p_chart(defectives, n_trials)
        assert np.all(result.limits.lcl >= 0.0)

    def test_ucl_always_gte_lcl(self):
        defectives = np.array([5.0, 10.0, 15.0])
        n_trials = np.array([100.0, 100.0, 100.0])
        result = p_chart(defectives, n_trials)
        assert np.all(result.limits.ucl >= result.limits.lcl)

    def test_k_sigma_2_tighter_limits(self):
        """k_sigma=2 gives tighter limits than k_sigma=3."""
        defectives = np.array([10.0] * 5)
        n_trials = np.full(5, 100.0)
        r3 = p_chart(defectives, n_trials, config=PChartConfig(k_sigma=3.0))
        r2 = p_chart(defectives, n_trials, config=PChartConfig(k_sigma=2.0))
        assert np.all(r2.limits.ucl <= r3.limits.ucl)
        assert np.all(r2.limits.lcl >= r3.limits.lcl)

    def test_default_config_applied_when_none(self):
        """Passing config=None uses default k_sigma=3.0."""
        defectives = np.array([10.0])
        n_trials = np.array([100.0])
        result = p_chart(defectives, n_trials, config=None)
        assert result.limits.k_sigma == 3.0
