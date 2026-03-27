"""CSV parsing service — convention-based column detection."""
from __future__ import annotations

import csv
import io
from dataclasses import dataclass, field


VALUE_COLUMN_NAMES = {"thickness", "value", "measurement", "result", "reading"}
SUBGROUP_COLUMN_NAMES = {"hour", "subgroup", "batch", "sample", "group"}


@dataclass
class MeasurementRow:
    value: float
    subgroup: str | None
    sequence_index: int
    metadata: dict


@dataclass
class ParsedCSV:
    value_column: str
    subgroup_column: str | None
    measurements: list[MeasurementRow] = field(default_factory=list)
    skipped_rows: int = 0


def _detect_value_column(headers: list[str]) -> str | None:
    """Find the value column by convention name match."""
    for h in headers:
        if h.strip().lower() in VALUE_COLUMN_NAMES:
            return h
    return None


def _detect_subgroup_column(headers: list[str]) -> str | None:
    """Find the subgroup column by convention name match."""
    for h in headers:
        if h.strip().lower() in SUBGROUP_COLUMN_NAMES:
            return h
    return None


def _find_first_numeric_column(headers: list[str], sample_row: dict) -> str | None:
    """Fallback: find the first column whose sample value is numeric."""
    for h in headers:
        try:
            float(sample_row.get(h, ""))
            return h
        except (ValueError, TypeError):
            continue
    return None


def parse_csv(content: str | bytes) -> ParsedCSV:
    """Parse CSV content into structured measurements.

    Column detection is convention-based:
    1. Value column: matches known names (Thickness, Value, etc.)
       or falls back to the first numeric column.
    2. Subgroup column: matches known names (Hour, Subgroup, etc.)

    Raises ValueError if no value column can be detected or the CSV is empty.
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

    # Detect columns
    value_col = _detect_value_column(headers)
    if value_col is None:
        value_col = _find_first_numeric_column(headers, rows[0])
    if value_col is None:
        raise ValueError(
            f"Cannot detect a value column. Headers: {headers}. "
            f"Expected one of: {', '.join(sorted(VALUE_COLUMN_NAMES))} "
            "or a column with numeric values."
        )

    subgroup_col = _detect_subgroup_column(headers)
    extra_columns = [h for h in headers if h != value_col and h != subgroup_col]

    measurements: list[MeasurementRow] = []
    skipped = 0

    for idx, row in enumerate(rows):
        raw_value = row.get(value_col, "").strip()
        try:
            value = float(raw_value)
        except (ValueError, TypeError):
            skipped += 1
            continue

        subgroup = row.get(subgroup_col, "").strip() if subgroup_col else None
        if subgroup == "":
            subgroup = None

        metadata = {col: row.get(col, "") for col in extra_columns}

        measurements.append(MeasurementRow(
            value=value,
            subgroup=subgroup,
            sequence_index=len(measurements),
            metadata=metadata,
        ))

    if not measurements:
        raise ValueError("No valid numeric rows found in the value column")

    return ParsedCSV(
        value_column=value_col,
        subgroup_column=subgroup_col,
        measurements=measurements,
        skipped_rows=skipped,
    )
