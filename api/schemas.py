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


class DataRowOut(BaseModel):
    id: int
    sequence_index: int
    metadata: dict | None = None
    raw_data: dict | None = None


class CreateDatasetRequest(BaseModel):
    name: str
    columns: list[ColumnOut]
    rows: list[dict]


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
    # Column overrides — per-chart column assignment
    value_column: str | None = Field(default=None, description="Column name for Y values (overrides dataset default)")
    subgroup_column: str | None = Field(default=None, description="Column name for subgroup grouping (overrides dataset default)")
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
    chart_values: list[float] = []
    chart_labels: list[str] = []


class AnalysisResult(BaseModel):
    id: str
    dataset_id: str
    sigma: SigmaOut
    limits: LimitsOut
    zones: ZonesOut
    capability: CapabilityOut | None = None
    violations: list[RuleViolationOut] = []
    phases: list[PhaseResult] = []
    chart_values: list[float] = []
    chart_labels: list[str] = []
    created_at: str


# --- Forecast ---

class ForecastRequest(BaseModel):
    horizon: int = Field(default=6, ge=1, description="Number of future points to forecast")
    confidence_level: float = Field(default=0.95, gt=0, lt=1, description="Confidence level for prediction intervals")
    value_column: str | None = Field(default=None, description="Column name for Y values (overrides dataset default)")
    time_budget: int = Field(default=3, ge=1, le=120, description="FLAML fitting time budget in seconds")
    values: list[float] | None = Field(default=None, description="Chart-specific values to forecast (overrides DB load)")
    limits: dict | None = Field(default=None, description="UCL/LCL for OOC estimation, e.g. {ucl: 12.5, lcl: 7.5}")


class ForecastPredictRequest(BaseModel):
    horizon: int = Field(default=6, ge=1, description="Number of future points to forecast")
    confidence_level: float = Field(default=0.95, gt=0, lt=1, description="Confidence level for prediction intervals")
    cache_key: str | None = Field(default=None, description="Cache key from initial forecast (for per-chart model isolation)")


class ForecastPointOut(BaseModel):
    x: float
    y: float


class ForecastConfidenceOut(BaseModel):
    x: float
    upper: float
    lower: float


class DriftSummaryOut(BaseModel):
    score: float
    intent: str
    ooc_estimate: int | None = None
    label: str


class ForecastResponse(BaseModel):
    projected: list[ForecastPointOut]
    confidence: list[ForecastConfidenceOut]
    drift: DriftSummaryOut
    model_name: str
    fit_time_ms: int
    cache_key: str | None = None
