"""
Laney P' Chart implementation (overdispersion-adjusted p-chart).

The Laney P' chart adjusts the binomial control limits by a factor
sigma_z that accounts for between-subgroup variation (overdispersion).

Algorithm:
  1. p_bar = compute_p_bar(defectives, n_trials)
  2. binomial_sigma_i = sqrt(p_bar * (1 - p_bar) / ni)
  3. Guard zero sigma: safe_sigma_i = where(binomial_sigma_i > 0, binomial_sigma_i, 1.0)
  4. residuals_i = (pi - p_bar) / safe_sigma_i
  5. sigma_z = sigma_laney_adjustment(residuals)
  6. UCL_i = min(p_bar + K * sigma_z * binomial_sigma_i, 1.0)
     CL_i  = p_bar
     LCL_i = max(p_bar - K * sigma_z * binomial_sigma_i, 0.0)
"""
import attrs
import numpy as np

from algo.common.attribute import compute_p_bar
from algo.common.sigma import sigma_binomial, sigma_laney_adjustment
from algo.common.types import ControlLimits
from algo.common.validators import validate_positive


@attrs.define(slots=True)
class LaneyPConfig:
    """Configuration for a Laney P' Chart.

    Parameters
    ----------
    k_sigma:
        Number of sigma multiples for control limits. Must be > 0.
        Default is 3.0.
    """

    k_sigma: float = attrs.field(default=3.0)

    @k_sigma.validator
    def _validate_k_sigma(self, attribute: attrs.Attribute, value: float) -> None:
        validate_positive(value, "k_sigma")


@attrs.define(slots=True)
class LaneyPResult:
    """Result of a Laney P' Chart computation.

    Parameters
    ----------
    proportions:
        Per-subgroup proportion defective (defectives / n_trials).
    limits:
        Per-subgroup control limits (UCL, CL, LCL).
    p_bar:
        Overall pooled proportion defective.
    sigma_z:
        Laney overdispersion adjustment factor.
    sigma:
        Per-subgroup binomial sigma values (before sigma_z adjustment).
    """

    proportions: np.ndarray
    limits: ControlLimits
    p_bar: float
    sigma_z: float
    sigma: np.ndarray


def laney_p_chart(
    defectives: np.ndarray,
    n_trials: np.ndarray,
    config: LaneyPConfig | None = None,
) -> LaneyPResult:
    """Compute Laney P' Chart control limits and statistics.

    Parameters
    ----------
    defectives:
        1-D array of defective counts per subgroup.
    n_trials:
        1-D array of sample sizes per subgroup.
    config:
        LaneyPConfig with k_sigma (default 3.0).

    Returns
    -------
    LaneyPResult with proportions, limits, p_bar, sigma_z, and sigma.
    """
    if config is None:
        config = LaneyPConfig()

    defectives = np.asarray(defectives, dtype=float)
    n_trials = np.asarray(n_trials, dtype=float)

    proportions = defectives / n_trials
    p_bar = compute_p_bar(defectives, n_trials)

    binomial_sigma = sigma_binomial(p_bar, n_trials)

    # Guard against zero sigma (e.g., p_bar=0 or p_bar=1)
    safe_sigma = np.where(binomial_sigma > 0.0, binomial_sigma, 1.0)

    residuals = (proportions - p_bar) / safe_sigma
    sigma_z = sigma_laney_adjustment(residuals)

    cl = np.full_like(binomial_sigma, fill_value=p_bar)
    ucl = np.minimum(cl + config.k_sigma * sigma_z * binomial_sigma, 1.0)
    lcl = np.maximum(cl - config.k_sigma * sigma_z * binomial_sigma, 0.0)

    limits = ControlLimits(ucl=ucl, cl=cl, lcl=lcl, k_sigma=config.k_sigma)

    return LaneyPResult(
        proportions=proportions,
        limits=limits,
        p_bar=p_bar,
        sigma_z=sigma_z,
        sigma=binomial_sigma,
    )
