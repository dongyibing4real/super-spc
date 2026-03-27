"""
Tests for algo/mewma — Multivariate Exponentially Weighted Moving Average control chart.
"""
from __future__ import annotations

import numpy as np
import pytest
from scipy.stats import chi2

from algo.mewma import MEWMAConfig, MEWMAResult, compute_mewma
from algo.hotelling_t2 import compute_hotelling_t2


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------


def make_in_control_data(n: int = 200, p: int = 2, seed: int = 42) -> np.ndarray:
    """Multivariate normal, zero mean, identity covariance."""
    rng = np.random.default_rng(seed)
    return rng.multivariate_normal(mean=np.zeros(p), cov=np.eye(p), size=n)


def make_shifted_data(
    n: int = 200,
    p: int = 2,
    shift_after: int = 100,
    shift_amount: float = 3.0,
    seed: int = 42,
) -> np.ndarray:
    rng = np.random.default_rng(seed)
    data = rng.multivariate_normal(mean=np.zeros(p), cov=np.eye(p), size=n)
    data[shift_after:, 0] += shift_amount
    return data


# ---------------------------------------------------------------------------
# Basic sanity
# ---------------------------------------------------------------------------


class TestMEWMABasic:
    def test_returns_result_type(self):
        data = make_in_control_data()
        result = compute_mewma(data)
        assert isinstance(result, MEWMAResult)

    def test_t2_values_non_negative(self):
        data = make_in_control_data()
        result = compute_mewma(data)
        assert np.all(result.t2_values >= 0)

    def test_ucl_positive(self):
        data = make_in_control_data()
        result = compute_mewma(data)
        assert result.ucl > 0

    def test_shape_attributes(self):
        n, p = 80, 3
        data = make_in_control_data(n=n, p=p)
        result = compute_mewma(data)
        assert result.n == n
        assert result.p == p
        assert result.mewma_values.shape == (n, p)
        assert result.t2_values.shape == (n,)
        assert result.mean_vector.shape == (p,)
        assert result.covariance_matrix.shape == (p, p)
        assert result.violations.shape == (n,)

    def test_violations_boolean_mask(self):
        data = make_in_control_data()
        result = compute_mewma(data)
        assert result.violations.dtype == bool
        assert np.all(result.violations == (result.t2_values > result.ucl))


# ---------------------------------------------------------------------------
# UCL matches chi-square formula
# ---------------------------------------------------------------------------


class TestMEWMAUCL:
    def test_ucl_chi2_formula(self):
        n, p = 100, 2
        alpha = 0.0027
        data = make_in_control_data(n=n, p=p)
        config = MEWMAConfig(alpha=alpha)
        result = compute_mewma(data, config)
        expected_ucl = chi2.ppf(1.0 - alpha, p)
        assert result.ucl == pytest.approx(expected_ucl, rel=1e-10)

    def test_ucl_chi2_3vars(self):
        alpha = 0.05
        data = make_in_control_data(n=100, p=3)
        config = MEWMAConfig(alpha=alpha)
        result = compute_mewma(data, config)
        expected_ucl = chi2.ppf(1.0 - alpha, 3)
        assert result.ucl == pytest.approx(expected_ucl, rel=1e-10)


# ---------------------------------------------------------------------------
# In-control: few violations
# ---------------------------------------------------------------------------


class TestMEWMAInControl:
    """With alpha=0.0027 and large n, expect ~0.27% violations."""

    def test_few_violations_exact(self):
        data = make_in_control_data(n=1000, seed=10)
        config = MEWMAConfig(alpha=0.0027, use_exact_covariance=True)
        result = compute_mewma(data, config)
        violation_rate = result.violations.mean()
        # Loose bound to avoid flakiness
        assert violation_rate < 0.10, f"Too many violations: {violation_rate:.3f}"

    def test_few_violations_asymptotic(self):
        data = make_in_control_data(n=1000, seed=11)
        config = MEWMAConfig(alpha=0.0027, use_exact_covariance=False)
        result = compute_mewma(data, config)
        violation_rate = result.violations.mean()
        assert violation_rate < 0.10


# ---------------------------------------------------------------------------
# Out-of-control: shift detected
# ---------------------------------------------------------------------------


