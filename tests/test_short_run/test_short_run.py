"""
Tests for Short Run chart (algo/short_run/).

Covers centered transformation, standardized CL=0, custom targets,
auto product_stats, dispersion chart, and config validation.
"""
import numpy as np
import pytest

from algo.common.enums import ScalingMethod
from algo.short_run import ShortRunConfig, ShortRunResult, compute_short_run


# ---------------------------------------------------------------------------
# Centered scaling
# ---------------------------------------------------------------------------

class TestShortRunCentered:
    def test_centered_removes_product_offset(self):
        """After centering, the mean of each product's transformed values is ~0."""
        values = np.array([10.0, 11.0, 10.5, 20.0, 21.0, 20.5])
        prods = np.array(["A", "A", "A", "B", "B", "B"])
        result = compute_short_run(values, prods, ShortRunConfig(scaling=ScalingMethod.CENTERED))
        # Product A mean = 10.5, Product B mean = 20.5
        # Transformed: A = [-0.5, 0.5, 0], B = [-0.5, 0.5, 0]
        np.testing.assert_allclose(
            result.transformed_values,
            np.array([-0.5, 0.5, 0.0, -0.5, 0.5, 0.0]),
            atol=1e-10,
        )

    def test_centered_cl_is_mean_of_transformed(self):
        values = np.array([10.0, 11.0, 20.0, 21.0])
        prods = np.array(["A", "A", "B", "B"])
        result = compute_short_run(values, prods, ShortRunConfig(scaling=ScalingMethod.CENTERED))
        expected_cl = float(np.mean(result.transformed_values))
        assert result.limits.cl[0] == pytest.approx(expected_cl, abs=1e-10)

    def test_centered_limits_symmetric_about_cl(self):
        values = np.array([5.0, 6.0, 7.0, 15.0, 16.0, 17.0])
        prods = np.array(["X", "X", "X", "Y", "Y", "Y"])
        result = compute_short_run(values, prods)
        cl = result.limits.cl[0]
        ucl = result.limits.ucl[0]
        lcl = result.limits.lcl[0]
        assert ucl - cl == pytest.approx(cl - lcl, rel=1e-6)

    def test_custom_targets_override_mean(self):
        """Custom product_targets should be used instead of computed mean."""
        values = np.array([10.0, 11.0, 12.0, 20.0, 21.0, 22.0])
        prods = np.array(["A", "A", "A", "B", "B", "B"])
        config = ShortRunConfig(
            scaling=ScalingMethod.CENTERED,
            product_targets={"A": 10.0, "B": 20.0},
        )
        result = compute_short_run(values, prods, config)
        # A is shifted by 10: [0, 1, 2]; B shifted by 20: [0, 1, 2]
        np.testing.assert_allclose(
            result.transformed_values,
            np.array([0.0, 1.0, 2.0, 0.0, 1.0, 2.0]),
            atol=1e-10,
        )

    def test_custom_targets_in_product_stats(self):
        values = np.array([10.0, 11.0, 20.0, 21.0])
        prods = np.array(["A", "A", "B", "B"])
        config = ShortRunConfig(product_targets={"A": 9.0, "B": 19.0})
        result = compute_short_run(values, prods, config)
        assert result.product_stats["A"][0] == pytest.approx(9.0)
        assert result.product_stats["B"][0] == pytest.approx(19.0)


# ---------------------------------------------------------------------------
# Standardized scaling
# ---------------------------------------------------------------------------

class TestShortRunStandardized:
    def test_standardized_cl_is_zero(self):
        """CL must be exactly 0 for standardized mode."""
        values = np.array([10.0, 11.0, 12.0, 30.0, 31.0, 32.0])
        prods = np.array(["A", "A", "A", "B", "B", "B"])
        config = ShortRunConfig(scaling=ScalingMethod.STANDARDIZED)
        result = compute_short_run(values, prods, config)
        assert result.limits.cl[0] == pytest.approx(0.0, abs=1e-12)

    def test_standardized_limits_symmetric(self):
        values = np.array([10.0, 12.0, 11.0, 30.0, 32.0, 31.0])
        prods = np.array(["A", "A", "A", "B", "B", "B"])
        config = ShortRunConfig(scaling=ScalingMethod.STANDARDIZED)
        result = compute_short_run(values, prods, config)
        ucl = result.limits.ucl[0]
        lcl = result.limits.lcl[0]
        assert ucl == pytest.approx(-lcl, rel=1e-9)

    def test_standardized_products_with_same_variation_give_same_z(self):
        """Two products with same sigma but different targets should both produce z~1."""
        values_a = np.array([10.0, 11.0, 10.0, 11.0])
        values_b = np.array([100.0, 101.0, 100.0, 101.0])
        values = np.concatenate([values_a, values_b])
        prods = np.array(["A"] * 4 + ["B"] * 4)
        config = ShortRunConfig(scaling=ScalingMethod.STANDARDIZED)
        result = compute_short_run(values, prods, config)
        # z scores for A and B should be the same (same pattern)
        z_a = result.transformed_values[:4]
        z_b = result.transformed_values[4:]
        np.testing.assert_allclose(z_a, z_b, atol=1e-10)

    def test_standardized_with_custom_sigma(self):
        values = np.array([10.0, 11.0, 12.0, 20.0, 22.0, 24.0])
        prods = np.array(["A", "A", "A", "B", "B", "B"])
        config = ShortRunConfig(
            scaling=ScalingMethod.STANDARDIZED,
            product_targets={"A": 11.0, "B": 22.0},
            product_sigmas={"A": 1.0, "B": 2.0},
        )
        result = compute_short_run(values, prods, config)
        # A: (10-11)/1=-1, (11-11)/1=0, (12-11)/1=1
        # B: (20-22)/2=-1, (22-22)/2=0, (24-22)/2=1
        np.testing.assert_allclose(
            result.transformed_values,
            np.array([-1.0, 0.0, 1.0, -1.0, 0.0, 1.0]),
            atol=1e-10,
        )


