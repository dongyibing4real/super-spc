"""
Tests for algo/common/attribute.py.

Tests known answers, variable sizes, and clamping behavior.
"""
import numpy as np
import pytest

from algo.common.attribute import (
    compute_binomial_limits,
    compute_p_bar,
    compute_poisson_limits,
    compute_u_bar,
)


# ---------------------------------------------------------------------------
# compute_p_bar
# ---------------------------------------------------------------------------

class TestComputePBar:
    def test_equal_subgroups(self):
        """sum(Xi)/sum(ni) for equal n."""
        defectives = np.array([5.0, 10.0, 15.0])
        n_trials = np.array([100.0, 100.0, 100.0])
        result = compute_p_bar(defectives, n_trials)
        assert result == pytest.approx(30.0 / 300.0)

    def test_unequal_subgroups(self):
        defectives = np.array([10.0, 20.0])
        n_trials = np.array([100.0, 200.0])
        # (10+20)/(100+200) = 30/300 = 0.1
        result = compute_p_bar(defectives, n_trials)
        assert result == pytest.approx(0.1)

    def test_all_defective(self):
        defectives = np.array([50.0, 50.0])
        n_trials = np.array([50.0, 50.0])
        assert compute_p_bar(defectives, n_trials) == pytest.approx(1.0)

    def test_no_defectives(self):
        defectives = np.zeros(5)
        n_trials = np.full(5, 100.0)
        assert compute_p_bar(defectives, n_trials) == pytest.approx(0.0)

    def test_single_subgroup(self):
        assert compute_p_bar(np.array([3.0]), np.array([10.0])) == pytest.approx(0.3)


# ---------------------------------------------------------------------------
# compute_u_bar
# ---------------------------------------------------------------------------

class TestComputeUBar:
    def test_equal_subgroups(self):
        defects = np.array([4.0, 8.0, 12.0])
        n_units = np.array([2.0, 2.0, 2.0])
        # (4+8+12)/(2+2+2) = 24/6 = 4.0
        result = compute_u_bar(defects, n_units)
        assert result == pytest.approx(4.0)

    def test_unequal_subgroups(self):
        defects = np.array([10.0, 5.0])
        n_units = np.array([5.0, 1.0])
        # (10+5)/(5+1) = 15/6 = 2.5
        result = compute_u_bar(defects, n_units)
        assert result == pytest.approx(2.5)

    def test_zero_defects(self):
        defects = np.zeros(4)
        n_units = np.full(4, 10.0)
        assert compute_u_bar(defects, n_units) == pytest.approx(0.0)


# ---------------------------------------------------------------------------
# compute_binomial_limits
# ---------------------------------------------------------------------------

class TestComputeBinomialLimits:
    def test_known_answer(self):
        """p_bar=0.1, n=100, k=3: UCL = 0.1 + 3*sqrt(0.09/100) = 0.19."""
        p_bar = 0.1
        n_trials = np.array([100.0])
        limits = compute_binomial_limits(p_bar, n_trials, k_sigma=3.0)
        sigma = np.sqrt(0.1 * 0.9 / 100)
        assert limits.ucl[0] == pytest.approx(0.1 + 3 * sigma, rel=1e-4)
        assert limits.cl[0] == pytest.approx(0.1)
        assert limits.lcl[0] == pytest.approx(max(0.0, 0.1 - 3 * sigma), rel=1e-4)
        assert limits.k_sigma == 3.0

    def test_ucl_clamped_to_1(self):
        """Very high p_bar or small n might push UCL > 1."""
        p_bar = 0.95
        n_trials = np.array([10.0])
        limits = compute_binomial_limits(p_bar, n_trials, k_sigma=3.0)
        assert np.all(limits.ucl <= 1.0)

    def test_lcl_clamped_to_0(self):
        """Very low p_bar should clamp LCL to 0."""
        p_bar = 0.01
        n_trials = np.array([50.0])
        limits = compute_binomial_limits(p_bar, n_trials, k_sigma=3.0)
        assert np.all(limits.lcl >= 0.0)

    def test_variable_n(self):
        """UCL/LCL vary per subgroup when n varies."""
        p_bar = 0.1
        n_trials = np.array([50.0, 100.0, 200.0])
        limits = compute_binomial_limits(p_bar, n_trials, k_sigma=3.0)
        # Larger n -> tighter limits
        assert limits.ucl[0] > limits.ucl[1] > limits.ucl[2]

    def test_cl_is_constant(self):
        """Center line is always p_bar regardless of subgroup size."""
        p_bar = 0.2
        n_trials = np.array([10.0, 50.0, 200.0])
        limits = compute_binomial_limits(p_bar, n_trials, k_sigma=3.0)
        np.testing.assert_array_equal(limits.cl, np.full(3, p_bar))

    def test_arrays_same_length(self):
        n_trials = np.array([100.0, 200.0, 150.0])
        limits = compute_binomial_limits(0.1, n_trials, k_sigma=3.0)
        assert limits.ucl.shape == limits.cl.shape == limits.lcl.shape == (3,)


# ---------------------------------------------------------------------------
# compute_poisson_limits
# ---------------------------------------------------------------------------

class TestComputePoissonLimits:
    def test_known_answer(self):
        """u_bar=4, n=1, k=3: UCL = 4 + 3*sqrt(4/1) = 10."""
        u_bar = 4.0
        n_units = np.array([1.0])
        limits = compute_poisson_limits(u_bar, n_units, k_sigma=3.0)
        assert limits.ucl[0] == pytest.approx(10.0)
        assert limits.cl[0] == pytest.approx(4.0)
        assert limits.lcl[0] == pytest.approx(0.0)  # 4 - 6 = -2 -> clamped to 0

    def test_lcl_clamped_to_0(self):
        u_bar = 1.0
        n_units = np.array([1.0])
        limits = compute_poisson_limits(u_bar, n_units, k_sigma=3.0)
        assert limits.lcl[0] == pytest.approx(0.0)

    def test_variable_n(self):
        u_bar = 9.0
        n_units = np.array([1.0, 2.0, 4.0])
        limits = compute_poisson_limits(u_bar, n_units, k_sigma=3.0)
        assert limits.ucl.shape == (3,)
        # Larger n -> tighter limits
        assert limits.ucl[0] > limits.ucl[1] > limits.ucl[2]

    def test_cl_is_constant(self):
        u_bar = 5.0
        n_units = np.array([1.0, 2.0, 3.0])
        limits = compute_poisson_limits(u_bar, n_units, k_sigma=3.0)
        np.testing.assert_array_equal(limits.cl, np.full(3, u_bar))

    def test_u_bar_zero(self):
        """All limits = 0 when u_bar = 0."""
        limits = compute_poisson_limits(0.0, np.array([10.0, 20.0]), k_sigma=3.0)
        np.testing.assert_array_equal(limits.ucl, np.zeros(2))
        np.testing.assert_array_equal(limits.lcl, np.zeros(2))
