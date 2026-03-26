"""
G Chart algorithm for overdispersed count data.

Uses chi-squared quantiles with degrees of freedom derived from the
negative-binomial overdispersion parameter k_param.
"""
import attrs
import numpy as np
from scipy.stats import chi2, norm

from ..common.types import ControlLimits
from ..common.validators import validate_positive, validate_1d_array, validate_non_empty


@attrs.define(slots=True)
class GChartConfig:
    """Configuration for G chart computation."""

    k_sigma: float = attrs.field(default=3.0)

    @k_sigma.validator
    def _validate_k_sigma(self, attribute, value):
        validate_positive(value, "k_sigma")


@attrs.define(slots=True)
class GChartResult:
    """Result of G chart computation."""

    values: np.ndarray
    limits: ControlLimits
    mu: float
    k_param: float


def compute_g_chart(data: np.ndarray, config: GChartConfig | None = None) -> GChartResult:
    """Compute G chart limits for count data.

    Parameters
    ----------
    data:
        1-D array of non-negative integer counts.
    config:
        GChartConfig with k_sigma (default 3.0).

    Returns
    -------
    GChartResult with values, limits, mu, and k_param.
    """
    if config is None:
        config = GChartConfig()

    data = np.asarray(data, dtype=float)
    validate_1d_array(data, "data")
    validate_non_empty(data, "data")

    K = config.k_sigma
    mu = float(np.mean(data))

    if mu > 0:
        var = float(np.var(data, ddof=1))
        k_param = max((var / mu - 1.0), 0.0)
    else:
        k_param = 0.0

    # Degrees of freedom for chi-squared approximation
    v = 2.0 / (1.0 + k_param)

    alpha = float(norm.cdf(-K))

    ucl_raw = (chi2.ppf(1.0 - alpha, v) * (1.0 + k_param) - 1.0) / 2.0
    lcl_raw = (chi2.ppf(alpha, v) * (1.0 + k_param) - 1.0) / 2.0

    ucl_val = float(ucl_raw)
    lcl_val = float(max(lcl_raw, 0.0))
    cl_val = mu

    n = len(data)
    limits = ControlLimits(
        ucl=np.full(n, ucl_val),
        cl=np.full(n, cl_val),
        lcl=np.full(n, lcl_val),
        k_sigma=K,
    )

    return GChartResult(
        values=data,
        limits=limits,
        mu=mu,
        k_param=k_param,
    )
