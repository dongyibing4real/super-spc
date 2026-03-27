"""
Laney U' Chart implementation (overdispersion-adjusted u-chart).

The Laney U' chart adjusts the Poisson control limits by a factor
sigma_z that accounts for between-subgroup variation (overdispersion).
Unlike Laney P', the UCL is not clamped to 1.

Algorithm:
  1. u_bar = compute_u_bar(defects, n_units)
  2. poisson_sigma_i = sqrt(u_bar / ni)
  3. Guard zero sigma: safe_sigma_i = where(poisson_sigma_i > 0, poisson_sigma_i, 1.0)
  4. rates_i = defects_i / ni
  5. residuals_i = (rates_i - u_bar) / safe_sigma_i
  6. sigma_z = sigma_laney_adjustment(residuals)
  7. UCL_i = u_bar + K * sigma_z * poisson_sigma_i   (no upper clamp)
     CL_i  = u_bar
     LCL_i = max(u_bar - K * sigma_z * poisson_sigma_i, 0.0)
"""
import attrs
import numpy as np

from algo.common.attribute import compute_u_bar
from algo.common.sigma import sigma_laney_adjustment, sigma_poisson
from algo.common.types import ControlLimits
from algo.common.validators import validate_positive


@attrs.define(slots=True)
class LaneyUConfig:
    """Configuration for a Laney U' Chart.

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
class LaneyUResult:
    """Result of a Laney U' Chart computation.

    Parameters
    ----------
    rates:
        Per-subgroup defects per unit (defects / n_units).
    limits:
        Per-subgroup control limits (UCL, CL, LCL).
    u_bar:
        Overall pooled defects per unit.
    sigma_z:
        Laney overdispersion adjustment factor.
    sigma:
        Per-subgroup Poisson sigma values (before sigma_z adjustment).
    """

    rates: np.ndarray
    limits: ControlLimits
    u_bar: float
    sigma_z: float
    sigma: np.ndarray


def laney_u_chart(
    defects: np.ndarray,
    n_units: np.ndarray,
    config: LaneyUConfig | None = None,
) -> LaneyUResult:
    """Compute Laney U' Chart control limits and statistics.

    Parameters
    ----------
    defects:
        1-D array of defect counts per subgroup.
    n_units:
        1-D array of inspection unit counts per subgroup.
    config:
        LaneyUConfig with k_sigma (default 3.0).

    Returns
    -------
    LaneyUResult with rates, limits, u_bar, sigma_z, and sigma.
    """
    if config is None:
        config = LaneyUConfig()

    defects = np.asarray(defects, dtype=float)
    n_units = np.asarray(n_units, dtype=float)

    rates = defects / n_units
    u_bar = compute_u_bar(defects, n_units)

    poisson_sigma = sigma_poisson(u_bar, n_units)

    # Guard against zero sigma (e.g., u_bar=0)
    safe_sigma = np.where(poisson_sigma > 0.0, poisson_sigma, 1.0)

    residuals = (rates - u_bar) / safe_sigma
    sigma_z = sigma_laney_adjustment(residuals)

    cl = np.full_like(poisson_sigma, fill_value=u_bar)
    ucl = cl + config.k_sigma * sigma_z * poisson_sigma
    lcl = np.maximum(cl - config.k_sigma * sigma_z * poisson_sigma, 0.0)

    limits = ControlLimits(ucl=ucl, cl=cl, lcl=lcl, k_sigma=config.k_sigma)

    return LaneyUResult(
        rates=rates,
        limits=limits,
        u_bar=u_bar,
        sigma_z=sigma_z,
        sigma=poisson_sigma,
    )
