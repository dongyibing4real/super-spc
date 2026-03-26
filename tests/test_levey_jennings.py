"""
Tests for algo/levey_jennings - Levey-Jennings control chart.
"""
import numpy as np
import pytest

from algo.common.enums import SigmaMethod
from algo.levey_jennings import LeveyJenningsConfig, LeveyJenningsResult, compute_levey_jennings


# ---------------------------------------------------------------------------
# Known-answer test
# ---------------------------------------------------------------------------

class TestLeveyJenningsKnownAnswer:
    """Verify limits against hand-computed values."""

    DATA = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
    MEAN = 3.0
    # std([1..5], ddof=1) = sqrt(2.5)
    SIGMA = np.std(np.array([1.0, 2.0, 3.0, 4.0, 5.0]), ddof=1)

    def test_process_mean(self):
        result = compute_levey_jennings(self.DATA)
        assert result.process_mean == pytest.approx(self.MEAN, rel=1e-10)

    def test_sigma_hat(self):
        result = compute_levey_jennings(self.DATA)
        assert result.sigma.sigma_hat == pytest.approx(self.SIGMA, rel=1e-6)

    def test_sigma_method(self):
        result = compute_levey_jennings(self.DATA)
        assert result.sigma.method == SigmaMethod.LEVEY_JENNINGS

    def test_ucl(self):
        result = compute_levey_jennings(self.DATA)
        expected = self.MEAN + 3.0 * self.SIGMA
        np.testing.assert_allclose(result.limits.ucl, expected, rtol=1e-6)

    def test_lcl(self):
        result = compute_levey_jennings(self.DATA)
        expected = self.MEAN - 3.0 * self.SIGMA
        np.testing.assert_allclose(result.limits.lcl, expected, rtol=1e-6)

    def test_cl(self):
        result = compute_levey_jennings(self.DATA)
        np.testing.assert_allclose(result.limits.cl, self.MEAN, atol=1e-10)

    def test_result_type(self):
        result = compute_levey_jennings(self.DATA)
        assert isinstance(result, LeveyJenningsResult)

    def test_values_stored(self):
        result = compute_levey_jennings(self.DATA)
        np.testing.assert_array_equal(result.values, self.DATA)

    def test_limits_shape_matches_data(self):
        result = compute_levey_jennings(self.DATA)
        assert result.limits.ucl.shape == (5,)
        assert result.limits.cl.shape == (5,)
        assert result.limits.lcl.shape == (5,)


# ---------------------------------------------------------------------------
# Constant data (sigma=0)
# ---------------------------------------------------------------------------

class TestLeveyJenningsConstantData:
    def test_constant_data_sigma_zero(self):
        data = np.full(10, 7.5)
        result = compute_levey_jennings(data)
        assert result.sigma.sigma_hat == pytest.approx(0.0, abs=1e-10)

    def test_constant_data_limits_equal_mean(self):
        data = np.full(10, 7.5)
        result = compute_levey_jennings(data)
        np.testing.assert_allclose(result.limits.ucl, 7.5, atol=1e-10)
        np.testing.assert_allclose(result.limits.lcl, 7.5, atol=1e-10)


# ---------------------------------------------------------------------------
# Two points
# ---------------------------------------------------------------------------

class TestLeveyJenningsTwoPoints:
    def test_two_points_sigma(self):
        values = np.array([0.0, 2.0])
        result = compute_levey_jennings(values)
        # std([0, 2], ddof=1) = sqrt(2)
        assert result.sigma.sigma_hat == pytest.approx(np.sqrt(2.0), rel=1e-6)

    def test_two_points_mean(self):
        values = np.array([0.0, 2.0])
        result = compute_levey_jennings(values)
        assert result.process_mean == pytest.approx(1.0, rel=1e-10)

    def test_two_points_limits_shape(self):
        values = np.array([0.0, 2.0])
        result = compute_levey_jennings(values)
        assert result.limits.ucl.shape == (2,)


