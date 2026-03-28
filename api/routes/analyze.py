"""Analysis endpoints — run algo pipeline and retrieve cached results."""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Analysis, Dataset
from ..schemas import (
    AnalysisRequest,
    AnalysisResult,
    CapabilityOut,
    LimitsOut,
    RuleViolationOut,
    SigmaOut,
    ZonesOut,
)
from ..services.analysis import run_analysis

router = APIRouter(prefix="/api/datasets", tags=["analysis"])


@router.post("/{dataset_id}/analyze", response_model=AnalysisResult, status_code=201)
async def analyze_dataset(
    dataset_id: str,
    request: AnalysisRequest,
    session: AsyncSession = Depends(get_db),
):
    """Run the analysis pipeline on a dataset."""
    dataset = await session.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail=f"Dataset '{dataset_id}' not found")

    try:
        return await run_analysis(session, dataset_id, request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/{dataset_id}/analysis", response_model=AnalysisResult)
async def get_analysis(
    dataset_id: str,
    session: AsyncSession = Depends(get_db),
):
    """Retrieve the most recent cached analysis for a dataset."""
    stmt = (
        select(Analysis)
        .where(Analysis.dataset_id == dataset_id)
        .order_by(Analysis.created_at.desc())
        .limit(1)
    )
    result = await session.execute(stmt)
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(
            status_code=404,
            detail=f"No analysis found for dataset '{dataset_id}'. Run POST .../analyze first.",
        )

    sigma_data = json.loads(row.sigma)
    limits_data = json.loads(row.limits)
    zones_data = json.loads(row.zones)
    capability_data = json.loads(row.capability) if row.capability else None

    return AnalysisResult(
        id=row.id,
        dataset_id=row.dataset_id,
        sigma=SigmaOut(**sigma_data),
        limits=LimitsOut(**limits_data),
        zones=ZonesOut(**zones_data),
        capability=CapabilityOut(**capability_data) if capability_data else None,
        created_at=row.created_at.isoformat() if hasattr(row.created_at, "isoformat") else str(row.created_at),
    )
