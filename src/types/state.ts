/**
 * Frontend state shape types — mirrors createInitialState() in core/state/init.ts.
 */

import type { ForecastPointOut, ForecastConfidenceOut } from './api.ts';

export interface ChartParams {
  chart_type: string | null;
  sigma_method: string;
  k_sigma: number;
  nelson_tests: number[];
  value_column: string | null;
  subgroup_column: string | null;
  phase_column: string | null;
  n_trials: number | null;
  usl: number | null;
  lsl: number | null;
  target: number | null;
}

export interface ContextField {
  id: string | null;
  label: string;
  detail?: string;
  unit?: string;
}

export interface ChartContext {
  title: string;
  metric: ContextField;
  subgroup: ContextField;
  phase: ContextField;
  chartType: ContextField;
  sigma: { label: string; detail: string };
  tests: { label: string; detail: string };
  compare: { label: string; detail: string };
  window: string;
  methodBadge: string;
  status: string;
}

export interface ChartLimits {
  center: number;
  ucl: number;
  lcl: number;
  usl: number | null;
  lsl: number | null;
  version: string;
  scope: string;
}

export interface SlotCapability {
  cp: number;
  cpk: number;
  ppk: number;
}

export interface SlotSigma {
  sigma_hat: number;
  method: string;
  n_used: number;
}

export interface SlotZones {
  zone_a_upper: number;
  zone_b_upper: number;
  cl: number;
  zone_b_lower: number;
  zone_a_lower: number;
}

export interface Violation {
  testId: string;
  indices: number[];
  description: string;
}

export interface SlotPhase {
  id: string;
  start: number;
  end: number;
  limits: { center: number; ucl: number; lcl: number };
}

export interface ForecastResult {
  projected: ForecastPointOut[];
  confidence: ForecastConfidenceOut[];
  driftScore: number;
  oocEstimate: number | null;
}

export type ForecastMode = "hidden" | "prompt" | "loading" | "active";

export interface DriftSummary {
  score: number;
  intent: string;
  oocEstimate: number | null;
  label: string;
}

export interface ForecastState {
  mode: ForecastMode;
  horizon: number;
  timeBudget: number;
  result: ForecastResult | null;
  driftSummary: DriftSummary | null;
  cacheKey: string | null;
  visibleHorizon: number;
}

export interface CascadeMemory {
  lastIndividualType: string | null;
  lastSubgroupedType: string | null;
}

export interface ChartSlot {
  params: ChartParams;
  context: ChartContext;
  limits: ChartLimits;
  capability: SlotCapability | null;
  violations: Violation[];
  sigma: SlotSigma | null;
  zones: SlotZones | null;
  overrides: { x: { min: number; max: number } | null; y: { yMin: number; yMax: number } | null };
  chartValues: number[];
  chartLabels: string[];
  phases: SlotPhase[];
  selectedPointIndex: number | null;
  selectedPointIndices: number[] | null;
  selectedPhaseIndex: number | null;
  showDataTable: boolean;
  accentIdx: number;
  _cascadeMemory: CascadeMemory;
  forecast: ForecastState;
}

export interface ChartPoint {
  id: string;
  label: string;
  subgroupLabel: string;
  phaseId: string | null;
  primaryValue: number;
  excluded: boolean;
  annotation: string | null;
  raw: Record<string, string>;
}

export interface ChartLayout {
  rows: string[][];
  colWeights: number[][];
  rowWeights: number[];
}

export interface ChartToggles {
  overlay: boolean;
  specLimits: boolean;
  grid: boolean;
  phaseTags: boolean;
  events: boolean;
  excludedMarkers: boolean;
  confidenceBand: boolean;
}

export interface UIState {
  notice: { title: string; body: string; tone?: string } | null;
  contextMenu: { x: number; y: number; axis: string | null; target: string; role: string } | null;
  layersExpanded: boolean;
  pendingNewChart: Record<string, unknown> | null;
  themePreference: "system" | "light" | "dark";
  themeResolved: "light" | "dark";
  shortcutOverlay: boolean;
}

export interface PipelineState {
  status: "ready" | "running" | "error";
  rescueMode: string;
  lastSuccessfulAt: string | null;
}

export interface FindingsStandards {
  cpkThreshold: number;
  cpkMarginal: number;
  maxOocPercent: number;
  maxOocCount: number;
  centeringRatio: number;
  runsZThreshold: number;
  zoneDeviation: number;
}

export interface DataPrepState {
  selectedDatasetId: string | null;
  datasetPoints: ChartPoint[];
  loading: boolean;
  error: string | null;
  rawRows: unknown[] | null;
  originalColumns: unknown[];
  arqueroTable: unknown | null;
  transforms: unknown[];
  hiddenColumns: string[];
  columnOrder: string[];
  unsavedChanges: boolean;
  activePanel: string | null;
  excludedRows: number[];
  expandedProfileColumn: string | null;
  profileCache: Record<string, unknown>;
  confirmingDeleteId: string | null;
  confirmingReset: boolean;
}

export interface ColumnConfig {
  columns: { name: string; ordinal: number; dtype: string; role: string | null }[];
  loading: boolean;
}

export interface SPCState {
  route: string;
  loading: boolean;
  error: string | null;
  datasets: { id: string; name: string }[];
  activeDatasetId: string | null;
  showDataTable: boolean;
  points: ChartPoint[];
  transforms: unknown[];
  structuralFindings: unknown[];
  selectedFindingId: string | null;
  findingsChartId: string | null;
  findingsStandards: FindingsStandards;
  findingsStandardsExpanded: boolean;
  reportTemplate: { title: string; sections: string[] };
  pipeline: PipelineState;
  selectedPointIndex: number | null;
  selectedPointIndices: number[] | null;
  selectedPhaseIndex: number | null;
  chartToggles: ChartToggles;
  charts: Record<string, ChartSlot>;
  chartOrder: string[];
  nextChartId: number;
  focusedChartId: string;
  chartLayout: ChartLayout;
  ui: UIState;
  auditLog: unknown[];
  dataPrep: DataPrepState;
  columnConfig: ColumnConfig;
  activeChipEditor: string | null;
  methodLabCharts: string[];
}
