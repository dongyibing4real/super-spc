"""
Tests for algo/imr - IMR (Individuals and Moving Range) control chart.
"""
import numpy as np
import pytest

from algo.common.enums import SigmaMethod
from algo.constants.tables import d2, d3
from algo.imr import IMRConfig, IMRResult, compute_imr


# ---------------------------------------------------------------------------
# Known-answer test
# ---------------------------------------------------------------------------

class TestIMRKnownAnswer:
    """Verify limits against hand-computed values.

    All MR = 1.128 -> MR_bar = 1.128
    sigma_hat = MR_bar / d2(2) = 1.128 / 1.128 = 1.0
    process_mean = mean([0.0, 1.128, 0.0, 1.128, 0.0]) = 2.256 / 5 = 0.4512
    """

    DATA = np.array([0.0, 1.128, 0.0, 1.128, 0.0])
    MR_BAR = 1.128
    SIGMA_HAT = MR_BAR / d2(2)
    PROCESS_MEAN = DATA.mean()

    def test_moving_ranges(self):
        result = compute_imr(self.DATA)
        expected_mr = np.abs(np.diff(self.DATA))
        np.testing.assert_allclose(result.moving_ranges, expected_mr, rtol=1e-10)

    def test_sigma_hat(self):
        result = compute_imr(self.DATA)
        assert result.sigma.sigma_hat == pytest.approx(self.SIGMA_HAT, rel=1e-3)

    def test_process_mean(self):
        result = compute_imr(self.DATA)
        assert result.process_mean == pytest.approx(self.PROCESS_MEAN, rel=1e-6)

    def test_i_limits(self):
        result = compute_imr(self.DATA)
        expected_ucl = self.PROCESS_MEAN + 3.0 * self.SIGMA_HAT
        expected_lcl = self.PROCESS_MEAN - 3.0 * self.SIGMA_HAT
        np.testing.assert_allclose(result.i_limits.ucl, expected_ucl, rtol=1e-4)
        np.testing.assert_allclose(result.i_limits.lcl, expected_lcl, rtol=1e-4)
        np.testing.assert_allclose(result.i_limits.cl, self.PROCESS_MEAN, rtol=1e-6)

    def test_mr_limits(self):
        result = compute_imr(self.DATA)
        mr_cl = d2(2) * self.SIGMA_HAT
        mr_ucl = mr_cl + 3.0 * d3(2) * self.SIGMA_HAT
        mr_lcl = max(mr_cl - 3.0 * d3(2) * self.SIGMA_HAT, 0.0)
        np.testing.assert_allclose(result.mr_limits.ucl, mr_ucl, rtol=1e-4)
        np.testing.assert_allclose(result.mr_limits.cl, mr_cl, rtol=1e-4)
        np.testing.assert_allclose(result.mr_limits.lcl, mr_lcl, rtol=1e-4)

    def test_result_type(self):
        result = compute_imr(self.DATA)
        assert isinstance(result, IMRResult)


# ---------------------------------------------------------------------------
# Median MR method
# ---------------------------------------------------------------------------

class TestIMRMedianMR:
    def test_median_mr_method_tag(self):
        data = np.array([1.0, 2.0, 1.5, 3.0, 2.5, 1.0])
        config = IMRConfig(sigma_method=SigmaMethod.MEDIAN_MOVING_RANGE)
        result = compute_imr(data, config=config)
        assert result.sigma.method == SigmaMethod.MEDIAN_MOVING_RANGE

    def test_median_vs_mean_mr_differ(self):
        """For asymmetric MRs, median and mean should give different sigma_hat."""
        # Construct data with unequal moving ranges
        data = np.array([0.0, 0.1, 0.0, 5.0, 0.0, 0.1, 0.0])
        result_mean = compute_imr(data, config=IMRConfig(sigma_method=SigmaMethod.MOVING_RANGE))
        result_median = compute_imr(data, config=IMRConfig(sigma_method=SigmaMethod.MEDIAN_MOVING_RANGE))
        assert result_mean.sigma.sigma_hat != pytest.approx(result_median.sigma.sigma_hat, rel=0.01)

    def test_median_mr_known_answer(self):
        """sigma_hat = median(MR) / 0.954 for median method."""
        # All MR identical -> same result as mean method
        data = np.array([0.0, 0.954, 0.0, 0.954, 0.0])
        config = IMRConfig(sigma_method=SigmaMethod.MEDIAN_MOVING_RANGE)
        result = compute_imr(data, config=config)
        assert result.sigma.sigma_hat == pytest.approx(1.0, rel=1e-3)


