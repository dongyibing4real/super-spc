"""
Property-based tests using Hypothesis.

Tests key algorithmic invariants for control chart computations.
"""
from __future__ import annotations

import numpy as np
import pytest
from hypothesis import given, strategies as st, settings, assume, HealthCheck
from hypothesis.extra.numpy import arrays

from algo.imr import IMRConfig, compute_imr
from algo.p_chart import PChartConfig, PChartResult, p_chart
from algo.cusum import CUSUMConfig, compute_cusum
from algo.ewma import EWMAConfig, compute_ewma
from algo.common.enums import SigmaMethod
from algo.r_chart import RChartConfig, compute_r_chart
from algo.s_chart import SChartConfig, compute_s_chart
from algo.mr_chart import MRChartConfig, compute_mr_chart
from algo.run_chart import RunChartConfig, compute_run_chart
from algo.hotelling_t2 import HotellingT2Config, compute_hotelling_t2
from algo.mewma import MEWMAConfig, compute_mewma


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

@settings(max_examples=50, suppress_health_check=[HealthCheck.too_slow])
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


# ---------------------------------------------------------------------------
# Invariant 9: R chart – LCL >= 0
# ---------------------------------------------------------------------------

@settings(max_examples=50)
@given(
    data=arrays(
        dtype=np.float64,
        shape=st.tuples(st.integers(3, 20), st.integers(2, 8)),
        elements=safe_floats,
    )
)
def test_r_chart_lcl_non_negative(data):
    """R chart LCL is always >= 0."""
    result = compute_r_chart(data)
    assert np.all(result.limits.lcl >= 0), "R chart LCL must be >= 0"


# ---------------------------------------------------------------------------
# Invariant 10: S chart – LCL >= 0
# ---------------------------------------------------------------------------

@settings(max_examples=50)
@given(
    data=arrays(
        dtype=np.float64,
        shape=st.tuples(st.integers(3, 20), st.integers(2, 8)),
        elements=safe_floats,
    )
)
def test_s_chart_lcl_non_negative(data):
    """S chart LCL is always >= 0."""
    result = compute_s_chart(data)
    assert np.all(result.limits.lcl >= 0), "S chart LCL must be >= 0"


# ---------------------------------------------------------------------------
# Invariant 11: MR chart – LCL >= 0
# ---------------------------------------------------------------------------

@settings(max_examples=50)
@given(data=safe_data)
def test_mr_chart_lcl_non_negative(data):
    """MR chart LCL is always >= 0."""
    result = compute_mr_chart(data)
    assert np.all(result.limits.lcl >= 0), "MR chart LCL must be >= 0"


# ---------------------------------------------------------------------------
# Invariant 12: Run chart – p_value in [0, 1]
# ---------------------------------------------------------------------------

@settings(max_examples=50)
@given(data=safe_data)
def test_run_chart_p_value_valid(data):
    """Run chart p-value is between 0 and 1."""
    result = compute_run_chart(data)
    assert 0 <= result.p_value <= 1, f"p_value out of range: {result.p_value}"


# ---------------------------------------------------------------------------
# Invariant 13: Run chart – n_runs >= 1
# ---------------------------------------------------------------------------

@settings(max_examples=50)
@given(data=safe_data)
def test_run_chart_n_runs_non_negative(data):
    """Run count is always non-negative. Zero when all points equal center."""
    result = compute_run_chart(data)
    assert result.n_runs >= 0


# ---------------------------------------------------------------------------
# Invariant 14: Hotelling T² – values >= 0
# ---------------------------------------------------------------------------

@settings(max_examples=30)
@given(
    data=arrays(
        dtype=np.float64,
        shape=st.tuples(st.integers(10, 30), st.integers(2, 4)),
        elements=safe_floats,
    )
)
def test_hotelling_t2_non_negative(data):
    """T² values are always non-negative."""
    assume(np.linalg.matrix_rank(np.cov(data, rowvar=False)) == data.shape[1])
    result = compute_hotelling_t2(data)
    assert np.all(result.t2_values >= -1e-10), "T² must be >= 0"


# ---------------------------------------------------------------------------
# Invariant 15: Hotelling T² – contributions sum to T²
# ---------------------------------------------------------------------------

@settings(max_examples=30)
@given(
    data=arrays(
        dtype=np.float64,
        shape=st.tuples(st.integers(10, 30), st.integers(2, 4)),
        elements=safe_floats,
    )
)
def test_hotelling_t2_contributions_sum(data):
    """Per-variable contributions sum to the total T² for each observation."""
    assume(np.linalg.matrix_rank(np.cov(data, rowvar=False)) == data.shape[1])
    result = compute_hotelling_t2(data)
    np.testing.assert_allclose(
        result.contributions.sum(axis=1), result.t2_values, atol=1e-6
    )


# ---------------------------------------------------------------------------
# Invariant 16: MEWMA – T² values >= 0
# ---------------------------------------------------------------------------

@settings(max_examples=30)
@given(
    data=arrays(
        dtype=np.float64,
        shape=st.tuples(st.integers(10, 30), st.integers(2, 4)),
        elements=safe_floats,
    )
)
def test_mewma_t2_non_negative(data):
    """MEWMA T² values are always non-negative."""
    assume(np.linalg.matrix_rank(np.cov(data, rowvar=False)) == data.shape[1])
    result = compute_mewma(data)
    assert np.all(result.t2_values >= -1e-10), "MEWMA T² must be >= 0"
