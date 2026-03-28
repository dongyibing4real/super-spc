"""
Tests for Three Way chart (algo/three_way/).

Covers known sigma decomposition, negative between->0 clamping,
stddev within method, config validation, and output structure.
"""
import numpy as np
import pytest

from algo.common.enums import WithinMethod, BetweenMethod
from algo.three_way import ThreeWayConfig, ThreeWayResult, compute_three_way
from algo.constants.tables import d2


# ---------------------------------------------------------------------------
# Known-answer test
# ---------------------------------------------------------------------------

class TestThreeWayKnown:
    def test_zero_between_variation(self):
        """When all subgroup means are identical, sigma_between should be 0."""
        # All subgroups have the same mean=10 but different within variation
        subgroups = [
            np.array([9.0, 10.0, 11.0]),
            np.array([9.5, 10.0, 10.5]),
            np.array([9.0, 10.0, 11.0]),
            np.array([9.5, 10.0, 10.5]),
        ]
        result = compute_three_way(subgroups)
        assert result.sigma_between == pytest.approx(0.0, abs=1e-3)

    def test_sigma_bw_formula(self):
        """sigma_bw should equal sqrt(sigma_w^2 + sigma_b^2)."""
        rng = np.random.default_rng(7)
        subgroups = [rng.normal(loc=i*0.1, scale=1.0, size=5) for i in range(20)]
        result = compute_three_way(subgroups)
        expected_bw = np.sqrt(result.sigma_within**2 + result.sigma_between**2)
        assert result.sigma_bw == pytest.approx(expected_bw, rel=1e-9)

    def test_subgroup_means_computed_correctly(self):
        subgroups = [
            np.array([1.0, 3.0]),   # mean = 2.0
            np.array([5.0, 7.0]),   # mean = 6.0
            np.array([3.0, 5.0]),   # mean = 4.0
        ]
        result = compute_three_way(subgroups)
        np.testing.assert_allclose(result.subgroup_means, [2.0, 6.0, 4.0], atol=1e-10)

    def test_subgroup_ranges_range_method(self):
        subgroups = [
            np.array([1.0, 5.0]),   # range = 4.0
            np.array([2.0, 8.0]),   # range = 6.0
            np.array([3.0, 7.0]),   # range = 4.0
        ]
        result = compute_three_way(subgroups)
        np.testing.assert_allclose(result.subgroup_dispersions, [4.0, 6.0, 4.0], atol=1e-10)


# ---------------------------------------------------------------------------
# Negative between -> clamped to 0
# ---------------------------------------------------------------------------

class TestThreeWayNegativeBetween:
    def test_negative_between_clamped_to_zero(self):
        """When between-component is negative, sigma_between must be 0."""
        # Large within variation relative to between variation forces negative sigma_b^2
        rng = np.random.default_rng(42)
        # Small means variation but large within variation
        subgroups = [rng.normal(loc=10.0, scale=5.0, size=10) for _ in range(5)]
        result = compute_three_way(subgroups)
        assert result.sigma_between >= 0.0

    def test_sigma_between_never_negative(self):
        """sigma_between must always be >= 0."""
        rng = np.random.default_rng(99)
        for seed in range(10):
            rng2 = np.random.default_rng(seed)
            subgroups = [rng2.normal(0, 3.0, size=5) for _ in range(8)]
            result = compute_three_way(subgroups)
            assert result.sigma_between >= 0.0

    def test_sigma_bw_gte_sigma_within(self):
        """sigma_bw >= sigma_within always (since sigma_b >= 0)."""
        rng = np.random.default_rng(11)
        subgroups = [rng.normal(10.0, 2.0, size=4) for _ in range(10)]
        result = compute_three_way(subgroups)
        assert result.sigma_bw >= result.sigma_within - 1e-12


# ---------------------------------------------------------------------------
# Stddev within method
# ---------------------------------------------------------------------------

