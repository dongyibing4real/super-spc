"""
Tests for algo/u_chart/u_chart.py.

Tests known answer, variable width, LCL>=0.
"""
import numpy as np
import pytest

from algo.u_chart import UChartConfig, UChartResult, u_chart


class TestUChartConfig:
    def test_default_k_sigma(self):
        cfg = UChartConfig()
        assert cfg.k_sigma == 3.0

    def test_custom_k_sigma(self):
        cfg = UChartConfig(k_sigma=2.0)
        assert cfg.k_sigma == 2.0

    def test_invalid_k_sigma_zero(self):
        with pytest.raises(ValueError, match="k_sigma"):
            UChartConfig(k_sigma=0.0)

    def test_invalid_k_sigma_negative(self):
        with pytest.raises(ValueError, match="k_sigma"):
            UChartConfig(k_sigma=-3.0)


class TestUChartKnownAnswer:
    def test_equal_subgroups_known_answer(self):
        """u_bar=4, n=1 for all subgroups, k=3.

        rates = 4
        sigma = sqrt(4/1) = 2
        UCL   = 4 + 3*2 = 10
        CL    = 4
        LCL   = max(4 - 3*2, 0) = max(-2, 0) = 0
        """
        defects = np.array([4.0, 4.0, 4.0, 4.0, 4.0])
        n_units = np.ones(5)

        result = u_chart(defects, n_units)

        assert isinstance(result, UChartResult)
        assert result.u_bar == pytest.approx(4.0)
        np.testing.assert_allclose(result.rates, np.full(5, 4.0))
        np.testing.assert_allclose(result.sigma, np.full(5, 2.0))
        np.testing.assert_allclose(result.limits.ucl, np.full(5, 10.0))
        np.testing.assert_allclose(result.limits.cl, np.full(5, 4.0))
        np.testing.assert_allclose(result.limits.lcl, np.full(5, 0.0))

    def test_rates_computed_correctly(self):
        defects = np.array([4.0, 8.0, 12.0])
        n_units = np.array([2.0, 4.0, 6.0])
        result = u_chart(defects, n_units)
        expected_rates = defects / n_units
        np.testing.assert_allclose(result.rates, expected_rates)


class TestUChartVariableWidth:
    def test_variable_n_limits_differ(self):
        """With different n_i, UCL and LCL vary per subgroup."""
        defects = np.array([4.0, 8.0, 16.0])
        n_units = np.array([1.0, 2.0, 4.0])
        result = u_chart(defects, n_units)

        # Larger n -> tighter limits (smaller sigma)
        assert result.limits.ucl[0] > result.limits.ucl[1] > result.limits.ucl[2]

    def test_cl_constant_at_u_bar(self):
        """Center line is constant u_bar regardless of subgroup size."""
        defects = np.array([4.0, 8.0, 16.0])
        n_units = np.array([1.0, 2.0, 4.0])
        result = u_chart(defects, n_units)
        np.testing.assert_allclose(result.limits.cl, np.full(3, result.u_bar))


class TestUChartBoundaries:
    def test_lcl_clamped_to_0(self):
        """LCL must never be negative."""
        defects = np.array([1.0, 1.0, 1.0])
        n_units = np.ones(3)
        result = u_chart(defects, n_units)
        assert np.all(result.limits.lcl >= 0.0)

    def test_ucl_greater_than_cl(self):
        """UCL must always exceed CL."""
        defects = np.array([4.0, 9.0, 16.0])
        n_units = np.ones(3)
        result = u_chart(defects, n_units)
        assert np.all(result.limits.ucl >= result.limits.cl)

    def test_k_sigma_2_tighter_than_3(self):
        """k_sigma=2 gives tighter limits than k_sigma=3."""
        defects = np.full(5, 9.0)
        n_units = np.ones(5)
        r3 = u_chart(defects, n_units, config=UChartConfig(k_sigma=3.0))
        r2 = u_chart(defects, n_units, config=UChartConfig(k_sigma=2.0))
        assert np.all(r2.limits.ucl <= r3.limits.ucl)
        assert np.all(r2.limits.lcl >= r3.limits.lcl)

    def test_default_config_applied_when_none(self):
        defects = np.array([4.0])
        n_units = np.array([1.0])
        result = u_chart(defects, n_units, config=None)
        assert result.limits.k_sigma == 3.0
