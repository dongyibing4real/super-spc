"""Pydantic models for API request/response serialization."""
from __future__ import annotations

from pydantic import BaseModel, Field


# --- Dataset ---

class DatasetSummary(BaseModel):
    id: str
    name: str
    created_at: str
    point_count: int
    metadata: dict | None = None


class MeasurementOut(BaseModel):
    id: int
    value: float
    subgroup: str | None = None
    sequence_index: int
    metadata: dict | None = None


# --- Analysis request/response ---

class AnalysisRequest(BaseModel):
    sigma_method: str = Field(
        default="moving_range",
        description="Sigma estimation method: moving_range, median_moving_range, "
                    "levey_jennings, range, stddev",
    )
    k_sigma: float = Field(default=3.0, gt=0, description="Number of sigma for control limits")
    usl: float | None = Field(default=None, description="Upper spec limit (for capability)")
    lsl: float | None = Field(default=None, description="Lower spec limit (for capability)")


class SigmaOut(BaseModel):
    sigma_hat: float
    method: str
    n_used: int


class LimitsOut(BaseModel):
    ucl: list[float]
    cl: list[float]
    lcl: list[float]
    k_sigma: float


class ZonesOut(BaseModel):
    zone_a_upper: float
    zone_b_upper: float
    cl: float
    zone_b_lower: float
    zone_a_lower: float


class CapabilityOut(BaseModel):
    cp: float | None = None
    cpk: float | None = None
    pp: float | None = None
    ppk: float | None = None


class AnalysisResult(BaseModel):
    id: str
    dataset_id: str
    sigma: SigmaOut
    limits: LimitsOut
    zones: ZonesOut
    capability: CapabilityOut | None = None
    created_at: str
