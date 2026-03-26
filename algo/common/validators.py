"""
Input validation helpers for control chart computations.

All validators raise ValueError with a message containing the parameter name
so callers get informative errors.
"""
import math

import numpy as np


def validate_positive(value: float, name: str) -> None:
    """Raise ValueError if value is not finite and strictly positive."""
    if not math.isfinite(value) or value <= 0:
        raise ValueError(
            f"{name} must be a finite positive number, got {value!r}"
        )


def validate_non_negative(value: float, name: str) -> None:
    """Raise ValueError if value is NaN or strictly negative.

    +inf is accepted (e.g., unbounded upper tolerance).
    """
    if math.isnan(value) or value < 0:
        raise ValueError(
            f"{name} must be >= 0 and not NaN, got {value!r}"
        )


def validate_range(value: float, lo: float, hi: float, name: str) -> None:
    """Raise ValueError if value is not in the closed interval [lo, hi]."""
    if not math.isfinite(value) or value < lo or value > hi:
        raise ValueError(
            f"{name} must be in [{lo}, {hi}], got {value!r}"
        )


def validate_1d_array(arr: np.ndarray, name: str) -> None:
    """Raise ValueError if arr is not a 1-D numpy array."""
    if arr.ndim != 1:
        raise ValueError(
            f"{name} must be a 1-D array, got shape {arr.shape}"
        )


def validate_non_empty(arr: np.ndarray, name: str) -> None:
    """Raise ValueError if arr has zero elements."""
    if arr.size == 0:
        raise ValueError(f"{name} must not be empty")
