"""
Data models for the Presummarize control chart.
"""
import attrs
import numpy as np

from ..common.types import ControlLimits, SigmaResult, ZoneBreakdown
from ..common.validators import validate_positive


def _validate_sigma(instance: object, attribute: attrs.Attribute, value: float) -> None:  # type: ignore[type-arg]
    validate_positive(value, "sigma")


def _validate_k_sigma(instance: object, attribute: attrs.Attribute, value: float) -> None:  # type: ignore[type-arg]
    validate_positive(value, "k_sigma")


@attrs.define(slots=True)
class PresummarizeConfig:
    """Configuration for a Presummarize chart.

    Parameters
    ----------
    target:
        Known/specified process target (center line).
    sigma:
        Known/specified process sigma (must be positive).
    k_sigma:
        Number of sigma for control limits. Default 3.0.
    summary_stat:
        Statistic used to summarize each subgroup:
        "mean" (default), "median", or "individual" (pass-through).
    """

    target: float = attrs.field()
    sigma: float = attrs.field(validator=_validate_sigma)
    k_sigma: float = attrs.field(default=3.0, validator=_validate_k_sigma)
    summary_stat: str = attrs.field(default="mean")


@attrs.define(slots=True)
class PresummarizeResult:
    """Result of computing a Presummarize chart.

    Parameters
    ----------
    summary_values:
        Summarized per-unit values (mean, median, or individual).
    limits:
        Control limits based on known target/sigma.
    sigma:
        Sigma result (externally provided; method=LEVEY_JENNINGS).
    zones:
        Zone boundaries for Western Electric rule detection.
    target:
        The known/specified process target used for the center line.
    """

    summary_values: np.ndarray
    limits: ControlLimits
    sigma: SigmaResult
    zones: ZoneBreakdown
    target: float
