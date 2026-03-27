"""
Tests for the Presummarize chart algorithm.
"""
from __future__ import annotations

import math

import numpy as np
import pytest

from algo.presummarize import (
    PresummarizeConfig,
    PresummarizeResult,
    compute_presummarize,
)
from algo.common.enums import SigmaMethod


class TestPresummarizeHandCalculation:
    """Known target/sigma, verify limits match hand calculation."""

    def test_mean_mode_uniform_subgroups(self):
        # target=10, sigma=2, k=3, n=4 per subgroup
        # UCL = 10 + 3*2/sqrt(4) = 10 + 3 = 13
        # LCL = 10 - 3*2/sqrt(4) = 10 - 3 = 7
        target = 10.0
        sigma = 2.0
        k = 3.0
        n = 4
        data = np.array([
            [10.0, 11.0, 9.0, 10.0],
            [10.5, 9.5, 10.2, 9.8],
            [11.0, 10.0, 9.0, 10.0],
        ])
        config = PresummarizeConfig(target=target, sigma=sigma, k_sigma=k, summary_stat="mean")
        result = compute_presummarize(data, config=config)
        expected_ucl = target + k * sigma / math.sqrt(n)
        expected_lcl = target - k * sigma / math.sqrt(n)
        assert result.limits.ucl[0] == pytest.approx(expected_ucl)
        assert result.limits.lcl[0] == pytest.approx(expected_lcl)
        assert result.limits.cl[0] == pytest.approx(target)

    def test_cl_is_constant_target(self):
        data = np.array([[1.0, 2.0], [3.0, 4.0], [5.0, 6.0]])
        config = PresummarizeConfig(target=5.0, sigma=1.0)
        result = compute_presummarize(data, config=config)
        np.testing.assert_array_equal(result.limits.cl, np.full(3, 5.0))

    def test_result_type(self):
        data = np.array([[1.0, 2.0], [3.0, 4.0]])
        config = PresummarizeConfig(target=2.5, sigma=1.0)
        result = compute_presummarize(data, config=config)
        assert isinstance(result, PresummarizeResult)

    def test_sigma_method_is_levey_jennings(self):
        data = np.array([[1.0, 2.0], [3.0, 4.0]])
        config = PresummarizeConfig(target=2.5, sigma=1.5)
        result = compute_presummarize(data, config=config)
        assert result.sigma.method == SigmaMethod.LEVEY_JENNINGS
        assert result.sigma.sigma_hat == pytest.approx(1.5)

    def test_target_preserved(self):
        data = np.array([[5.0, 6.0, 7.0]])
        config = PresummarizeConfig(target=12.34, sigma=1.0)
        result = compute_presummarize(data, config=config)
        assert result.target == pytest.approx(12.34)


class TestPresummarizeVariableSubgroups:
    """Variable subgroup sizes produce per-point limits."""

    def test_variable_subgroup_sizes(self):
        # Subgroup sizes: 2, 4, 3
        # UCL_i = target + k*sigma/sqrt(n_i)
        target = 0.0
        sigma = 1.0
        k = 3.0
        subgroup_sizes = [2, 4, 3]
        # Build 1D data: 2+4+3=9 points
        data_1d = np.array([0.5, -0.5, 0.3, 0.1, -0.2, 0.4, 0.2, -0.1, 0.0])
        config = PresummarizeConfig(target=target, sigma=sigma, k_sigma=k, summary_stat="mean")
        result = compute_presummarize(data_1d, subgroup_sizes=subgroup_sizes, config=config)
        expected_ucls = [k * sigma / math.sqrt(n) for n in subgroup_sizes]
        for i, exp_ucl in enumerate(expected_ucls):
            assert result.limits.ucl[i] == pytest.approx(exp_ucl), f"UCL mismatch at index {i}"
        expected_lcls = [-k * sigma / math.sqrt(n) for n in subgroup_sizes]
        for i, exp_lcl in enumerate(expected_lcls):
            assert result.limits.lcl[i] == pytest.approx(exp_lcl), f"LCL mismatch at index {i}"

    def test_variable_sizes_summary_values_shape(self):
        subgroup_sizes = [2, 3, 4]
        data_1d = np.arange(9, dtype=float)
        config = PresummarizeConfig(target=4.0, sigma=1.0)
        result = compute_presummarize(data_1d, subgroup_sizes=subgroup_sizes, config=config)
        assert len(result.summary_values) == 3

    def test_mean_summary_correct(self):
        # [0,1] => mean=0.5; [2,3,4] => mean=3.0; [5,6,7,8] => mean=6.5
        data_1d = np.arange(9, dtype=float)
        subgroup_sizes = [2, 3, 4]
        config = PresummarizeConfig(target=4.0, sigma=1.0, summary_stat="mean")
        result = compute_presummarize(data_1d, subgroup_sizes=subgroup_sizes, config=config)
        np.testing.assert_allclose(result.summary_values, [0.5, 3.0, 6.5])

    def test_median_summary_correct(self):
        # [0,1] => median=0.5; [2,3,4] => median=3.0; [5,6,7,8] => median=6.5
        data_1d = np.arange(9, dtype=float)
        subgroup_sizes = [2, 3, 4]
        config = PresummarizeConfig(target=4.0, sigma=1.0, summary_stat="median")
        result = compute_presummarize(data_1d, subgroup_sizes=subgroup_sizes, config=config)
        np.testing.assert_allclose(result.summary_values, [0.5, 3.0, 6.5])


