/**
 * transforms.js — Maps API responses to the frontend state shape.
 *
 * API types:
 *   DataRowOut: { id, sequence_index, metadata, raw_data }
 *   AnalysisResult: { id, dataset_id, sigma, limits, zones, capability, created_at }
 *
 * Frontend state shape: see state.js createInitialState()
 */

/**
 * Map DataRowOut[] → point[]
 *
 * Uses column config to determine which raw data fields map to which roles.
 * No hardcoded field names — everything is driven by the columns parameter.
 * Value and subgroup are derived from raw_data using column roles (not stored on the row).
 *
 * @param {Array<{id: number, sequence_index: number, metadata: object, raw_data: object}>} rows
 * @param {Array<{name: string, ordinal: number, dtype: string, role: string|null}>} [columns]
 * @returns {Array<{id: string, label: string, subgroupLabel: string, phaseId: string|null, primaryValue: number, excluded: boolean, annotation: null, raw: object}>}
 */
export function mapRowsToChartPoints(rows, columns) {
  if (!Array.isArray(rows)) return [];

  // Find column roles from the columns config
  const valueCol = columns?.find((c) => c.role === "value")?.name;
  const subgroupCol = columns?.find((c) => c.role === "subgroup")?.name;
  const labelCol = columns?.find((c) => c.role === "label")?.name;
  const phaseCol = columns?.find((c) => c.role === "phase")?.name;

  return rows.map((m) => {
    const raw = m.raw_data || m.metadata || {};
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
 * Map AnalysisResult → { limits, capability, sigma, zones, violations, dispersion }
 *
 * @param {{id: number, dataset_id: number, sigma: object, limits: {ucl: number[], cl: number[], lcl: number[], k_sigma: number}, zones: object, capability: {cp: number, cpk: number, pp: number, ppk: number}|null, violations: Array|undefined, created_at: string}} analysisResult
 * @param {number|null} usl - Upper spec limit (not in API response, passed separately)
 * @param {number|null} lsl - Lower spec limit (not in API response, passed separately)
 * @returns {{limits: object, capability: object|null, sigma: object|null, zones: object|null, violations: Array}}
 */
export function mapAnalysisToSlotFields(analysisResult, usl = null, lsl = null) {
  const apiLimits = analysisResult.limits;

  const limits = {
    center: apiLimits.cl[0],
    ucl: apiLimits.ucl[0],
    lcl: apiLimits.lcl[0],
    usl: usl,
    lsl: lsl,
    version: analysisResult.id,
    scope: "Dataset",
  };

  let capability = null;
  if (analysisResult.capability) {
    capability = {
      cp: analysisResult.capability.cp,
      cpk: analysisResult.capability.cpk,
      ppk: analysisResult.capability.ppk,
    };
  }

  // Pass through sigma info
  const sigma = analysisResult.sigma
    ? { sigma_hat: analysisResult.sigma.sigma_hat, method: analysisResult.sigma.method, n_used: analysisResult.sigma.n_used }
    : null;

  // Pass through zone boundaries
  const zones = analysisResult.zones
    ? {
        zone_a_upper: analysisResult.zones.zone_a_upper,
        zone_b_upper: analysisResult.zones.zone_b_upper,
        cl: analysisResult.zones.cl,
        zone_b_lower: analysisResult.zones.zone_b_lower,
        zone_a_lower: analysisResult.zones.zone_a_lower,
      }
    : null;

  // Map rule violations
  const violations = Array.isArray(analysisResult.violations)
    ? analysisResult.violations.map((v) => ({
        testId: String(v.test_id),
        indices: Array.isArray(v.point_indices) ? v.point_indices : [],
        description: v.description || "",
      }))
    : [];

  // Extract per-phase results when present
  const phases = Array.isArray(analysisResult.phases)
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

/**
 * Build the context object from dataset metadata and column config.
 *
 * @param {{name: string, [key: string]: any}} datasetMeta
 * @param {Array<{name: string, ordinal: number, dtype: string, role: string|null}>} [columns]
 * @returns {object}
 */
export function buildInitialChartContext(datasetMeta, columns) {
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
