"""FLAML-based time series forecasting."""
from __future__ import annotations

import time
import logging

import numpy as np
import pandas as pd
from flaml.automl.automl import AutoML

from .models import ForecastConfig, ForecastResult
from .drift import compute_drift_score, estimate_ooc

logger = logging.getLogger(__name__)

_MIN_POINTS = 10


def _detect_period(values: np.ndarray) -> int:
    """Auto-detect seasonal period via autocorrelation peak.

    Scans periods 4-48 and picks the lag with the highest
    autocorrelation. Falls back to 1 (no seasonality).
    """
    n = len(values)
    if n < 12:
        return 1
    mean = values.mean()
    demeaned = values - mean
    var = np.sum(demeaned ** 2)
    if var == 0:
        return 1

    max_lag = min(48, n // 2)
    best_lag = 1
    best_acf = -1.0
    for lag in range(4, max_lag + 1):
        acf = np.sum(demeaned[:n - lag] * demeaned[lag:]) / var
        if acf > best_acf:
            best_acf = acf
            best_lag = lag

    return best_lag if best_acf > 0.3 else 1


def _compute_slope(values: np.ndarray) -> float:
    """Simple linear regression slope for drift scoring."""
    n = len(values)
    if n < 2:
        return 0.0
    x = np.arange(n, dtype=float)
    x_mean = x.mean()
    y_mean = values.mean()
    denom = np.sum((x - x_mean) ** 2)
    if denom == 0:
        return 0.0
    return float(np.sum((x - x_mean) * (values - y_mean)) / denom)


def _compute_prediction_intervals(
    automl: AutoML,
    train_values: np.ndarray,
    horizon: int,
    projected_values: np.ndarray,
    confidence_level: float,
) -> tuple[np.ndarray, np.ndarray]:
    """Compute prediction intervals from residuals.

    FLAML does not always expose native prediction intervals,
    so we use residual-based expanding intervals as a fallback.
    """
    from scipy import stats

    # Get in-sample predictions for residual estimation
    n = len(train_values)
    try:
        in_sample_pred = automl.predict(
            pd.DataFrame({"ds": pd.date_range("2000-01-01", periods=n, freq="D")})
        )
        residuals = train_values - in_sample_pred[:n]
        sigma_resid = float(np.std(residuals, ddof=1))
    except (ValueError, AttributeError, RuntimeError) as exc:
        # Fallback: use overall sigma when in-sample prediction unavailable
        logger.warning("In-sample prediction failed, using overall sigma: %s", exc)
        sigma_resid = float(np.std(train_values, ddof=1))

    if sigma_resid == 0:
        sigma_resid = 1e-10

    alpha = 1.0 - confidence_level
    z = stats.norm.ppf(1.0 - alpha / 2.0)

    # Expanding intervals: uncertainty grows with sqrt(h)
    h_indices = np.arange(1, horizon + 1, dtype=float)
    widths = z * sigma_resid * np.sqrt(1.0 + h_indices / (n / 2.0))

    upper = projected_values + widths
    lower = projected_values - widths

    return upper, lower


def compute_forecast(
    values: np.ndarray,
    config: ForecastConfig,
    limits: dict | None = None,
) -> tuple[ForecastResult, AutoML]:
    """Run FLAML AutoML time series forecast.

    Parameters
    ----------
    values : np.ndarray
        1-D array of observed values (chronological order).
    config : ForecastConfig
        Forecast configuration.
    limits : dict | None
        Optional dict with 'ucl' and 'lcl' keys for OOC estimation.

    Returns
    -------
    tuple of (ForecastResult, AutoML)
        The result and the fitted AutoML instance (for caching).
    """
    if len(values) < _MIN_POINTS:
        raise ValueError(
            f"Need at least {_MIN_POINTS} data points for forecasting, "
            f"got {len(values)}"
        )

    n = len(values)
    period = config.period if config.period is not None else _detect_period(values)
    # FLAML holdout splits data ~50/50; period must leave enough training points
    max_period = max(1, n // 3)
    period = min(period, max_period)

    # Build training DataFrame with datetime index (FLAML requirement)
    dates = pd.date_range("2000-01-01", periods=n, freq="D")
    train_df = pd.DataFrame({"ds": dates, "y": values})

    # Fit FLAML AutoML
    automl = AutoML()
    t0 = time.time()

    automl_settings = {
        "task": "ts_forecast",
        "time_budget": config.time_budget,
        "metric": "mape",
        "eval_method": "holdout",
        "label": "y",
        "period": period,
        "log_training_metric": False,
        "verbose": 0,
    }

    automl.fit(dataframe=train_df, **automl_settings)
    fit_time_ms = int((time.time() - t0) * 1000)

    model_name = getattr(automl, "best_estimator", "unknown")

    # Predict future values
    future_dates = pd.date_range(
        dates[-1] + pd.Timedelta(days=1),
        periods=config.horizon,
        freq="D",
    )
    future_df = pd.DataFrame({"ds": future_dates})
    predicted = automl.predict(future_df)
    predicted = np.asarray(predicted, dtype=float).ravel()

    # Anchor: shift predictions so the first predicted point is continuous
    # with the last observed value. Tree-based models (lgbm, rf) often
    # produce a discontinuous jump at the boundary.
    last_observed = float(values[-1])
    offset = last_observed - predicted[0]
    if abs(offset) > 1e-10:
        predicted = predicted + offset

    # Build projected points (x is 1-based from projection start)
    start_x = n
    projected = [
        {"x": start_x + i, "y": float(predicted[i])}
        for i in range(config.horizon)
    ]

    # Prediction intervals
    upper, lower = _compute_prediction_intervals(
        automl, values, config.horizon, predicted, config.confidence_level
    )
    confidence = [
        {"x": start_x + i, "upper": float(upper[i]), "lower": float(lower[i])}
        for i in range(config.horizon)
    ]

    # Drift scoring
    slope = _compute_slope(values)
    sigma = float(np.std(values, ddof=1)) if n > 1 else 0.0
    drift_score = compute_drift_score(slope, sigma, n)

    # OOC estimation
    ucl = limits.get("ucl") if limits else None
    lcl = limits.get("lcl") if limits else None
    ooc_estimate = estimate_ooc(projected, ucl, lcl)

    result = ForecastResult(
        projected=projected,
        confidence=confidence,
        drift_score=drift_score,
        ooc_estimate=ooc_estimate,
        model_name=str(model_name),
        fit_time_ms=fit_time_ms,
    )
    return result, automl


def predict_from_fitted(
    automl: AutoML,
    train_values: np.ndarray,
    horizon: int,
    confidence_level: float = 0.95,
    limits: dict | None = None,
) -> ForecastResult:
    """Lightweight re-predict from an already-fitted FLAML model.

    Used for horizon adjustments without re-fitting.
    """
    n = len(train_values)
    start_date = pd.Timestamp("2000-01-01") + pd.Timedelta(days=n)
    future_dates = pd.date_range(start_date, periods=horizon, freq="D")
    future_df = pd.DataFrame({"ds": future_dates})

    predicted = automl.predict(future_df)
    predicted = np.asarray(predicted, dtype=float).ravel()

    # Anchor to last observed value
    last_observed = float(train_values[-1])
    offset = last_observed - predicted[0]
    if abs(offset) > 1e-10:
        predicted = predicted + offset

    start_x = n
    projected = [
        {"x": start_x + i, "y": float(predicted[i])}
        for i in range(horizon)
    ]

    upper, lower = _compute_prediction_intervals(
        automl, train_values, horizon, predicted, confidence_level
    )
    confidence = [
        {"x": start_x + i, "upper": float(upper[i]), "lower": float(lower[i])}
        for i in range(horizon)
    ]

    slope = _compute_slope(train_values)
    sigma = float(np.std(train_values, ddof=1)) if n > 1 else 0.0
    drift_score = compute_drift_score(slope, sigma, n)

    ucl = limits.get("ucl") if limits else None
    lcl = limits.get("lcl") if limits else None
    ooc_estimate = estimate_ooc(projected, ucl, lcl)

    model_name = getattr(automl, "best_estimator", "unknown")

    return ForecastResult(
        projected=projected,
        confidence=confidence,
        drift_score=drift_score,
        ooc_estimate=ooc_estimate,
        model_name=str(model_name),
        fit_time_ms=0,
    )
