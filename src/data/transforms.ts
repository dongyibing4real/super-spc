/**
 * transforms.ts — Maps API responses to the frontend state shape.
 */

import type { AnalysisResult, ColumnOut, DataRowOut } from "../types/api.ts";
import type {
  ChartContext,
  ChartLimits,
  ChartPoint,
  SlotCapability,
  SlotPhase,
  SlotSigma,
  SlotZones,
  Violation,
} from "../types/state.ts";

export interface SlotFields {
  limits: ChartLimits;
  capability: SlotCapability | null;
  sigma: SlotSigma | null;
  zones: SlotZones | null;
  violations: Violation[];
  phases: SlotPhase[];
  chartValues: number[];
  chartLabels: string[];
}

/**
 * Map DataRowOut[] → ChartPoint[]
 *
 * Uses column config to determine which raw data fields map to which roles.
 * No hardcoded field names — everything is driven by the columns parameter.
 */
export function mapRowsToChartPoints(rows: DataRowOut[] | null | undefined, columns?: ColumnOut[]): ChartPoint[] {
  if (!Array.isArray(rows)) return [];

  const valueCol = columns?.find((c) => c.role === "value")?.name;
  const subgroupCol = columns?.find((c) => c.role === "subgroup")?.name;
  const labelCol = columns?.find((c) => c.role === "label")?.name;
  const phaseCol = columns?.find((c) => c.role === "phase")?.name;

  return rows.map((m) => {
    const raw = (m.raw_data || m.metadata || {}) as Record<string, string>;
    const rawValue = valueCol ? raw[valueCol] : null;
    const value = rawValue != null ? parseFloat(rawValue) : 0;
    const subgroup = subgroupCol ? (raw[subgroupCol] ?? null) : null;

    return {
      id: `pt-${m.sequence_index}`,
      label: labelCol ? (raw[labelCol] ?? `pt-${m.sequence_index}`) : `pt-${m.sequence_index}`,
      subgroupLabel: subgroup ?? `pt-${m.sequence_index}`,
      phaseId: phaseCol ? (raw[phaseCol] ?? null) : null,
      primaryValue: isNaN(value) ? 0 : value,
      excluded: false,
      annotation: null,
      raw,
    };
  });
}

/**
 * Map AnalysisResult → SlotFields
 */
export function mapAnalysisToSlotFields(
  analysisResult: AnalysisResult,
  usl: number | null = null,
  lsl: number | null = null,
): SlotFields {
  const apiLimits = analysisResult.limits;

  const limits: ChartLimits = {
    center: apiLimits.cl[0],
    ucl: apiLimits.ucl[0],
    lcl: apiLimits.lcl[0],
    usl,
    lsl,
    version: analysisResult.id,
    scope: "Dataset",
  };

  let capability: SlotCapability | null = null;
  if (analysisResult.capability) {
    capability = {
      cp: analysisResult.capability.cp,
      cpk: analysisResult.capability.cpk,
      ppk: analysisResult.capability.ppk,
    };
  }

  const sigma: SlotSigma | null = analysisResult.sigma
    ? { sigma_hat: analysisResult.sigma.sigma_hat, method: analysisResult.sigma.method, n_used: analysisResult.sigma.n_used }
    : null;

  const zones: SlotZones | null = analysisResult.zones
    ? {
        zone_a_upper: analysisResult.zones.zone_a_upper,
        zone_b_upper: analysisResult.zones.zone_b_upper,
        cl: analysisResult.zones.cl,
        zone_b_lower: analysisResult.zones.zone_b_lower,
        zone_a_lower: analysisResult.zones.zone_a_lower,
      }
    : null;

  const violations: Violation[] = Array.isArray(analysisResult.violations)
    ? analysisResult.violations.map((v) => ({
        testId: String(v.test_id),
        indices: Array.isArray(v.point_indices) ? v.point_indices : [],
        description: v.description || "",
      }))
    : [];

  const phases: SlotPhase[] = Array.isArray(analysisResult.phases)
    ? analysisResult.phases.map((p) => ({
        id: p.phase_id,
        start: p.start_index,
        end: p.end_index,
        limits: {
          center: p.limits.cl[0],
          ucl: p.limits.ucl[0],
          lcl: p.limits.lcl[0],
        },
      }))
    : [];

  const chartValues = Array.isArray(analysisResult.chart_values) ? analysisResult.chart_values : [];
  const chartLabels = Array.isArray(analysisResult.chart_labels) ? analysisResult.chart_labels : [];

  return { limits, capability, sigma, zones, violations, phases, chartValues, chartLabels };
}

interface DatasetMeta {
  name?: string;
  chartType?: { id: string; label: string; detail: string };
}

/**
 * Build the context object from dataset metadata and column config.
 */
export function buildInitialChartContext(datasetMeta: DatasetMeta, columns?: ColumnOut[]): ChartContext {
  const valueCol = columns?.find((c) => c.role === "value");
  const subgroupCol = columns?.find((c) => c.role === "subgroup");
  const phaseCol = columns?.find((c) => c.role === "phase");

  return {
    title: datasetMeta.name ?? "Untitled Dataset",
    metric: valueCol
      ? { id: valueCol.name, label: valueCol.name, unit: "" }
      : { id: "value", label: "Value", unit: "" },
    subgroup: subgroupCol
      ? { id: subgroupCol.name, label: subgroupCol.name, detail: `Grouped by ${subgroupCol.name}` }
      : { id: "individual", label: "Individual", detail: "n=1" },
    phase: phaseCol
      ? { id: phaseCol.name, label: phaseCol.name, detail: `By ${phaseCol.name}` }
      : { id: "single", label: "Single phase", detail: "No phase boundaries" },
    chartType: datasetMeta.chartType ?? { id: "imr", label: "IMR", detail: "Individual + Moving Range" },
    sigma: { label: "3 Sigma", detail: "Moving range" },
    tests: { label: "Nelson", detail: "Standard rule set" },
    compare: { label: "None", detail: "Single method" },
    window: "All data",
    methodBadge: "IMR",
    status: "OK",
  };
}
