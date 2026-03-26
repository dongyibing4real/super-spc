"""
Enumerations used throughout the algo package.
"""
from enum import StrEnum


class SigmaMethod(StrEnum):
    RANGE = "range"
    STDDEV = "stddev"
    MOVING_RANGE = "moving_range"
    MEDIAN_MOVING_RANGE = "median_moving_range"
    LEVEY_JENNINGS = "levey_jennings"
    BINOMIAL = "binomial"
    POISSON = "poisson"


class ScalingMethod(StrEnum):
    CENTERED = "centered"
    STANDARDIZED = "standardized"


class WithinMethod(StrEnum):
    RANGE = "range"
    STDDEV = "stddev"


class BetweenMethod(StrEnum):
    MOVING_RANGE = "mr"
    MEDIAN_MOVING_RANGE = "median_mr"
