"""
Tests for algo/ewma/__init__.py (EWMA control chart).
"""
import numpy as np
import pytest

from algo.ewma import EWMAConfig, EWMAResult, compute_ewma


# ---------------------------------------------------------------------------
# Configuration defaults and validation
# ---------------------------------------------------------------------------

class TestEWMAConfig:
    def test_defaults(self):
        cfg = EWMAConfig()
        assert cfg.target == 0.0
        assert cfg.sigma == 1.0
        assert cfg.lambda_ == 0.2
        assert cfg.k_sigma == 3.0
        assert cfg.use_exact_limits is True

    def test_sigma_must_be_positive(self):
        with pytest.raises(ValueError):
            EWMAConfig(sigma=0.0)

    def test_sigma_negative_raises(self):
        with pytest.raises(ValueError):
            EWMAConfig(sigma=-1.0)

    def test_lambda_must_be_in_range(self):
        with pytest.raises(ValueError):
            EWMAConfig(lambda_=0.0)  # strictly > 0
        with pytest.raises(ValueError):
            EWMAConfig(lambda_=1.1)  # <= 1

    def test_lambda_one_is_valid(self):
        cfg = EWMAConfig(lambda_=1.0)
        assert cfg.lambda_ == 1.0

    def test_k_sigma_must_be_positive(self):
        with pytest.raises(ValueError):
            EWMAConfig(k_sigma=0.0)

    def test_custom_values(self):
        cfg = EWMAConfig(target=5.0, sigma=2.0, lambda_=0.1, k_sigma=2.5,
                         use_exact_limits=False)
        assert cfg.target == 5.0
        assert cfg.sigma == 2.0
        assert cfg.lambda_ == 0.1
        assert cfg.k_sigma == 2.5
        assert cfg.use_exact_limits is False


# ---------------------------------------------------------------------------
# compute_ewma: result structure
# ---------------------------------------------------------------------------

class TestEWMAResultStructure:
    def test_result_fields(self):
        values = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
        cfg = EWMAConfig()
        result = compute_ewma(values, cfg)
        assert isinstance(result, EWMAResult)
        assert len(result.ewma) == 5
        assert len(result.ucl) == 5
        assert len(result.lcl) == 5
        assert len(result.center) == 5
        assert len(result.violations) == 5
        assert len(result.residuals) == 5
        assert isinstance(result.forecast, float)

    def test_center_constant_at_target(self):
        values = np.array([1.0, 2.0, 3.0])
        cfg = EWMAConfig(target=5.0)
        result = compute_ewma(values, cfg)
        np.testing.assert_array_equal(result.center, 5.0)


# ---------------------------------------------------------------------------
# compute_ewma: lambda=1 equals raw data
# ---------------------------------------------------------------------------

class TestEWMALambdaOne:
    def test_lambda_one_ewma_equals_raw(self):
        """With lambda=1, EWMA_i = x_i (pure data, no smoothing)."""
        values = np.array([1.0, 3.0, -1.0, 5.0, 2.0])
        cfg = EWMAConfig(lambda_=1.0)
        result = compute_ewma(values, cfg)
        np.testing.assert_array_almost_equal(result.ewma, values)

    def test_lambda_one_forecast_equals_last_observation(self):
        values = np.array([1.0, 3.0, -1.0, 5.0, 2.0])
        cfg = EWMAConfig(lambda_=1.0)
        result = compute_ewma(values, cfg)
        assert np.isclose(result.forecast, 2.0)


# ---------------------------------------------------------------------------
# compute_ewma: smoothing behaviour
# ---------------------------------------------------------------------------

