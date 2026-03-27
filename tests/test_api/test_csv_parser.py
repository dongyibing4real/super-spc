"""Tests for the CSV parser service."""
from __future__ import annotations

from pathlib import Path

import pytest

from api.services.csv_parser import parse_csv

CSV_PATH = Path(__file__).resolve().parent.parent.parent / "src" / "data" / "Socket Thickness.csv"


def test_parse_real_csv():
    """Parse the actual Socket Thickness.csv from the project."""
    content = CSV_PATH.read_text(encoding="utf-8")
    result = parse_csv(content)

    assert result.value_column == "Thickness"
    assert result.subgroup_column == "Hour"
    assert len(result.measurements) > 0
    assert result.skipped_rows == 0


def test_value_column_detection():
    """Detects 'Thickness' as the value column."""
    content = CSV_PATH.read_text(encoding="utf-8")
    result = parse_csv(content)
    assert result.value_column == "Thickness"


def test_subgroup_column_detection():
    """Detects 'Hour' as the subgroup column."""
    content = CSV_PATH.read_text(encoding="utf-8")
    result = parse_csv(content)
    assert result.subgroup_column == "Hour"


def test_metadata_contains_extra_columns():
    """Extra columns go into metadata."""
    content = CSV_PATH.read_text(encoding="utf-8")
    result = parse_csv(content)
    m = result.measurements[0]
    assert "Cycle" in m.metadata
    assert "Cavity" in m.metadata


def test_sequence_index_is_contiguous():
    """Sequence indices are 0-based and contiguous."""
    content = CSV_PATH.read_text(encoding="utf-8")
    result = parse_csv(content)
    indices = [m.sequence_index for m in result.measurements]
    assert indices == list(range(len(result.measurements)))


def test_fallback_to_first_numeric_column():
    """Falls back to the first numeric column when no known name matches."""
    csv_text = "id,reading_val,group\n1,10.5,A\n2,11.0,B\n"
    result = parse_csv(csv_text)
    # 'id' is also numeric but comes first — that's fine, it's the fallback
    assert result.value_column == "id"


def test_named_value_column_takes_priority():
    """A known value column name beats positional fallback."""
    csv_text = "id,Value,group\n1,10.5,A\n2,11.0,B\n"
    result = parse_csv(csv_text)
    assert result.value_column == "Value"


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
    with pytest.raises(ValueError, match="Cannot detect a value column"):
        parse_csv(csv_text)


def test_skips_non_numeric_rows():
    """Rows with non-numeric values in the value column are skipped."""
    csv_text = "Thickness,Hour\n10,1\nbad,2\n12,3\n"
    result = parse_csv(csv_text)
    assert len(result.measurements) == 2
    assert result.skipped_rows == 1
    assert result.measurements[0].value == 10.0
    assert result.measurements[1].value == 12.0
    # Sequence index should be contiguous (0, 1) not (0, 2)
    assert result.measurements[1].sequence_index == 1


def test_bytes_input():
    """Accepts bytes (as from file upload)."""
    csv_bytes = b"Value,Hour\n10,1\n20,2\n"
    result = parse_csv(csv_bytes)
    assert len(result.measurements) == 2


def test_bom_handling():
    """Handles UTF-8 BOM gracefully."""
    csv_bytes = b"\xef\xbb\xbfValue,Hour\n10,1\n20,2\n"
    result = parse_csv(csv_bytes)
    assert result.value_column == "Value"
    assert len(result.measurements) == 2
