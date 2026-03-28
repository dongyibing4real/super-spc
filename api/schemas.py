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


class ColumnOut(BaseModel):
    name: str
    ordinal: int
    dtype: str
    role: str | None = None


class DatasetDetailOut(BaseModel):
    id: str
    name: str
    created_at: str
    columns: list[ColumnOut]
    point_count: int
    metadata: dict | None = None


class ColumnRoleUpdate(BaseModel):
    name: str
    role: str | None = None


class UpdateColumnsRequest(BaseModel):
    columns: list[ColumnRoleUpdate]


class MeasurementOut(BaseModel):
    id: int
    value: float
    subgroup: str | None = None
    sequence_index: int
    metadata: dict | None = None
    raw_data: dict | None = None


# --- Analysis request/response ---

class AnalysisRequest(BaseModel):
    chart_type: str = Field(
        default="imr",
        description="Chart type: imr, xbar_r, xbar_s, r, s, mr, p, np, c, u, "
                    "laney_p, laney_u, cusum, ewma, levey_jennings, three_way, "
                    "short_run, g, t, run, presummarize, cusum_vmask, "
                    "hotelling_t2, mewma",
    )
    sigma_method: str = Field(
        default="moving_range",
        description="Sigma estimation method: moving_range, median_moving_range, "
                    "levey_jennings, range, stddev",
    )
    k_sigma: float = Field(default=3.0, gt=0, description="Number of sigma for control limits")
    usl: float | None = Field(default=None, description="Upper spec limit (for capability)")
    lsl: float | None = Field(default=None, description="Lower spec limit (for capability)")
    # Chart-type-specific optional params
    target: float | None = Field(default=None, description="Process target (CUSUM, EWMA, Short Run)")
    lambda_: float | None = Field(default=None, description="EWMA smoothing parameter (0,1]")
    h: float | None = Field(default=None, description="CUSUM decision interval")
    k_slack: float | None = Field(default=None, description="CUSUM slack parameter")
    # Known parameters (presummarize, cusum_vmask)
    sigma: float | None = Field(default=None, description="Known process sigma (presummarize, cusum_vmask)")
    summary_stat: str | None = Field(default=None, description="Summary statistic: mean, median, individual (presummarize)")
    # Three-way chart
    within_method: str | None = Field(default=None, description="Within-subgroup method: range, stddev (three_way)")
    # Multivariate charts
    alpha: float | None = Field(default=None, description="Type I error rate (hotelling_t2, mewma)")
    phase: int | None = Field(default=None, description="Phase 1 (retrospective) or 2 (prospective) (hotelling_t2, mewma)")
    # Short run
    scaling: str | None = Field(default=None, description="Scaling method: centered, standardized (short_run)")
    # Run chart
    center_method: str | None = Field(default=None, description="Center method: median, mean (run chart)")
    # CUSUM V-Mask
    d_units: float | None = Field(default=None, description="Horizontal scale factor (cusum_vmask)")
    # Phase and subgroup overrides
    phase_column: str | None = Field(default=None, description="Column name for phase grouping")
    n_trials: int | None = Field(default=None, description="Number of trials for attribute charts")
    subgroup_size: int | None = Field(default=None, description="Override subgroup size")
    # Rule config
    nelson_tests: list[int] = Field(default=[1, 2, 3, 4, 5], description="Nelson test numbers to evaluate")
    westgard_rules: list[str] = Field(default=[], description="Westgard rule names to evaluate")


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


class RuleViolationOut(BaseModel):
    test_id: str
    point_indices: list[int]
    description: str


class PhaseResult(BaseModel):
    phase_id: str
    start_index: int
    end_index: int
    sigma: SigmaOut
    limits: LimitsOut
    zones: ZonesOut
    capability: CapabilityOut | None = None
    violations: list[RuleViolationOut] = []


class AnalysisResult(BaseModel):
    id: str
    dataset_id: str
    sigma: SigmaOut
    limits: LimitsOut
    zones: ZonesOut
    capability: CapabilityOut | None = None
    violations: list[RuleViolationOut] = []
    phases: list[PhaseResult] = []
    created_at: str
