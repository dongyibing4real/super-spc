"""
Tests for the standalone S chart.
"""
import numpy as np
import pytest

from algo.s_chart import SChartConfig, SChartResult, compute_s_chart
from algo.constants.tables import c4, c5


# ---------------------------------------------------------------------------
# Known-answer test: 5 subgroups of size 4
# All rows are [k, k+1, k+2, k+3] => stddev = sqrt(5/3) ~ 1.2910
# ---------------------------------------------------------------------------

DATA_5x4 = np.array([
    [2.0, 3.0, 4.0, 5.0],
    [1.0, 2.0, 3.0, 4.0],
    [3.0, 4.0, 5.0, 6.0],
    [2.0, 3.0, 4.0, 5.0],
    [1.0, 2.0, 3.0, 4.0],
])

_EXPECTED_STDDEV = float(np.std([2.0, 3.0, 4.0, 5.0], ddof=1))  # same for all rows


def test_known_answer_s_bar():
    result = compute_s_chart(DATA_5x4)
    assert abs(result.s_bar - _EXPECTED_STDDEV) < 1e-10


def test_known_answer_stddevs():
    result = compute_s_chart(DATA_5x4)
    np.testing.assert_allclose(result.subgroup_stddevs, _EXPECTED_STDDEV)


def test_known_answer_result_type():
    result = compute_s_chart(DATA_5x4)
    assert isinstance(result, SChartResult)


def test_known_answer_limits_shape():
    result = compute_s_chart(DATA_5x4)
    assert result.limits.ucl.shape == (5,)
    assert result.limits.cl.shape == (5,)
    assert result.limits.lcl.shape == (5,)


def test_known_answer_cl():
    result = compute_s_chart(DATA_5x4)
    sigma_hat = result.sigma.sigma_hat
    expected_cl = c4(4) * sigma_hat
    np.testing.assert_allclose(result.limits.cl, expected_cl, rtol=1e-10)


def test_known_answer_ucl():
    result = compute_s_chart(DATA_5x4)
    sigma_hat = result.sigma.sigma_hat
    expected_ucl = c4(4) * sigma_hat + 3.0 * c5(4) * sigma_hat
    np.testing.assert_allclose(result.limits.ucl, expected_ucl, rtol=1e-10)


def test_known_answer_lcl_zero():
    result = compute_s_chart(DATA_5x4)
    # n=4 => LCL is 0 (clamped)
    np.testing.assert_allclose(result.limits.lcl, 0.0, atol=1e-10)


# ---------------------------------------------------------------------------
# Variable subgroup sizes: limits vary per subgroup
# ---------------------------------------------------------------------------

def test_variable_subgroup_sizes_limits_vary():
    """With different subgroup sizes, CL values should differ."""
    data_1d = np.array([1.0, 2.0, 3.0,  1.0, 2.0, 3.0, 4.0, 5.0])
    sizes = np.array([3, 5])
    result = compute_s_chart(data_1d, subgroup_sizes=sizes)
    # c4(3) != c4(5), so CL differs
    assert result.limits.cl[0] != result.limits.cl[1]


def test_variable_subgroup_sizes_shape():
    data_1d = np.array([1.0, 2.0, 3.0,  1.0, 2.0, 3.0, 4.0, 5.0])
    sizes = np.array([3, 5])
    result = compute_s_chart(data_1d, subgroup_sizes=sizes)
    assert result.limits.ucl.shape == (2,)
    assert result.limits.cl.shape == (2,)
    assert result.limits.lcl.shape == (2,)


# ---------------------------------------------------------------------------
# LCL >= 0 always
# ---------------------------------------------------------------------------

def test_lcl_nonneg_small_subgroup():
    """For n=2 the formula gives LCL < 0; must be clamped to 0."""
    data = np.array([
        [1.0, 5.0],
        [2.0, 6.0],
        [3.0, 7.0],
    ])
    result = compute_s_chart(data)
    assert np.all(result.limits.lcl >= 0.0)


def test_lcl_nonneg_large_k():
    """LCL must be >= 0 regardless of k_sigma."""
    data = np.array([
        [0.0, 10.0, 5.0],
        [1.0, 9.0, 4.0],
    ])
    result = compute_s_chart(data, config=SChartConfig(k_sigma=10.0))
    assert np.all(result.limits.lcl >= 0.0)


# ---------------------------------------------------------------------------
# Single subgroup
# ---------------------------------------------------------------------------

def test_single_subgroup_2d():
    data = np.array([[1.0, 3.0, 5.0, 7.0]])
    result = compute_s_chart(data)
    assert result.subgroup_stddevs.shape == (1,)
    assert result.limits.ucl.shape == (1,)
    expected_std = float(np.std([1.0, 3.0, 5.0, 7.0], ddof=1))
    np.testing.assert_allclose(result.subgroup_stddevs, [expected_std])


# ---------------------------------------------------------------------------
# 1-D input validation
# ---------------------------------------------------------------------------

def test_1d_requires_subgroup_sizes():
    with pytest.raises(ValueError, match="subgroup_sizes"):
        compute_s_chart(np.array([1.0, 2.0, 3.0]))


def test_1d_size_mismatch():
    with pytest.raises(ValueError):
        compute_s_chart(np.array([1.0, 2.0, 3.0]), subgroup_sizes=np.array([2, 4]))


# ---------------------------------------------------------------------------
# Config validation
# ---------------------------------------------------------------------------

def test_invalid_k_sigma():
    with pytest.raises((ValueError, TypeError)):
        SChartConfig(k_sigma=-1.0)


# ---------------------------------------------------------------------------
# Zones are based on S_bar
# ---------------------------------------------------------------------------

def test_zones_center_is_s_bar():
    result = compute_s_chart(DATA_5x4)
    assert abs(result.zones.cl - result.s_bar) < 1e-10
