"""
Short Run control chart algorithm.

Handles multiple products/part families by transforming measurements
to remove product-to-product differences before charting.
"""
from .short_run import ShortRunConfig, ShortRunResult, compute_short_run

__all__ = ["ShortRunConfig", "ShortRunResult", "compute_short_run"]