# ---------------------------------------------------------------------------
# product_stats auto-computed
# ---------------------------------------------------------------------------

class TestShortRunProductStats:
    def test_product_stats_keys_match_products(self):
        values = np.array([1.0, 2.0, 3.0, 10.0, 11.0])
        prods = np.array(["X", "X", "X", "Y", "Y"])
        result = compute_short_run(values, prods)
        assert "X" in result.product_stats
        assert "Y" in result.product_stats

    def test_product_stats_target_is_mean(self):
        values = np.array([4.0, 6.0, 5.0])
        prods = np.array(["A", "A", "A"])
        result = compute_short_run(values, prods)
        assert result.product_stats["A"][0] == pytest.approx(5.0, rel=1e-9)

    def test_product_stats_sigma_is_mr_based(self):
        from algo.common.sigma import sigma_from_moving_range
        values = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
        prods = np.array(["A", "A", "A", "A", "A"])
        result = compute_short_run(values, prods)
        expected_sigma = sigma_from_moving_range(values).sigma_hat
        assert result.product_stats["A"][1] == pytest.approx(expected_sigma, rel=1e-9)

    def test_product_stats_with_custom_sigmas(self):
        values = np.array([1.0, 2.0, 100.0, 101.0])
        prods = np.array(["A", "A", "B", "B"])
        config = ShortRunConfig(product_sigmas={"A": 5.0, "B": 10.0})
        result = compute_short_run(values, prods, config)
        assert result.product_stats["A"][1] == pytest.approx(5.0)
        assert result.product_stats["B"][1] == pytest.approx(10.0)


# ---------------------------------------------------------------------------
# Dispersion chart
# ---------------------------------------------------------------------------

class TestShortRunDispersion:
    def test_dispersion_values_are_moving_ranges(self):
        """dispersion_values should be |diff| of transformed values."""
        values = np.array([10.0, 11.0, 12.0, 20.0, 21.0, 22.0])
        prods = np.array(["A", "A", "A", "B", "B", "B"])
        result = compute_short_run(values, prods)
        expected_mr = np.abs(np.diff(result.transformed_values))
        np.testing.assert_allclose(result.dispersion_values, expected_mr, atol=1e-10)

    def test_dispersion_limits_length(self):
        values = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
        prods = np.array(["A"] * 5)
        result = compute_short_run(values, prods)
        # MR has n-1 values
        assert len(result.dispersion_values) == 4
        assert len(result.dispersion_limits.ucl) == 4

    def test_dispersion_ucl_above_cl(self):
        values = np.array([10.0, 11.0, 10.0, 11.0, 10.0])
        prods = np.array(["A"] * 5)
        result = compute_short_run(values, prods)
        assert result.dispersion_limits.ucl[0] >= result.dispersion_limits.cl[0]

    def test_dispersion_lcl_non_negative(self):
        values = np.array([10.0, 11.0, 10.0, 11.0, 10.0])
        prods = np.array(["A"] * 5)
        result = compute_short_run(values, prods)
        assert np.all(result.dispersion_limits.lcl >= 0.0)


# ---------------------------------------------------------------------------
# Config validation
# ---------------------------------------------------------------------------

class TestShortRunConfig:
    def test_default_config(self):
        config = ShortRunConfig()
        assert config.scaling == ScalingMethod.CENTERED
        assert config.k_sigma == pytest.approx(3.0)
        assert config.product_targets is None
        assert config.product_sigmas is None
        assert config.subgrouped is False

    def test_invalid_k_sigma(self):
        with pytest.raises(ValueError, match="k_sigma"):
            ShortRunConfig(k_sigma=0.0)

    def test_empty_values_raises(self):
        with pytest.raises(ValueError):
            compute_short_run(np.array([]), np.array([]))

    def test_single_product(self):
        values = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
        prods = np.array(["A"] * 5)
        result = compute_short_run(values, prods)
        assert "A" in result.product_stats
        assert len(result.transformed_values) == 5
