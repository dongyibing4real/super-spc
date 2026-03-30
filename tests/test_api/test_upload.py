"""Integration tests for create, delete, and export endpoints."""
from __future__ import annotations

import csv
import io
from pathlib import Path

import pytest

from tests.test_api.conftest import SEED_DATASET_ID

CSV_PATH = Path(__file__).resolve().parent.parent.parent / "src" / "data" / "Socket Thickness.csv"


def _csv_to_create_payload(name: str, csv_bytes: bytes) -> dict:
    """Parse CSV bytes client-side and return a CreateDatasetRequest-compatible dict.

    Mimics the frontend's auto-role assignment: first numeric column = value,
    second column (numeric or text) = subgroup.
    """
    text = csv_bytes.decode("utf-8")
    reader = csv.DictReader(io.StringIO(text))
    fieldnames = list(reader.fieldnames or [])
    rows = list(reader)

    # Detect dtypes
    col_dtypes: list[str] = []
    for col_name in fieldnames:
        sample = next((r[col_name] for r in rows if r.get(col_name, "").strip()), None)
        is_numeric = False
        if sample is not None:
            try:
                float(sample)
                is_numeric = True
            except (ValueError, TypeError):
                pass
        col_dtypes.append("numeric" if is_numeric else "text")

    # Assign roles: first numeric = value, first other column = subgroup
    columns = []
    has_value = False
    has_subgroup = False
    for i, col_name in enumerate(fieldnames):
        role = None
        if col_dtypes[i] == "numeric" and not has_value:
            role = "value"
            has_value = True
        elif has_value and not has_subgroup:
            # Second column becomes subgroup (regardless of dtype)
            role = "subgroup"
            has_subgroup = True
        columns.append({"name": col_name, "ordinal": i, "dtype": col_dtypes[i], "role": role})

    return {"name": name, "columns": columns, "rows": rows}


def _has_numeric_column(csv_bytes: bytes) -> bool:
    """Check if CSV has at least one numeric column."""
    text = csv_bytes.decode("utf-8")
    reader = csv.DictReader(io.StringIO(text))
    fieldnames = list(reader.fieldnames or [])
    rows = list(reader)
    for col_name in fieldnames:
        sample = next((r[col_name] for r in rows if r.get(col_name, "").strip()), None)
        if sample is not None:
            try:
                float(sample)
                return True
            except (ValueError, TypeError):
                pass
    return False


def test_upload_csv(client):
    """Upload a CSV via JSON create and verify the dataset is created."""
    csv_content = b"Value,Hour\n10.5,1\n11.0,1\n12.0,2\n13.0,2\n"
    payload = _csv_to_create_payload("test_data", csv_content)
    resp = client.post("/api/datasets", json=payload)
    assert resp.status_code == 201, f"Create failed: {resp.text}"
    data = resp.json()
    assert data["name"] == "test_data"
    assert data["point_count"] == 4
    assert data["metadata"]["value_column"] == "Value"
    assert data["metadata"]["subgroup_column"] == "Hour"
    # Verify columns are returned
    assert "columns" in data
    col_names = [c["name"] for c in data["columns"]]
    assert "Value" in col_names
    assert "Hour" in col_names


def test_upload_real_csv(client):
    """Upload the actual Socket Thickness.csv."""
    content = CSV_PATH.read_bytes()
    payload = _csv_to_create_payload("Socket Thickness", content)
    resp = client.post("/api/datasets", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Socket Thickness"
    assert data["point_count"] > 0

    # Verify rows are queryable
    dataset_id = data["id"]
    resp2 = client.get(f"/api/datasets/{dataset_id}/rows")
    assert resp2.status_code == 200
    assert len(resp2.json()) == data["point_count"]


def test_upload_invalid_csv(client):
    """Upload a CSV with no numeric columns -> 400."""
    csv_content = b"name,color\nalice,blue\nbob,red\n"
    # Client-side parsing would detect no numeric column, but here we
    # send payload without a value role to test the API validation.
    payload = {
        "name": "bad",
        "columns": [
            {"name": "name", "ordinal": 0, "dtype": "text", "role": None},
            {"name": "color", "ordinal": 1, "dtype": "text", "role": None},
        ],
        "rows": [{"name": "alice", "color": "blue"}, {"name": "bob", "color": "red"}],
    }
    resp = client.post("/api/datasets", json=payload)
    assert resp.status_code == 400


def test_upload_appears_in_list(client):
    """Created dataset shows up in GET /api/datasets."""
    csv_content = b"Measurement,Subgroup\n5.0,A\n6.0,B\n"
    payload = _csv_to_create_payload("new", csv_content)
    resp = client.post("/api/datasets", json=payload)
    assert resp.status_code == 201
    new_id = resp.json()["id"]

    resp2 = client.get("/api/datasets")
    ids = [d["id"] for d in resp2.json()]
    assert new_id in ids


def test_delete_dataset(client):
    """Delete removes the dataset and all associated data."""
    csv_content = b"Value,Hour\n10,1\n20,2\n"
    payload = _csv_to_create_payload("del_me", csv_content)
    resp = client.post("/api/datasets", json=payload)
    dataset_id = resp.json()["id"]

    # Delete
    resp2 = client.delete(f"/api/datasets/{dataset_id}")
    assert resp2.status_code == 204

    # Verify gone
    resp3 = client.get(f"/api/datasets/{dataset_id}")
    assert resp3.status_code == 404

    resp4 = client.get(f"/api/datasets/{dataset_id}/rows")
    assert resp4.status_code == 404


def test_delete_not_found(client):
    """Delete nonexistent dataset -> 404."""
    resp = client.delete("/api/datasets/nonexistent")
    assert resp.status_code == 404


def test_delete_cascades_analysis(client):
    """Delete removes associated analyses too."""
    csv_content = b"Value,Hour\n10,1\n11,1\n12,2\n13,2\n14,3\n"
    payload = _csv_to_create_payload("cascade", csv_content)
    resp = client.post("/api/datasets", json=payload)
    dataset_id = resp.json()["id"]
    client.post(
        f"/api/datasets/{dataset_id}/analyze",
        json={"sigma_method": "moving_range"},
    )

    # Delete
    resp2 = client.delete(f"/api/datasets/{dataset_id}")
    assert resp2.status_code == 204

    # Analysis should be gone
    resp3 = client.get(f"/api/datasets/{dataset_id}/analysis")
    assert resp3.status_code == 404


def test_export_csv(client):
    """Export returns a valid CSV with correct data."""
    csv_content = b"Value,Hour\n10.5,1\n11.0,2\n12.0,3\n"
    payload = _csv_to_create_payload("export_test", csv_content)
    resp = client.post("/api/datasets", json=payload)
    dataset_id = resp.json()["id"]

    # Export
    resp2 = client.get(f"/api/datasets/{dataset_id}/export")
    assert resp2.status_code == 200
    assert "text/csv" in resp2.headers["content-type"]
    assert "attachment" in resp2.headers["content-disposition"]

    # Parse the exported CSV
    reader = csv.DictReader(io.StringIO(resp2.text))
    rows = list(reader)
    assert len(rows) == 3
    # New format preserves original column names
    assert "Value" in reader.fieldnames
    assert "Hour" in reader.fieldnames
    assert float(rows[0]["Value"]) == 10.5


def test_export_not_found(client):
    """Export nonexistent dataset -> 404."""
    resp = client.get("/api/datasets/nonexistent/export")
    assert resp.status_code == 404
