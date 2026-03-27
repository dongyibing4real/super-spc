"""Dataset endpoints — list, get, upload, delete, and export."""
from __future__ import annotations

import csv
import io
import json

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..database import get_db
from ..models import Dataset, Measurement
from ..schemas import DatasetSummary, MeasurementOut
from ..services.csv_parser import parse_csv

router = APIRouter(prefix="/api/datasets", tags=["datasets"])


async def _get_dataset_or_404(
    session: AsyncSession, dataset_id: str
) -> Dataset:
    """Fetch a dataset by ID or raise 404."""
    dataset = await session.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail=f"Dataset '{dataset_id}' not found")
    return dataset


@router.get("", response_model=list[DatasetSummary])
async def list_datasets(session: AsyncSession = Depends(get_db)):
    """List all datasets with point counts."""
    stmt = (
        select(
            Dataset,
            func.count(Measurement.id).label("point_count"),
        )
        .outerjoin(Measurement)
        .group_by(Dataset.id)
        .order_by(Dataset.created_at.desc())
    )
    result = await session.execute(stmt)
    return [
        DatasetSummary(
            id=ds.id,
            name=ds.name,
            created_at=ds.created_at.isoformat() if hasattr(ds.created_at, "isoformat") else str(ds.created_at),
            point_count=count,
            metadata=json.loads(ds.metadata_json) if ds.metadata_json else None,
        )
        for ds, count in result.all()
    ]


@router.get("/{dataset_id}", response_model=DatasetSummary)
async def get_dataset(dataset_id: str, session: AsyncSession = Depends(get_db)):
    """Get a single dataset summary."""
    ds = await _get_dataset_or_404(session, dataset_id)
    stmt = select(func.count(Measurement.id)).where(Measurement.dataset_id == dataset_id)
    count = (await session.execute(stmt)).scalar() or 0

    return DatasetSummary(
        id=ds.id,
        name=ds.name,
        created_at=ds.created_at.isoformat() if hasattr(ds.created_at, "isoformat") else str(ds.created_at),
        point_count=count,
        metadata=json.loads(ds.metadata_json) if ds.metadata_json else None,
    )


@router.get("/{dataset_id}/points", response_model=list[MeasurementOut])
async def get_points(dataset_id: str, session: AsyncSession = Depends(get_db)):
    """Get all measurements for a dataset, ordered by sequence index."""
    await _get_dataset_or_404(session, dataset_id)

    stmt = (
        select(Measurement)
        .where(Measurement.dataset_id == dataset_id)
        .order_by(Measurement.sequence_index)
    )
    result = await session.execute(stmt)
    return [
        MeasurementOut(
            id=m.id,
            value=m.value,
            subgroup=m.subgroup,
            sequence_index=m.sequence_index,
            metadata=json.loads(m.metadata_json) if m.metadata_json else None,
        )
        for m in result.scalars().all()
    ]


@router.post("/upload", response_model=DatasetSummary, status_code=201)
async def upload_dataset(
    file: UploadFile,
    session: AsyncSession = Depends(get_db),
):
    """Upload a CSV file and create a new dataset."""
    content = await file.read()
    try:
        parsed = parse_csv(content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    name = file.filename or "Untitled"
    if name.lower().endswith(".csv"):
        name = name[:-4]

    metadata = {
        "value_column": parsed.value_column,
        "subgroup_column": parsed.subgroup_column,
        "skipped_rows": parsed.skipped_rows,
    }

    dataset = Dataset(
        name=name,
        metadata_json=json.dumps(metadata),
    )

    for m in parsed.measurements:
        dataset.measurements.append(
            Measurement(
                value=m.value,
                subgroup=m.subgroup,
                sequence_index=m.sequence_index,
                metadata_json=json.dumps(m.metadata) if m.metadata else None,
            )
        )

    session.add(dataset)
    await session.commit()
    await session.refresh(dataset)

    return DatasetSummary(
        id=dataset.id,
        name=dataset.name,
        created_at=dataset.created_at.isoformat() if hasattr(dataset.created_at, "isoformat") else str(dataset.created_at),
        point_count=len(parsed.measurements),
        metadata=metadata,
    )


@router.delete("/{dataset_id}", status_code=204)
async def delete_dataset(dataset_id: str, session: AsyncSession = Depends(get_db)):
    """Delete a dataset and all associated data (cascading)."""
    ds = await _get_dataset_or_404(session, dataset_id)
    await session.delete(ds)
    await session.commit()


@router.get("/{dataset_id}/export")
async def export_dataset(dataset_id: str, session: AsyncSession = Depends(get_db)):
    """Export dataset measurements as a CSV download."""
    ds = await _get_dataset_or_404(session, dataset_id)

    stmt = (
        select(Measurement)
        .where(Measurement.dataset_id == dataset_id)
        .order_by(Measurement.sequence_index)
    )
    result = await session.execute(stmt)
    measurements = result.scalars().all()

    # Build CSV in memory
    output = io.StringIO()
    writer = csv.writer(output)

    # Determine all metadata keys across rows for consistent columns
    meta_keys: list[str] = []
    for m in measurements:
        if m.metadata_json:
            meta = json.loads(m.metadata_json)
            for k in meta:
                if k not in meta_keys:
                    meta_keys.append(k)

    header = ["value", "subgroup", "sequence_index"] + meta_keys
    writer.writerow(header)

    for m in measurements:
        meta = json.loads(m.metadata_json) if m.metadata_json else {}
        row_data = [m.value, m.subgroup or "", m.sequence_index]
        row_data.extend(meta.get(k, "") for k in meta_keys)
        writer.writerow(row_data)

    csv_content = output.getvalue()
    filename = f"{ds.name}.csv"

    return StreamingResponse(
        io.BytesIO(csv_content.encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
