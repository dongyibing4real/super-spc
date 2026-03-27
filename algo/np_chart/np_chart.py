"""
NP Chart implementation (number defective, binomial model).
"""
import attrs
import numpy as np

from algo.common.attribute import compute_p_bar
from algo.common.sigma import sigma_binomial
from algo.common.types import ControlLimits
from algo.common.validators import validate_positive


@attrs.define(slots=True)
class NPChartConfig:
    """Configuration for an NP Chart.

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
class NPChartResult:
    """Result of an NP Chart computation.

    Parameters
    ----------
    counts:
        Per-subgroup defective counts (same as input defectives).
    limits:
        Per-subgroup control limits (UCL, CL, LCL).
    p_bar:
        Overall pooled proportion defective.
    sigma:
        Per-subgroup binomial sigma values (in count units: sqrt(ni*p_bar*(1-p_bar))).
    """

    counts: np.ndarray
    limits: ControlLimits
    p_bar: float
    sigma: np.ndarray


def np_chart(
    defectives: np.ndarray,
    n_trials: np.ndarray,
    config: NPChartConfig | None = None,
) -> NPChartResult:
    """Compute NP Chart control limits and statistics.

    UCL_i = min(ni*p_bar + K*sqrt(ni*p_bar*(1-p_bar)), ni)
    CL_i  = ni*p_bar
    LCL_i = max(ni*p_bar - K*sqrt(ni*p_bar*(1-p_bar)), 0)

    Parameters
    ----------
    defectives:
        1-D array of defective counts per subgroup.
    n_trials:
        1-D array of sample sizes per subgroup.
    config:
        NPChartConfig with k_sigma (default 3.0).

    Returns
    -------
    NPChartResult with counts, limits, p_bar, and sigma.
    """
    if config is None:
        config = NPChartConfig()

    defectives = np.asarray(defectives, dtype=float)
    n_trials = np.asarray(n_trials, dtype=float)

    p_bar = compute_p_bar(defectives, n_trials)

    # sigma in count units: sqrt(ni * p_bar * (1 - p_bar))
    sigma = np.sqrt(n_trials * p_bar * (1.0 - p_bar))

    cl = n_trials * p_bar
    ucl = np.minimum(cl + config.k_sigma * sigma, n_trials)
    lcl = np.maximum(cl - config.k_sigma * sigma, 0.0)

    limits = ControlLimits(ucl=ucl, cl=cl, lcl=lcl, k_sigma=config.k_sigma)

    return NPChartResult(
        counts=defectives,
        limits=limits,
        p_bar=p_bar,
        sigma=sigma,
    )
