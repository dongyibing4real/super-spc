"""FastAPI application for Super SPC."""
from __future__ import annotations

import csv
import json
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select

from .database import close_db, get_session_factory, init_db
from .models import Dataset, Measurement
from .routes.analyze import router as analyze_router
from .routes.datasets import router as datasets_router

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = PROJECT_ROOT / "src" / "data" / "Socket Thickness.csv"


async def _seed_if_empty() -> None:
    """Seed the database from the CSV file if no datasets exist yet."""
    factory = get_session_factory()
    if factory is None:
        return

    async with factory() as session:
        count = (await session.execute(select(func.count(Dataset.id)))).scalar() or 0
        if count > 0:
            return

        if not CSV_PATH.exists():
            return

        dataset = Dataset(
            name="Socket Thickness",
            metadata_json=json.dumps({
                "source": "seed",
                "file": "Socket Thickness.csv",
                "columns": ["Thickness", "Hour", "Cycle", "Cavity", "Hour Cycle", "Hour Cavity"],
            }),
        )

        with open(CSV_PATH, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for idx, row in enumerate(reader):
                value = float(row["Thickness"])
                subgroup = row.get("Hour")
                metadata = {
                    k: v for k, v in row.items()
                    if k not in ("Thickness", "Hour")
                }
                dataset.measurements.append(
                    Measurement(
                        value=value,
                        subgroup=subgroup,
                        sequence_index=idx,
                        metadata_json=json.dumps(metadata) if metadata else None,
                    )
                )

        session.add(dataset)
        await session.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown lifecycle."""
    await init_db()
    await _seed_if_empty()
    yield
    await close_db()


app = FastAPI(
    title="Super SPC API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:4173",
        "http://localhost:5173",
        "http://127.0.0.1:4173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(datasets_router)
app.include_router(analyze_router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
