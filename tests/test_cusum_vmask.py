"""
Tests for the CUSUM V-Mask algorithm.
"""
from __future__ import annotations

import math

import numpy as np
import pytest

from algo.cusum_vmask import (
    CUSUMVMaskConfig,
    CUSUMVMaskResult,
    compute_cusum_vmask,
)
from algo.cusum.cusum import CUSUMConfig, compute_cusum


class TestCUSUMVMaskCumulativeSums:
    """Cumulative sums should be correct."""

    def test_cumsum_on_target(self):
        # All values equal to target => S_i = 0 for all i
        values = np.full(10, 5.0)
        config = CUSUMVMaskConfig(target=5.0, sigma=1.0)
        result = compute_cusum_vmask(values, config)
        np.testing.assert_array_almost_equal(result.cumulative_sums, np.zeros(10))

    def test_cumsum_increasing(self):
        # Values always 1 sigma above target: z_i = 1, S_i = i+1
        target = 0.0
        sigma = 1.0
        values = np.ones(5)
        config = CUSUMVMaskConfig(target=target, sigma=sigma)
        result = compute_cusum_vmask(values, config)
        expected = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
        np.testing.assert_array_almost_equal(result.cumulative_sums, expected)

    def test_cumsum_formula(self):
        # S_i = sum_{j=0}^{i} (x_j - target) / sigma
        values = np.array([1.0, 3.0, 2.0, 5.0, 4.0])
        target = 2.0
        sigma = 1.0
        config = CUSUMVMaskConfig(target=target, sigma=sigma)
        result = compute_cusum_vmask(values, config)
        standardized = (values - target) / sigma
        expected = np.cumsum(standardized)
        np.testing.assert_array_almost_equal(result.cumulative_sums, expected)

    def test_result_type(self):
        values = np.array([1.0, 2.0, 3.0])
        result = compute_cusum_vmask(values)
        assert isinstance(result, CUSUMVMaskResult)

    def test_cumsum_length_matches_input(self):
        values = np.arange(20, dtype=float)
        result = compute_cusum_vmask(values)
        assert len(result.cumulative_sums) == 20


class TestCUSUMVMaskLeadDistance:
    """Lead distance d = h / (2*k)."""

    def test_lead_distance_default(self):
        # h=5, k=0.5 => d = 5/(2*0.5) = 5
        config = CUSUMVMaskConfig(h=5.0, k=0.5)
        result = compute_cusum_vmask(np.zeros(5), config)
        assert result.lead_distance == pytest.approx(5.0)

    def test_lead_distance_custom(self):
        config = CUSUMVMaskConfig(h=4.0, k=1.0)
        result = compute_cusum_vmask(np.zeros(5), config)
        assert result.lead_distance == pytest.approx(2.0)

    def test_lead_distance_formula(self):
        h = 7.0
        k = 2.0
        config = CUSUMVMaskConfig(h=h, k=k)
        result = compute_cusum_vmask(np.zeros(5), config)
        assert result.lead_distance == pytest.approx(h / (2 * k))


class TestCUSUMVMaskHalfAngle:
    """half_angle = atan(k / d_units) = atan(k) when d_units=1."""

    def test_half_angle_default(self):
        # k=0.5, d_units=1 => theta = atan(0.5)
        config = CUSUMVMaskConfig(k=0.5, d_units=1.0)
        result = compute_cusum_vmask(np.zeros(5), config)
        assert result.half_angle == pytest.approx(math.atan(0.5))

    def test_half_angle_k1(self):
        config = CUSUMVMaskConfig(k=1.0, d_units=1.0)
        result = compute_cusum_vmask(np.zeros(5), config)
        assert result.half_angle == pytest.approx(math.atan(1.0))

    def test_half_angle_with_d_units(self):
        # k=1.0, d_units=2.0 => theta = atan(1.0/2.0)
        config = CUSUMVMaskConfig(k=1.0, d_units=2.0)
        result = compute_cusum_vmask(np.zeros(5), config)
        assert result.half_angle == pytest.approx(math.atan(0.5))


