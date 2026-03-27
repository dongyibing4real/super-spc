"""
Data models for the Run Chart.
"""
import attrs
import numpy as np


@attrs.define(slots=True)
class RunChartConfig:
    """Configuration for a Run Chart.

    Parameters
    ----------
    center_method:
        How to compute the center line. Either "median" (default) or "mean".
    """

    center_method: str = attrs.field(default="median")

    @center_method.validator
    def _validate_center_method(self, attribute: attrs.Attribute, value: str) -> None:  # type: ignore[type-arg]
        if value not in ("median", "mean"):
            raise ValueError(
                f"center_method must be 'median' or 'mean', got {value!r}"
            )


@attrs.define(slots=True)
class RunChartResult:
    """Result of computing a Run Chart.

    Parameters
    ----------
    values:
        The original data values.
    center:
        The computed center line (median or mean of the data).
    n_runs:
        Number of runs — consecutive sequences of points all above or all
        below the center line. Points exactly on the center line are excluded.
    expected_runs:
        Expected number of runs under the null hypothesis of randomness:
        (2 * n1 * n2) / (n1 + n2) + 1, where n1 = #above, n2 = #below.
    p_value:
        Two-sided p-value from the runs test (0 <= p_value <= 1).
    """

    values: np.ndarray
    center: float
    n_runs: int
    expected_runs: float
    p_value: float
