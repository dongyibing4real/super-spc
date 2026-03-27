"""Integration tests for API endpoints via TestClient."""
from __future__ import annotations

import pytest

from tests.test_api.conftest import SEED_DATASET_ID


def test_health(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_list_datasets(client):
    resp = client.get("/api/datasets")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["id"] == SEED_DATASET_ID
    assert data[0]["name"] == "Test Dataset"
    assert data[0]["point_count"] == 20


def test_get_dataset(client):
    resp = client.get(f"/api/datasets/{SEED_DATASET_ID}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == SEED_DATASET_ID
    assert data["point_count"] == 20


def test_get_dataset_not_found(client):
    resp = client.get("/api/datasets/nonexistent")
    assert resp.status_code == 404


def test_get_points(client):
    resp = client.get(f"/api/datasets/{SEED_DATASET_ID}/points")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 20
    # Check ordering
    assert data[0]["sequence_index"] == 0
    assert data[19]["sequence_index"] == 19
    assert data[0]["value"] == 10.0


def test_get_points_not_found(client):
    resp = client.get("/api/datasets/nonexistent/points")
    assert resp.status_code == 404


def test_analyze_dataset(client):
    resp = client.post(
        f"/api/datasets/{SEED_DATASET_ID}/analyze",
        json={"sigma_method": "moving_range", "k_sigma": 3.0},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["dataset_id"] == SEED_DATASET_ID
    assert data["sigma"]["method"] == "moving_range"
    assert data["sigma"]["sigma_hat"] > 0
    assert len(data["limits"]["ucl"]) == 20
    assert data["zones"]["cl"] > 0
    assert data["capability"] is None  # no spec limits


def test_analyze_with_capability(client):
    resp = client.post(
        f"/api/datasets/{SEED_DATASET_ID}/analyze",
        json={
            "sigma_method": "moving_range",
            "k_sigma": 3.0,
            "usl": 11.0,
            "lsl": 9.5,
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["capability"] is not None
    assert data["capability"]["cpk"] > 0


def test_analyze_not_found(client):
    resp = client.post(
        "/api/datasets/nonexistent/analyze",
        json={"sigma_method": "moving_range"},
    )
    assert resp.status_code == 404


def test_get_cached_analysis(client):
    # First, run an analysis
    client.post(
        f"/api/datasets/{SEED_DATASET_ID}/analyze",
        json={"sigma_method": "levey_jennings"},
    )

    # Then retrieve the cached result
    resp = client.get(f"/api/datasets/{SEED_DATASET_ID}/analysis")
    assert resp.status_code == 200
    data = resp.json()
    assert data["dataset_id"] == SEED_DATASET_ID
    assert data["sigma"]["method"] == "levey_jennings"


def test_get_analysis_not_found(client):
    # No analysis has been run for this dataset in this test
    # (The seeded_db doesn't have any analyses pre-loaded)
    resp = client.get(f"/api/datasets/{SEED_DATASET_ID}/analysis")
    assert resp.status_code == 404
