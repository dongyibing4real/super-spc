"""
Tests for algo/np_chart/np_chart.py.

Tests known answer, UCL<=ni, LCL>=0.
"""
import numpy as np
import pytest

from algo.np_chart import NPChartConfig, NPChartResult, np_chart


class TestNPChartConfig:
    def test_default_k_sigma(self):
        cfg = NPChartConfig()
        assert cfg.k_sigma == 3.0

    def test_custom_k_sigma(self):
        cfg = NPChartConfig(k_sigma=2.5)
        assert cfg.k_sigma == 2.5

    def test_invalid_k_sigma_zero(self):
        with pytest.raises(ValueError, match="k_sigma"):
            NPChartConfig(k_sigma=0.0)

    def test_invalid_k_sigma_negative(self):
        with pytest.raises(ValueError, match="k_sigma"):
            NPChartConfig(k_sigma=-2.0)


class TestNPChartKnownAnswer:
    def test_equal_subgroups_known_answer(self):
        """p_bar=0.1, n=100 for all subgroups, k=3.

        CL   = 100*0.1 = 10
        sigma = sqrt(100*0.1*0.9) = sqrt(9) = 3
        UCL  = min(10 + 3*3, 100) = 19
        LCL  = max(10 - 3*3, 0)  = 1
        """
        defectives = np.full(5, 10.0)
        n_trials = np.full(5, 100.0)

        result = np_chart(defectives, n_trials)

        assert isinstance(result, NPChartResult)
        assert result.p_bar == pytest.approx(0.1)
        np.testing.assert_allclose(result.counts, defectives)

        np.testing.assert_allclose(result.limits.cl, np.full(5, 10.0))
        np.testing.assert_allclose(result.sigma, np.full(5, 3.0))
        np.testing.assert_allclose(result.limits.ucl, np.full(5, 19.0))
        np.testing.assert_allclose(result.limits.lcl, np.full(5, 1.0))

    def test_counts_equal_defectives(self):
        """counts field must be the defectives array unchanged."""
        defectives = np.array([3.0, 7.0, 5.0])
        n_trials = np.array([50.0, 50.0, 50.0])
        result = np_chart(defectives, n_trials)
        np.testing.assert_array_equal(result.counts, defectives)


class TestNPChartBoundaries:
    def test_ucl_clamped_to_ni(self):
        """UCL must never exceed ni."""
        defectives = np.array([9.0, 9.0, 9.0])
        n_trials = np.array([10.0, 10.0, 10.0])
        result = np_chart(defectives, n_trials)
        assert np.all(result.limits.ucl <= n_trials)

    def test_lcl_clamped_to_0(self):
        """LCL must never be negative."""
        defectives = np.array([1.0, 1.0, 1.0])
        n_trials = np.array([100.0, 100.0, 100.0])
        result = np_chart(defectives, n_trials)
        assert np.all(result.limits.lcl >= 0.0)

    def test_cl_is_ni_times_p_bar(self):
        """Center line CL_i = ni * p_bar."""
        defectives = np.array([5.0, 10.0, 15.0])
        n_trials = np.array([50.0, 100.0, 150.0])
        result = np_chart(defectives, n_trials)
        expected_cl = n_trials * result.p_bar
        np.testing.assert_allclose(result.limits.cl, expected_cl)

    def test_variable_n_different_limits(self):
        """With variable n_i, UCL and LCL should vary per subgroup."""
        defectives = np.array([5.0, 10.0, 20.0])
        n_trials = np.array([50.0, 100.0, 200.0])
        result = np_chart(defectives, n_trials)
        # Different n -> different cl values
        assert not np.all(result.limits.cl == result.limits.cl[0])

    def test_k_sigma_2_tighter_than_3(self):
        """k_sigma=2 gives tighter limits than k_sigma=3."""
        defectives = np.full(5, 10.0)
        n_trials = np.full(5, 100.0)
        r3 = np_chart(defectives, n_trials, config=NPChartConfig(k_sigma=3.0))
        r2 = np_chart(defectives, n_trials, config=NPChartConfig(k_sigma=2.0))
        assert np.all(r2.limits.ucl <= r3.limits.ucl)
        assert np.all(r2.limits.lcl >= r3.limits.lcl)
