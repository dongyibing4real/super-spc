"""Dataset endpoints — list, get, upload, delete, export, column roles, raw data."""
from __future__ import annotations

import csv
import io
import json

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..database import get_db
from ..models import Analysis, Dataset, DatasetColumn, Measurement
from ..schemas import (
    ColumnOut,
    DatasetDetailOut,
    DatasetSummary,
    MeasurementOut,
    UpdateColumnsRequest,
)
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


def _build_summary(ds: Dataset, count: int) -> DatasetSummary:
    return DatasetSummary(
        id=ds.id,
        name=ds.name,
        created_at=ds.created_at.isoformat() if hasattr(ds.created_at, "isoformat") else str(ds.created_at),
        point_count=count,
        metadata=json.loads(ds.metadata_json) if ds.metadata_json else None,
    )


def _build_detail(ds: Dataset, columns: list[DatasetColumn], count: int) -> DatasetDetailOut:
    return DatasetDetailOut(
        id=ds.id,
        name=ds.name,
        created_at=ds.created_at.isoformat() if hasattr(ds.created_at, "isoformat") else str(ds.created_at),
        columns=[
            ColumnOut(name=c.name, ordinal=c.ordinal, dtype=c.dtype, role=c.role)
            for c in sorted(columns, key=lambda c: c.ordinal)
        ],
        point_count=count,
        metadata=json.loads(ds.metadata_json) if ds.metadata_json else None,
    )


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
    return [_build_summary(ds, count) for ds, count in result.all()]


@router.get("/{dataset_id}", response_model=DatasetDetailOut)
async def get_dataset(dataset_id: str, session: AsyncSession = Depends(get_db)):
    """Get a dataset with column metadata."""
    ds = await _get_dataset_or_404(session, dataset_id)

    col_stmt = select(DatasetColumn).where(DatasetColumn.dataset_id == dataset_id)
    columns = (await session.execute(col_stmt)).scalars().all()

    count_stmt = select(func.count(Measurement.id)).where(Measurement.dataset_id == dataset_id)
    count = (await session.execute(count_stmt)).scalar() or 0

    return _build_detail(ds, list(columns), count)


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
            raw_data=json.loads(m.raw_json) if m.raw_json else None,
        )
        for m in result.scalars().all()
    ]


@router.get("/{dataset_id}/raw", response_model=list[dict])
async def get_raw_data(dataset_id: str, session: AsyncSession = Depends(get_db)):
    """Get all raw CSV rows for a dataset (all original columns preserved)."""
    await _get_dataset_or_404(session, dataset_id)

    stmt = (
        select(Measurement)
        .where(Measurement.dataset_id == dataset_id)
        .order_by(Measurement.sequence_index)
    )
    result = await session.execute(stmt)
    rows = []
    for m in result.scalars().all():
        raw = json.loads(m.raw_json) if m.raw_json else {}
        raw["_sequence_index"] = m.sequence_index
        raw["_value"] = m.value
        raw["_subgroup"] = m.subgroup
        rows.append(raw)
    return rows


@router.get("/{dataset_id}/columns", response_model=list[ColumnOut])
async def get_columns(dataset_id: str, session: AsyncSession = Depends(get_db)):
    """Get column metadata for a dataset."""
    await _get_dataset_or_404(session, dataset_id)

    stmt = (
        select(DatasetColumn)
        .where(DatasetColumn.dataset_id == dataset_id)
        .order_by(DatasetColumn.ordinal)
    )
    result = await session.execute(stmt)
    return [
        ColumnOut(name=c.name, ordinal=c.ordinal, dtype=c.dtype, role=c.role)
        for c in result.scalars().all()
    ]


@router.put("/{dataset_id}/columns", response_model=list[ColumnOut])
async def update_columns(
    dataset_id: str,
    body: UpdateColumnsRequest,
    session: AsyncSession = Depends(get_db),
):
    """Update column roles and re-derive measurement values."""
    await _get_dataset_or_404(session, dataset_id)

    # Load existing columns
    col_stmt = select(DatasetColumn).where(DatasetColumn.dataset_id == dataset_id)
    db_columns = {c.name: c for c in (await session.execute(col_stmt)).scalars().all()}

    if not db_columns:
        raise HTTPException(status_code=400, detail="Dataset has no column metadata")

    # Apply role updates
    for update in body.columns:
        col = db_columns.get(update.name)
        if col is None:
            raise HTTPException(
                status_code=400,
                detail=f"Column '{update.name}' not found in dataset",
            )
        col.role = update.role

    # Find the new value and subgroup columns
    value_col_name = None
    subgroup_col_name = None
    for col in db_columns.values():
        if col.role == "value":
            value_col_name = col.name
        elif col.role == "subgroup":
            subgroup_col_name = col.name

    if value_col_name is None:
        raise HTTPException(
            status_code=400,
            detail="At least one column must have the 'value' role",
        )

    # Re-derive measurement.value and measurement.subgroup from raw_json
    m_stmt = (
        select(Measurement)
        .where(Measurement.dataset_id == dataset_id)
        .order_by(Measurement.sequence_index)
    )
    measurements = (await session.execute(m_stmt)).scalars().all()

    skipped = 0
    seq = 0
    for m in measurements:
        raw = json.loads(m.raw_json) if m.raw_json else {}
        raw_value = raw.get(value_col_name, "")
        try:
            m.value = float(str(raw_value).strip())
        except (ValueError, TypeError):
            skipped += 1
            continue

        if subgroup_col_name:
            sg = raw.get(subgroup_col_name, "")
            m.subgroup = str(sg).strip() if sg else None
        else:
            m.subgroup = None

        seq += 1

    # Invalidate cached analyses
    await session.execute(
        delete(Analysis).where(Analysis.dataset_id == dataset_id)
    )

    await session.commit()

    # Return updated columns
    return [
        ColumnOut(name=c.name, ordinal=c.ordinal, dtype=c.dtype, role=c.role)
        for c in sorted(db_columns.values(), key=lambda c: c.ordinal)
    ]


