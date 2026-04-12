/**
 * analysis.js — Compound state reducers for dataset load and reanalysis.
 *
 * These functions compose multiple primitive reducers (setColumns, setRecipeParams,
 * loadDataset, setStructuralFindings) into complete state transitions.
 */
import { getFirstChart } from './selectors.js';
import { loadDataset } from './pipeline.js';
import { setRecipeParams } from './reconcile-params.js';
import { setColumns } from './columns.js';
import { setStructuralFindings } from './findings.js';
import { applyParamsToContext } from '../../data/params.js';
import { buildInitialChartContext, mapAnalysisToSlotFields, mapRowsToChartPoints } from '../../data/transforms.js';
import { generateFindings } from '../findings-engine.js';

/** Expected rejection messages that indicate incomplete config, not real errors. */
const SILENT_REJECTIONS = new Set([
  "No chart type selected.",
]);

function isExpectedRejection(reason) {
  if (!reason?.message) return false;
  if (SILENT_REJECTIONS.has(reason.message)) return true;
  if (reason.message.includes("requires a subgroup column")) return true;
  return false;
}

function buildWarningNotice(failedCharts, analysisResults) {
  if (failedCharts.length === 0) return null;
  // Filter out expected incomplete-config rejections
  const realFailures = [];
  if (analysisResults) {
    for (const r of analysisResults) {
      if (r.status === "rejected" && !isExpectedRejection(r.reason)) {
        realFailures.push(r);
      }
    }
  }
  if (realFailures.length === 0) return null;
  const reason = realFailures[0]?.reason?.message || "";
  return {
    tone: "warning",
    title: "Analysis failed",
    body: reason || `${realFailures.length} chart(s) could not be analyzed.`,
  };
}

export function applyColumnRolesToChartParams(state, columns) {
  let next = setColumns(state, columns);
  const valueName = columns.find((c) => c.role === "value")?.name || null;
  const subgroupName = columns.find((c) => c.role === "subgroup")?.name || null;
  const phaseName = columns.find((c) => c.role === "phase")?.name || null;

  for (const id of next.chartOrder) {
    if (!next.charts[id].params.value_column) {
      next = setRecipeParams(next, id, {
        value_column: valueName,
        subgroup_column: subgroupName,
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
    const transformed = mapAnalysisToSlotFields(analysisResults[i].value, params.usl, params.lsl);
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
      // Reset forecast on re-analysis — old model is stale
      forecast: {
        mode: "hidden",
        horizon: state.charts[id]?.forecast?.horizon ?? 6,
        timeBudget: state.charts[id]?.forecast?.timeBudget ?? 3,
        result: null,
        driftSummary: null,
        visibleHorizon: state.charts[id]?.forecast?.horizon ?? 6,
      },
    };
  });
  return slots;
}

export function finalizeDatasetLoad(state, { datasetId, datasets, points, columns, analysisResults }) {
  let next = applyColumnRolesToChartParams(state, columns);
  const dataset = datasets.find((item) => item.id === datasetId);
  const baseContext = dataset ? buildInitialChartContext(dataset, columns) : getFirstChart(next).context;
  const slots = buildSuccessfulAnalysisSlots(next, analysisResults, baseContext);
  const failedCharts = next.chartOrder.filter((_, i) => analysisResults[i]?.status === "rejected");

  next = loadDataset(next, {
    points: mapRowsToChartPoints(points, columns),
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
  const baseContext = dataset ? buildInitialChartContext(dataset, columns) : getFirstChart(state).context;
  const slots = buildSuccessfulAnalysisSlots(state, analysisResults, baseContext);
  const failedCharts = state.chartOrder.filter((_, i) => analysisResults[i]?.status === "rejected");

  let next = loadDataset(state, {
    points: mapRowsToChartPoints(points, columns),
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
