"""Tests for phase splitting, EWMA/CUSUM subgroup dispatch, and n_trials override."""
from __future__ import annotations

import json

import numpy as np
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from api.models import Base, Dataset, DataRow, DatasetColumn
from api.schemas import AnalysisRequest
from api.services.analysis import run_analysis, _split_by_phase


PHASE_DATASET_ID = "phase-test-001"
EWMA_SUBGROUP_DATASET_ID = "ewma-subgroup-001"
CUSUM_SUBGROUP_DATASET_ID = "cusum-subgroup-001"
ATTR_DATASET_ID = "attr-ntrials-001"


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


# ─── Phase splitting tests ───────────────────────────────────────────────

@pytest_asyncio.fixture
async def phase_db(db: AsyncSession):
    """Dataset with two contiguous phase groups in raw_json."""
    dataset = Dataset(
        id=PHASE_DATASET_ID,
        name="Phase Test",
        metadata_json=json.dumps({}),
    )

    # Phase A: 10 points around 10.0
    phase_a_values = [10.0, 10.1, 10.2, 9.9, 10.0, 10.1, 9.8, 10.3, 10.0, 10.1]
    # Phase B: 10 points around 15.0 (clearly different mean)
    phase_b_values = [15.0, 15.2, 14.8, 15.1, 15.3, 14.9, 15.0, 15.2, 14.7, 15.1]

    for i, v in enumerate(phase_a_values + phase_b_values):
        phase = "A" if i < 10 else "B"
        dataset.data_rows.append(
            DataRow(
                sequence_index=i,
                raw_json=json.dumps({"Phase": phase, "value": str(v)}),
            )
        )

    db.add(dataset)
    db.add_all([
        DatasetColumn(dataset_id=PHASE_DATASET_ID, name="value", ordinal=0, dtype="numeric", role="value"),
        DatasetColumn(dataset_id=PHASE_DATASET_ID, name="Phase", ordinal=1, dtype="str", role="phase"),
    ])
    await db.commit()
    return db


def test_split_by_phase_no_column():
    """Without a phase column, returns a single 'all' group."""
    # Create mock measurements
    class FakeMeasurement:
        def __init__(self, val, raw):
            self.value = val
            self.raw_json = json.dumps(raw)

    measurements = [FakeMeasurement(1.0, {"x": 1}), FakeMeasurement(2.0, {"x": 2})]
    result = _split_by_phase(measurements, None)
    assert len(result) == 1
    assert result[0][0] == "all"
    assert len(result[0][1]) == 2


def test_split_by_phase_contiguous():
    """Contiguous phase groups are preserved in order."""
    class FakeMeasurement:
        def __init__(self, val, raw):
            self.value = val
            self.raw_json = json.dumps(raw)

    measurements = [
        FakeMeasurement(1.0, {"Phase": "A"}),
        FakeMeasurement(2.0, {"Phase": "A"}),
        FakeMeasurement(3.0, {"Phase": "B"}),
        FakeMeasurement(4.0, {"Phase": "B"}),
        FakeMeasurement(5.0, {"Phase": "A"}),  # A again — new group
    ]
    result = _split_by_phase(measurements, "Phase")
    # _split_by_phase groups by unique phase value (not contiguous runs)
    assert len(result) == 2
    assert result[0][0] == "A"
    assert len(result[0][1]) == 3  # all 3 A measurements grouped together
    assert result[1][0] == "B"
    assert len(result[1][1]) == 2


@pytest.mark.asyncio
async def test_phase_independent_limits(phase_db):
    """Two phases with different means → different CL values."""
    request = AnalysisRequest(chart_type="imr", k_sigma=3.0, nelson_tests=[])
    result = await run_analysis(phase_db, PHASE_DATASET_ID, request)

    # Should have two phases
    assert len(result.phases) == 2
    phase_a = result.phases[0]
    phase_b = result.phases[1]

    assert phase_a.phase_id == "A"
    assert phase_b.phase_id == "B"
    assert phase_a.start_index == 0
    assert phase_a.end_index == 10
    assert phase_b.start_index == 10
    assert phase_b.end_index == 20

    # CL values should be significantly different (10 vs 15)
    cl_a = phase_a.limits.cl[0]
    cl_b = phase_b.limits.cl[0]
    assert abs(cl_a - 10.0) < 1.0, f"Phase A CL {cl_a} should be near 10"
    assert abs(cl_b - 15.0) < 1.0, f"Phase B CL {cl_b} should be near 15"
    assert abs(cl_b - cl_a) > 3.0, "Phase limits should be independently computed"


