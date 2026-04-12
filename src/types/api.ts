/**
 * API response types — mirrors the Pydantic schemas in api/schemas.py.
 */

export interface DatasetSummary {
  id: string;
  name: string;
  created_at: string;
  point_count: number;
  metadata: Record<string, unknown> | null;
}

export interface DatasetDetail extends DatasetSummary {
  columns: ColumnOut[];
}

export interface ColumnOut {
  name: string;
  ordinal: number;
  dtype: string;
  role: string | null;
}

export interface DataRowOut {
  id: number;
  sequence_index: number;
  metadata: Record<string, unknown> | null;
  raw_data: Record<string, string> | null;
}

export interface SigmaOut {
  sigma_hat: number;
  method: string;
  n_used: number;
}

export interface LimitsOut {
  ucl: number[];
  cl: number[];
  lcl: number[];
  k_sigma: number;
}

export interface ZonesOut {
  zone_a_upper: number;
  zone_b_upper: number;
  cl: number;
  zone_b_lower: number;
  zone_a_lower: number;
}

export interface CapabilityOut {
  cp: number;
  cpk: number;
  pp: number;
  ppk: number;
}

export interface ViolationOut {
  test_id: string | number;
  point_indices: number[];
  description: string;
}

export interface PhaseOut {
  phase_id: string;
  start_index: number;
  end_index: number;
  limits: LimitsOut;
}

export interface AnalysisResult {
  id: string;
  dataset_id: string;
  sigma: SigmaOut | null;
  limits: LimitsOut;
  zones: ZonesOut | null;
  capability: CapabilityOut | null;
  violations?: ViolationOut[];
  phases?: PhaseOut[];
  chart_values?: number[];
  chart_labels?: string[];
  created_at: string;
}

export interface ForecastPointOut {
  x: number;
  y: number;
}

export interface ForecastConfidenceOut {
  x: number;
  upper: number;
  lower: number;
}

export interface ForecastDriftOut {
  score: number;
  intent: string;
  ooc_estimate: number | null;
  label: string;
}

export interface ForecastOut {
  projected: ForecastPointOut[];
  confidence: ForecastConfidenceOut[];
  drift: ForecastDriftOut;
  model_name: string;
  fit_time_ms: number;
  cache_key: string | null;
}

export interface CreateDatasetRequest {
  name: string;
  columns: { name: string; dtype?: string; role?: string | null }[];
  rows: Record<string, unknown>[];
}

export interface ColumnRoleUpdate {
  name: string;
  role: string | null;
}

export interface AnalysisRequest {
  sigma_method?: string;
  k_sigma?: number;
  nelson_tests?: number[];
  value_column?: string | null;
  subgroup_column?: string | null;
  phase_column?: string | null;
  n_trials?: number | null;
  usl?: number | null;
  lsl?: number | null;
  target?: number | null;
  chart_type?: string | null;
}
