"""
Tests for the Run Chart algorithm.
"""
from __future__ import annotations

import math

import numpy as np
import pytest

from algo.run_chart import RunChartConfig, RunChartResult, compute_run_chart


class TestRunChartKnownSequence:
    """Known sequence with known number of runs."""

    def test_known_runs_count(self):
        # Sequence: A A B B A B A A B B  (A=above, B=below center=5)
        # Values:   7 8 3 2 9 1 6 7 4 2
        # Runs:     [7,8] [3,2] [9] [1] [6,7] [4,2] => 6 runs
        data = np.array([7.0, 8.0, 3.0, 2.0, 9.0, 1.0, 6.0, 7.0, 4.0, 2.0])
        config = RunChartConfig(center_method="median")
        result = compute_run_chart(data, config)
        assert result.n_runs == 6

    def test_result_type(self):
        data = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
        result = compute_run_chart(data)
        assert isinstance(result, RunChartResult)

    def test_values_preserved(self):
        data = np.array([1.0, 3.0, 2.0, 5.0, 4.0])
        result = compute_run_chart(data)
        np.testing.assert_array_equal(result.values, data)


class TestRunChartCenterMethods:
    """Tests for median vs mean center line computation."""

    def test_median_center(self):
        data = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
        config = RunChartConfig(center_method="median")
        result = compute_run_chart(data, config)
        assert result.center == pytest.approx(3.0)

    def test_mean_center(self):
        data = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
        config = RunChartConfig(center_method="mean")
        result = compute_run_chart(data, config)
        assert result.center == pytest.approx(3.0)

    def test_median_vs_mean_differ(self):
        # Skewed data: median != mean
        data = np.array([1.0, 2.0, 3.0, 4.0, 100.0])
        median_config = RunChartConfig(center_method="median")
        mean_config = RunChartConfig(center_method="mean")
        r_median = compute_run_chart(data, median_config)
        r_mean = compute_run_chart(data, mean_config)
        assert r_median.center == pytest.approx(3.0)
        assert r_mean.center == pytest.approx(22.0)

    def test_default_center_is_median(self):
        data = np.array([1.0, 2.0, 3.0, 4.0, 100.0])
        result = compute_run_chart(data)
        assert result.center == pytest.approx(3.0)


class TestRunChartAllOneSide:
    """All points on one side => 1 run."""

    def test_all_above_center(self):
        # data=[5,5,5,6,7] => median=5; 6 and 7 are above; the three 5s are on center
        # (excluded). Only above-center points remain => n1=2, n2=0 => 1 run.
        data = np.array([5.0, 5.0, 5.0, 6.0, 7.0])
        config = RunChartConfig(center_method="median")
        result = compute_run_chart(data, config)
        assert result.n_runs == 1

    def test_all_below_center(self):
        # data=[1,2,3,3,3] => median=3; 1 and 2 are below; the three 3s are on center
        # (excluded). Only below-center points remain => n1=0, n2=2 => 1 run.
        data = np.array([1.0, 2.0, 3.0, 3.0, 3.0])
        config = RunChartConfig(center_method="median")
        result = compute_run_chart(data, config)
        assert result.n_runs == 1


class TestRunChartAlternating:
    """Alternating values => maximum runs."""

    def test_alternating_above_below(self):
        # A B A B A B A B: 8 runs (alternating around center=5)
        data = np.array([6.0, 4.0, 6.0, 4.0, 6.0, 4.0, 6.0, 4.0])
        config = RunChartConfig(center_method="mean")
        result = compute_run_chart(data, config)
        assert result.n_runs == 8


class TestRunChartOnCenterExclusion:
    """Points exactly on the center line are excluded from run counting."""

    def test_center_points_excluded(self):
        # Sequence: A ON A B ON B => after excluding ON, we have A A B B => 2 runs
        # center = mean = 5.0
        data = np.array([7.0, 5.0, 8.0, 3.0, 5.0, 2.0])
        config = RunChartConfig(center_method="mean")
        result = compute_run_chart(data, config)
        # Excluding the two 5.0s: [7, 8, 3, 2] => A A B B => 2 runs
        assert result.n_runs == 2

    def test_all_on_center(self):
        data = np.array([3.0, 3.0, 3.0, 3.0])
        config = RunChartConfig(center_method="mean")
        result = compute_run_chart(data, config)
        # All excluded: n1=0, n2=0 => n_runs=0
        assert result.n_runs == 0


class TestRunChartStatistics:
    """Expected runs and p-value tests."""

    def test_expected_runs_formula(self):
        # 8 points alternating: n1=4, n2=4
        # expected = (2*4*4)/(4+4) + 1 = 32/8 + 1 = 5.0
        data = np.array([6.0, 4.0, 6.0, 4.0, 6.0, 4.0, 6.0, 4.0])
        config = RunChartConfig(center_method="mean")
        result = compute_run_chart(data, config)
        assert result.expected_runs == pytest.approx(5.0)

    def test_p_value_in_range(self):
        data = np.array([1.0, 5.0, 2.0, 6.0, 3.0, 7.0, 4.0, 8.0])
        result = compute_run_chart(data)
        assert 0.0 <= result.p_value <= 1.0

    def test_p_value_range_multiple_datasets(self):
        rng = np.random.default_rng(42)
        for _ in range(10):
            data = rng.normal(0, 1, size=30)
            result = compute_run_chart(data)
            assert 0.0 <= result.p_value <= 1.0

    def test_highly_non_random_has_low_p(self):
        # Perfect alternating pattern is highly non-random (too many runs)
        data = np.array([6.0, 4.0, 6.0, 4.0, 6.0, 4.0, 6.0, 4.0,
                         6.0, 4.0, 6.0, 4.0, 6.0, 4.0, 6.0, 4.0])
        config = RunChartConfig(center_method="mean")
        result = compute_run_chart(data, config)
        assert result.p_value < 0.05

    def test_invalid_center_method(self):
        data = np.array([1.0, 2.0, 3.0])
        with pytest.raises(ValueError, match="center_method"):
            RunChartConfig(center_method="mode")
