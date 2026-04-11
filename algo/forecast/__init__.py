"""
Time series forecasting via FLAML AutoML.

Provides automated model selection (ARIMA, ETS, Theta, etc.)
with prediction intervals and drift scoring for SPC charts.
"""

from .models import ForecastConfig, ForecastResult
from .compute import compute_forecast, predict_from_fitted
from .drift import compute_drift_score, estimate_ooc

__all__ = [
    "ForecastConfig",
    "ForecastResult",
    "compute_forecast",
    "predict_from_fitted",
    "compute_drift_score",
    "estimate_ooc",
]
