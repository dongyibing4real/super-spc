"""XBar-S (mean and standard deviation) control chart."""
from .compute import compute_xbar_s
from .models import XBarSConfig, XBarSResult

__all__ = ["XBarSConfig", "XBarSResult", "compute_xbar_s"]
