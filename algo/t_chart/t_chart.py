"""
T Chart algorithm for time-between-events data.

Fits a Weibull distribution (with fixed location=0) to non-zero inter-arrival
times, then derives control limits by probability-matching to normal quantiles.
"""
import attrs
import numpy as np
from scipy.stats import norm, weibull_min

from ..common.types import ControlLimits
from ..common.validators import validate_positive, validate_1d_array, validate_non_empty


@attrs.define(slots=True)
class TChartConfig:
    """Configuration for T chart computation."""

    k_sigma: float = attrs.field(default=3.0)

    @k_sigma.validator
    def _validate_k_sigma(self, attribute, value):
        validate_positive(value, "k_sigma")


@attrs.define(slots=True)
class TChartResult:
    """Result of T chart computation."""

    values: np.ndarray
    limits: ControlLimits
    alpha: float   # Weibull shape parameter
    beta: float    # Weibull scale parameter


def compute_t_chart(data: np.ndarray, config: TChartConfig | None = None) -> TChartResult:
    """Compute T chart limits for time-between-events data.

    Parameters
    ----------
    data:
        1-D array of inter-arrival times (may include zeros, which are excluded
        from Weibull fitting).
    config:
        TChartConfig with k_sigma (default 3.0).

    Returns
    -------
    TChartResult with values, limits (UCL/CL/LCL scalars broadcast to data length),
    Weibull shape (alpha), and scale (beta).

    Raises
    ------
    ValueError
        If fewer than 2 non-zero values are present in data.
    """
    if config is None:
        config = TChartConfig()

    data = np.asarray(data, dtype=float)
    validate_1d_array(data, "data")
    validate_non_empty(data, "data")

    K = config.k_sigma

    # Exclude zeros
    nonzero = data[data > 0.0]
    if len(nonzero) < 2:
        raise ValueError(
            f"T chart requires at least 2 non-zero values; got {len(nonzero)}"
        )

    # Fit Weibull with fixed location=0
    shape, _loc, scale = weibull_min.fit(nonzero, floc=0)

    # Probability-matching: map normal quantiles to Weibull quantiles
    p1 = float(norm.cdf(-K))   # lower tail probability
    p2 = 0.5                    # median → center line
    p3 = float(norm.cdf(K))    # upper tail probability

    lcl_val = float(max(weibull_min.ppf(p1, shape, scale=scale), 0.0))
    cl_val = float(weibull_min.ppf(p2, shape, scale=scale))
    ucl_val = float(weibull_min.ppf(p3, shape, scale=scale))

    n = len(data)
    limits = ControlLimits(
        ucl=np.full(n, ucl_val),
        cl=np.full(n, cl_val),
        lcl=np.full(n, lcl_val),
        k_sigma=K,
    )

    return TChartResult(
        values=data,
        limits=limits,
        alpha=float(shape),
        beta=float(scale),
    )
