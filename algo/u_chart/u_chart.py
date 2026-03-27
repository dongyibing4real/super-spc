"""
U Chart implementation (defects per unit, Poisson model).
"""
import attrs
import numpy as np

from algo.common.attribute import compute_poisson_limits, compute_u_bar
from algo.common.sigma import sigma_poisson
from algo.common.types import ControlLimits
from algo.common.validators import validate_positive


@attrs.define(slots=True)
class UChartConfig:
    """Configuration for a U Chart.

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
class UChartResult:
    """Result of a U Chart computation.

    Parameters
    ----------
    rates:
        Per-subgroup defects per unit (defects / n_units).
    limits:
        Per-subgroup control limits (UCL, CL, LCL).
    u_bar:
        Overall pooled defects per unit.
    sigma:
        Per-subgroup Poisson sigma values (sqrt(u_bar / ni)).
    """

    rates: np.ndarray
    limits: ControlLimits
    u_bar: float
    sigma: np.ndarray


def u_chart(
    defects: np.ndarray,
    n_units: np.ndarray,
    config: UChartConfig | None = None,
) -> UChartResult:
    """Compute U Chart control limits and statistics.

    Parameters
    ----------
    defects:
        1-D array of defect counts per subgroup.
    n_units:
        1-D array of inspection unit counts per subgroup.
    config:
        UChartConfig with k_sigma (default 3.0).

    Returns
    -------
    UChartResult with rates, limits, u_bar, and sigma.
    """
    if config is None:
        config = UChartConfig()

    defects = np.asarray(defects, dtype=float)
    n_units = np.asarray(n_units, dtype=float)

    rates = defects / n_units
    u_bar = compute_u_bar(defects, n_units)
    limits = compute_poisson_limits(u_bar, n_units, k_sigma=config.k_sigma)
    sigma = sigma_poisson(u_bar, n_units)

    return UChartResult(
        rates=rates,
        limits=limits,
        u_bar=u_bar,
        sigma=sigma,
    )