class TestEWMASmoothing:
    def test_ewma_smoothed_between_target_and_data(self):
        """EWMA should be between previous EWMA and current observation."""
        values = np.array([10.0, 10.0, 10.0])  # all above target=0
        cfg = EWMAConfig(target=0.0, lambda_=0.3)
        result = compute_ewma(values, cfg)
        # Each EWMA should be positive and less than 10
        assert np.all(result.ewma > 0)
        assert np.all(result.ewma < 10)

    def test_ewma_monotone_approach_with_constant_input(self):
        """For constant input above target, EWMA should be non-decreasing."""
        values = np.full(10, 5.0)
        cfg = EWMAConfig(target=0.0, lambda_=0.2)
        result = compute_ewma(values, cfg)
        assert np.all(np.diff(result.ewma) >= 0)

    def test_ewma_formula_manual(self):
        """Verify EWMA recurrence by hand."""
        # lambda=0.4, target=0, sigma=1
        # EWMA_0 = 0.4*2 + 0.6*0 = 0.8
        # EWMA_1 = 0.4*3 + 0.6*0.8 = 1.2 + 0.48 = 1.68
        values = np.array([2.0, 3.0])
        cfg = EWMAConfig(target=0.0, lambda_=0.4)
        result = compute_ewma(values, cfg)
        np.testing.assert_almost_equal(result.ewma[0], 0.8)
        np.testing.assert_almost_equal(result.ewma[1], 1.68)

    def test_forecast_equals_last_ewma(self):
        values = np.array([1.0, 2.0, 3.0])
        cfg = EWMAConfig()
        result = compute_ewma(values, cfg)
        assert np.isclose(result.forecast, result.ewma[-1])


# ---------------------------------------------------------------------------
# compute_ewma: residuals
# ---------------------------------------------------------------------------

class TestEWMAResiduals:
    def test_residual_zero_equals_first_obs_minus_target(self):
        """residuals[0] = x[0] - target."""
        values = np.array([3.0, 1.0, 2.0])
        cfg = EWMAConfig(target=1.0)
        result = compute_ewma(values, cfg)
        assert np.isclose(result.residuals[0], 3.0 - 1.0)

    def test_residual_i_equals_xi_minus_ewma_prev(self):
        """residuals[i] = x[i] - EWMA[i-1] for i > 0."""
        values = np.array([2.0, 5.0, 1.0])
        cfg = EWMAConfig(target=0.0, lambda_=0.3)
        result = compute_ewma(values, cfg)
        for i in range(1, len(values)):
            expected = values[i] - result.ewma[i - 1]
            np.testing.assert_almost_equal(result.residuals[i], expected)


# ---------------------------------------------------------------------------
# compute_ewma: exact limits (use_exact_limits=True)
# ---------------------------------------------------------------------------

class TestEWMAExactLimits:
    def test_exact_limits_narrower_at_start_wider_later(self):
        """Exact limits start narrow (small variance) and widen toward asymptote."""
        values = np.zeros(50)
        cfg = EWMAConfig(lambda_=0.2, k_sigma=3.0, use_exact_limits=True)
        result = compute_ewma(values, cfg)
        # UCL should be non-decreasing (exact limits approach asymptote)
        ucl_diffs = np.diff(result.ucl)
        assert np.all(ucl_diffs >= -1e-12)  # allow tiny floating point

    def test_exact_limits_converge_to_asymptote(self):
        """After many observations, exact limits should equal asymptotic."""
        n = 500
        values = np.zeros(n)
        lam = 0.1
        cfg_exact = EWMAConfig(lambda_=lam, use_exact_limits=True)
        cfg_asym = EWMAConfig(lambda_=lam, use_exact_limits=False)
        result_exact = compute_ewma(values, cfg_exact)
        result_asym = compute_ewma(values, cfg_asym)
        # Final UCL should be very close
        np.testing.assert_almost_equal(result_exact.ucl[-1], result_asym.ucl[-1], decimal=3)

    def test_exact_limits_formula(self):
        """Verify exact variance computation manually."""
        # variance_i = lambda^2 * variance_{i-1} + lambda^2 (for n=1 subgroups)
        # Actually for n_i=1: variance_i = lambda^2*(variance_{i-1} + 1/1)
        # Wait: variance_i = lambda^2 * variance_{i-1} + lambda^2/ni
        # = lambda^2 * (variance_{i-1} + 1)  for ni=1
        # Starting: variance_0 = lambda^2 * (0 + 1) = lambda^2
        # variance_1 = lambda^2 * (lambda^2 + 1) = lambda^2 + lambda^4
        # UCL_0 = target + k*sigma*sqrt(lambda^2) = target + k*sigma*lambda
        lam = 0.3
        k = 3.0
        sigma = 1.0
        target = 0.0
        values = np.array([0.0, 0.0])
        cfg = EWMAConfig(target=target, sigma=sigma, lambda_=lam, k_sigma=k,
                         use_exact_limits=True)
        result = compute_ewma(values, cfg)
        expected_ucl_0 = target + k * sigma * lam  # sqrt(lambda^2) = lambda
        np.testing.assert_almost_equal(result.ucl[0], expected_ucl_0)


