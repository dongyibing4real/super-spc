"""
Tests for the standalone R chart.
"""
import numpy as np
import pytest

from algo.r_chart import RChartConfig, RChartResult, compute_r_chart
from algo.constants.tables import d2, d3


# ---------------------------------------------------------------------------
# Known-answer test: 5 subgroups of size 4, all ranges = 3
# ---------------------------------------------------------------------------

DATA_5x4 = np.array([
    [2.0, 3.0, 4.0, 5.0],
    [1.0, 2.0, 3.0, 4.0],
    [3.0, 4.0, 5.0, 6.0],
    [2.0, 3.0, 4.0, 5.0],
    [1.0, 2.0, 3.0, 4.0],
])


def test_known_answer_r_bar():
    result = compute_r_chart(DATA_5x4)
    assert abs(result.r_bar - 3.0) < 1e-10


def test_known_answer_limits_shape():
    result = compute_r_chart(DATA_5x4)
    assert result.limits.ucl.shape == (5,)
    assert result.limits.cl.shape == (5,)
    assert result.limits.lcl.shape == (5,)


def test_known_answer_cl():
    result = compute_r_chart(DATA_5x4)
    sigma_hat = result.sigma.sigma_hat
    expected_cl = d2(4) * sigma_hat
    np.testing.assert_allclose(result.limits.cl, expected_cl, rtol=1e-10)


def test_known_answer_ucl():
    result = compute_r_chart(DATA_5x4)
    sigma_hat = result.sigma.sigma_hat
    expected_ucl = d2(4) * sigma_hat + 3.0 * d3(4) * sigma_hat
    np.testing.assert_allclose(result.limits.ucl, expected_ucl, rtol=1e-10)


def test_known_answer_lcl_zero():
    result = compute_r_chart(DATA_5x4)
    # n=4 => LCL should be 0 (cannot be negative)
    np.testing.assert_allclose(result.limits.lcl, 0.0, atol=1e-10)


def test_known_answer_ranges():
    result = compute_r_chart(DATA_5x4)
    np.testing.assert_allclose(result.subgroup_ranges, 3.0)


def test_known_answer_result_type():
    result = compute_r_chart(DATA_5x4)
    assert isinstance(result, RChartResult)


# ---------------------------------------------------------------------------
# Variable subgroup sizes: limits vary per subgroup
# ---------------------------------------------------------------------------

def test_variable_subgroup_sizes_limits_vary():
    """With different subgroup sizes, CL values should differ."""
    # subgroups: size 3, size 5
    data_1d = np.array([1.0, 2.0, 3.0,  1.0, 2.0, 3.0, 4.0, 5.0])
    sizes = np.array([3, 5])
    result = compute_r_chart(data_1d, subgroup_sizes=sizes)
    # CL depends on d2(ni)*sigma_hat, d2(3) != d2(5)
    assert result.limits.cl[0] != result.limits.cl[1]


def test_variable_subgroup_sizes_shape():
    data_1d = np.array([1.0, 2.0, 3.0,  1.0, 2.0, 3.0, 4.0, 5.0])
    sizes = np.array([3, 5])
    result = compute_r_chart(data_1d, subgroup_sizes=sizes)
    assert result.limits.ucl.shape == (2,)
    assert result.limits.cl.shape == (2,)
    assert result.limits.lcl.shape == (2,)


# ---------------------------------------------------------------------------
# LCL >= 0 always
# ---------------------------------------------------------------------------

def test_lcl_nonneg_small_subgroup():
    """For n=2 the standard formula gives LCL < 0; must be clamped to 0."""
    data = np.array([
        [1.0, 5.0],
        [2.0, 6.0],
        [3.0, 7.0],
    ])
    result = compute_r_chart(data)
    assert np.all(result.limits.lcl >= 0.0)


def test_lcl_nonneg_large_sigma():
    """LCL must be >= 0 regardless of k_sigma."""
    data = np.array([
        [0.0, 10.0],
        [1.0, 9.0],
    ])
    result = compute_r_chart(data, config=RChartConfig(k_sigma=10.0))
    assert np.all(result.limits.lcl >= 0.0)


# ---------------------------------------------------------------------------
# Single subgroup
# ---------------------------------------------------------------------------

def test_single_subgroup_2d():
    data = np.array([[1.0, 3.0, 5.0, 7.0]])
    result = compute_r_chart(data)
    assert result.subgroup_ranges.shape == (1,)
    assert result.limits.ucl.shape == (1,)
    np.testing.assert_allclose(result.subgroup_ranges, [6.0])


# ---------------------------------------------------------------------------
# 1-D input validation
# ---------------------------------------------------------------------------

def test_1d_requires_subgroup_sizes():
    with pytest.raises(ValueError, match="subgroup_sizes"):
        compute_r_chart(np.array([1.0, 2.0, 3.0]))


def test_1d_size_mismatch():
    with pytest.raises(ValueError):
        compute_r_chart(np.array([1.0, 2.0, 3.0]), subgroup_sizes=np.array([2, 4]))


# ---------------------------------------------------------------------------
# Config k_sigma validation
# ---------------------------------------------------------------------------

def test_invalid_k_sigma():
    with pytest.raises((ValueError, TypeError)):
        RChartConfig(k_sigma=-1.0)


# ---------------------------------------------------------------------------
# Zones are based on R_bar
# ---------------------------------------------------------------------------

def test_zones_center_is_r_bar():
    result = compute_r_chart(DATA_5x4)
    assert abs(result.zones.cl - result.r_bar) < 1e-10
