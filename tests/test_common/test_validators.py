"""
Tests for algo/common/validators.py.

Tests pass/fail/nan/inf cases for each validator.
"""
import numpy as np
import pytest

from algo.common.validators import (
    validate_1d_array,
    validate_non_empty,
    validate_non_negative,
    validate_positive,
    validate_range,
)


# ---------------------------------------------------------------------------
# validate_positive
# ---------------------------------------------------------------------------

class TestValidatePositive:
    def test_passes_for_positive(self):
        validate_positive(1.0, "x")
        validate_positive(0.001, "x")
        validate_positive(1e10, "x")

    def test_raises_for_zero(self):
        with pytest.raises(ValueError, match="x"):
            validate_positive(0.0, "x")

    def test_raises_for_negative(self):
        with pytest.raises(ValueError, match="x"):
            validate_positive(-1.0, "x")

    def test_raises_for_nan(self):
        with pytest.raises(ValueError, match="x"):
            validate_positive(float("nan"), "x")

    def test_raises_for_inf(self):
        with pytest.raises(ValueError, match="x"):
            validate_positive(float("inf"), "x")

    def test_raises_for_negative_inf(self):
        with pytest.raises(ValueError, match="x"):
            validate_positive(float("-inf"), "x")


# ---------------------------------------------------------------------------
# validate_non_negative
# ---------------------------------------------------------------------------

class TestValidateNonNegative:
    def test_passes_for_positive(self):
        validate_non_negative(1.0, "x")

    def test_passes_for_zero(self):
        validate_non_negative(0.0, "x")

    def test_raises_for_negative(self):
        with pytest.raises(ValueError, match="x"):
            validate_non_negative(-0.001, "x")

    def test_raises_for_nan(self):
        with pytest.raises(ValueError, match="x"):
            validate_non_negative(float("nan"), "x")

    def test_raises_for_negative_inf(self):
        with pytest.raises(ValueError, match="x"):
            validate_non_negative(float("-inf"), "x")

    def test_passes_for_positive_inf(self):
        # +inf is technically >= 0 — acceptable
        validate_non_negative(float("inf"), "x")


# ---------------------------------------------------------------------------
# validate_range
# ---------------------------------------------------------------------------

class TestValidateRange:
    def test_passes_within_range(self):
        validate_range(0.5, 0.0, 1.0, "p")

    def test_passes_at_lower_bound(self):
        validate_range(0.0, 0.0, 1.0, "p")

    def test_passes_at_upper_bound(self):
        validate_range(1.0, 0.0, 1.0, "p")

    def test_raises_below_lower(self):
        with pytest.raises(ValueError, match="p"):
            validate_range(-0.1, 0.0, 1.0, "p")

    def test_raises_above_upper(self):
        with pytest.raises(ValueError, match="p"):
            validate_range(1.1, 0.0, 1.0, "p")

    def test_raises_for_nan(self):
        with pytest.raises(ValueError, match="p"):
            validate_range(float("nan"), 0.0, 1.0, "p")

    def test_raises_for_inf(self):
        with pytest.raises(ValueError, match="p"):
            validate_range(float("inf"), 0.0, 1.0, "p")

    def test_symmetric_range(self):
        validate_range(-3.0, -3.0, 3.0, "z")
        validate_range(3.0, -3.0, 3.0, "z")


# ---------------------------------------------------------------------------
# validate_1d_array
# ---------------------------------------------------------------------------

class TestValidate1dArray:
    def test_passes_for_1d(self):
        validate_1d_array(np.array([1.0, 2.0, 3.0]), "arr")

    def test_raises_for_2d(self):
        with pytest.raises(ValueError, match="arr"):
            validate_1d_array(np.array([[1.0, 2.0], [3.0, 4.0]]), "arr")

    def test_raises_for_0d(self):
        with pytest.raises(ValueError, match="arr"):
            validate_1d_array(np.array(5.0), "arr")

    def test_passes_for_single_element(self):
        validate_1d_array(np.array([42.0]), "arr")

    def test_passes_for_empty_array(self):
        # Emptiness is separate from dimensionality
        validate_1d_array(np.array([], dtype=float), "arr")


# ---------------------------------------------------------------------------
# validate_non_empty
# ---------------------------------------------------------------------------

class TestValidateNonEmpty:
    def test_passes_for_non_empty(self):
        validate_non_empty(np.array([1.0]), "arr")

    def test_raises_for_empty(self):
        with pytest.raises(ValueError, match="arr"):
            validate_non_empty(np.array([]), "arr")

    def test_raises_for_empty_2d(self):
        with pytest.raises(ValueError, match="arr"):
            validate_non_empty(np.array([[]]), "arr")

    def test_passes_for_multi_element(self):
        validate_non_empty(np.array([1.0, 2.0, 3.0]), "arr")