# ---------------------------------------------------------------------------
# Constant data (sigma=0)
# ---------------------------------------------------------------------------

class TestIMRConstantData:
    def test_constant_data_sigma_zero(self):
        data = np.full(10, 5.0)
        result = compute_imr(data)
        assert result.sigma.sigma_hat == pytest.approx(0.0, abs=1e-10)

    def test_constant_data_all_mr_zero(self):
        data = np.full(10, 5.0)
        result = compute_imr(data)
        np.testing.assert_array_equal(result.moving_ranges, np.zeros(9))

    def test_constant_data_limits_equal_to_mean(self):
        data = np.full(10, 5.0)
        result = compute_imr(data)
        # With sigma=0, UCL = LCL = CL = process_mean
        np.testing.assert_allclose(result.i_limits.ucl, 5.0, atol=1e-10)
        np.testing.assert_allclose(result.i_limits.lcl, 5.0, atol=1e-10)


# ---------------------------------------------------------------------------
# Two-point minimum input
# ---------------------------------------------------------------------------

class TestIMRTwoPoints:
    def test_two_points_produces_one_mr(self):
        data = np.array([0.0, 1.128])
        result = compute_imr(data)
        assert len(result.moving_ranges) == 1
        assert result.moving_ranges[0] == pytest.approx(1.128, rel=1e-6)

    def test_two_points_sigma_hat(self):
        data = np.array([0.0, 1.128])
        result = compute_imr(data)
        assert result.sigma.sigma_hat == pytest.approx(1.0, rel=1e-3)

    def test_two_points_i_limits_shape(self):
        data = np.array([3.0, 5.0])
        result = compute_imr(data)
        assert result.i_limits.ucl.shape == (2,)
        assert result.i_limits.lcl.shape == (2,)


# ---------------------------------------------------------------------------
# MR LCL >= 0
# ---------------------------------------------------------------------------

class TestMRLclNonNegative:
    def test_mr_lcl_non_negative(self):
        """d2(2)*sigma - K*d3(2)*sigma can be negative; LCL must be floored at 0."""
        # d2(2)=1.128, d3(2)=0.8525
        # d2(2)*s - 3*d3(2)*s = s*(1.128 - 2.558) = negative -> floor to 0
        rng = np.random.default_rng(5)
        data = rng.normal(100.0, 5.0, size=30)
        result = compute_imr(data)
        assert np.all(result.mr_limits.lcl >= 0.0)

    def test_mr_lcl_non_negative_median_method(self):
        rng = np.random.default_rng(6)
        data = rng.normal(0.0, 1.0, size=20)
        config = IMRConfig(sigma_method=SigmaMethod.MEDIAN_MOVING_RANGE)
        result = compute_imr(data, config=config)
        assert np.all(result.mr_limits.lcl >= 0.0)


# ---------------------------------------------------------------------------
# Config validation
# ---------------------------------------------------------------------------

class TestIMRConfigValidation:
    def test_negative_k_sigma_raises(self):
        with pytest.raises(ValueError):
            IMRConfig(k_sigma=-1.0)

    def test_zero_k_sigma_raises(self):
        with pytest.raises(ValueError):
            IMRConfig(k_sigma=0.0)

    def test_invalid_sigma_method_raises(self):
        with pytest.raises(ValueError):
            IMRConfig(sigma_method=SigmaMethod.RANGE)

    def test_invalid_sigma_method_stddev_raises(self):
        with pytest.raises(ValueError):
            IMRConfig(sigma_method=SigmaMethod.STDDEV)

    def test_default_method_is_moving_range(self):
        cfg = IMRConfig()
        assert cfg.sigma_method == SigmaMethod.MOVING_RANGE

    def test_median_method_valid(self):
        cfg = IMRConfig(sigma_method=SigmaMethod.MEDIAN_MOVING_RANGE)
        assert cfg.sigma_method == SigmaMethod.MEDIAN_MOVING_RANGE


# ---------------------------------------------------------------------------
# Zones
# ---------------------------------------------------------------------------

class TestIMRZones:
    def test_zones_cl_equals_process_mean(self):
        data = np.arange(10, dtype=float)
        result = compute_imr(data)
        assert result.zones.cl == pytest.approx(result.process_mean, rel=1e-10)