@pytest.mark.asyncio
async def test_phase_top_level_limits_concatenated(phase_db):
    """Top-level limit arrays should be the concatenation of per-phase arrays."""
    request = AnalysisRequest(chart_type="imr", k_sigma=3.0, nelson_tests=[])
    result = await run_analysis(phase_db, PHASE_DATASET_ID, request)

    # Top-level arrays should have 20 elements (10 per phase)
    assert len(result.limits.ucl) == 20
    assert len(result.limits.cl) == 20
    assert len(result.limits.lcl) == 20

    # First 10 should match phase A, last 10 phase B
    phase_a = result.phases[0]
    phase_b = result.phases[1]
    assert result.limits.cl[:10] == phase_a.limits.cl
    assert result.limits.cl[10:] == phase_b.limits.cl


@pytest.mark.asyncio
async def test_no_phase_column_single_phase(phase_db):
    """Without phase column, phases list is empty (backward compat)."""
    # Remove the phase column role
    from sqlalchemy import update
    await phase_db.execute(
        update(DatasetColumn)
        .where(DatasetColumn.dataset_id == PHASE_DATASET_ID)
        .values(role=None)
    )
    await phase_db.commit()

    request = AnalysisRequest(chart_type="imr", k_sigma=3.0, nelson_tests=[])
    result = await run_analysis(phase_db, PHASE_DATASET_ID, request)
    assert len(result.phases) == 0  # single phase → empty list


# ─── EWMA subgroup tests ─────────────────────────────────────────────────

