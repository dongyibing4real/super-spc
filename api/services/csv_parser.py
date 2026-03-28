"""CSV parsing service — column detection with role suggestions."""
from __future__ import annotations

import csv
import io
from dataclasses import dataclass, field
from datetime import datetime


VALUE_COLUMN_NAMES = {"thickness", "value", "measurement", "result", "reading"}
SUBGROUP_COLUMN_NAMES = {"hour", "subgroup", "batch", "sample", "group"}


@dataclass
class ColumnInfo:
    name: str
    ordinal: int
    dtype: str  # "numeric" | "text" | "datetime"
    suggested_role: str | None = None  # "value" | "subgroup" | None


@dataclass
class ParsedCSV:
    columns: list[ColumnInfo] = field(default_factory=list)
    rows: list[dict] = field(default_factory=list)
    skipped_rows: int = 0


# Keep backward-compatible aliases
@dataclass
class MeasurementRow:
    value: float
    subgroup: str | None
    sequence_index: int
    metadata: dict


def _detect_dtype(values: list[str]) -> str:
    """Detect column dtype by sampling values."""
    numeric_count = 0
    datetime_count = 0
    total = 0

    for v in values[:50]:  # sample first 50 rows
        v = v.strip()
        if not v:
            continue
        total += 1
        try:
            float(v)
            numeric_count += 1
            continue
        except (ValueError, TypeError):
            pass
        # Try common datetime formats
        for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%Y-%m-%d %H:%M:%S", "%m/%d/%Y %H:%M"):
            try:
                datetime.strptime(v, fmt)
                datetime_count += 1
                break
            except ValueError:
                continue

    if total == 0:
        return "text"
    if numeric_count / total > 0.8:
        return "numeric"
    if datetime_count / total > 0.8:
        return "datetime"
    return "text"


def _suggest_role(name: str, dtype: str) -> str | None:
    """Suggest a column role based on name convention."""
    lower = name.strip().lower()
    if lower in VALUE_COLUMN_NAMES:
        return "value"
    if lower in SUBGROUP_COLUMN_NAMES:
        return "subgroup"
    return None


def parse_csv(content: str | bytes) -> ParsedCSV:
    """Parse CSV content into columns metadata and raw rows.

    Column detection suggests roles but does not enforce them.
    All columns and all data are preserved.

    Raises ValueError if the CSV is empty or has no headers.
    """
    if isinstance(content, bytes):
        content = content.decode("utf-8-sig")  # handle BOM

    reader = csv.DictReader(io.StringIO(content))
    if not reader.fieldnames:
        raise ValueError("CSV has no headers")

    headers = list(reader.fieldnames)
    rows = list(reader)
    if not rows:
        raise ValueError("CSV has no data rows")

    # Detect column dtypes and suggest roles
    columns: list[ColumnInfo] = []
    value_suggested = False

    for ordinal, name in enumerate(headers):
        col_values = [row.get(name, "") for row in rows]
        dtype = _detect_dtype(col_values)
        suggested = _suggest_role(name, dtype)

        # Only suggest one value column
        if suggested == "value":
            if value_suggested:
                suggested = None
            else:
                value_suggested = True

        columns.append(ColumnInfo(
            name=name,
            ordinal=ordinal,
            dtype=dtype,
            suggested_role=suggested,
        ))

    # If no value column was suggested by name, suggest first numeric column
    if not value_suggested:
        for col in columns:
            if col.dtype == "numeric":
                col.suggested_role = "value"
                break

    # Verify at least one value column exists
    has_value = any(c.suggested_role == "value" for c in columns)
    if not has_value:
        raise ValueError(
            f"Cannot detect a numeric value column. Headers: {headers}. "
            "Upload a CSV with at least one numeric column."
        )

    return ParsedCSV(
        columns=columns,
        rows=rows,
        skipped_rows=0,
    )