@router.post("/upload", response_model=DatasetDetailOut, status_code=201)
async def upload_dataset(
    file: UploadFile,
    session: AsyncSession = Depends(get_db),
):
    """Upload a CSV file and create a new dataset with full column metadata."""
    content = await file.read()
    try:
        parsed = parse_csv(content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    name = file.filename or "Untitled"
    if name.lower().endswith(".csv"):
        name = name[:-4]

    # Build metadata
    value_col = next((c for c in parsed.columns if c.suggested_role == "value"), None)
    subgroup_col = next((c for c in parsed.columns if c.suggested_role == "subgroup"), None)

    metadata = {
        "value_column": value_col.name if value_col else None,
        "subgroup_column": subgroup_col.name if subgroup_col else None,
        "column_count": len(parsed.columns),
        "row_count": len(parsed.rows),
    }

    dataset = Dataset(
        name=name,
        metadata_json=json.dumps(metadata),
    )

    # Create DatasetColumn records
    for col in parsed.columns:
        dataset.columns.append(
            DatasetColumn(
                name=col.name,
                ordinal=col.ordinal,
                dtype=col.dtype,
                role=col.suggested_role,
            )
        )

    # Create Measurement records with raw data
    value_col_name = value_col.name if value_col else None
    subgroup_col_name = subgroup_col.name if subgroup_col else None
    skipped = 0

    for idx, row in enumerate(parsed.rows):
        # Get value from raw row
        raw_value = row.get(value_col_name, "") if value_col_name else ""
        try:
            value = float(str(raw_value).strip())
        except (ValueError, TypeError):
            skipped += 1
            continue

        subgroup = None
        if subgroup_col_name:
            sg = row.get(subgroup_col_name, "")
            subgroup = str(sg).strip() if sg else None

        # Extra columns stored in metadata for backward compat
        extra = {
            k: v for k, v in row.items()
            if k != value_col_name and k != subgroup_col_name
        }

        dataset.measurements.append(
            Measurement(
                value=value,
                subgroup=subgroup,
                sequence_index=idx - skipped,
                metadata_json=json.dumps(extra) if extra else None,
                raw_json=json.dumps(row),
            )
        )

    if not dataset.measurements:
        raise HTTPException(status_code=400, detail="No valid numeric rows found")

    point_count = len(dataset.measurements)
    col_data = [
        ColumnOut(name=col.name, ordinal=col.ordinal, dtype=col.dtype, role=col.suggested_role)
        for col in parsed.columns
    ]

    session.add(dataset)
    await session.commit()
    await session.refresh(dataset)

    return DatasetDetailOut(
        id=dataset.id,
        name=dataset.name,
        created_at=dataset.created_at.isoformat() if hasattr(dataset.created_at, "isoformat") else str(dataset.created_at),
        columns=col_data,
        point_count=point_count,
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
    """Export dataset as CSV using original column names from raw data."""
    ds = await _get_dataset_or_404(session, dataset_id)

    stmt = (
        select(Measurement)
        .where(Measurement.dataset_id == dataset_id)
        .order_by(Measurement.sequence_index)
    )
    result = await session.execute(stmt)
    measurements = result.scalars().all()

    # Try to use raw data for export (preserves original columns)
    has_raw = any(m.raw_json for m in measurements)

    output = io.StringIO()
    writer = csv.writer(output)

    if has_raw:
        # Collect all column names from raw data
        all_keys: list[str] = []
        for m in measurements:
            if m.raw_json:
                raw = json.loads(m.raw_json)
                for k in raw:
                    if k not in all_keys:
                        all_keys.append(k)

        writer.writerow(all_keys)
        for m in measurements:
            raw = json.loads(m.raw_json) if m.raw_json else {}
            writer.writerow([raw.get(k, "") for k in all_keys])
    else:
        # Fallback to old format
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