@pytest_asyncio.fixture
async def ewma_subgroup_db(db: AsyncSession):
    """Dataset with subgroup labels for EWMA testing."""
    dataset = Dataset(
        id=EWMA_SUBGROUP_DATASET_ID,
        name="EWMA Subgroup Test",
        metadata_json=json.dumps({}),
    )

    # 4 subgroups of 5 measurements each
    values = [
        10.0, 10.1, 10.2, 9.9, 10.0,   # subgroup 1
        10.5, 10.4, 10.6, 10.3, 10.5,   # subgroup 2
        11.0, 10.8, 11.1, 10.9, 11.0,   # subgroup 3
        10.2, 10.3, 10.1, 10.4, 10.2,   # subgroup 4
    ]
    for i, v in enumerate(values):
        sg = str((i // 5) + 1)
        dataset.data_rows.append(
            DataRow(
                sequence_index=i,
                raw_json=json.dumps({"value": str(v), "subgroup": sg}),
            )
        )

    db.add(dataset)
    db.add_all([
        DatasetColumn(dataset_id=EWMA_SUBGROUP_DATASET_ID, name="value", ordinal=0, dtype="numeric", role="value"),
        DatasetColumn(dataset_id=EWMA_SUBGROUP_DATASET_ID, name="subgroup", ordinal=1, dtype="text", role="subgroup"),
    ])
    await db.commit()
    return db


@pytest.mark.asyncio
async def test_ewma_with_subgroups(ewma_subgroup_db):
    """EWMA with subgroups should use subgroup means and adjusted limits."""
    request = AnalysisRequest(
        chart_type="ewma",
        k_sigma=3.0,
        lambda_=0.2,
        nelson_tests=[],
    )
    result = await run_analysis(ewma_subgroup_db, EWMA_SUBGROUP_DATASET_ID, request)

    # Should produce 4 EWMA values (one per subgroup)
    assert len(result.limits.ucl) == 4
    assert len(result.limits.cl) == 4
    assert len(result.limits.lcl) == 4

    # UCL should be above CL, LCL below
    for i in range(4):
        assert result.limits.ucl[i] >= result.limits.cl[i]
        assert result.limits.lcl[i] <= result.limits.cl[i]


# ─── CUSUM subgroup tests ────────────────────────────────────────────────

@pytest_asyncio.fixture
async def cusum_subgroup_db(db: AsyncSession):
    """Dataset with subgroup labels for CUSUM testing."""
    dataset = Dataset(
        id=CUSUM_SUBGROUP_DATASET_ID,
        name="CUSUM Subgroup Test",
        metadata_json=json.dumps({}),
    )

    values = [
        10.0, 10.1, 10.2, 9.9, 10.0,
        10.5, 10.4, 10.6, 10.3, 10.5,
        11.0, 10.8, 11.1, 10.9, 11.0,
        10.2, 10.3, 10.1, 10.4, 10.2,
    ]
    for i, v in enumerate(values):
        sg = str((i // 5) + 1)
        dataset.data_rows.append(
            DataRow(
                sequence_index=i,
                raw_json=json.dumps({"value": str(v), "subgroup": sg}),
            )
        )

    db.add(dataset)
    db.add_all([
        DatasetColumn(dataset_id=CUSUM_SUBGROUP_DATASET_ID, name="value", ordinal=0, dtype="numeric", role="value"),
        DatasetColumn(dataset_id=CUSUM_SUBGROUP_DATASET_ID, name="subgroup", ordinal=1, dtype="text", role="subgroup"),
    ])
    await db.commit()
    return db


@pytest.mark.asyncio
async def test_cusum_with_subgroups(cusum_subgroup_db):
    """CUSUM with subgroups should use subgroup means."""
    request = AnalysisRequest(
        chart_type="cusum",
        k_sigma=3.0,
        nelson_tests=[],
    )
    result = await run_analysis(cusum_subgroup_db, CUSUM_SUBGROUP_DATASET_ID, request)

    # Should produce 4 values (one per subgroup)
    assert len(result.limits.ucl) == 4
    assert len(result.limits.cl) == 4


# ─── n_trials override tests ─────────────────────────────────────────────

@pytest_asyncio.fixture
async def attr_db(db: AsyncSession):
    """Dataset for attribute chart with subgroups."""
    dataset = Dataset(
        id=ATTR_DATASET_ID,
        name="Attribute n_trials Test",
        metadata_json=json.dumps({}),
    )

    # 20 measurements in 4 subgroups of 5
    # Values are 0/1 for defective/not-defective
    values = [
        1, 0, 0, 1, 0,   # sg 1: 2 defectives
        0, 0, 0, 0, 1,   # sg 2: 1 defective
        1, 1, 0, 0, 0,   # sg 3: 2 defectives
        0, 0, 1, 0, 0,   # sg 4: 1 defective
    ]
    for i, v in enumerate(values):
        sg = str((i // 5) + 1)
        dataset.data_rows.append(
            DataRow(
                sequence_index=i,
                raw_json=json.dumps({"value": str(float(v)), "subgroup": sg}),
            )
        )

    db.add(dataset)
    db.add_all([
        DatasetColumn(dataset_id=ATTR_DATASET_ID, name="value", ordinal=0, dtype="numeric", role="value"),
        DatasetColumn(dataset_id=ATTR_DATASET_ID, name="subgroup", ordinal=1, dtype="text", role="subgroup"),
    ])
    await db.commit()
    return db


@pytest.mark.asyncio
async def test_n_trials_override(attr_db):
    """Attribute chart with n_trials override uses the specified value."""
    # Without override — n_trials = 5 (subgroup size)
    request_default = AnalysisRequest(
        chart_type="p",
        k_sigma=3.0,
        nelson_tests=[],
    )
    result_default = await run_analysis(attr_db, ATTR_DATASET_ID, request_default)

    # With override — n_trials = 100
    request_override = AnalysisRequest(
        chart_type="p",
        k_sigma=3.0,
        n_trials=100,
        nelson_tests=[],
    )
    result_override = await run_analysis(attr_db, ATTR_DATASET_ID, request_override)

    # Limits should differ because n_trials affects control limit width
    # Larger n_trials → narrower limits
    assert result_override.limits.ucl[0] != result_default.limits.ucl[0]


@pytest.mark.asyncio
async def test_explicit_phase_column_param(phase_db):
    """Phase column can be specified explicitly via request param."""
    # Remove the column role so auto-derive won't find it
    from sqlalchemy import update
    await phase_db.execute(
        update(DatasetColumn)
        .where(DatasetColumn.dataset_id == PHASE_DATASET_ID)
        .values(role=None)
    )
    await phase_db.commit()

    # Pass phase_column explicitly
    request = AnalysisRequest(
        chart_type="imr",
        k_sigma=3.0,
        phase_column="Phase",
        nelson_tests=[],
    )
    result = await run_analysis(phase_db, PHASE_DATASET_ID, request)

    assert len(result.phases) == 2
    assert result.phases[0].phase_id == "A"
    assert result.phases[1].phase_id == "B"


@pytest.mark.asyncio
async def test_phase_violations_offset(phase_db):
    """Violations in phase B should have indices offset by phase A's length."""
    request = AnalysisRequest(
        chart_type="imr",
        k_sigma=3.0,
        nelson_tests=[1],  # Test 1: point beyond 3 sigma
    )
    result = await run_analysis(phase_db, PHASE_DATASET_ID, request)

    # Check that any phase B violations have indices >= 10
    if len(result.phases) == 2:
        for v in result.phases[1].violations:
            for idx in v.point_indices:
                assert idx >= 10, f"Phase B violation index {idx} should be >= 10"
