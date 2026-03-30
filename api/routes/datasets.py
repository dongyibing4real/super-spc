"""Dataset endpoints — list, get, create, delete, export, column roles, raw data."""
from __future__ import annotations

import csv
import io
import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Analysis, Dataset, DatasetColumn, DataRow
from ..schemas import (
    ColumnOut,
    CreateDatasetRequest,
    DataRowOut,
    DatasetDetailOut,
    DatasetSummary,
    UpdateColumnsRequest,
)

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
            func.count(DataRow.id).label("point_count"),
        )
        .outerjoin(DataRow)
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

    count_stmt = select(func.count(DataRow.id)).where(DataRow.dataset_id == dataset_id)
    count = (await session.execute(count_stmt)).scalar() or 0

    return _build_detail(ds, list(columns), count)


@router.get("/{dataset_id}/rows", response_model=list[DataRowOut])
async def get_rows(dataset_id: str, session: AsyncSession = Depends(get_db)):
    """Get all data rows for a dataset, ordered by sequence index."""
    await _get_dataset_or_404(session, dataset_id)

    stmt = (
        select(DataRow)
        .where(DataRow.dataset_id == dataset_id)
        .order_by(DataRow.sequence_index)
    )
    result = await session.execute(stmt)
    return [
        DataRowOut(
            id=m.id,
            sequence_index=m.sequence_index,
            metadata=json.loads(m.metadata_json) if m.metadata_json else None,
            raw_data=json.loads(m.raw_json) if m.raw_json else None,
        )
        for m in result.scalars().all()
    ]


@router.get("/{dataset_id}/raw", response_model=list[dict])
async def get_raw_data(dataset_id: str, session: AsyncSession = Depends(get_db)):
    """Get all raw data rows for a dataset (all original columns preserved)."""
    await _get_dataset_or_404(session, dataset_id)

    stmt = (
        select(DataRow)
        .where(DataRow.dataset_id == dataset_id)
        .order_by(DataRow.sequence_index)
    )
    result = await session.execute(stmt)
    rows = []
    for m in result.scalars().all():
        raw = json.loads(m.raw_json) if m.raw_json else {}
        raw["_sequence_index"] = m.sequence_index
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
    """Update column roles for a dataset."""
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

    # Validate at least one value column
    has_value = any(col.role == "value" for col in db_columns.values())
    if not has_value:
        raise HTTPException(
            status_code=400,
            detail="At least one column must have the 'value' role",
        )

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


@router.post("", response_model=DatasetDetailOut, status_code=201)
async def create_dataset(
    body: CreateDatasetRequest,
    session: AsyncSession = Depends(get_db),
):
    """Create a new dataset from structured JSON (columns + rows)."""
    # Validate: at least one column with role="value"
    if not any(c.role == "value" for c in body.columns):
        raise HTTPException(
            status_code=400,
            detail="At least one column must have the 'value' role",
        )

    # Validate: rows is not empty
    if not body.rows:
        raise HTTPException(status_code=400, detail="rows must not be empty")

    # Build metadata
    value_col = next((c for c in body.columns if c.role == "value"), None)
    subgroup_col = next((c for c in body.columns if c.role == "subgroup"), None)

    metadata = {
        "value_column": value_col.name if value_col else None,
        "subgroup_column": subgroup_col.name if subgroup_col else None,
        "column_count": len(body.columns),
        "row_count": len(body.rows),
    }

    dataset = Dataset(
        name=body.name,
        metadata_json=json.dumps(metadata),
    )

    # Create DatasetColumn records
    for col in body.columns:
        dataset.columns.append(
            DatasetColumn(
                name=col.name,
                ordinal=col.ordinal,
                dtype=col.dtype,
                role=col.role,
            )
        )

    # Create DataRow records — store raw string values, no derivation
    for idx, row in enumerate(body.rows):
        dataset.data_rows.append(
            DataRow(
                sequence_index=idx,
                raw_json=json.dumps(row),
            )
        )

    point_count = len(dataset.data_rows)
    col_data = [
        ColumnOut(name=col.name, ordinal=col.ordinal, dtype=col.dtype, role=col.role)
        for col in body.columns
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
        select(DataRow)
        .where(DataRow.dataset_id == dataset_id)
        .order_by(DataRow.sequence_index)
    )
    result = await session.execute(stmt)
    data_rows = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)

    # Collect all column names from raw data
    all_keys: list[str] = []
    for m in data_rows:
        if m.raw_json:
            raw = json.loads(m.raw_json)
            for k in raw:
                if k not in all_keys:
                    all_keys.append(k)

    writer.writerow(all_keys)
    for m in data_rows:
        raw = json.loads(m.raw_json) if m.raw_json else {}
        writer.writerow([raw.get(k, "") for k in all_keys])

    csv_content = output.getvalue()
    filename = f"{ds.name}.csv"

    return StreamingResponse(
        io.BytesIO(csv_content.encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
