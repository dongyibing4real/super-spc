"""
Shared pytest fixtures and helpers for the algo test suite.
"""
import numpy as np
import pytest

from algo.common.types import ControlLimits


@pytest.fixture
def rng() -> np.random.Generator:
    """Seeded random number generator for reproducible tests."""
    return np.random.default_rng(seed=42)


def assert_limits_valid(limits: ControlLimits) -> None:
    """Assert that a ControlLimits object is internally consistent.

    Checks:
    - UCL >= CL >= LCL element-wise
    - No NaN or Inf in any array
    - All arrays have the same shape
    """
    assert limits.ucl.shape == limits.cl.shape == limits.lcl.shape, (
        "UCL, CL, and LCL must have the same shape"
    )
    assert not np.any(np.isnan(limits.ucl)), "UCL contains NaN"
    assert not np.any(np.isnan(limits.cl)), "CL contains NaN"
    assert not np.any(np.isnan(limits.lcl)), "LCL contains NaN"
    assert not np.any(np.isinf(limits.ucl)), "UCL contains Inf"
    assert not np.any(np.isinf(limits.cl)), "CL contains Inf"
    assert not np.any(np.isinf(limits.lcl)), "LCL contains Inf"
    assert np.all(limits.ucl >= limits.cl), "UCL must be >= CL"
    assert np.all(limits.cl >= limits.lcl), "CL must be >= LCL"
