"""
Tests for T chart (algo/t_chart/).

Covers Weibull data, zeros excluded from fitting, LCL>=0 guarantee,
insufficient data error, and config validation.
"""
import numpy as np
import pytest
from scipy.stats import norm, weibull_min

from algo.t_chart import TChartConfig, TChartResult, compute_t_chart


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _weibull_limits(data, k_sigma=3.0):
    """Compute expected limits from first principles."""
    nonzero = data[data > 0]
    shape, _loc, scale = weibull_min.fit(nonzero, floc=0)
    p1 = norm.cdf(-k_sigma)
    p2 = 0.5
    p3 = norm.cdf(k_sigma)
    lcl = max(weibull_min.ppf(p1, shape, scale=scale), 0.0)
    cl = weibull_min.ppf(p2, shape, scale=scale)
    ucl = weibull_min.ppf(p3, shape, scale=scale)
    return ucl, cl, lcl, shape, scale


# ---------------------------------------------------------------------------
# Basic Weibull data
# ---------------------------------------------------------------------------

class TestTChartWeibullData:
    def test_known_exponential(self):
        """Exponential(rate=1) is Weibull(shape=1, scale=1). Check alpha≈1."""
        rng = np.random.default_rng(7)
        data = rng.exponential(scale=1.0, size=200)
        result = compute_t_chart(data)
        # Weibull shape should be close to 1 for exponential data
        assert result.alpha == pytest.approx(1.0, abs=0.3)
        assert result.beta == pytest.approx(1.0, abs=0.3)

    def test_known_weibull_shape2(self):
        """Weibull(shape=2, scale=5) data: recovered parameters should be close."""
        rng = np.random.default_rng(42)
        data = rng.weibull(a=2.0, size=500) * 5.0
        result = compute_t_chart(data)
        assert result.alpha == pytest.approx(2.0, abs=0.3)
        assert result.beta == pytest.approx(5.0, abs=0.5)

    def test_limits_ordering(self):
        """LCL <= CL <= UCL for well-behaved Weibull data."""
        rng = np.random.default_rng(1)
        data = rng.weibull(a=1.5, size=100) * 3.0
        result = compute_t_chart(data)
        assert result.limits.lcl[0] <= result.limits.cl[0]
        assert result.limits.cl[0] <= result.limits.ucl[0]

    def test_exact_known_answer(self):
        """Known-answer test against scipy directly."""
        rng = np.random.default_rng(55)
        data = rng.weibull(a=2.0, size=100) * 10.0
        result = compute_t_chart(data)
        ucl_exp, cl_exp, lcl_exp, shape_exp, scale_exp = _weibull_limits(data)
        assert result.limits.ucl[0] == pytest.approx(ucl_exp, rel=1e-6)
        assert result.limits.cl[0] == pytest.approx(cl_exp, rel=1e-6)
        assert result.limits.lcl[0] == pytest.approx(lcl_exp, abs=1e-6)
        assert result.alpha == pytest.approx(shape_exp, rel=1e-6)
        assert result.beta == pytest.approx(scale_exp, rel=1e-6)

    def test_values_preserved(self):
        data = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
        result = compute_t_chart(data)
        np.testing.assert_array_equal(result.values, data)

    def test_limits_shape(self):
        rng = np.random.default_rng(3)
        data = rng.exponential(2.0, size=50)
        result = compute_t_chart(data)
        assert result.limits.ucl.shape == (50,)
        assert result.limits.cl.shape == (50,)
        assert result.limits.lcl.shape == (50,)


# ---------------------------------------------------------------------------
# Zeros excluded from fit
# ---------------------------------------------------------------------------

class TestTChartZerosExcluded:
    def test_zeros_do_not_affect_fit(self):
        """Fitting with and without prepended zeros should give same parameters."""
        rng = np.random.default_rng(20)
        data_clean = rng.exponential(2.0, size=50)
        data_with_zeros = np.concatenate([[0.0, 0.0, 0.0], data_clean])
        result_clean = compute_t_chart(data_clean)
        result_zeros = compute_t_chart(data_with_zeros)
        assert result_zeros.alpha == pytest.approx(result_clean.alpha, rel=1e-9)
        assert result_zeros.beta == pytest.approx(result_clean.beta, rel=1e-9)

    def test_values_include_zeros(self):
        """The values array in the result should include the original zeros."""
        data = np.array([0.0, 1.0, 2.0, 0.0, 3.0])
        result = compute_t_chart(data)
        np.testing.assert_array_equal(result.values, data)

    def test_limits_length_includes_zeros(self):
        """Limit arrays should have same length as original data (including zeros)."""
        data = np.array([0.0, 1.0, 2.0, 3.0])
        result = compute_t_chart(data)
        assert len(result.limits.ucl) == 4
        assert len(result.limits.lcl) == 4

    def test_one_nonzero_raises(self):
        """Only 1 non-zero value should raise ValueError."""
        with pytest.raises(ValueError, match="2 non-zero"):
            compute_t_chart(np.array([0.0, 0.0, 5.0]))

    def test_all_zeros_raises(self):
        """All zeros should raise ValueError."""
        with pytest.raises(ValueError, match="2 non-zero"):
            compute_t_chart(np.zeros(10))


# ---------------------------------------------------------------------------
# LCL >= 0 guarantee
# ---------------------------------------------------------------------------

class TestTChartLCLNonNegative:
    def test_lcl_always_non_negative(self):
        """LCL must be clamped to 0."""
        rng = np.random.default_rng(100)
        # Very small times => Weibull ppf at low probability can approach 0
        data = rng.exponential(0.001, size=100)
        result = compute_t_chart(data)
        assert np.all(result.limits.lcl >= 0.0)

    def test_lcl_non_negative_shape_lt1(self):
        """Weibull with shape < 1 may push LCL very close to 0."""
        rng = np.random.default_rng(101)
        data = rng.weibull(a=0.5, size=200) * 1.0
        result = compute_t_chart(data)
        assert np.all(result.limits.lcl >= 0.0)


# ---------------------------------------------------------------------------
# Config validation
# ---------------------------------------------------------------------------

class TestTChartConfig:
    def test_default_k_sigma(self):
        config = TChartConfig()
        assert config.k_sigma == pytest.approx(3.0)

    def test_invalid_k_sigma_zero(self):
        with pytest.raises(ValueError, match="k_sigma"):
            TChartConfig(k_sigma=0.0)

    def test_invalid_k_sigma_negative(self):
        with pytest.raises(ValueError, match="k_sigma"):
            TChartConfig(k_sigma=-0.5)

    def test_larger_k_gives_wider_limits(self):
        rng = np.random.default_rng(5)
        data = rng.exponential(3.0, size=100)
        r3 = compute_t_chart(data, TChartConfig(k_sigma=3.0))
        r2 = compute_t_chart(data, TChartConfig(k_sigma=2.0))
        assert r3.limits.ucl[0] > r2.limits.ucl[0]

    def test_empty_raises(self):
        with pytest.raises(ValueError):
            compute_t_chart(np.array([]))
