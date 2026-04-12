"""Forecast service — orchestrates FLAML forecasting from API parameters."""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import sys
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass, field

import numpy as np
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from algo.forecast import ForecastConfig, ForecastResult, compute_forecast, predict_from_fitted

from ..models import Analysis, DataRow, DatasetColumn
from ..schemas import (
    DriftSummaryOut,
    ForecastConfidenceOut,
    ForecastPointOut,
    ForecastPredictRequest,
    ForecastRequest,
    ForecastResponse,
)

logger = logging.getLogger(__name__)

# Cache configuration
_MAX_CACHE = 16
_TTL_SECONDS = 3600  # 1 hour
_MAX_MEMORY_BYTES = 512 * 1024 * 1024  # 512 MB


@dataclass
class _CacheEntry:
    automl: object
    values: np.ndarray
    col_name: str
    limits: dict | None
    created_at: float = field(default_factory=time.monotonic)

    @property
    def memory_bytes(self) -> int:
        size = self.values.nbytes
        size += sys.getsizeof(self.automl) if self.automl else 0
        size += 1024  # overhead for limits, strings, etc.
        return size

    @property
    def is_expired(self) -> bool:
        return (time.monotonic() - self.created_at) > _TTL_SECONDS

    def as_tuple(self) -> tuple:
        return (self.automl, self.values, self.col_name, self.limits)


_model_cache: OrderedDict[str, _CacheEntry] = OrderedDict()
_cache_lock = threading.Lock()


def _evict_expired() -> None:
    """Remove all expired entries. Must be called with _cache_lock held."""
    expired = [k for k, v in _model_cache.items() if v.is_expired]
    for k in expired:
        del _model_cache[k]


def _total_memory() -> int:
    """Total memory used by all cache entries. Must be called with _cache_lock held."""
    return sum(e.memory_bytes for e in _model_cache.values())


def _cache_put(key: str, entry: _CacheEntry) -> None:
    """Insert entry, evicting as needed. Must be called with _cache_lock held."""
    _evict_expired()
    _model_cache[key] = entry
    _model_cache.move_to_end(key)
    # Evict oldest entries until under count and memory limits
    while len(_model_cache) > _MAX_CACHE or _total_memory() > _MAX_MEMORY_BYTES:
        if len(_model_cache) <= 1:
            break
        evicted_key, _ = _model_cache.popitem(last=False)
        logger.debug("Evicted forecast cache entry: %s", evicted_key)


def _cache_get(key: str) -> _CacheEntry | None:
    """Get entry if it exists and is not expired. Must be called with _cache_lock held."""
    entry = _model_cache.get(key)
    if entry is None:
        return None
    if entry.is_expired:
        del _model_cache[key]
        return None
    # Move to end (LRU)
    _model_cache.move_to_end(key)
    return entry


def _cache_key(dataset_id: str, value_column: str, data_hash: str) -> str:
    return f"{dataset_id}:{value_column}:{data_hash}"


def _data_hash(values: np.ndarray) -> str:
    return hashlib.md5(values.tobytes()).hexdigest()


def _build_drift_summary(score: float, ooc_estimate: int | None) -> DriftSummaryOut:
    if score > 0.7:
        intent = "danger"
        label = "High drift"
    elif score > 0.3:
        intent = "warning"
        label = "Approaching drift"
    else:
        intent = "success"
        label = "Low drift"
    return DriftSummaryOut(
        score=score,
        intent=intent,
        ooc_estimate=ooc_estimate,
        label=label,
    )


async def _load_values(
    session: AsyncSession,
    dataset_id: str,
    value_column: str | None,
) -> tuple[np.ndarray, str]:
    """Load measurement values for a dataset, returning (values, column_name)."""
    # Resolve value column
    if value_column is None:
        col_stmt = (
            select(DatasetColumn)
            .where(DatasetColumn.dataset_id == dataset_id)
            .where(DatasetColumn.role == "value")
        )
        col_result = await session.execute(col_stmt)
        col = col_result.scalar_one_or_none()
        if col is None:
            raise ValueError("No value column assigned. Set a column role to 'value' first.")
        value_column = col.name

    # Load data rows in order
    stmt = (
        select(DataRow)
        .where(DataRow.dataset_id == dataset_id)
        .order_by(DataRow.sequence_index)
    )
    result = await session.execute(stmt)
    rows = result.scalars().all()

    if not rows:
        raise ValueError("Dataset has no data rows.")

    values = []
    for row in rows:
        raw = json.loads(row.raw_json)
        val = raw.get(value_column)
        if val is not None:
            try:
                values.append(float(val))
            except (ValueError, TypeError):
                continue

    return np.array(values, dtype=float), value_column


