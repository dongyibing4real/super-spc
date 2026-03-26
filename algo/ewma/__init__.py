"""EWMA subpackage: Exponentially Weighted Moving Average control chart."""

from .ewma import EWMAConfig, EWMAResult, compute_ewma

__all__ = ["EWMAConfig", "EWMAResult", "compute_ewma"]