class TestCUSUMVMaskViolationsMatchTabular:
    """V-Mask violations should match tabular CUSUM violations."""

    def test_incontrol_no_violations(self):
        rng = np.random.default_rng(0)
        values = rng.normal(0, 1, size=50)
        config = CUSUMVMaskConfig(target=0.0, sigma=1.0, h=5.0, k=0.5)
        result = compute_cusum_vmask(values, config)
        # Cross-check with tabular CUSUM
        tab_config = CUSUMConfig(target=0.0, sigma=1.0, h=5.0, k=0.5)
        tab_result = compute_cusum(values, tab_config)
        expected_violations = tab_result.violations_upper | tab_result.violations_lower
        np.testing.assert_array_equal(result.violations, expected_violations)

    def test_shift_detected(self):
        # Step shift upward after point 15
        rng = np.random.default_rng(42)
        in_control = rng.normal(0, 1, size=15)
        shifted = rng.normal(3, 1, size=15)
        values = np.concatenate([in_control, shifted])
        config = CUSUMVMaskConfig(target=0.0, sigma=1.0, h=5.0, k=0.5)
        result = compute_cusum_vmask(values, config)
        assert np.any(result.violations)

    def test_violations_match_tabular_on_shift(self):
        # Compare v-mask and tabular on same data
        rng = np.random.default_rng(7)
        values = np.concatenate([rng.normal(0, 1, 20), rng.normal(2, 1, 20)])
        config = CUSUMVMaskConfig(target=0.0, sigma=1.0, h=5.0, k=0.5)
        result = compute_cusum_vmask(values, config)
        tab_config = CUSUMConfig(target=0.0, sigma=1.0, h=5.0, k=0.5)
        tab_result = compute_cusum(values, tab_config)
        expected_violations = tab_result.violations_upper | tab_result.violations_lower
        np.testing.assert_array_equal(result.violations, expected_violations)

    def test_violation_indices_within_bounds(self):
        rng = np.random.default_rng(3)
        values = np.concatenate([rng.normal(0, 1, 10), rng.normal(4, 1, 20)])
        config = CUSUMVMaskConfig(target=0.0, sigma=1.0, h=5.0, k=0.5)
        result = compute_cusum_vmask(values, config)
        n = len(values)
        assert np.all(result.violation_indices >= 0)
        assert np.all(result.violation_indices < n)


class TestCUSUMVMaskMaskGeometry:
    """V-Mask vertex and arm geometry."""

    def test_upper_arm_slope(self):
        config = CUSUMVMaskConfig(target=0.0, sigma=1.0, k=0.5)
        result = compute_cusum_vmask(np.zeros(5), config)
        np.testing.assert_array_almost_equal(result.upper_arm, np.full(5, 0.5))

    def test_lower_arm_slope(self):
        config = CUSUMVMaskConfig(target=0.0, sigma=1.0, k=0.7)
        result = compute_cusum_vmask(np.zeros(5), config)
        np.testing.assert_array_almost_equal(result.lower_arm, np.full(5, -0.7))

    def test_mask_vertex_y_equals_cumsum(self):
        values = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
        config = CUSUMVMaskConfig(target=0.0, sigma=1.0)
        result = compute_cusum_vmask(values, config)
        np.testing.assert_array_almost_equal(
            result.mask_vertex_y, result.cumulative_sums
        )

    def test_mask_vertex_x_position(self):
        # vertex x-coordinate at point i = i + d
        config = CUSUMVMaskConfig(target=0.0, sigma=1.0, h=5.0, k=0.5, d_units=1.0)
        values = np.zeros(5)
        result = compute_cusum_vmask(values, config)
        d = result.lead_distance
        expected_x = np.arange(5) + d
        np.testing.assert_array_almost_equal(result.mask_vertex_x, expected_x)


class TestCUSUMVMaskValidation:
    """Input validation tests."""

    def test_sigma_must_be_positive(self):
        with pytest.raises((ValueError, TypeError)):
            CUSUMVMaskConfig(sigma=-1.0)

    def test_h_must_be_positive(self):
        with pytest.raises((ValueError, TypeError)):
            CUSUMVMaskConfig(h=0.0)

    def test_k_must_be_positive(self):
        with pytest.raises((ValueError, TypeError)):
            CUSUMVMaskConfig(k=-0.5)

    def test_d_units_must_be_positive(self):
        with pytest.raises((ValueError, TypeError)):
            CUSUMVMaskConfig(d_units=0.0)

    def test_1d_input_required(self):
        with pytest.raises(ValueError):
            compute_cusum_vmask(np.zeros((3, 3)))