class TestMEWMAOutOfControl:
    def test_shift_causes_violations(self):
        data = make_shifted_data(n=200, shift_after=100, shift_amount=3.0)
        config = MEWMAConfig(lambda_=0.2)
        result = compute_mewma(data, config)
        # Post-shift T² should be higher on average
        t2_pre = result.t2_values[:100]
        t2_post = result.t2_values[100:]
        assert t2_post.mean() > t2_pre.mean()

    def test_shift_violates_ucl(self):
        """Large shift should trigger many violations after the shift point.

        We pass the true (pre-shift) mean so the MEWMA is centered correctly
        and deviations due to the shift are fully detected.
        """
        data = make_shifted_data(n=200, shift_after=50, shift_amount=5.0)
        config = MEWMAConfig(lambda_=0.2, alpha=0.0027)
        result = compute_mewma(
            data, config, known_mean=np.zeros(2), known_cov=np.eye(2)
        )
        post_violations = result.violations[100:]  # well after the shift
        assert post_violations.mean() > 0.5


# ---------------------------------------------------------------------------
# lambda=1 reduces to Hotelling T²
# ---------------------------------------------------------------------------


class TestMEWMALambdaOne:
    """When lambda_=1, Z_i = x_i so MEWMA should equal Hotelling T² on raw data."""

    def test_lambda1_matches_hotelling(self):
        data = make_in_control_data(n=50, p=2, seed=99)
        mu = data.mean(axis=0)
        Sigma = np.cov(data, rowvar=False)

        mewma_config = MEWMAConfig(lambda_=1.0, use_exact_covariance=False)
        mewma_result = compute_mewma(data, mewma_config, known_mean=mu, known_cov=Sigma)

        # For asymptotic MEWMA with lambda=1:
        # Sigma_Z = (1/(2-1)) * Sigma = Sigma
        # T²_i = (Z_i - mu)^T @ Sigma^{-1} @ (Z_i - mu)
        # This equals Hotelling T² with known mean and cov (Phase II)
        S_inv = np.linalg.inv(Sigma)
        deviations = data - mu
        expected_t2 = np.einsum("ij,jk,ik->i", deviations, S_inv, deviations)

        assert np.allclose(mewma_result.t2_values, expected_t2, atol=1e-10)

    def test_lambda1_mewma_values_equal_data(self):
        """With lambda=1 and Z_0=mu, Z_i = 1*x_i + 0*Z_{i-1} = x_i."""
        data = make_in_control_data(n=30, p=2, seed=5)
        mu = data.mean(axis=0)
        config = MEWMAConfig(lambda_=1.0)
        result = compute_mewma(data, config, known_mean=mu)
        assert np.allclose(result.mewma_values, data, atol=1e-10)


# ---------------------------------------------------------------------------
# Smoothed values converge
# ---------------------------------------------------------------------------


class TestMEWMASmoothing:
    def test_smoothed_values_bounded_by_data_range(self):
        """EWMA of a bounded signal stays within the signal's range."""
        data = make_in_control_data(n=100, p=2)
        result = compute_mewma(data)
        # For lambda < 1, MEWMA damps extremes
        assert np.abs(result.mewma_values).max() <= np.abs(data).max() + 1e-10

    def test_large_lambda_closer_to_data(self):
        """Larger lambda → MEWMA closer to raw data."""
        data = make_in_control_data(n=100, p=2, seed=77)
        mu = data.mean(axis=0)
        Sigma = np.cov(data, rowvar=False)

        r_small = compute_mewma(data, MEWMAConfig(lambda_=0.05), known_mean=mu, known_cov=Sigma)
        r_large = compute_mewma(data, MEWMAConfig(lambda_=0.8), known_mean=mu, known_cov=Sigma)

        # Larger lambda → MEWMA tracks data more closely
        err_small = np.abs(r_small.mewma_values - data).mean()
        err_large = np.abs(r_large.mewma_values - data).mean()
        assert err_large < err_small


# ---------------------------------------------------------------------------
# Exact vs asymptotic covariance
# ---------------------------------------------------------------------------


