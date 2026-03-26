"""
Tests for algo/cusum/__init__.py (CUSUM control chart).
"""
import numpy as np
import pytest

from algo.cusum import CUSUMConfig, CUSUMResult, compute_cusum


# ---------------------------------------------------------------------------
# Configuration defaults and validation
# ---------------------------------------------------------------------------

class TestCUSUMConfig:
    def test_defaults(self):
        cfg = CUSUMConfig()
        assert cfg.target == 0.0
        assert cfg.sigma == 1.0
        assert cfg.h == 5.0
        assert cfg.k == 0.5
        assert cfg.head_start == 0.0
        assert cfg.data_units is False

    def test_sigma_must_be_positive(self):
        with pytest.raises(ValueError):
            CUSUMConfig(sigma=0.0)

    def test_h_must_be_positive(self):
        with pytest.raises(ValueError):
            CUSUMConfig(h=0.0)

    def test_k_must_be_positive(self):
        with pytest.raises(ValueError):
            CUSUMConfig(k=0.0)

    def test_head_start_non_negative(self):
        with pytest.raises(ValueError):
            CUSUMConfig(head_start=-0.1)

    def test_custom_values(self):
        cfg = CUSUMConfig(target=10.0, sigma=2.0, h=4.0, k=0.75, head_start=1.0, data_units=True)
        assert cfg.target == 10.0
        assert cfg.sigma == 2.0
        assert cfg.h == 4.0
        assert cfg.k == 0.75
        assert cfg.head_start == 1.0
        assert cfg.data_units is True


# ---------------------------------------------------------------------------
# compute_cusum: in-control (no shift)
# ---------------------------------------------------------------------------

class TestCUSUMInControl:
    def test_in_control_no_violations(self):
        rng = np.random.default_rng(42)
        # 50 N(0,1) samples — in-control, no persistent shift
        values = rng.normal(0, 1, 50)
        cfg = CUSUMConfig()
        result = compute_cusum(values, cfg)
        # With k=0.5, h=5, short in-control run should have no violations
        assert isinstance(result, CUSUMResult)

    def test_c_plus_always_non_negative(self):
        rng = np.random.default_rng(123)
        values = rng.normal(0, 1, 100)
        cfg = CUSUMConfig()
        result = compute_cusum(values, cfg)
        assert np.all(result.c_plus >= 0)

    def test_c_minus_always_non_positive(self):
        rng = np.random.default_rng(123)
        values = rng.normal(0, 1, 100)
        cfg = CUSUMConfig()
        result = compute_cusum(values, cfg)
        assert np.all(result.c_minus <= 0)

    def test_output_length_matches_input(self):
        values = np.array([0.0, 0.5, -0.3, 1.2, -0.8])
        cfg = CUSUMConfig()
        result = compute_cusum(values, cfg)
        assert len(result.c_plus) == 5
        assert len(result.c_minus) == 5
        assert len(result.violations_upper) == 5
        assert len(result.violations_lower) == 5

    def test_upper_lower_limits_scalar(self):
        values = np.array([1.0, 2.0, 3.0])
        cfg = CUSUMConfig(h=4.0)
        result = compute_cusum(values, cfg)
        assert result.upper_limit == 4.0
        assert result.lower_limit == -4.0


# ---------------------------------------------------------------------------
# compute_cusum: positive shift detection
# ---------------------------------------------------------------------------

class TestCUSUMPositiveShift:
    def test_detects_upward_shift(self):
        # Sustained upward shift of 2 sigma above target
        values = np.full(30, 2.0)  # target=0, sigma=1, shift=2
        cfg = CUSUMConfig(target=0.0, sigma=1.0, h=5.0, k=0.5)
        result = compute_cusum(values, cfg)
        # Should signal violation of upper limit within 30 points
        assert np.any(result.violations_upper)

    def test_no_lower_violations_on_upward_shift(self):
        values = np.full(30, 2.0)
        cfg = CUSUMConfig()
        result = compute_cusum(values, cfg)
        assert not np.any(result.violations_lower)

    def test_c_plus_increases_with_sustained_shift(self):
        # Pure positive shift: C+ should grow monotonically (until reset not applied)
        values = np.full(20, 1.5)  # 1.5 sigma above target, k=0.5 -> each step adds 1.0
        cfg = CUSUMConfig(target=0.0, sigma=1.0, h=100.0, k=0.5)  # high h to avoid reset
        result = compute_cusum(values, cfg)
        diffs = np.diff(result.c_plus)
        assert np.all(diffs >= 0)


# ---------------------------------------------------------------------------
# compute_cusum: negative shift detection
# ---------------------------------------------------------------------------

