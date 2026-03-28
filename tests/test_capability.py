"""
Tests for algo/capability — Cp, Cpk, Pp, Ppk computation.
"""
import numpy as np
import pytest

from algo.capability import CapabilityResult, compute_capability


class TestCapabilityKnownAnswer:
    """Verify indices against hand-computed values.

    Process: mean=50, sigma_within=2, sigma_overall=2.5
    Spec: USL=58, LSL=42  (range=16)

    Cp  = 16 / (6*2)   = 1.3333
    Cpu = (58-50)/(3*2) = 1.3333
    Cpl = (50-42)/(3*2) = 1.3333
    Cpk = min(1.3333, 1.3333) = 1.3333

    Pp  = 16 / (6*2.5)   = 1.0667
    Ppu = (58-50)/(3*2.5) = 1.0667
    Ppl = (50-42)/(3*2.5) = 1.0667
    Ppk = min(1.0667, 1.0667) = 1.0667
    """

    # Build values with known mean=50 and std~=2.5
    VALUES = np.array([47.5, 48.0, 49.0, 50.0, 51.0, 52.0, 52.5])
    SIGMA_WITHIN = 2.0
    USL = 58.0
    LSL = 42.0

    def test_cp(self):
        result = compute_capability(self.VALUES, self.SIGMA_WITHIN, self.USL, self.LSL)
        assert result is not None
        expected_cp = (self.USL - self.LSL) / (6 * self.SIGMA_WITHIN)
        assert result.cp == pytest.approx(expected_cp, rel=1e-3)

    def test_cpk(self):
        result = compute_capability(self.VALUES, self.SIGMA_WITHIN, self.USL, self.LSL)
        assert result is not None
        mean = float(np.mean(self.VALUES))
        cpu = (self.USL - mean) / (3 * self.SIGMA_WITHIN)
        cpl = (mean - self.LSL) / (3 * self.SIGMA_WITHIN)
        assert result.cpk == pytest.approx(min(cpu, cpl), rel=1e-3)

    def test_pp(self):
        result = compute_capability(self.VALUES, self.SIGMA_WITHIN, self.USL, self.LSL)
        assert result is not None
        sigma_overall = float(np.std(self.VALUES, ddof=1))
        expected_pp = (self.USL - self.LSL) / (6 * sigma_overall)
        assert result.pp == pytest.approx(expected_pp, rel=1e-3)

    def test_ppk(self):
        result = compute_capability(self.VALUES, self.SIGMA_WITHIN, self.USL, self.LSL)
        assert result is not None
        mean = float(np.mean(self.VALUES))
        sigma_overall = float(np.std(self.VALUES, ddof=1))
        ppu = (self.USL - mean) / (3 * sigma_overall)
        ppl = (mean - self.LSL) / (3 * sigma_overall)
        assert result.ppk == pytest.approx(min(ppu, ppl), rel=1e-3)


class TestCapabilityOffCenter:
    """Process shifted toward USL — Cpk < Cp."""

    VALUES = np.array([54.0, 55.0, 56.0, 55.5, 54.5])
    SIGMA_WITHIN = 1.0
    USL = 58.0
    LSL = 42.0

    def test_cpk_less_than_cp(self):
        result = compute_capability(self.VALUES, self.SIGMA_WITHIN, self.USL, self.LSL)
        assert result is not None
        assert result.cpk < result.cp

    def test_cpk_uses_closer_spec(self):
        result = compute_capability(self.VALUES, self.SIGMA_WITHIN, self.USL, self.LSL)
        assert result is not None
        mean = float(np.mean(self.VALUES))
        cpu = (self.USL - mean) / (3 * self.SIGMA_WITHIN)
        cpl = (mean - self.LSL) / (3 * self.SIGMA_WITHIN)
        # Mean is closer to USL, so CPU should be the smaller one
        assert cpu < cpl
        assert result.cpk == pytest.approx(cpu, rel=1e-3)


class TestCapabilityEdgeCases:
    """Edge cases that should return None."""

    def test_zero_sigma_returns_none(self):
        values = np.array([50.0, 50.0, 50.0])
        assert compute_capability(values, 0.0, 58.0, 42.0) is None

    def test_single_value_returns_none(self):
        values = np.array([50.0])
        assert compute_capability(values, 2.0, 58.0, 42.0) is None

    def test_usl_equals_lsl_returns_none(self):
        values = np.array([50.0, 51.0, 49.0])
        assert compute_capability(values, 2.0, 50.0, 50.0) is None

    def test_usl_less_than_lsl_returns_none(self):
        values = np.array([50.0, 51.0, 49.0])
        assert compute_capability(values, 2.0, 42.0, 58.0) is None

    def test_identical_values_returns_none(self):
        """All same values → overall std = 0 → None."""
        values = np.array([50.0, 50.0, 50.0, 50.0])
        assert compute_capability(values, 2.0, 58.0, 42.0) is None

    def test_empty_array_returns_none(self):
        values = np.array([])
        assert compute_capability(values, 2.0, 58.0, 42.0) is None


class TestCapabilityResultType:
    """Verify result is an attrs class with expected fields."""

    def test_result_fields(self):
        values = np.array([48.0, 49.0, 50.0, 51.0, 52.0])
        result = compute_capability(values, 2.0, 58.0, 42.0)
        assert result is not None
        assert isinstance(result, CapabilityResult)
        assert hasattr(result, "cp")
        assert hasattr(result, "cpk")
        assert hasattr(result, "pp")
        assert hasattr(result, "ppk")

    def test_result_values_are_rounded(self):
        values = np.array([48.0, 49.0, 50.0, 51.0, 52.0])
        result = compute_capability(values, 2.0, 58.0, 42.0)
        assert result is not None
        # All values should have at most 4 decimal places
        for field in [result.cp, result.cpk, result.pp, result.ppk]:
            assert round(field, 4) == field