class TestMEWMAExactVsAsymptotic:
    def test_exact_t2_smaller_at_start(self):
        """Exact covariance accounts for smaller variance at start (Z_0=mu).

        For the first few observations, the exact T² should be larger than
        the asymptotic (because exact Sigma_Z is smaller → T² is larger),
        BUT the asymptotic UCL is the same for both.

        Actually: exact Sigma_Z starts smaller (decay < 1) → Sigma_Z_inv larger
        → exact T²_i at start is LARGER than asymptotic T²_i.
        Once converged (i large), they should be approximately equal.
        """
        data = make_in_control_data(n=100, p=2, seed=88)
        mu = data.mean(axis=0)
        Sigma = np.cov(data, rowvar=False)

        r_exact = compute_mewma(
            data, MEWMAConfig(lambda_=0.2, use_exact_covariance=True),
            known_mean=mu, known_cov=Sigma
        )
        r_asym = compute_mewma(
            data, MEWMAConfig(lambda_=0.2, use_exact_covariance=False),
            known_mean=mu, known_cov=Sigma
        )

        # Both share the same UCL (chi2 based)
        assert r_exact.ucl == pytest.approx(r_asym.ucl, rel=1e-10)

        # At start (first few points), exact T² > asymptotic T²
        # (exact has smaller Sigma_Z → larger inverse → larger T²)
        assert r_exact.t2_values[0] > r_asym.t2_values[0]

    def test_exact_and_asymptotic_converge_late(self):
        """After many steps, exact and asymptotic T² should be very similar."""
        lam = 0.2
        data = make_in_control_data(n=500, p=2, seed=99)
        mu = data.mean(axis=0)
        Sigma = np.cov(data, rowvar=False)

        r_exact = compute_mewma(
            data, MEWMAConfig(lambda_=lam, use_exact_covariance=True),
            known_mean=mu, known_cov=Sigma
        )
        r_asym = compute_mewma(
            data, MEWMAConfig(lambda_=lam, use_exact_covariance=False),
            known_mean=mu, known_cov=Sigma
        )

        # After 100+ steps, (1-lambda)^{2i} is negligible → should converge
        assert np.allclose(r_exact.t2_values[400:], r_asym.t2_values[400:], atol=1e-6)


# ---------------------------------------------------------------------------
# Known mean / covariance
# ---------------------------------------------------------------------------


class TestMEWMAKnownParameters:
    def test_known_mean_used(self):
        data = make_in_control_data(n=50, p=2)
        known_mean = np.array([0.5, -0.5])
        result = compute_mewma(data, known_mean=known_mean)
        assert np.allclose(result.mean_vector, known_mean)

    def test_known_cov_used(self):
        data = make_in_control_data(n=50, p=2)
        known_cov = 3.0 * np.eye(2)
        result = compute_mewma(data, known_cov=known_cov)
        assert np.allclose(result.covariance_matrix, known_cov)


# ---------------------------------------------------------------------------
# Input validation
# ---------------------------------------------------------------------------


class TestMEWMAValidation:
    def test_1d_input_raises(self):
        with pytest.raises(ValueError, match="2-D"):
            compute_mewma(np.array([1.0, 2.0, 3.0]))

    def test_n_le_p_raises(self):
        data = np.ones((3, 4))
        with pytest.raises(ValueError, match="greater than"):
            compute_mewma(data)

    def test_n_equals_p_raises(self):
        data = np.eye(3)
        with pytest.raises(ValueError, match="greater than"):
            compute_mewma(data)

    def test_invalid_lambda_zero_raises(self):
        with pytest.raises(ValueError):
            MEWMAConfig(lambda_=0.0)

    def test_invalid_lambda_negative_raises(self):
        with pytest.raises(ValueError):
            MEWMAConfig(lambda_=-0.1)

    def test_invalid_lambda_above_one_raises(self):
        with pytest.raises(ValueError):
            MEWMAConfig(lambda_=1.5)

    def test_invalid_alpha_raises(self):
        with pytest.raises(ValueError):
            MEWMAConfig(alpha=-0.01)

    def test_invalid_alpha_above_one_raises(self):
        with pytest.raises(ValueError):
            MEWMAConfig(alpha=2.0)

    def test_3d_input_raises(self):
        data = np.ones((10, 3, 2))
        with pytest.raises(ValueError, match="2-D"):
            compute_mewma(data)
