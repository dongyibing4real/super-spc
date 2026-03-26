"""
Three Way chart algorithm.

Decomposes total variation into within-subgroup (sigma_within),
between-subgroup (sigma_between), and combined (sigma_bw) components,
producing separate between and within control charts.
"""
from .three_way import ThreeWayConfig, ThreeWayResult, compute_three_way

__all__ = ["ThreeWayConfig", "ThreeWayResult", "compute_three_way"]
