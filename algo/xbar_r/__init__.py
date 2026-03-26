"""XBar-R (mean and range) control chart."""
from .compute import compute_xbar_r
from .models import XBarRConfig, XBarRResult

__all__ = ["XBarRConfig", "XBarRResult", "compute_xbar_r"]
