"""
G Chart (Geometric/Negative Binomial) control chart algorithm.

Handles count data that may be overdispersed relative to Poisson.
"""
from .g_chart import GChartConfig, GChartResult, compute_g_chart

__all__ = ["GChartConfig", "GChartResult", "compute_g_chart"]
