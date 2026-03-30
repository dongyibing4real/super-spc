"""SQLAlchemy ORM models for Super SPC."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    """Base class for all ORM models."""
    pass


def _generate_uuid() -> str:
    return str(uuid.uuid4())


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Dataset(Base):
    __tablename__ = "datasets"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_generate_uuid)
    name: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    metadata_json: Mapped[str | None] = mapped_column("metadata", Text, nullable=True)

    data_rows: Mapped[list[DataRow]] = relationship(
        back_populates="dataset", cascade="all, delete-orphan", passive_deletes=True,
    )
    columns: Mapped[list[DatasetColumn]] = relationship(
        back_populates="dataset", cascade="all, delete-orphan", passive_deletes=True,
    )
    analyses: Mapped[list[Analysis]] = relationship(
        back_populates="dataset", cascade="all, delete-orphan", passive_deletes=True,
    )
    findings: Mapped[list[Finding]] = relationship(
        back_populates="dataset", cascade="all, delete-orphan", passive_deletes=True,
    )


class DatasetColumn(Base):
    __tablename__ = "dataset_columns"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    dataset_id: Mapped[str] = mapped_column(
        ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    ordinal: Mapped[int] = mapped_column(Integer, nullable=False)
    dtype: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str | None] = mapped_column(String, nullable=True)

    dataset: Mapped[Dataset] = relationship(back_populates="columns")


class DataRow(Base):
    __tablename__ = "data_rows"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    dataset_id: Mapped[str] = mapped_column(
        ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    sequence_index: Mapped[int] = mapped_column(Integer, nullable=False)
    metadata_json: Mapped[str | None] = mapped_column("metadata", Text, nullable=True)
    raw_json: Mapped[str | None] = mapped_column("raw_data", Text, nullable=True)

    dataset: Mapped[Dataset] = relationship(back_populates="data_rows")

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Transient attributes for analysis-time use (not persisted to DB)
        self.value: float = 0.0
        self.subgroup: str | None = None


class Analysis(Base):
    __tablename__ = "analyses"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_generate_uuid)
    dataset_id: Mapped[str] = mapped_column(
        ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    sigma_method: Mapped[str] = mapped_column(String, nullable=False)
    sigma: Mapped[str] = mapped_column(Text, nullable=False)
    limits: Mapped[str] = mapped_column(Text, nullable=False)
    zones: Mapped[str] = mapped_column(Text, nullable=False)
    capability: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    dataset: Mapped[Dataset] = relationship(back_populates="analyses")


class Finding(Base):
    __tablename__ = "findings"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_generate_uuid)
    dataset_id: Mapped[str] = mapped_column(
        ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    title: Mapped[str] = mapped_column(String, nullable=False)
    severity: Mapped[str] = mapped_column(String, nullable=False)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    evidence: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    dataset: Mapped[Dataset] = relationship(back_populates="findings")
