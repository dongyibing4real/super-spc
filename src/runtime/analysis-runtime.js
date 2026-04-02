import {
  getFirstChart,
  loadDataset,
  setChartParams,
  setColumns,
  setStructuralFindings,
} from "../core/state.js";
import { applyParamsToContext, INDIVIDUAL_ONLY } from "../helpers.js";
import { buildDefaultContext, transformAnalysis, transformPoints } from "../data/transforms.js";
import { generateFindings } from "../core/findings-engine.js";

function buildWarningNotice(failedCharts, analysisResults) {
  if (failedCharts.length === 0) return null;
  // Extract the first meaningful error message from failed results
  let reason = "";
  if (analysisResults) {
    for (const r of analysisResults) {
      if (r.status === "rejected" && r.reason?.message) {
        reason = r.reason.message;
        break;
      }
    }
  }
  return {
    tone: "warning",
    title: "Analysis failed",
    body: reason || `${failedCharts.length} chart(s) could not be analyzed.`,
  };
}

export function applyColumnRolesToChartParams(state, columns) {
  let next = setColumns(state, columns);
  const valueName = columns.find((c) => c.role === "value")?.name || null;
  const subgroupName = columns.find((c) => c.role === "subgroup")?.name || null;
  const phaseName = columns.find((c) => c.role === "phase")?.name || null;

  for (const id of next.chartOrder) {
    if (!next.charts[id].params.value_column) {
      const chartType = next.charts[id].params.chart_type;
      next = setChartParams(next, id, {
        value_column: valueName,
        subgroup_column: INDIVIDUAL_ONLY.has(chartType) ? null : subgroupName,
        phase_column: phaseName,
      });
    }
  }

  return next;
}

export function buildSuccessfulAnalysisSlots(state, analysisResults, baseContext) {
  const slots = {};
  state.chartOrder.forEach((id, i) => {
    if (analysisResults[i]?.status !== "fulfilled") return;

    const params = state.charts[id].params;
    const transformed = transformAnalysis(analysisResults[i].value, params.usl, params.lsl);
    slots[id] = {
      context: applyParamsToContext(baseContext, params),
      limits: { ...transformed.limits, target: params.target ?? null },
      capability: transformed.capability,
      violations: transformed.violations,
      sigma: transformed.sigma,
      zones: transformed.zones,
      chartValues: transformed.chartValues,
      chartLabels: transformed.chartLabels,
      phases: transformed.phases,
    };
  });
  return slots;
}

export function finalizeDatasetLoad(state, { datasetId, datasets, points, columns, analysisResults }) {
  let next = applyColumnRolesToChartParams(state, columns);
  const dataset = datasets.find((item) => item.id === datasetId);
  const baseContext = dataset ? buildDefaultContext(dataset, columns) : getFirstChart(next).context;
  const slots = buildSuccessfulAnalysisSlots(next, analysisResults, baseContext);
  const failedCharts = next.chartOrder.filter((_, i) => analysisResults[i]?.status === "rejected");

  next = loadDataset(next, {
    points: transformPoints(points, columns),
    slots,
    datasetId,
  });
  next = setStructuralFindings(next, generateFindings(next));

  const notice = buildWarningNotice(failedCharts, analysisResults);
  if (notice) {
    next = { ...next, ui: { ...next.ui, notice } };
  }

  return { nextState: next, failedCharts };
}

export function finalizeReanalysis(state, { points, analysisResults }) {
  const datasetId = state.activeDatasetId;
  const columns = state.columnConfig.columns;
  const dataset = state.datasets.find((item) => item.id === datasetId);
  const baseContext = dataset ? buildDefaultContext(dataset, columns) : getFirstChart(state).context;
  const slots = buildSuccessfulAnalysisSlots(state, analysisResults, baseContext);
  const failedCharts = state.chartOrder.filter((_, i) => analysisResults[i]?.status === "rejected");

  let next = loadDataset(state, {
    points: transformPoints(points, columns),
    slots,
    datasetId,
  });
  next = setStructuralFindings(next, generateFindings(next));

  const notice = buildWarningNotice(failedCharts, analysisResults);
  if (notice) {
    next = { ...next, ui: { ...next.ui, notice } };
  }

  return { nextState: next, failedCharts };
}
