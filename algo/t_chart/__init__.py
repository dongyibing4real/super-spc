"""
T Chart (Time-between-events) control chart algorithm.

Fits a Weibull distribution to inter-arrival times and uses
normal-probability-matching quantiles for control limits.
"""
from .t_chart import TChartConfig, TChartResult, compute_t_chart

__all__ = ["TChartConfig", "TChartResult", "compute_t_chart"]
