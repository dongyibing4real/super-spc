"""Tests for chart type dispatch and rule violations in analysis service."""
from __future__ import annotations

import json

import numpy as np
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from api.models import Base, Dataset, Measurement
from api.schemas import AnalysisRequest
from api.services.analysis import run_analysis


DATASET_ID = "chart-dispatch-001"
SUBGROUPED_DATASET_ID = "chart-dispatch-002"
SHORT_RUN_DATASET_ID = "chart-dispatch-003"
MULTIVARIATE_DATASET_ID = "chart-dispatch-004"


@pytest_asyncio.fixture
async def db():
    """In-memory SQLite database with schema applied."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
    )

    from sqlalchemy import event

    @event.listens_for(engine.sync_engine, "connect")
    def _set_sqlite_pragmas(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(engine, expire_on_commit=False)

    async with factory() as session:
        yield session

    await engine.dispose()


@pytest_asyncio.fixture
async def seeded_db(db: AsyncSession):
    """Database with individual measurements (no meaningful subgroups)."""
    dataset = Dataset(
        id=DATASET_ID,
        name="Chart Dispatch Test",
        metadata_json=json.dumps({"source": "test"}),
    )

    # 20 values — enough for IMR, LJ, EWMA, CUSUM
    values = [
        10.0, 10.2, 10.1, 10.3, 10.0,
        10.2, 10.4, 10.1, 10.3, 10.2,
        10.5, 10.3, 10.4, 10.2, 10.6,
        10.3, 10.5, 10.4, 10.7, 10.5,
    ]
    for i, v in enumerate(values):
        dataset.measurements.append(
            Measurement(value=v, subgroup=None, sequence_index=i)
        )

    db.add(dataset)
    await db.commit()
    return db


@pytest_asyncio.fixture
async def subgrouped_db(db: AsyncSession):
    """Database with subgrouped measurements for xbar_r / xbar_s."""
    dataset = Dataset(
        id=SUBGROUPED_DATASET_ID,
        name="Subgrouped Test",
        metadata_json=json.dumps({"source": "test"}),
    )

    # 4 subgroups of size 5
    values = [
        10.0, 10.2, 10.1, 10.3, 10.0,  # subgroup 1
        10.2, 10.4, 10.1, 10.3, 10.2,  # subgroup 2
        10.5, 10.3, 10.4, 10.2, 10.6,  # subgroup 3
        10.3, 10.5, 10.4, 10.7, 10.5,  # subgroup 4
    ]
    for i, v in enumerate(values):
        sg = str((i // 5) + 1)
        dataset.measurements.append(
            Measurement(value=v, subgroup=sg, sequence_index=i)
        )

    db.add(dataset)
    await db.commit()
    return db


@pytest_asyncio.fixture
async def short_run_db(db: AsyncSession):
    """Database with measurements tagged by product (subgroup = product ID)."""
    dataset = Dataset(
        id=SHORT_RUN_DATASET_ID,
        name="Short Run Test",
        metadata_json=json.dumps({"source": "test"}),
    )

    # Two products, 10 measurements each
    values_a = [10.0, 10.2, 10.1, 10.3, 10.0, 10.2, 10.4, 10.1, 10.3, 10.2]
    values_b = [20.0, 20.3, 20.1, 20.2, 20.4, 20.1, 20.3, 20.0, 20.2, 20.1]
    for i, v in enumerate(values_a):
        dataset.measurements.append(
            Measurement(value=v, subgroup="product_A", sequence_index=i)
        )
    for i, v in enumerate(values_b):
        dataset.measurements.append(
            Measurement(value=v, subgroup="product_B", sequence_index=len(values_a) + i)
        )

    db.add(dataset)
    await db.commit()
    return db


@pytest_asyncio.fixture
async def multivariate_db(db: AsyncSession):
    """Database with multivariate data in raw_json."""
    dataset = Dataset(
        id=MULTIVARIATE_DATASET_ID,
        name="Multivariate Test",
        metadata_json=json.dumps({"source": "test"}),
    )

    # 15 observations of 3 independent variables (n=15 > p=3)
    # Variables are NOT perfectly correlated to avoid singular covariance
    data = [
        [1.0, 2.3, 3.1], [1.1, 1.9, 2.8], [0.9, 2.1, 3.3],
        [1.2, 2.0, 2.9], [1.0, 2.4, 3.0], [0.8, 1.8, 3.2],
        [1.1, 2.2, 2.7], [1.0, 1.7, 3.1], [1.3, 2.5, 2.9],
        [0.9, 2.0, 3.4], [1.0, 2.1, 2.8], [1.1, 1.9, 3.0],
        [0.8, 2.3, 3.1], [1.2, 2.0, 2.6], [1.0, 2.2, 3.2],
    ]
    for i, row in enumerate(data):
        dataset.measurements.append(
            Measurement(
                value=row[0],
                subgroup=None,
                sequence_index=i,
                raw_json=json.dumps({"variables": row}),
            )
        )

    db.add(dataset)
    await db.commit()
    return db


# --- Backward Compatibility ---

@pytest.mark.asyncio
async def test_default_imr_backward_compat(seeded_db):
    """Default chart_type=imr with moving_range produces results with all new fields."""
    request = AnalysisRequest(sigma_method="moving_range", k_sigma=3.0)
    result = await run_analysis(seeded_db, DATASET_ID, request)

    assert result.dataset_id == DATASET_ID
    assert result.sigma.method == "moving_range"
    assert result.sigma.sigma_hat > 0
    assert len(result.limits.ucl) == 20
    assert len(result.limits.cl) == 20
    assert len(result.limits.lcl) == 20
    # New fields present
    assert isinstance(result.violations, list)


@pytest.mark.asyncio
async def test_imr_explicit_chart_type(seeded_db):
    """Explicit chart_type='imr' should work same as default."""
    request = AnalysisRequest(chart_type="imr", sigma_method="moving_range", k_sigma=3.0)
    result = await run_analysis(seeded_db, DATASET_ID, request)

    assert result.sigma.method == "moving_range"


# --- Rule Violations ---

@pytest.mark.asyncio
async def test_violations_returned(seeded_db):
    """Violations list is populated (may be empty depending on data, but field exists)."""
    request = AnalysisRequest(
        chart_type="imr",
        nelson_tests=[1, 2, 3, 4, 5],
        westgard_rules=[],
    )
    result = await run_analysis(seeded_db, DATASET_ID, request)

    # violations is a list of RuleViolationOut
    assert isinstance(result.violations, list)
    for v in result.violations:
        assert isinstance(v.test_id, str)
        assert isinstance(v.point_indices, list)
        assert isinstance(v.description, str)


@pytest.mark.asyncio
async def test_no_violations_with_empty_tests(seeded_db):
    """Empty nelson_tests should produce no violations."""
    request = AnalysisRequest(
        chart_type="imr",
        nelson_tests=[],
        westgard_rules=[],
    )
    result = await run_analysis(seeded_db, DATASET_ID, request)
    assert result.violations == []


# --- XBar-R ---

@pytest.mark.asyncio
async def test_xbar_r_chart(subgrouped_db):
    """XBar-R chart produces subgrouped results."""
    request = AnalysisRequest(chart_type="xbar_r", k_sigma=3.0)
    result = await run_analysis(subgrouped_db, SUBGROUPED_DATASET_ID, request)

    assert result.sigma.method == "range"
    # 4 subgroups
    assert len(result.limits.ucl) == 4
    assert len(result.limits.cl) == 4
    assert len(result.limits.lcl) == 4


# --- XBar-S ---

@pytest.mark.asyncio
async def test_xbar_s_chart(subgrouped_db):
    """XBar-S chart produces subgrouped results."""
    request = AnalysisRequest(chart_type="xbar_s", k_sigma=3.0)
    result = await run_analysis(subgrouped_db, SUBGROUPED_DATASET_ID, request)

    assert result.sigma.method == "stddev"
    assert len(result.limits.ucl) == 4


# --- Levey-Jennings ---

@pytest.mark.asyncio
async def test_levey_jennings_chart(seeded_db):
    """Levey-Jennings chart type works."""
    request = AnalysisRequest(chart_type="levey_jennings", k_sigma=3.0)
    result = await run_analysis(seeded_db, DATASET_ID, request)

    assert result.sigma.method == "levey_jennings"
    assert result.sigma.n_used == 20
    assert len(result.limits.ucl) == 20

    # Verify sigma matches sample std dev
    values = [
        10.0, 10.2, 10.1, 10.3, 10.0,
        10.2, 10.4, 10.1, 10.3, 10.2,
        10.5, 10.3, 10.4, 10.2, 10.6,
        10.3, 10.5, 10.4, 10.7, 10.5,
    ]
    expected_sigma = float(np.std(values, ddof=1))
    assert abs(result.sigma.sigma_hat - expected_sigma) < 1e-10


# --- EWMA ---

@pytest.mark.asyncio
async def test_ewma_chart(seeded_db):
    """EWMA chart type works with default params."""
    request = AnalysisRequest(chart_type="ewma", k_sigma=3.0)
    result = await run_analysis(seeded_db, DATASET_ID, request)

    assert result.sigma.sigma_hat > 0
    assert len(result.limits.ucl) == 20
    assert len(result.limits.cl) == 20
    assert len(result.limits.lcl) == 20


@pytest.mark.asyncio
async def test_ewma_with_target(seeded_db):
    """EWMA with explicit target parameter."""
    request = AnalysisRequest(
        chart_type="ewma",
        target=10.0,
        lambda_=0.3,
        k_sigma=3.0,
    )
    result = await run_analysis(seeded_db, DATASET_ID, request)
    assert result.sigma.sigma_hat > 0
    assert len(result.limits.ucl) == 20


# --- CUSUM ---

@pytest.mark.asyncio
async def test_cusum_chart(seeded_db):
    """CUSUM chart type works with default params."""
    request = AnalysisRequest(chart_type="cusum", k_sigma=3.0)
    result = await run_analysis(seeded_db, DATASET_ID, request)

    assert result.sigma.sigma_hat > 0
    assert len(result.limits.ucl) == 20


# --- Invalid Chart Type ---

@pytest.mark.asyncio
async def test_invalid_chart_type(seeded_db):
    """Invalid chart_type raises ValueError."""
    request = AnalysisRequest(chart_type="bogus_chart", k_sigma=3.0)
    with pytest.raises(ValueError, match="Unknown chart type"):
        await run_analysis(seeded_db, DATASET_ID, request)


# --- Unsupported but valid chart types ---

@pytest.mark.asyncio
async def test_unsupported_chart_type(seeded_db):
    """Completely unknown chart types raise ValueError."""
    request = AnalysisRequest(chart_type="nonexistent_chart", k_sigma=3.0)
    with pytest.raises(ValueError, match="Unknown chart type"):
        await run_analysis(seeded_db, DATASET_ID, request)


# --- R Chart ---

@pytest.mark.asyncio
async def test_r_chart(subgrouped_db):
    """R chart produces per-subgroup range values."""
    request = AnalysisRequest(chart_type="r", k_sigma=3.0)
    result = await run_analysis(subgrouped_db, SUBGROUPED_DATASET_ID, request)

    assert result.sigma.sigma_hat > 0
    assert result.sigma.method == "range"
    assert len(result.limits.ucl) == 4
    assert len(result.limits.cl) == 4
    assert len(result.limits.lcl) == 4


# --- S Chart ---

@pytest.mark.asyncio
async def test_s_chart(subgrouped_db):
    """S chart produces per-subgroup standard deviation values."""
    request = AnalysisRequest(chart_type="s", k_sigma=3.0)
    result = await run_analysis(subgrouped_db, SUBGROUPED_DATASET_ID, request)

    assert result.sigma.sigma_hat > 0
    assert result.sigma.method == "stddev"
    assert len(result.limits.ucl) == 4


# --- MR Chart ---

@pytest.mark.asyncio
async def test_mr_chart(seeded_db):
    """MR chart produces moving range values."""
    request = AnalysisRequest(chart_type="mr", k_sigma=3.0)
    result = await run_analysis(seeded_db, DATASET_ID, request)

    assert result.sigma.sigma_hat > 0
    # MR chart produces n-1 moving ranges for n=20 individual values
    assert len(result.limits.ucl) == 19
    assert len(result.limits.cl) == 19
    assert len(result.limits.lcl) == 19


# --- G Chart ---

@pytest.mark.asyncio
async def test_g_chart(seeded_db):
    """G chart produces results from individual count data."""
    request = AnalysisRequest(chart_type="g", k_sigma=3.0)
    result = await run_analysis(seeded_db, DATASET_ID, request)

    assert result.sigma.sigma_hat > 0
    assert result.sigma.method == "g_chart"
    assert len(result.limits.ucl) == 20


# --- T Chart ---

@pytest.mark.asyncio
async def test_t_chart(seeded_db):
    """T chart produces results from inter-arrival time data."""
    request = AnalysisRequest(chart_type="t", k_sigma=3.0)
    result = await run_analysis(seeded_db, DATASET_ID, request)

    assert result.sigma.sigma_hat > 0
    assert result.sigma.method == "t_chart"
    assert len(result.limits.ucl) == 20


# --- Three-Way Chart ---

@pytest.mark.asyncio
async def test_three_way_chart(subgrouped_db):
    """Three-Way chart produces between-subgroup results."""
    request = AnalysisRequest(chart_type="three_way", k_sigma=3.0)
    result = await run_analysis(subgrouped_db, SUBGROUPED_DATASET_ID, request)

    assert result.sigma.sigma_hat > 0
    assert result.sigma.method == "three_way"
    assert len(result.limits.ucl) == 4


@pytest.mark.asyncio
async def test_three_way_with_stddev(subgrouped_db):
    """Three-Way chart with within_method=stddev."""
    request = AnalysisRequest(
        chart_type="three_way", within_method="stddev", k_sigma=3.0,
    )
    result = await run_analysis(subgrouped_db, SUBGROUPED_DATASET_ID, request)

    assert result.sigma.sigma_hat > 0
    assert len(result.limits.ucl) == 4


# --- Short Run Chart ---

@pytest.mark.asyncio
async def test_short_run_chart(short_run_db):
    """Short Run chart with centered scaling."""
    request = AnalysisRequest(chart_type="short_run", k_sigma=3.0)
    result = await run_analysis(short_run_db, SHORT_RUN_DATASET_ID, request)

    assert result.sigma.sigma_hat > 0
    assert result.sigma.method == "short_run"
    assert len(result.limits.ucl) == 20  # 10 + 10 measurements


@pytest.mark.asyncio
async def test_short_run_standardized(short_run_db):
    """Short Run chart with standardized scaling."""
    request = AnalysisRequest(
        chart_type="short_run", scaling="standardized", k_sigma=3.0,
    )
    result = await run_analysis(short_run_db, SHORT_RUN_DATASET_ID, request)

    assert result.sigma.sigma_hat > 0
    assert len(result.limits.ucl) == 20


# --- Run Chart ---

@pytest.mark.asyncio
async def test_run_chart(seeded_db):
    """Run chart produces results with center line (no control limits)."""
    request = AnalysisRequest(chart_type="run", k_sigma=3.0)
    result = await run_analysis(seeded_db, DATASET_ID, request)

    assert result.sigma.sigma_hat > 0
    assert result.sigma.method == "run_chart"
    assert len(result.limits.ucl) == 20
    assert len(result.limits.cl) == 20
    # UCL and LCL should be wider than CL (not degenerate)
    assert result.limits.ucl[0] > result.limits.cl[0]
    assert result.limits.lcl[0] < result.limits.cl[0]


@pytest.mark.asyncio
async def test_run_chart_mean_center(seeded_db):
    """Run chart with center_method=mean."""
    request = AnalysisRequest(
        chart_type="run", center_method="mean", k_sigma=3.0,
    )
    result = await run_analysis(seeded_db, DATASET_ID, request)

    assert result.sigma.sigma_hat > 0
    assert len(result.limits.cl) == 20


# --- Presummarize Chart ---

@pytest.mark.asyncio
async def test_presummarize_chart(subgrouped_db):
    """Presummarize chart with known target and sigma."""
    request = AnalysisRequest(
        chart_type="presummarize",
        target=10.3,
        sigma=0.2,
        k_sigma=3.0,
    )
    result = await run_analysis(subgrouped_db, SUBGROUPED_DATASET_ID, request)

    assert result.sigma.sigma_hat > 0
    assert len(result.limits.ucl) == 4


@pytest.mark.asyncio
async def test_presummarize_requires_params(seeded_db):
    """Presummarize without target/sigma raises ValueError."""
    request = AnalysisRequest(chart_type="presummarize", k_sigma=3.0)
    with pytest.raises(ValueError, match="requires 'target' and 'sigma'"):
        await run_analysis(seeded_db, DATASET_ID, request)


# --- CUSUM V-Mask Chart ---

@pytest.mark.asyncio
async def test_cusum_vmask_chart(seeded_db):
    """CUSUM V-Mask chart produces cumulative sum values."""
    request = AnalysisRequest(chart_type="cusum_vmask", k_sigma=3.0)
    result = await run_analysis(seeded_db, DATASET_ID, request)

    assert result.sigma.sigma_hat > 0
    assert len(result.limits.ucl) == 20
    assert len(result.limits.cl) == 20


@pytest.mark.asyncio
async def test_cusum_vmask_with_params(seeded_db):
    """CUSUM V-Mask with explicit h, k_slack, target."""
    request = AnalysisRequest(
        chart_type="cusum_vmask",
        target=10.3,
        h=4.0,
        k_slack=0.5,
        k_sigma=3.0,
    )
    result = await run_analysis(seeded_db, DATASET_ID, request)

    assert result.sigma.sigma_hat > 0
    # Limits should reflect h=4.0
    assert result.limits.ucl[0] == pytest.approx(4.0)
    assert result.limits.lcl[0] == pytest.approx(-4.0)


# --- Hotelling T² Chart ---

@pytest.mark.asyncio
async def test_hotelling_t2_chart(multivariate_db):
    """Hotelling T² chart produces T² statistics from multivariate data."""
    request = AnalysisRequest(chart_type="hotelling_t2", k_sigma=3.0)
    result = await run_analysis(multivariate_db, MULTIVARIATE_DATASET_ID, request)

    assert result.sigma.sigma_hat > 0
    assert result.sigma.method == "hotelling_t2"
    assert len(result.limits.ucl) == 15
    # UCL should be positive (F-distribution based)
    assert result.limits.ucl[0] > 0
    # CL should be 0
    assert result.limits.cl[0] == 0.0
    # Capability should not be computed for multivariate charts
    assert result.capability is None


@pytest.mark.asyncio
async def test_hotelling_t2_phase2(multivariate_db):
    """Hotelling T² Phase II chart."""
    request = AnalysisRequest(
        chart_type="hotelling_t2", phase=2, alpha=0.005, k_sigma=3.0,
    )
    result = await run_analysis(multivariate_db, MULTIVARIATE_DATASET_ID, request)

    assert len(result.limits.ucl) == 15


# --- MEWMA Chart ---

@pytest.mark.asyncio
async def test_mewma_chart(multivariate_db):
    """MEWMA chart produces T² statistics from multivariate data."""
    request = AnalysisRequest(chart_type="mewma", k_sigma=3.0)
    result = await run_analysis(multivariate_db, MULTIVARIATE_DATASET_ID, request)

    assert result.sigma.sigma_hat > 0
    assert result.sigma.method == "mewma"
    assert len(result.limits.ucl) == 15
    assert result.limits.ucl[0] > 0
    assert result.capability is None


@pytest.mark.asyncio
async def test_mewma_with_lambda(multivariate_db):
    """MEWMA with explicit lambda parameter."""
    request = AnalysisRequest(
        chart_type="mewma", lambda_=0.1, k_sigma=3.0,
    )
    result = await run_analysis(multivariate_db, MULTIVARIATE_DATASET_ID, request)

    assert len(result.limits.ucl) == 15


# --- Multivariate error handling ---

@pytest.mark.asyncio
async def test_multivariate_requires_raw_data(seeded_db):
    """Multivariate chart without raw_data.variables raises ValueError."""
    request = AnalysisRequest(chart_type="hotelling_t2", k_sigma=3.0)
    with pytest.raises(ValueError, match="variables"):
        await run_analysis(seeded_db, DATASET_ID, request)


# --- HTTP endpoint tests ---

@pytest.fixture
def client(seeded_db: AsyncSession):
    """FastAPI TestClient with seeded session."""
    from fastapi.testclient import TestClient
    from api.main import app
    from api.database import get_db

    async def override_get_db():
        yield seeded_db

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
    app.dependency_overrides.clear()


def test_post_analyze_returns_violations(client):
    """POST /analyze endpoint includes violations in response."""
    resp = client.post(
        f"/api/datasets/{DATASET_ID}/analyze",
        json={"chart_type": "imr", "nelson_tests": [1, 2, 3, 4, 5]},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert "violations" in data
    assert isinstance(data["violations"], list)


def test_post_analyze_invalid_chart_type_400(client):
    """POST /analyze with invalid chart_type returns 400."""
    resp = client.post(
        f"/api/datasets/{DATASET_ID}/analyze",
        json={"chart_type": "invalid_type"},
    )
    assert resp.status_code == 400
    assert "Unknown chart type" in resp.json()["detail"]


def test_post_analyze_levey_jennings_endpoint(client):
    """POST /analyze with levey_jennings chart type works."""
    resp = client.post(
        f"/api/datasets/{DATASET_ID}/analyze",
        json={"chart_type": "levey_jennings"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["sigma"]["method"] == "levey_jennings"