# ---------------------------------------------------------------------------
# compute_ewma: asymptotic limits (use_exact_limits=False)
# ---------------------------------------------------------------------------

class TestEWMAAsymptoticLimits:
    def test_asymptotic_limits_constant(self):
        """Asymptotic limits should be the same for all observations."""
        values = np.zeros(20)
        cfg = EWMAConfig(use_exact_limits=False)
        result = compute_ewma(values, cfg)
        assert np.all(result.ucl == result.ucl[0])
        assert np.all(result.lcl == result.lcl[0])

    def test_asymptotic_formula(self):
        """UCL = target + k*sigma*sqrt(lambda/(2-lambda)) for n_avg=1."""
        lam = 0.2
        k = 3.0
        sigma = 1.0
        target = 0.0
        expected_ucl = target + k * sigma * np.sqrt(lam / (2 - lam))
        values = np.zeros(10)
        cfg = EWMAConfig(target=target, sigma=sigma, lambda_=lam, k_sigma=k,
                         use_exact_limits=False)
        result = compute_ewma(values, cfg)
        np.testing.assert_almost_equal(result.ucl[0], expected_ucl)

    def test_asymptotic_with_subgroup_sizes(self):
        """With subgroup_sizes, UCL = target + k*sigma*sqrt(lambda/(n_avg*(2-lambda)))."""
        lam = 0.2
        k = 3.0
        sigma = 1.0
        target = 0.0
        n = 4
        expected_ucl = target + k * sigma * np.sqrt(lam / (n * (2 - lam)))
        values = np.zeros(10)
        subgroup_sizes = np.full(10, n)
        cfg = EWMAConfig(target=target, sigma=sigma, lambda_=lam, k_sigma=k,
                         use_exact_limits=False)
        result = compute_ewma(values, cfg, subgroup_sizes=subgroup_sizes)
        np.testing.assert_almost_equal(result.ucl[0], expected_ucl)


# ---------------------------------------------------------------------------
# compute_ewma: shift detection
# ---------------------------------------------------------------------------

class TestEWMAShiftDetection:
    def test_sustained_shift_detected(self):
        """A sustained 3-sigma shift should be detected within a few observations."""
        # Start in-control, then shift by 3 sigma
        values = np.concatenate([np.zeros(20), np.full(20, 3.0)])
        cfg = EWMAConfig(target=0.0, sigma=1.0, lambda_=0.2, k_sigma=3.0)
        result = compute_ewma(values, cfg)
        # Should detect the shift in the second half
        assert np.any(result.violations[20:])

    def test_no_violations_in_control(self):
        """In-control process should rarely trigger violations."""
        rng = np.random.default_rng(42)
        values = rng.normal(0, 1, 200)
        cfg = EWMAConfig(target=0.0, sigma=1.0, lambda_=0.2, k_sigma=3.0)
        result = compute_ewma(values, cfg)
        # Allow a small number of false alarms (< 10%)
        violation_rate = np.mean(result.violations)
        assert violation_rate < 0.10

    def test_violations_boolean_array(self):
        values = np.array([0.0, 1.0, 2.0])
        cfg = EWMAConfig()
        result = compute_ewma(values, cfg)
        assert result.violations.dtype == bool


# ---------------------------------------------------------------------------
# compute_ewma: subgroup sizes
# ---------------------------------------------------------------------------

class TestEWMASubgroupSizes:
    def test_subgroup_sizes_affect_exact_limits(self):
        """Larger subgroup sizes give tighter exact limits."""
        values = np.zeros(10)
        cfg = EWMAConfig(use_exact_limits=True)
        result_n1 = compute_ewma(values, cfg, subgroup_sizes=np.ones(10))
        result_n4 = compute_ewma(values, cfg, subgroup_sizes=np.full(10, 4))
        # Larger subgroups -> smaller sigma/sqrt(n) -> tighter limits
        assert np.all(result_n4.ucl <= result_n1.ucl + 1e-10)