class TestPresummarizeIndividualMode:
    """Individual mode: no subgrouping, UCL = target +/- k*sigma."""

    def test_individual_limits(self):
        data = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
        config = PresummarizeConfig(target=3.0, sigma=1.0, k_sigma=3.0, summary_stat="individual")
        result = compute_presummarize(data, config=config)
        expected_ucl = 3.0 + 3.0 * 1.0
        expected_lcl = 3.0 - 3.0 * 1.0
        np.testing.assert_array_almost_equal(result.limits.ucl, np.full(5, expected_ucl))
        np.testing.assert_array_almost_equal(result.limits.lcl, np.full(5, expected_lcl))

    def test_individual_summary_values_are_data(self):
        data = np.array([1.0, 2.0, 3.0])
        config = PresummarizeConfig(target=2.0, sigma=0.5, summary_stat="individual")
        result = compute_presummarize(data, config=config)
        np.testing.assert_array_equal(result.summary_values, data)

    def test_individual_no_subgroup_sizes_needed(self):
        data = np.array([5.0, 6.0, 7.0])
        config = PresummarizeConfig(target=6.0, sigma=1.0, summary_stat="individual")
        # Should work without subgroup_sizes
        result = compute_presummarize(data, config=config)
        assert len(result.summary_values) == 3


class TestPresummarizeViolations:
    """Points outside known limits should be identifiable."""

    def test_points_outside_limits(self):
        # target=0, sigma=1, k=3 => UCL=3, LCL=-3
        target = 0.0
        sigma = 1.0
        k = 3.0
        data = np.array([0.0, 2.0, 5.0, -5.0, 1.0])  # 5 and -5 are outside
        config = PresummarizeConfig(target=target, sigma=sigma, k_sigma=k, summary_stat="individual")
        result = compute_presummarize(data, config=config)
        violations_upper = result.summary_values > result.limits.ucl
        violations_lower = result.summary_values < result.limits.lcl
        assert violations_upper[2]   # 5.0 > UCL=3
        assert violations_lower[3]   # -5.0 < LCL=-3
        assert not violations_upper[0]  # 0.0 <= UCL
        assert not violations_lower[0]  # 0.0 >= LCL

    def test_all_in_control(self):
        target = 100.0
        sigma = 5.0
        k = 3.0
        # All data within [85, 115]
        data = np.array([[98.0, 102.0], [99.0, 101.0], [100.0, 100.0]])
        config = PresummarizeConfig(target=target, sigma=sigma, k_sigma=k, summary_stat="mean")
        result = compute_presummarize(data, config=config)
        assert np.all(result.summary_values <= result.limits.ucl)
        assert np.all(result.summary_values >= result.limits.lcl)


class TestPresummarizeValidation:
    """Input validation tests."""

    def test_sigma_must_be_positive(self):
        with pytest.raises((ValueError, TypeError)):
            PresummarizeConfig(target=0.0, sigma=-1.0)

    def test_sigma_zero_raises(self):
        with pytest.raises((ValueError, TypeError)):
            PresummarizeConfig(target=0.0, sigma=0.0)

    def test_k_sigma_must_be_positive(self):
        with pytest.raises((ValueError, TypeError)):
            PresummarizeConfig(target=0.0, sigma=1.0, k_sigma=-1.0)

    def test_invalid_summary_stat(self):
        data = np.array([1.0, 2.0, 3.0])
        config = PresummarizeConfig(target=2.0, sigma=1.0, summary_stat="mode")
        with pytest.raises(ValueError):
            compute_presummarize(data, config=config)
