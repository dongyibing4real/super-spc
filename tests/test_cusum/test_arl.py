"""
Tests for algo/cusum/arl.py (CUSUM Average Run Length via Gauss-Legendre quadrature).
"""
import numpy as np
import pytest

from algo.cusum.arl import compute_arl, compute_arl_table


# ---------------------------------------------------------------------------
# compute_arl: basic sanity checks
# ---------------------------------------------------------------------------

class TestComputeARL:
    def test_in_control_arl_in_expected_range(self):
        """ARL(h=5, k=0.5, shift=0) should be in [400, 550] per literature."""
        arl = compute_arl(h=5.0, k=0.5, shift=0.0)
        assert 400 <= arl <= 550, f"In-control ARL={arl:.1f} out of [400, 550]"

    def test_arl_decreases_with_shift(self):
        """Larger shifts should produce shorter ARLs."""
        arl_0 = compute_arl(h=5.0, k=0.5, shift=0.0)
        arl_1 = compute_arl(h=5.0, k=0.5, shift=1.0)
        arl_2 = compute_arl(h=5.0, k=0.5, shift=2.0)
        assert arl_0 > arl_1 > arl_2

    def test_head_start_reduces_arl(self):
        """A FIR head-start should reduce ARL compared to no head-start."""
        arl_no_hs = compute_arl(h=5.0, k=0.5, shift=1.0, head_start=0.0)
        arl_hs = compute_arl(h=5.0, k=0.5, shift=1.0, head_start=2.5)
        assert arl_hs < arl_no_hs

    def test_returns_positive_float(self):
        arl = compute_arl(h=4.0, k=0.5, shift=0.5)
        assert isinstance(arl, float)
        assert arl > 0

    def test_large_shift_gives_small_arl(self):
        """A 3-sigma shift should be detected very quickly."""
        arl = compute_arl(h=5.0, k=0.5, shift=3.0)
        assert arl < 10.0


# ---------------------------------------------------------------------------
# compute_arl_table
# ---------------------------------------------------------------------------

class TestComputeARLTable:
    def test_default_table_shape(self):
        """Default shifts 0..3 step 0.25 gives 13 rows."""
        table = compute_arl_table(h=5.0, k=0.5)
        assert table.shape == (13, 2), f"Expected (13, 2), got {table.shape}"

    def test_table_first_column_is_shifts(self):
        """First column should be the shift values."""
        table = compute_arl_table(h=5.0, k=0.5)
        expected_shifts = np.arange(0, 3.01, 0.25)
        np.testing.assert_allclose(table[:, 0], expected_shifts, atol=1e-10)

    def test_table_arl_values_decrease(self):
        """ARL column should be monotonically decreasing with shift."""
        table = compute_arl_table(h=5.0, k=0.5)
        arls = table[:, 1]
        assert np.all(np.diff(arls) < 0), "ARL should decrease as shift increases"

    def test_custom_shifts(self):
        shifts = np.array([0.0, 0.5, 1.0, 2.0])
        table = compute_arl_table(h=5.0, k=0.5, shifts=shifts)
        assert table.shape == (4, 2)
        np.testing.assert_allclose(table[:, 0], shifts)

    def test_table_in_control_row_matches_compute_arl(self):
        """The shift=0 row should match compute_arl directly."""
        table = compute_arl_table(h=5.0, k=0.5)
        direct = compute_arl(h=5.0, k=0.5, shift=0.0)
        assert np.isclose(table[0, 1], direct, rtol=1e-6)

    def test_head_start_reduces_all_arls(self):
        """All ARL values with head_start > 0 should be <= those without."""
        table_no_hs = compute_arl_table(h=5.0, k=0.5, head_start=0.0)
        table_hs = compute_arl_table(h=5.0, k=0.5, head_start=2.5)
        assert np.all(table_hs[:, 1] <= table_no_hs[:, 1])
