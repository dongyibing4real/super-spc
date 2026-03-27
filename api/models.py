"""SQLAlchemy ORM models for Super SPC."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func
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

    measurements: Mapped[list[Measurement]] = relationship(
        back_populates="dataset", cascade="all, delete-orphan", passive_deletes=True,
    )
    analyses: Mapped[list[Analysis]] = relationship(
        back_populates="dataset", cascade="all, delete-orphan", passive_deletes=True,
    )
    findings: Mapped[list[Finding]] = relationship(
        back_populates="dataset", cascade="all, delete-orphan", passive_deletes=True,
    )


class Measurement(Base):
    __tablename__ = "measurements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    dataset_id: Mapped[str] = mapped_column(
        ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    value: Mapped[float] = mapped_column(Float, nullable=False)
    subgroup: Mapped[str | None] = mapped_column(String, nullable=True)
    sequence_index: Mapped[int] = mapped_column(Integer, nullable=False)
    metadata_json: Mapped[str | None] = mapped_column("metadata", Text, nullable=True)

    dataset: Mapped[Dataset] = relationship(back_populates="measurements")


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
