"""
Tests for G chart (algo/g_chart/).

Covers Poisson-like (k~0), overdispersed (k>0), LCL>=0 guarantee,
and basic config validation.
"""
import numpy as np
import pytest
from scipy.stats import chi2, norm

from algo.g_chart import GChartConfig, GChartResult, compute_g_chart


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _expected_limits(data, k_sigma=3.0):
    """Compute expected UCL/LCL from first principles."""
    mu = np.mean(data)
    var = np.var(data, ddof=1)
    k_param = max((var / mu - 1.0), 0.0) if mu > 0 else 0.0
    v = 2.0 / (1.0 + k_param)
    alpha = norm.cdf(-k_sigma)
    ucl = (chi2.ppf(1.0 - alpha, v) * (1.0 + k_param) - 1.0) / 2.0
    lcl = max((chi2.ppf(alpha, v) * (1.0 + k_param) - 1.0) / 2.0, 0.0)
    return ucl, mu, lcl, k_param


# ---------------------------------------------------------------------------
# Poisson-like data (variance ≈ mean → k_param ≈ 0)
# ---------------------------------------------------------------------------

class TestGChartPoisson:
    def test_k_param_near_zero(self):
        """Poisson data: k_param should be >= 0 and UCL should exceed the mean."""
        rng = np.random.default_rng(42)
        data = rng.poisson(lam=5.0, size=200).astype(float)
        result = compute_g_chart(data)
        # For pure Poisson, var ≈ mean → k_param ≈ 0 (but can be slightly > 0 due to sample noise)
        assert result.k_param >= 0.0
        # UCL must exceed mean, LCL must be below mean
        assert result.limits.ucl[0] > result.mu
        assert result.limits.lcl[0] < result.mu

    def test_values_preserved(self):
        data = np.array([3.0, 5.0, 7.0, 2.0, 4.0])
        result = compute_g_chart(data)
        np.testing.assert_array_equal(result.values, data)

    def test_limits_shape(self):
        data = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
        result = compute_g_chart(data)
        assert result.limits.ucl.shape == (5,)
        assert result.limits.cl.shape == (5,)
        assert result.limits.lcl.shape == (5,)

    def test_known_answer_poisson(self):
        """Constant data: var=0, k_param=0, v=2. Check with exact chi2 formula."""
        data = np.full(10, 5.0)
        # var(ddof=1) = 0, but then k_param=max(0/5-1, 0)=0
        result = compute_g_chart(data)
        assert result.k_param == pytest.approx(0.0, abs=1e-10)
        assert result.mu == pytest.approx(5.0)
        # v=2, alpha=norm.cdf(-3)
        ucl_exp, mu_exp, lcl_exp, _ = _expected_limits(data)
        assert result.limits.ucl[0] == pytest.approx(ucl_exp, rel=1e-6)
        assert result.limits.lcl[0] == pytest.approx(lcl_exp, abs=1e-6)


# ---------------------------------------------------------------------------
# Overdispersed data (k_param > 0)
# ---------------------------------------------------------------------------

class TestGChartOverdispersed:
    def test_k_param_positive(self):
        """Highly overdispersed data should produce k_param > 0."""
        # Negative binomial with high variance
        rng = np.random.default_rng(0)
        data = rng.negative_binomial(n=2, p=0.3, size=100).astype(float)
        result = compute_g_chart(data)
        assert result.k_param > 0.0

    def test_wider_limits_than_poisson(self):
        """Overdispersed data should produce wider UCL than Poisson would give."""
        rng = np.random.default_rng(0)
        data_nb = rng.negative_binomial(n=2, p=0.3, size=100).astype(float)
        result_nb = compute_g_chart(data_nb)
        # A Poisson G chart with the same mu would have narrower UCL
        mu = result_nb.mu
        poisson_ucl_approx = mu + 3.0 * np.sqrt(mu)
        assert result_nb.limits.ucl[0] > poisson_ucl_approx

    def test_known_overdispersed(self):
        """Known answer test: manually compute expected limits."""
        data = np.array([1.0, 10.0, 2.0, 15.0, 3.0, 12.0, 4.0, 20.0])
        result = compute_g_chart(data)
        ucl_exp, mu_exp, lcl_exp, k_exp = _expected_limits(data)
        assert result.mu == pytest.approx(mu_exp, rel=1e-9)
        assert result.k_param == pytest.approx(k_exp, rel=1e-9)
        assert result.limits.ucl[0] == pytest.approx(ucl_exp, rel=1e-6)
        assert result.limits.lcl[0] == pytest.approx(lcl_exp, abs=1e-6)


# ---------------------------------------------------------------------------
# LCL >= 0 guarantee
# ---------------------------------------------------------------------------

class TestGChartLCLNonNegative:
    def test_lcl_always_non_negative(self):
        """LCL must be clamped to 0 for small counts."""
        data = np.array([0.0, 1.0, 0.0, 2.0, 0.0, 1.0])
        result = compute_g_chart(data)
        assert np.all(result.limits.lcl >= 0.0)

    def test_lcl_zero_for_small_data(self):
        """For small mean, raw LCL would be negative; must return 0."""
        data = np.array([0.0, 0.0, 1.0, 0.0])
        result = compute_g_chart(data)
        assert result.limits.lcl[0] >= 0.0

    def test_lcl_non_negative_large_variance(self):
        """Even with large variance, LCL cannot go negative."""
        rng = np.random.default_rng(99)
        data = rng.negative_binomial(n=1, p=0.1, size=50).astype(float)
        result = compute_g_chart(data)
        assert np.all(result.limits.lcl >= 0.0)


# ---------------------------------------------------------------------------
# Config validation
# ---------------------------------------------------------------------------

class TestGChartConfig:
    def test_default_k_sigma(self):
        config = GChartConfig()
        assert config.k_sigma == pytest.approx(3.0)

    def test_custom_k_sigma(self):
        config = GChartConfig(k_sigma=2.0)
        assert config.k_sigma == pytest.approx(2.0)

    def test_invalid_k_sigma_zero(self):
        with pytest.raises(ValueError, match="k_sigma"):
            GChartConfig(k_sigma=0.0)

    def test_invalid_k_sigma_negative(self):
        with pytest.raises(ValueError, match="k_sigma"):
            GChartConfig(k_sigma=-1.0)

    def test_custom_k_sigma_widens_limits(self):
        data = np.array([3.0, 4.0, 5.0, 4.0, 3.0])
        result_3 = compute_g_chart(data, GChartConfig(k_sigma=3.0))
        result_2 = compute_g_chart(data, GChartConfig(k_sigma=2.0))
        assert result_3.limits.ucl[0] > result_2.limits.ucl[0]


# ---------------------------------------------------------------------------
# Zero mean edge case
# ---------------------------------------------------------------------------

class TestGChartZeroMean:
    def test_all_zeros_k_param_zero(self):
        data = np.zeros(10)
        result = compute_g_chart(data)
        assert result.k_param == 0.0
        assert result.mu == 0.0

    def test_empty_data_raises(self):
        with pytest.raises(ValueError):
            compute_g_chart(np.array([]))
