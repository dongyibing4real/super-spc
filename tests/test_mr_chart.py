"""
Tests for the standalone MR (Moving Range) chart.
"""
import numpy as np
import pytest

from algo.mr_chart import MRChartConfig, MRChartResult, compute_mr_chart
from algo.common.enums import SigmaMethod
from algo.constants.tables import d2, d3


# ---------------------------------------------------------------------------
# Known-answer test: span=2 (default)
# data = [1, 2, 4, 3, 5]  => MRs = [1, 2, 1, 2]  => MR_bar = 1.5
# ---------------------------------------------------------------------------

DATA_5 = np.array([1.0, 2.0, 4.0, 3.0, 5.0])


def test_known_answer_moving_ranges():
    result = compute_mr_chart(DATA_5)
    expected = np.array([1.0, 2.0, 1.0, 2.0])
    np.testing.assert_allclose(result.moving_ranges, expected)


def test_known_answer_mr_bar():
    result = compute_mr_chart(DATA_5)
    assert abs(result.mr_bar - 1.5) < 1e-10


def test_known_answer_result_type():
    result = compute_mr_chart(DATA_5)
    assert isinstance(result, MRChartResult)


def test_known_answer_limits_shape():
    result = compute_mr_chart(DATA_5)
    assert result.limits.ucl.shape == (4,)
    assert result.limits.cl.shape == (4,)
    assert result.limits.lcl.shape == (4,)


def test_known_answer_cl():
    result = compute_mr_chart(DATA_5)
    sigma_hat = result.sigma.sigma_hat
    expected_cl = d2(2) * sigma_hat
    np.testing.assert_allclose(result.limits.cl, expected_cl, rtol=1e-10)


def test_known_answer_ucl():
    result = compute_mr_chart(DATA_5)
    sigma_hat = result.sigma.sigma_hat
    expected_ucl = d2(2) * sigma_hat + 3.0 * d3(2) * sigma_hat
    np.testing.assert_allclose(result.limits.ucl, expected_ucl, rtol=1e-10)


# ---------------------------------------------------------------------------
# Median MR method
# ---------------------------------------------------------------------------

def test_median_mr_method():
    """Median MR gives a different sigma than mean MR for skewed data."""
    data = np.array([1.0, 2.0, 1.5, 10.0, 1.8, 2.0])
    result_mean = compute_mr_chart(data, config=MRChartConfig(sigma_method=SigmaMethod.MOVING_RANGE))
    result_median = compute_mr_chart(data, config=MRChartConfig(sigma_method=SigmaMethod.MEDIAN_MOVING_RANGE))
    # They should differ for this data (one outlier inflates mean MR)
    assert result_mean.sigma.sigma_hat != result_median.sigma.sigma_hat


def test_median_mr_sigma_method_recorded():
    data = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
    result = compute_mr_chart(data, config=MRChartConfig(sigma_method=SigmaMethod.MEDIAN_MOVING_RANGE))
    assert result.sigma.method == SigmaMethod.MEDIAN_MOVING_RANGE


# ---------------------------------------------------------------------------
# span=3
# ---------------------------------------------------------------------------

DATA_6 = np.array([1.0, 2.0, 4.0, 3.0, 5.0, 2.0])


def test_span3_moving_ranges():
    result = compute_mr_chart(DATA_6, config=MRChartConfig(span=3))
    expected = np.array([3.0, 2.0, 2.0, 3.0])
    np.testing.assert_allclose(result.moving_ranges, expected)


def test_span3_mr_bar():
    result = compute_mr_chart(DATA_6, config=MRChartConfig(span=3))
    assert abs(result.mr_bar - 2.5) < 1e-10


def test_span3_limits_shape():
    result = compute_mr_chart(DATA_6, config=MRChartConfig(span=3))
    assert result.limits.ucl.shape == (4,)
    assert result.limits.cl.shape == (4,)
    assert result.limits.lcl.shape == (4,)


def test_span3_uses_d2_d3_span3():
    result = compute_mr_chart(DATA_6, config=MRChartConfig(span=3))
    sigma_hat = result.sigma.sigma_hat
    expected_cl = d2(3) * sigma_hat
    np.testing.assert_allclose(result.limits.cl, expected_cl, rtol=1e-10)


# ---------------------------------------------------------------------------
# LCL >= 0 always
# ---------------------------------------------------------------------------

def test_lcl_nonneg_default():
    result = compute_mr_chart(DATA_5)
    assert np.all(result.limits.lcl >= 0.0)


def test_lcl_nonneg_large_k():
    result = compute_mr_chart(DATA_5, config=MRChartConfig(k_sigma=10.0))
    assert np.all(result.limits.lcl >= 0.0)


# ---------------------------------------------------------------------------
# Constant data — all MRs are 0
# ---------------------------------------------------------------------------

def test_constant_data_zero_mr():
    data = np.full(6, 5.0)
    result = compute_mr_chart(data)
    np.testing.assert_allclose(result.moving_ranges, 0.0)


def test_constant_data_mr_bar():
    data = np.full(6, 5.0)
    result = compute_mr_chart(data)
    assert result.mr_bar == 0.0


def test_constant_data_limits_zero():
    data = np.full(6, 5.0)
    result = compute_mr_chart(data)
    np.testing.assert_allclose(result.limits.ucl, 0.0)
    np.testing.assert_allclose(result.limits.cl, 0.0)
    np.testing.assert_allclose(result.limits.lcl, 0.0)


# ---------------------------------------------------------------------------
# Input validation
# ---------------------------------------------------------------------------

def test_2d_data_raises():
    with pytest.raises(ValueError, match="1-D"):
        compute_mr_chart(np.array([[1.0, 2.0], [3.0, 4.0]]))


def test_span_lt_2_raises():
    with pytest.raises((ValueError, TypeError)):
        MRChartConfig(span=1)


def test_invalid_k_sigma():
    with pytest.raises((ValueError, TypeError)):
        MRChartConfig(k_sigma=0.0)


def test_invalid_sigma_method():
    with pytest.raises(ValueError):
        MRChartConfig(sigma_method=SigmaMethod.RANGE)


# ---------------------------------------------------------------------------
# Zones are based on MR_bar
# ---------------------------------------------------------------------------

def test_zones_center_is_mr_bar():
    result = compute_mr_chart(DATA_5)
    assert abs(result.zones.cl - result.mr_bar) < 1e-10
