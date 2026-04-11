"""Forecast endpoints — run FLAML time series forecasting."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Dataset
from ..schemas import ForecastPredictRequest, ForecastRequest, ForecastResponse
from ..services.forecast import predict_horizon, run_forecast

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/datasets", tags=["forecast"])


@router.post("/{dataset_id}/forecast", response_model=ForecastResponse, status_code=201)
async def forecast_dataset(
    dataset_id: str,
    request: ForecastRequest,
    session: AsyncSession = Depends(get_db),
):
    """Run FLAML time series forecast on a dataset."""
    dataset = await session.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail=f"Dataset '{dataset_id}' not found")

    try:
        return await run_forecast(session, dataset_id, request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except MemoryError:
        raise HTTPException(status_code=413, detail="Dataset too large for forecasting")
    except Exception as exc:
        logger.exception("Forecast failed for dataset %s", dataset_id)
        raise HTTPException(status_code=500, detail=f"Forecast computation failed: {type(exc).__name__}")


@router.post(
    "/{dataset_id}/forecast/predict",
    response_model=ForecastResponse,
    status_code=200,
)
async def forecast_predict(
    dataset_id: str,
    request: ForecastPredictRequest,
    session: AsyncSession = Depends(get_db),
):
    """Re-predict with a new horizon using cached model.

    Falls back to full fit if no cached model is available.
    """
    dataset = await session.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail=f"Dataset '{dataset_id}' not found")

    try:
        return await predict_horizon(session, dataset_id, request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except MemoryError:
        raise HTTPException(status_code=413, detail="Dataset too large for forecasting")
    except Exception as exc:
        logger.exception("Forecast predict failed for dataset %s", dataset_id)
        raise HTTPException(status_code=500, detail=f"Forecast computation failed: {type(exc).__name__}")
