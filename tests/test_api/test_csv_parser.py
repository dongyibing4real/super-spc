"""Tests for the CSV parser service."""
from __future__ import annotations

from pathlib import Path

import pytest

from api.services.csv_parser import parse_csv

CSV_PATH = Path(__file__).resolve().parent.parent.parent / "src" / "data" / "Socket Thickness.csv"


def _get_col(result, name):
    """Get a column by name."""
    return next((c for c in result.columns if c.name == name), None)


def _get_value_col(result):
    """Get the column with suggested_role='value'."""
    return next((c for c in result.columns if c.suggested_role == "value"), None)


def _get_subgroup_col(result):
    """Get the column with suggested_role='subgroup'."""
    return next((c for c in result.columns if c.suggested_role == "subgroup"), None)


def test_parse_real_csv():
    """Parse the actual Socket Thickness.csv from the project."""
    content = CSV_PATH.read_text(encoding="utf-8")
    result = parse_csv(content)

    value_col = _get_value_col(result)
    subgroup_col = _get_subgroup_col(result)
    assert value_col is not None
    assert value_col.name == "Thickness"
    assert subgroup_col is not None
    assert subgroup_col.name == "Hour"
    assert len(result.rows) > 0


def test_value_column_detection():
    """Detects 'Thickness' as the value column."""
    content = CSV_PATH.read_text(encoding="utf-8")
    result = parse_csv(content)
    assert _get_value_col(result).name == "Thickness"


def test_subgroup_column_detection():
    """Detects 'Hour' as the subgroup column."""
    content = CSV_PATH.read_text(encoding="utf-8")
    result = parse_csv(content)
    assert _get_subgroup_col(result).name == "Hour"


def test_all_columns_preserved():
    """All CSV columns are preserved in columns metadata."""
    content = CSV_PATH.read_text(encoding="utf-8")
    result = parse_csv(content)
    col_names = [c.name for c in result.columns]
    assert "Thickness" in col_names
    assert "Hour" in col_names
    assert "Cycle" in col_names
    assert "Cavity" in col_names


def test_raw_rows_contain_all_columns():
    """Raw rows preserve all original column data."""
    content = CSV_PATH.read_text(encoding="utf-8")
    result = parse_csv(content)
    row = result.rows[0]
    assert "Thickness" in row
    assert "Hour" in row
    assert "Cycle" in row
    assert "Cavity" in row


def test_column_ordinals():
    """Columns have correct ordinal positions."""
    content = CSV_PATH.read_text(encoding="utf-8")
    result = parse_csv(content)
    ordinals = [c.ordinal for c in result.columns]
    assert ordinals == list(range(len(result.columns)))


def test_dtype_detection():
    """Numeric columns are detected as numeric."""
    content = CSV_PATH.read_text(encoding="utf-8")
    result = parse_csv(content)
    thickness = _get_col(result, "Thickness")
    assert thickness.dtype == "numeric"


def test_fallback_to_first_numeric_column():
    """Falls back to the first numeric column when no known name matches."""
    csv_text = "id,reading_val,group\n1,10.5,A\n2,11.0,B\n"
    result = parse_csv(csv_text)
    value_col = _get_value_col(result)
    # 'id' is also numeric but comes first — that's fine, it's the fallback
    assert value_col.name == "id"


def test_named_value_column_takes_priority():
    """A known value column name beats positional fallback."""
    csv_text = "id,Value,group\n1,10.5,A\n2,11.0,B\n"
    result = parse_csv(csv_text)
    assert _get_value_col(result).name == "Value"


def test_no_header_raises():
    """Empty CSV raises ValueError."""
    with pytest.raises(ValueError, match="no headers"):
        parse_csv("")


def test_no_data_rows_raises():
    """CSV with header but no data raises ValueError."""
    with pytest.raises(ValueError, match="no data rows"):
        parse_csv("col1,col2\n")


def test_no_numeric_column_raises():
    """CSV with no numeric values raises ValueError."""
    csv_text = "name,color\nalice,blue\nbob,red\n"
    with pytest.raises(ValueError, match="numeric value column"):
        parse_csv(csv_text)


def test_bytes_input():
    """Accepts bytes (as from file upload)."""
    csv_bytes = b"Value,Hour\n10,1\n20,2\n"
    result = parse_csv(csv_bytes)
    assert len(result.rows) == 2


def test_bom_handling():
    """Handles UTF-8 BOM gracefully."""
    csv_bytes = b"\xef\xbb\xbfValue,Hour\n10,1\n20,2\n"
    result = parse_csv(csv_bytes)
    assert _get_value_col(result).name == "Value"
    assert len(result.rows) == 2


def test_arbitrary_column_names():
    """CSV with non-standard column names still works via fallback."""
    csv_text = "temperature,batch_id,measurement_value\n21.5,B1,2.50\n22.0,B2,2.51\n"
    result = parse_csv(csv_text)
    value_col = _get_value_col(result)
    assert value_col is not None
    # Should pick first numeric column since no known names match
    assert value_col.name == "temperature"
    # All columns preserved
    assert len(result.columns) == 3
    assert all(c.name in ("temperature", "batch_id", "measurement_value") for c in result.columns)
