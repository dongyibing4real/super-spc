"""Standalone R (range) control chart."""
from .compute import compute_r_chart
from .models import RChartConfig, RChartResult

__all__ = ["RChartConfig", "RChartResult", "compute_r_chart"]
