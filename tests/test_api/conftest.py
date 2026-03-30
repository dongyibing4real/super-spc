"""Shared fixtures for API tests — SQLAlchemy async session."""
from __future__ import annotations

import json
from datetime import datetime, timezone

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from api.models import Base, Dataset, DataRow, DatasetColumn


SEED_DATASET_ID = "test-dataset-001"


@pytest_asyncio.fixture
async def db():
    """In-memory SQLite database with schema applied via SQLAlchemy."""
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
    """Database session with a test dataset and measurements."""
    dataset = Dataset(
        id=SEED_DATASET_ID,
        name="Test Dataset",
        metadata_json=json.dumps({"source": "test"}),
    )

    # Add columns (value + subgroup)
    db.add_all([
        DatasetColumn(dataset_id=SEED_DATASET_ID, name="value", ordinal=0, dtype="numeric", role="value"),
        DatasetColumn(dataset_id=SEED_DATASET_ID, name="subgroup", ordinal=1, dtype="text", role="subgroup"),
    ])

    # 20 individual data rows with known values for verification
    values = [
        10.0, 10.2, 10.1, 10.3, 10.0,
        10.2, 10.4, 10.1, 10.3, 10.2,
        10.5, 10.3, 10.4, 10.2, 10.6,
        10.3, 10.5, 10.4, 10.7, 10.5,
    ]
    for i, v in enumerate(values):
        dataset.data_rows.append(
            DataRow(
                sequence_index=i,
                raw_json=json.dumps({"value": str(v), "subgroup": str((i // 5) + 1)}),
            )
        )

    db.add(dataset)
    await db.commit()
    return db


@pytest.fixture
def client(seeded_db: AsyncSession):
    """FastAPI TestClient with the seeded session injected."""
    from fastapi.testclient import TestClient
    from api.main import app
    from api.database import get_db

    async def override_get_db():
        yield seeded_db

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
    app.dependency_overrides.clear()