async def _load_limits(
    session: AsyncSession,
    dataset_id: str,
) -> dict | None:
    """Load the most recent analysis limits for OOC estimation."""
    stmt = (
        select(Analysis)
        .where(Analysis.dataset_id == dataset_id)
        .order_by(Analysis.created_at.desc())
        .limit(1)
    )
    result = await session.execute(stmt)
    analysis = result.scalar_one_or_none()
    if analysis is None:
        return None

    limits_data = json.loads(analysis.limits)
    ucl_list = limits_data.get("ucl", [])
    lcl_list = limits_data.get("lcl", [])
    if not ucl_list or not lcl_list:
        return None
    return {"ucl": ucl_list[-1], "lcl": lcl_list[-1]}


def _to_response(result: ForecastResult, cache_key: str | None = None) -> ForecastResponse:
    """Convert ForecastResult to ForecastResponse schema."""
    return ForecastResponse(
        projected=[ForecastPointOut(**p) for p in result.projected],
        confidence=[ForecastConfidenceOut(**c) for c in result.confidence],
        drift=_build_drift_summary(result.drift_score, result.ooc_estimate),
        model_name=result.model_name,
        fit_time_ms=result.fit_time_ms,
        cache_key=cache_key,
    )


async def run_forecast(
    session: AsyncSession,
    dataset_id: str,
    request: ForecastRequest,
) -> ForecastResponse:
    """Full fit + predict forecast."""
    # Use inline values if provided (per-chart isolation), else load from DB
    if request.values is not None:
        values = np.array(request.values, dtype=float)
        col_name = "_inline"
    else:
        values, col_name = await _load_values(session, dataset_id, request.value_column)

    # Use inline limits if provided, else load from latest analysis
    limits = request.limits if request.limits is not None else await _load_limits(session, dataset_id)

    config = ForecastConfig(
        horizon=request.horizon,
        confidence_level=request.confidence_level,
        time_budget=request.time_budget,
    )

    # Offload CPU-bound FLAML fitting to thread pool to avoid blocking event loop
    loop = asyncio.get_running_loop()
    result, automl_instance = await loop.run_in_executor(
        None, lambda: compute_forecast(values, config, limits=limits)
    )

    # Cache the fitted model for fast horizon re-predictions
    key = _cache_key(dataset_id, col_name, _data_hash(values))
    with _cache_lock:
        _cache_put(key, _CacheEntry(automl=automl_instance, values=values, col_name=col_name, limits=limits))

    return _to_response(result, cache_key=key)


async def predict_horizon(
    session: AsyncSession,
    dataset_id: str,
    request: ForecastPredictRequest,
) -> ForecastResponse:
    """Re-predict with a new horizon using cached model.

    Uses cache_key from the initial forecast to find the right per-chart model.
    Falls back to full fit if no cached model exists.
    """
    # Look for cached entry using the provided cache key
    key = request.cache_key
    cached = None
    if key:
        with _cache_lock:
            cached = _cache_get(key)

    if cached is not None and cached.automl is not None:
        automl_instance, train_values, _, limits = cached.as_tuple()
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            None, lambda: predict_from_fitted(
                automl_instance, train_values,
                horizon=request.horizon,
                confidence_level=request.confidence_level,
                limits=limits,
            )
        )
        return _to_response(result, cache_key=key)

    # No cached model — do full fit from DB values
    values, col_name = await _load_values(session, dataset_id, None)
    limits = await _load_limits(session, dataset_id)
    config = ForecastConfig(
        horizon=request.horizon,
        confidence_level=request.confidence_level,
    )
    loop = asyncio.get_running_loop()
    result, automl_instance = await loop.run_in_executor(
        None, lambda: compute_forecast(values, config, limits=limits)
    )

    # Cache for future horizon adjustments
    fallback_key = _cache_key(dataset_id, col_name, _data_hash(values))
    with _cache_lock:
        _cache_put(fallback_key, _CacheEntry(automl=automl_instance, values=values, col_name=col_name, limits=limits))

    return _to_response(result, cache_key=fallback_key)