# ---------------------------------------------------------------------------
# Custom k_sigma
# ---------------------------------------------------------------------------

class TestLeveyJenningsCustomK:
    def test_k2_sigma_gives_narrower_limits(self):
        data = np.arange(10, dtype=float)
        r3 = compute_levey_jennings(data, config=LeveyJenningsConfig(k_sigma=3.0))
        r2 = compute_levey_jennings(data, config=LeveyJenningsConfig(k_sigma=2.0))
        assert np.all(r2.limits.ucl <= r3.limits.ucl)
        assert np.all(r2.limits.lcl >= r3.limits.lcl)

    def test_wider_k_gives_wider_limits(self):
        data = np.arange(10, dtype=float)
        r3 = compute_levey_jennings(data, config=LeveyJenningsConfig(k_sigma=3.0))
        r4 = compute_levey_jennings(data, config=LeveyJenningsConfig(k_sigma=4.0))
        assert np.all(r4.limits.ucl >= r3.limits.ucl)
        assert np.all(r4.limits.lcl <= r3.limits.lcl)

    def test_symmetric_limits(self):
        data = np.array([10.0, 12.0, 8.0, 11.0, 9.0])
        result = compute_levey_jennings(data)
        spread_up = result.limits.ucl[0] - result.process_mean
        spread_down = result.process_mean - result.limits.lcl[0]
        assert spread_up == pytest.approx(spread_down, rel=1e-10)


# ---------------------------------------------------------------------------
# Config validation
# ---------------------------------------------------------------------------

class TestLeveyJenningsConfigValidation:
    def test_negative_k_sigma_raises(self):
        with pytest.raises(ValueError):
            LeveyJenningsConfig(k_sigma=-1.0)

    def test_zero_k_sigma_raises(self):
        with pytest.raises(ValueError):
            LeveyJenningsConfig(k_sigma=0.0)

    def test_default_k_sigma(self):
        cfg = LeveyJenningsConfig()
        assert cfg.k_sigma == pytest.approx(3.0)


# ---------------------------------------------------------------------------
# Zones
# ---------------------------------------------------------------------------

class TestLeveyJenningsZones:
    def test_zones_cl_equals_process_mean(self):
        data = np.array([2.0, 4.0, 6.0, 8.0, 10.0])
        result = compute_levey_jennings(data)
        assert result.zones.cl == pytest.approx(result.process_mean, rel=1e-10)

    def test_zones_ordering(self):
        data = np.arange(1, 11, dtype=float)
        result = compute_levey_jennings(data)
        z = result.zones
        assert z.zone_a_upper > z.zone_b_upper > z.cl
        assert z.cl > z.zone_b_lower > z.zone_a_lower

    def test_zones_symmetric(self):
        data = np.array([1.0, 3.0, 5.0, 7.0, 9.0])
        result = compute_levey_jennings(data)
        z = result.zones
        sigma = result.sigma.sigma_hat
        assert z.zone_a_upper == pytest.approx(result.process_mean + 2 * sigma, rel=1e-10)
        assert z.zone_a_lower == pytest.approx(result.process_mean - 2 * sigma, rel=1e-10)


# ---------------------------------------------------------------------------
# Larger dataset consistency
# ---------------------------------------------------------------------------

class TestLeveyJenningsLargerDataset:
    def test_ucl_always_ge_cl(self):
        rng = np.random.default_rng(42)
        data = rng.normal(100.0, 5.0, size=50)
        result = compute_levey_jennings(data)
        assert np.all(result.limits.ucl >= result.limits.cl)

    def test_cl_always_ge_lcl(self):
        rng = np.random.default_rng(42)
        data = rng.normal(100.0, 5.0, size=50)
        result = compute_levey_jennings(data)
        assert np.all(result.limits.cl >= result.limits.lcl)

    def test_n_used_equals_data_length(self):
        data = np.arange(1, 21, dtype=float)
        result = compute_levey_jennings(data)
        assert result.sigma.n_used == 20
