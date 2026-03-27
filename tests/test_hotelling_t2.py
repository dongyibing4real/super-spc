"""
Tests for algo/hotelling_t2 — Hotelling T² multivariate control chart.
"""
from __future__ import annotations

import numpy as np
import pytest
from scipy.stats import f as f_dist

from algo.hotelling_t2 import HotellingT2Config, HotellingT2Result, compute_hotelling_t2


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------

RNG = np.random.default_rng(42)


def make_in_control_data(n: int = 100, p: int = 2, seed: int = 42) -> np.ndarray:
    """Multivariate normal, zero mean, identity covariance."""
    rng = np.random.default_rng(seed)
    return rng.multivariate_normal(mean=np.zeros(p), cov=np.eye(p), size=n)


def make_shifted_data(
    n: int = 100,
    p: int = 2,
    shift_after: int = 50,
    shift_amount: float = 3.0,
    seed: int = 42,
) -> np.ndarray:
    """In-control then out-of-control (shift in variable 0)."""
    rng = np.random.default_rng(seed)
    data = rng.multivariate_normal(mean=np.zeros(p), cov=np.eye(p), size=n)
    data[shift_after:, 0] += shift_amount
    return data


# ---------------------------------------------------------------------------
# Basic sanity
# ---------------------------------------------------------------------------


class TestHotellingT2Basic:
    def test_returns_result_type(self):
        data = make_in_control_data()
        result = compute_hotelling_t2(data)
        assert isinstance(result, HotellingT2Result)

    def test_t2_values_non_negative(self):
        data = make_in_control_data()
        result = compute_hotelling_t2(data)
        assert np.all(result.t2_values >= 0)

    def test_ucl_positive(self):
        data = make_in_control_data()
        result = compute_hotelling_t2(data)
        assert result.ucl > 0

    def test_shape_attributes(self):
        n, p = 80, 3
        data = make_in_control_data(n=n, p=p)
        result = compute_hotelling_t2(data)
        assert result.n == n
        assert result.p == p
        assert result.t2_values.shape == (n,)
        assert result.mean_vector.shape == (p,)
        assert result.covariance_matrix.shape == (p, p)
        assert result.violations.shape == (n,)
        assert result.contributions.shape == (n, p)

    def test_violations_boolean_mask(self):
        data = make_in_control_data()
        result = compute_hotelling_t2(data)
        assert result.violations.dtype == bool
        assert np.all(result.violations == (result.t2_values > result.ucl))


# ---------------------------------------------------------------------------
# In-control: few violations
# ---------------------------------------------------------------------------


class TestHotellingT2InControl:
    """With alpha=0.0027, expect ~0.27% violations for in-control data."""

    def test_few_violations_phase1(self):
        data = make_in_control_data(n=500)
        config = HotellingT2Config(alpha=0.0027, phase=1)
        result = compute_hotelling_t2(data, config)
        # Allow up to 5% violation rate (loose bound for stochastic test)
        violation_rate = result.violations.mean()
        assert violation_rate < 0.05, f"Too many violations: {violation_rate:.3f}"

    def test_few_violations_phase2(self):
        data = make_in_control_data(n=500)
        config = HotellingT2Config(alpha=0.0027, phase=2)
        result = compute_hotelling_t2(data, config)
        violation_rate = result.violations.mean()
        assert violation_rate < 0.05


# ---------------------------------------------------------------------------
# Out-of-control: shift detected
# ---------------------------------------------------------------------------


class TestHotellingT2OutOfControl:
    def test_shift_detected_phase1(self):
        data = make_shifted_data(n=100, shift_after=50, shift_amount=4.0)
        config = HotellingT2Config(alpha=0.0027, phase=1)
        result = compute_hotelling_t2(data, config)
        # Post-shift observations should have higher T² on average
        t2_pre = result.t2_values[:50]
        t2_post = result.t2_values[50:]
        assert t2_post.mean() > t2_pre.mean()

    def test_shift_causes_violations_phase2(self):
        """Use known_mean/known_cov from in-control period."""
        in_ctrl = make_in_control_data(n=200)
        known_mean = in_ctrl.mean(axis=0)
        known_cov = np.cov(in_ctrl, rowvar=False)

        # New data with a clear shift
        shifted = make_shifted_data(n=100, shift_after=0, shift_amount=5.0)
        config = HotellingT2Config(alpha=0.0027, phase=2)
        result = compute_hotelling_t2(
            shifted, config, known_mean=known_mean, known_cov=known_cov
        )
        # The mean shift of 5 sigma should cause many violations
        assert result.violations.mean() > 0.5


# ---------------------------------------------------------------------------
# Contributions decompose T²
# ---------------------------------------------------------------------------


