"""Standalone S (standard deviation) control chart."""
from .compute import compute_s_chart
from .models import SChartConfig, SChartResult

__all__ = ["SChartConfig", "SChartResult", "compute_s_chart"]
