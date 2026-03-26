"""
Property-based tests using Hypothesis.

Tests key algorithmic invariants for control chart computations.
"""
from __future__ import annotations

import numpy as np
import pytest
from hypothesis import given, strategies as st, settings, assume
from hypothesis.extra.numpy import arrays

from algo.imr import IMRConfig, compute_imr
from algo.p_chart import PChartConfig, PChartResult, p_chart
from algo.cusum import CUSUMConfig, compute_cusum
from algo.ewma import EWMAConfig, compute_ewma
from algo.common.enums import SigmaMethod


# ---------------------------------------------------------------------------
# Shared strategy: 1-D arrays of safe floats between 1 and 100
# ---------------------------------------------------------------------------

safe_floats = st.floats(1, 100, allow_nan=False, allow_infinity=False)
safe_data = arrays(
    dtype=np.float64,
    shape=st.integers(min_value=3, max_value=50),
    elements=safe_floats,
)


# ---------------------------------------------------------------------------
# Invariant 1: IMR – UCL >= CL >= LCL for random data
# ---------------------------------------------------------------------------

@settings(max_examples=50)
@given(data=safe_data)
def test_imr_limits_ordered(data):
    """UCL >= CL >= LCL element-wise for the individuals chart."""
    result = compute_imr(data)
    limits = result.i_limits
    assert np.all(limits.ucl >= limits.cl), "UCL must be >= CL"
    assert np.all(limits.cl >= limits.lcl), "CL must be >= LCL"


# ---------------------------------------------------------------------------
# Invariant 2: IMR – MR LCL >= 0
# ---------------------------------------------------------------------------

@settings(max_examples=50)
@given(data=safe_data)
def test_imr_mr_lcl_non_negative(data):
    """Moving range LCL is always >= 0."""
    result = compute_imr(data)
    assert np.all(result.mr_limits.lcl >= 0), "MR LCL must be >= 0"


# ---------------------------------------------------------------------------
# Invariant 3: IMR – wider k_sigma -> wider limits
# ---------------------------------------------------------------------------

@settings(max_examples=50)
@given(data=safe_data)
def test_imr_wider_k_wider_limits(data):
    """Increasing k_sigma produces wider or equal control limits."""
    config_narrow = IMRConfig(k_sigma=2.0)
    config_wide = IMRConfig(k_sigma=4.0)
    result_narrow = compute_imr(data, config=config_narrow)
    result_wide = compute_imr(data, config=config_wide)

    # UCL should be wider (higher) for larger k_sigma
    assert np.all(result_wide.i_limits.ucl >= result_narrow.i_limits.ucl)
    # LCL should be wider (lower) for larger k_sigma
    assert np.all(result_wide.i_limits.lcl <= result_narrow.i_limits.lcl)


# ---------------------------------------------------------------------------
# Invariant 4: IMR – CL equals mean of data
# ---------------------------------------------------------------------------

@settings(max_examples=50)
@given(data=safe_data)
def test_imr_cl_equals_mean(data):
    """The center line of the individuals chart equals the sample mean."""
    result = compute_imr(data)
    expected_mean = float(np.mean(data))
    np.testing.assert_allclose(
        result.i_limits.cl,
        np.full(len(data), expected_mean),
        rtol=1e-10,
    )


# ---------------------------------------------------------------------------
# Invariant 5: P chart – UCL <= 1, LCL >= 0
# ---------------------------------------------------------------------------

@settings(max_examples=50)
@given(
    n_samples=st.integers(min_value=5, max_value=30),
    sample_size=st.integers(min_value=5, max_value=100),
)
def test_p_chart_limits_valid_range(n_samples, sample_size):
    """P chart control limits must stay within [0, 1]."""
    # Use a fixed p so we always have valid proportion data
    rng = np.random.default_rng(seed=n_samples * sample_size)
    counts = rng.binomial(sample_size, 0.1, size=n_samples).astype(float)
    sizes = np.full(n_samples, float(sample_size))

    result = p_chart(counts, sizes)
    assert np.all(result.limits.ucl <= 1.0 + 1e-10), f"UCL exceeded 1: {result.limits.ucl.max()}"
    assert np.all(result.limits.lcl >= 0.0), f"LCL negative: {result.limits.lcl.min()}"


# ---------------------------------------------------------------------------
# Invariant 6: CUSUM – C+ >= 0, C- <= 0
# ---------------------------------------------------------------------------

@settings(max_examples=50)
@given(data=safe_data)
def test_cusum_sign_invariant(data):
    """CUSUM C+ accumulator >= 0 and C- accumulator <= 0 throughout."""
    config = CUSUMConfig(target=float(np.mean(data)), sigma=1.0, h=5.0, k=0.5)
    result = compute_cusum(data, config=config)
    assert np.all(result.c_plus >= 0), "C+ must be >= 0"
    assert np.all(result.c_minus <= 0), "C- must be <= 0"


# ---------------------------------------------------------------------------
# Invariant 7: EWMA – lambda=1 gives EWMA equal to raw data
# ---------------------------------------------------------------------------

@settings(max_examples=50)
@given(data=safe_data)
def test_ewma_lambda1_equals_data(data):
    """When lambda=1, the EWMA statistic equals each raw observation."""
    target = float(np.mean(data))
    config = EWMAConfig(target=target, sigma=1.0, lambda_=1.0)
    result = compute_ewma(data, config=config)
    np.testing.assert_allclose(result.ewma, data, rtol=1e-10)


# ---------------------------------------------------------------------------
# Invariant 8: Config validation
# ---------------------------------------------------------------------------

class TestConfigValidation:
    def test_imr_rejects_negative_k_sigma(self):
        with pytest.raises(ValueError):
            IMRConfig(k_sigma=-1.0)

    def test_imr_rejects_zero_k_sigma(self):
        with pytest.raises(ValueError):
            IMRConfig(k_sigma=0.0)

    def test_imr_rejects_nan_k_sigma(self):
        with pytest.raises(ValueError):
            IMRConfig(k_sigma=float("nan"))

    def test_imr_rejects_inf_k_sigma(self):
        with pytest.raises(ValueError):
            IMRConfig(k_sigma=float("inf"))

    def test_imr_rejects_invalid_sigma_method(self):
        with pytest.raises((ValueError, Exception)):
            IMRConfig(sigma_method="invalid_method")

    def test_ewma_rejects_lambda_zero(self):
        with pytest.raises(ValueError):
            EWMAConfig(target=0.0, sigma=1.0, lambda_=0.0)

    def test_ewma_rejects_lambda_negative(self):
        with pytest.raises(ValueError):
            EWMAConfig(target=0.0, sigma=1.0, lambda_=-0.1)

    def test_ewma_rejects_lambda_greater_than_1(self):
        with pytest.raises(ValueError):
            EWMAConfig(target=0.0, sigma=1.0, lambda_=1.1)

    def test_ewma_accepts_lambda_1(self):
        # lambda=1 is valid
        config = EWMAConfig(target=0.0, sigma=1.0, lambda_=1.0)
        assert config.lambda_ == 1.0

    def test_ewma_rejects_negative_sigma(self):
        with pytest.raises(ValueError):
            EWMAConfig(target=0.0, sigma=-1.0, lambda_=0.2)