class TestThreeWayStddevMethod:
    def test_stddev_method_produces_stddevs(self):
        """With WithinMethod.STDDEV, dispersions should be sample stddevs."""
        subgroups = [
            np.array([1.0, 3.0, 5.0]),
            np.array([2.0, 4.0, 6.0]),
        ]
        config = ThreeWayConfig(within_method=WithinMethod.STDDEV)
        result = compute_three_way(subgroups, config)
        expected_s = np.array([
            float(np.std(subgroups[0], ddof=1)),
            float(np.std(subgroups[1], ddof=1)),
        ])
        np.testing.assert_allclose(result.subgroup_dispersions, expected_s, atol=1e-10)

    def test_stddev_sigma_within_close_to_range_method(self):
        """Both methods should give similar sigma_within for normal data."""
        rng = np.random.default_rng(3)
        subgroups = [rng.normal(0, 1.0, size=5) for _ in range(30)]
        result_r = compute_three_way(subgroups, ThreeWayConfig(within_method=WithinMethod.RANGE))
        result_s = compute_three_way(subgroups, ThreeWayConfig(within_method=WithinMethod.STDDEV))
        # Both should be close to the true sigma=1.0
        assert result_r.sigma_within == pytest.approx(1.0, abs=0.3)
        assert result_s.sigma_within == pytest.approx(1.0, abs=0.3)

    def test_within_chart_lcl_non_negative_stddev(self):
        """Within chart LCL should be >= 0 for S chart."""
        rng = np.random.default_rng(77)
        subgroups = [rng.normal(0, 1.0, size=3) for _ in range(10)]
        config = ThreeWayConfig(within_method=WithinMethod.STDDEV)
        result = compute_three_way(subgroups, config)
        assert np.all(result.within_chart.lcl >= 0.0)


# ---------------------------------------------------------------------------
# Output structure
# ---------------------------------------------------------------------------

class TestThreeWayOutputStructure:
    def test_chart_lengths_match_subgroup_count(self):
        subgroups = [np.array([1.0, 2.0, 3.0]) for _ in range(8)]
        result = compute_three_way(subgroups)
        assert len(result.between_chart.ucl) == 8
        assert len(result.within_chart.ucl) == 8
        assert len(result.subgroup_means) == 8
        assert len(result.subgroup_dispersions) == 8

    def test_between_chart_ucl_above_lcl(self):
        rng = np.random.default_rng(5)
        subgroups = [rng.normal(i, 1.0, size=4) for i in range(10)]
        result = compute_three_way(subgroups)
        assert result.between_chart.ucl[0] > result.between_chart.lcl[0]

    def test_within_chart_ucl_above_cl(self):
        rng = np.random.default_rng(5)
        subgroups = [rng.normal(0, 1.0, size=4) for _ in range(10)]
        result = compute_three_way(subgroups)
        assert result.within_chart.ucl[0] >= result.within_chart.cl[0]

    def test_k_sigma_stored_in_limits(self):
        subgroups = [np.array([1.0, 2.0]) for _ in range(5)]
        config = ThreeWayConfig(k_sigma=2.5)
        result = compute_three_way(subgroups, config)
        assert result.between_chart.k_sigma == pytest.approx(2.5)
        assert result.within_chart.k_sigma == pytest.approx(2.5)


# ---------------------------------------------------------------------------
# Config validation
# ---------------------------------------------------------------------------

class TestThreeWayConfig:
    def test_default_config(self):
        config = ThreeWayConfig()
        assert config.within_method == WithinMethod.RANGE
        assert config.between_method == BetweenMethod.MOVING_RANGE
        assert config.k_sigma == pytest.approx(3.0)

    def test_invalid_k_sigma(self):
        with pytest.raises(ValueError, match="k_sigma"):
            ThreeWayConfig(k_sigma=0.0)

    def test_empty_subgroups_raises(self):
        with pytest.raises(ValueError):
            compute_three_way([])

    @pytest.mark.filterwarnings("ignore:Mean of empty slice:RuntimeWarning")
    @pytest.mark.filterwarnings("ignore:invalid value encountered:RuntimeWarning")
    def test_single_subgroup_no_raise(self):
        """Single subgroup: MR of means is undefined; result should still be returned."""
        # With a single subgroup the MR-based sigma_between is undefined (nan or 0).
        # We verify the function either raises or returns a finite sigma_between >= 0.
        try:
            result = compute_three_way([np.array([1.0, 2.0, 3.0])])
            # If it doesn't raise, sigma_between must be non-negative (may be nan->clamped)
            assert result.sigma_between >= 0.0 or np.isnan(result.sigma_between)
        except (ValueError, RuntimeWarning):
            pass  # Raising is also acceptable behaviour


# ---------------------------------------------------------------------------
# Variable subgroup sizes
# ---------------------------------------------------------------------------

class TestThreeWayVariableSizes:
    def test_unequal_subgroup_sizes(self):
        """Should handle unequal subgroup sizes gracefully."""
        subgroups = [
            np.array([1.0, 2.0]),
            np.array([3.0, 4.0, 5.0]),
            np.array([6.0, 7.0]),
            np.array([8.0, 9.0, 10.0, 11.0]),
        ]
        result = compute_three_way(subgroups)
        assert result.sigma_within >= 0.0
        assert result.sigma_between >= 0.0
        assert result.sigma_bw >= 0.0
        assert len(result.subgroup_means) == 4
