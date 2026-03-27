"""
Tests for algo/c_chart/c_chart.py.

Tests known answer, LCL>=0.
"""
import numpy as np
import pytest

from algo.c_chart import CChartConfig, CChartResult, c_chart


class TestCChartConfig:
    def test_default_k_sigma(self):
        cfg = CChartConfig()
        assert cfg.k_sigma == 3.0

    def test_custom_k_sigma(self):
        cfg = CChartConfig(k_sigma=2.0)
        assert cfg.k_sigma == 2.0

    def test_invalid_k_sigma_zero(self):
        with pytest.raises(ValueError, match="k_sigma"):
            CChartConfig(k_sigma=0.0)

    def test_invalid_k_sigma_negative(self):
        with pytest.raises(ValueError, match="k_sigma"):
            CChartConfig(k_sigma=-1.0)


class TestCChartKnownAnswer:
    def test_unit_area_known_answer(self):
        """n_i=1 for all, u_bar=4, k=3.

        CL    = 1*4 = 4
        sigma = sqrt(1*4) = 2
        UCL   = 4 + 3*2 = 10
        LCL   = max(4 - 3*2, 0) = max(-2, 0) = 0
        """
        defects = np.array([4.0, 4.0, 4.0, 4.0, 4.0])
        n_units = np.ones(5)

        result = c_chart(defects, n_units)

        assert isinstance(result, CChartResult)
        assert result.u_bar == pytest.approx(4.0)
        np.testing.assert_allclose(result.limits.cl, np.full(5, 4.0))
        np.testing.assert_allclose(result.sigma, np.full(5, 2.0))
        np.testing.assert_allclose(result.limits.ucl, np.full(5, 10.0))
        np.testing.assert_allclose(result.limits.lcl, np.full(5, 0.0))

    def test_larger_n_units(self):
        """n_i=4, u_bar=9, k=3.

        CL    = 4*9 = 36
        sigma = sqrt(4*9) = sqrt(36) = 6
        UCL   = 36 + 3*6 = 54
        LCL   = max(36 - 18, 0) = 18
        """
        defects = np.array([36.0, 36.0, 36.0])
        n_units = np.full(3, 4.0)

        result = c_chart(defects, n_units)

        assert result.u_bar == pytest.approx(9.0)
        np.testing.assert_allclose(result.limits.cl, np.full(3, 36.0))
        np.testing.assert_allclose(result.sigma, np.full(3, 6.0))
        np.testing.assert_allclose(result.limits.ucl, np.full(3, 54.0))
        np.testing.assert_allclose(result.limits.lcl, np.full(3, 18.0))

    def test_counts_equal_defects(self):
        defects = np.array([3.0, 5.0, 7.0])
        n_units = np.ones(3)
        result = c_chart(defects, n_units)
        np.testing.assert_array_equal(result.counts, defects)


class TestCChartBoundaries:
    def test_lcl_clamped_to_0(self):
        """LCL must never be negative."""
        # Small defect rate -> LCL would be negative without clamping
        defects = np.array([1.0, 1.0, 1.0])
        n_units = np.ones(3)
        result = c_chart(defects, n_units)
        assert np.all(result.limits.lcl >= 0.0)

    def test_ucl_greater_than_cl(self):
        """UCL must always exceed CL."""
        defects = np.array([4.0, 9.0, 16.0])
        n_units = np.ones(3)
        result = c_chart(defects, n_units)
        assert np.all(result.limits.ucl >= result.limits.cl)

    def test_cl_is_ni_times_u_bar(self):
        """CL_i = ni * u_bar."""
        defects = np.array([4.0, 8.0, 12.0])
        n_units = np.array([1.0, 2.0, 3.0])
        result = c_chart(defects, n_units)
        expected_cl = n_units * result.u_bar
        np.testing.assert_allclose(result.limits.cl, expected_cl)

    def test_variable_n_different_limits(self):
        """Variable n_i produces different UCL/LCL per subgroup."""
        defects = np.array([4.0, 8.0, 16.0])
        n_units = np.array([1.0, 2.0, 4.0])
        result = c_chart(defects, n_units)
        # Larger n -> larger cl and larger sigma
        assert result.limits.ucl[0] < result.limits.ucl[1] < result.limits.ucl[2]

    def test_k_sigma_2_tighter_than_3(self):
        """k_sigma=2 gives tighter limits than k_sigma=3."""
        defects = np.full(5, 9.0)
        n_units = np.ones(5)
        r3 = c_chart(defects, n_units, config=CChartConfig(k_sigma=3.0))
        r2 = c_chart(defects, n_units, config=CChartConfig(k_sigma=2.0))
        assert np.all(r2.limits.ucl <= r3.limits.ucl)
        assert np.all(r2.limits.lcl >= r3.limits.lcl)