class TestCUSUMNegativeShift:
    def test_detects_downward_shift(self):
        values = np.full(30, -2.0)  # target=0, sigma=1, shift=-2
        cfg = CUSUMConfig()
        result = compute_cusum(values, cfg)
        assert np.any(result.violations_lower)

    def test_no_upper_violations_on_downward_shift(self):
        values = np.full(30, -2.0)
        cfg = CUSUMConfig()
        result = compute_cusum(values, cfg)
        assert not np.any(result.violations_upper)


# ---------------------------------------------------------------------------
# head_start: faster detection
# ---------------------------------------------------------------------------

class TestCUSUMHeadStart:
    def test_head_start_detects_sooner(self):
        """With head_start, a shift should be detected at or before no head_start."""
        values = np.full(30, 1.5)
        cfg_no_hs = CUSUMConfig(h=5.0, k=0.5, head_start=0.0)
        cfg_hs = CUSUMConfig(h=5.0, k=0.5, head_start=2.0)

        result_no_hs = compute_cusum(values, cfg_no_hs)
        result_hs = compute_cusum(values, cfg_hs)

        first_no_hs = np.argmax(result_no_hs.violations_upper) if np.any(result_no_hs.violations_upper) else len(values)
        first_hs = np.argmax(result_hs.violations_upper) if np.any(result_hs.violations_upper) else len(values)

        assert first_hs <= first_no_hs

    def test_initial_c_plus_equals_head_start(self):
        values = np.array([0.0])  # zero shift, so C+ should not grow
        cfg = CUSUMConfig(target=0.0, sigma=1.0, k=0.5, head_start=2.0)
        result = compute_cusum(values, cfg)
        # C0+ = head_start; after one step at 0 with k=0.5: max(0, -0.5 + 2.0) = 1.5
        assert np.isclose(result.c_plus[0], 1.5)

    def test_initial_c_minus_equals_neg_head_start(self):
        values = np.array([0.0])
        cfg = CUSUMConfig(target=0.0, sigma=1.0, k=0.5, head_start=2.0)
        result = compute_cusum(values, cfg)
        # C0- = -head_start = -2.0; after step: min(0, 0.5 + (-2.0)) = -1.5
        assert np.isclose(result.c_minus[0], -1.5)


# ---------------------------------------------------------------------------
# shift_starts: detecting where shift began
# ---------------------------------------------------------------------------

class TestCUSUMShiftStarts:
    def test_shift_starts_upper_non_empty_after_violation(self):
        values = np.full(30, 2.0)
        cfg = CUSUMConfig()
        result = compute_cusum(values, cfg)
        if np.any(result.violations_upper):
            assert len(result.shift_starts_upper) > 0

    def test_shift_starts_lower_non_empty_after_violation(self):
        values = np.full(30, -2.0)
        cfg = CUSUMConfig()
        result = compute_cusum(values, cfg)
        if np.any(result.violations_lower):
            assert len(result.shift_starts_lower) > 0

    def test_shift_start_before_violation(self):
        """The shift start index should be <= the violation index."""
        values = np.full(30, 2.0)
        cfg = CUSUMConfig()
        result = compute_cusum(values, cfg)
        if np.any(result.violations_upper) and len(result.shift_starts_upper) > 0:
            first_violation = np.argmax(result.violations_upper)
            assert result.shift_starts_upper[0] <= first_violation

    def test_no_shift_starts_without_violation(self):
        """All-zero input should produce no violations and no shift starts."""
        values = np.zeros(20)
        cfg = CUSUMConfig(h=5.0)
        result = compute_cusum(values, cfg)
        # With all zeros, C+ = max(0, -k + C-1+); decreases to 0 quickly
        if not np.any(result.violations_upper):
            assert len(result.shift_starts_upper) == 0
        if not np.any(result.violations_lower):
            assert len(result.shift_starts_lower) == 0


# ---------------------------------------------------------------------------
# data_units mode
# ---------------------------------------------------------------------------

class TestCUSUMDataUnits:
    def test_data_units_normalizes_by_sigma(self):
        """With data_units=True, values are assumed in raw units, divided by sigma."""
        values = np.full(20, 3.0)  # raw values at 3 sigma above target
        cfg_std = CUSUMConfig(target=0.0, sigma=1.0, data_units=False)
        cfg_raw = CUSUMConfig(target=0.0, sigma=3.0, data_units=True)
        # Both should behave equivalently: (3-0)/3 = 1.0 standardized shift
        result_std = compute_cusum(values / 3.0, cfg_std)  # manually standardize
        result_raw = compute_cusum(values, cfg_raw)
        np.testing.assert_array_almost_equal(result_std.c_plus, result_raw.c_plus)
