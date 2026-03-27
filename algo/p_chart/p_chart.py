"""
P Chart implementation (proportion defective, binomial model).
"""
import attrs
import numpy as np

from algo.common.attribute import compute_binomial_limits, compute_p_bar
from algo.common.sigma import sigma_binomial
from algo.common.types import ControlLimits
from algo.common.validators import validate_positive


@attrs.define(slots=True)
class PChartConfig:
    """Configuration for a P Chart.

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
class PChartResult:
    """Result of a P Chart computation.

    Parameters
    ----------
    proportions:
        Per-subgroup proportion defective (defectives / n_trials).
    limits:
        Per-subgroup control limits (UCL, CL, LCL).
    p_bar:
        Overall pooled proportion defective.
    sigma:
        Per-subgroup binomial sigma values.
    """

    proportions: np.ndarray
    limits: ControlLimits
    p_bar: float
    sigma: np.ndarray


def p_chart(
    defectives: np.ndarray,
    n_trials: np.ndarray,
    config: PChartConfig | None = None,
) -> PChartResult:
    """Compute P Chart control limits and statistics.

    Parameters
    ----------
    defectives:
        1-D array of defective counts per subgroup.
    n_trials:
        1-D array of sample sizes per subgroup.
    config:
        PChartConfig with k_sigma (default 3.0).

    Returns
    -------
    PChartResult with proportions, limits, p_bar, and sigma.
    """
    if config is None:
        config = PChartConfig()

    defectives = np.asarray(defectives, dtype=float)
    n_trials = np.asarray(n_trials, dtype=float)

    proportions = defectives / n_trials
    p_bar = compute_p_bar(defectives, n_trials)
    limits = compute_binomial_limits(p_bar, n_trials, k_sigma=config.k_sigma)
    sigma = sigma_binomial(p_bar, n_trials)

    return PChartResult(
        proportions=proportions,
        limits=limits,
        p_bar=p_bar,
        sigma=sigma,
    )
