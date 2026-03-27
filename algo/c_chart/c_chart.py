"""
C Chart implementation (defect counts, Poisson model).

The C chart is a special case of the U chart where the inspection unit
is fixed. It is parameterized by defect counts and n_units (area of
opportunity per subgroup).

UCL_i = ni*u_bar + K*sqrt(ni*u_bar)
CL_i  = ni*u_bar
LCL_i = max(ni*u_bar - K*sqrt(ni*u_bar), 0)
"""
import attrs
import numpy as np

from algo.common.attribute import compute_u_bar
from algo.common.types import ControlLimits
from algo.common.validators import validate_positive


@attrs.define(slots=True)
class CChartConfig:
    """Configuration for a C Chart.

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
class CChartResult:
    """Result of a C Chart computation.

    Parameters
    ----------
    counts:
        Per-subgroup defect counts (same as input defects).
    limits:
        Per-subgroup control limits (UCL, CL, LCL).
    u_bar:
        Overall pooled defects per unit.
    sigma:
        Per-subgroup Poisson sigma values (sqrt(ni*u_bar)).
    """

    counts: np.ndarray
    limits: ControlLimits
    u_bar: float
    sigma: np.ndarray


def c_chart(
    defects: np.ndarray,
    n_units: np.ndarray,
    config: CChartConfig | None = None,
) -> CChartResult:
    """Compute C Chart control limits and statistics.

    UCL_i = min(ni*u_bar + K*sqrt(ni*u_bar), ...) -- no upper clamp
    CL_i  = ni*u_bar
    LCL_i = max(ni*u_bar - K*sqrt(ni*u_bar), 0)

    Parameters
    ----------
    defects:
        1-D array of defect counts per subgroup.
    n_units:
        1-D array of inspection unit counts per subgroup (area of opportunity).
    config:
        CChartConfig with k_sigma (default 3.0).

    Returns
    -------
    CChartResult with counts, limits, u_bar, and sigma.
    """
    if config is None:
        config = CChartConfig()

    defects = np.asarray(defects, dtype=float)
    n_units = np.asarray(n_units, dtype=float)

    u_bar = compute_u_bar(defects, n_units)

    # sigma in count units: sqrt(ni * u_bar)
    sigma = np.sqrt(n_units * u_bar)

    cl = n_units * u_bar
    ucl = cl + config.k_sigma * sigma
    lcl = np.maximum(cl - config.k_sigma * sigma, 0.0)

    limits = ControlLimits(ucl=ucl, cl=cl, lcl=lcl, k_sigma=config.k_sigma)

    return CChartResult(
        counts=defects,
        limits=limits,
        u_bar=u_bar,
        sigma=sigma,
    )