class TestHotellingT2Contributions:
    def test_contributions_sum_to_t2(self):
        data = make_in_control_data(n=80, p=3)
        result = compute_hotelling_t2(data)
        assert np.allclose(
            result.contributions.sum(axis=1), result.t2_values, atol=1e-10
        )

    def test_contributions_shape(self):
        n, p = 60, 4
        data = make_in_control_data(n=n, p=p)
        result = compute_hotelling_t2(data)
        assert result.contributions.shape == (n, p)

    def test_shifted_variable_has_higher_contribution(self):
        """When variable 0 is shifted, its contribution should dominate.

        We use known_mean=zeros so the shift is not absorbed into the estimate.
        """
        rng = np.random.default_rng(7)
        data = rng.multivariate_normal(np.zeros(3), np.eye(3), size=50)
        # Add large shift to variable 0 only
        data[:, 0] += 10.0
        # Pass the true (pre-shift) mean so deviations capture the shift
        result = compute_hotelling_t2(data, known_mean=np.zeros(3), known_cov=np.eye(3))
        mean_contrib = result.contributions.mean(axis=0)
        assert mean_contrib[0] == mean_contrib.max()


# ---------------------------------------------------------------------------
# Phase I vs Phase II UCL
# ---------------------------------------------------------------------------


class TestHotellingT2PhaseUCL:
    def test_phase1_vs_phase2_ucl_differ(self):
        data = make_in_control_data(n=50, p=2)
        config1 = HotellingT2Config(phase=1)
        config2 = HotellingT2Config(phase=2)
        r1 = compute_hotelling_t2(data, config1)
        r2 = compute_hotelling_t2(data, config2)
        assert r1.ucl != r2.ucl

    def test_phase1_ucl_formula(self):
        """Verify Phase I UCL against hand-computed formula."""
        n, p = 50, 2
        alpha = 0.0027
        data = make_in_control_data(n=n, p=p)
        config = HotellingT2Config(alpha=alpha, phase=1)
        result = compute_hotelling_t2(data, config)
        expected_ucl = p * (n - 1) * (n + 1) / (n * (n - p)) * f_dist.ppf(
            1.0 - alpha, p, n - p
        )
        assert result.ucl == pytest.approx(expected_ucl, rel=1e-10)

    def test_phase2_ucl_formula(self):
        """Verify Phase II UCL uses chi-square approximation."""
        n, p = 50, 2
        alpha = 0.0027
        from scipy.stats import chi2
        data = make_in_control_data(n=n, p=p)
        config = HotellingT2Config(alpha=alpha, phase=2)
        result = compute_hotelling_t2(data, config)
        expected_ucl = float(chi2.ppf(1.0 - alpha, p))
        assert result.ucl == pytest.approx(expected_ucl, rel=1e-10)


# ---------------------------------------------------------------------------
# Known mean / covariance
# ---------------------------------------------------------------------------


class TestHotellingT2KnownParameters:
    def test_known_mean_used(self):
        data = make_in_control_data(n=50, p=2)
        known_mean = np.array([1.0, 2.0])
        result = compute_hotelling_t2(data, known_mean=known_mean)
        assert np.allclose(result.mean_vector, known_mean)

    def test_known_cov_used(self):
        data = make_in_control_data(n=50, p=2)
        known_cov = 2.0 * np.eye(2)
        result = compute_hotelling_t2(data, known_cov=known_cov)
        assert np.allclose(result.covariance_matrix, known_cov)

    def test_known_params_change_t2_values(self):
        data = make_in_control_data(n=50, p=2)
        r_estimated = compute_hotelling_t2(data)
        r_known = compute_hotelling_t2(
            data, known_mean=np.zeros(2), known_cov=np.eye(2)
        )
        # Different parameters → different T² values
        assert not np.allclose(r_estimated.t2_values, r_known.t2_values)


# ---------------------------------------------------------------------------
# Input validation
# ---------------------------------------------------------------------------


class TestHotellingT2Validation:
    def test_1d_input_raises(self):
        with pytest.raises(ValueError, match="2-D"):
            compute_hotelling_t2(np.array([1.0, 2.0, 3.0]))

    def test_n_le_p_raises(self):
        # n=3, p=4 → n <= p
        data = np.ones((3, 4))
        with pytest.raises(ValueError, match="greater than"):
            compute_hotelling_t2(data)

    def test_n_equals_p_raises(self):
        data = np.eye(3)
        with pytest.raises(ValueError, match="greater than"):
            compute_hotelling_t2(data)

    def test_invalid_alpha_raises(self):
        with pytest.raises(ValueError):
            HotellingT2Config(alpha=-0.1)

    def test_invalid_alpha_above_one_raises(self):
        with pytest.raises(ValueError):
            HotellingT2Config(alpha=1.5)

    def test_invalid_phase_raises(self):
        with pytest.raises(ValueError, match="phase"):
            HotellingT2Config(phase=3)

    def test_3d_input_raises(self):
        data = np.ones((10, 3, 2))
        with pytest.raises(ValueError, match="2-D"):
            compute_hotelling_t2(data)
