/**
 * actions.ts -- Async store actions for the React/Zustand migration.
 *
 * Extracted from legacy-boot.js. Each function reads/writes spcStore
 * directly -- no bridge needed.
 */
import { spcStore } from "../store/spc-store.js";
import { createSlot, migrateTreeToRows } from "../core/state/init.js";
import { setColumns } from "../core/state/columns.js";
import { setDatasets, setError, setLoadingState, initTheme } from "../core/state/ui.js";
import { setPrepParsedData, loadPrepPoints, setPrepError } from "../core/state/data-prep.js";
import {
  createDataset,
  fetchColumns,
  fetchDatasets,
  fetchRows,
  runAnalysis,
} from "../data/api.js";
import { parseCSV } from "../data/csv-engine.js";
import { createTable } from "../data/data-prep-engine.js";
import { finalizeDatasetLoad, finalizeReanalysis } from "../core/state/analysis.js";
import { CHART_TYPE_LABELS, INDIVIDUAL_ONLY, SUBGROUP_REQUIRED } from "../constants.js";
import type { SPCState, ChartParams, ChartSlot, ChartLayout, CascadeMemory } from "../types/state.ts";
import type { AnalysisResult, AnalysisRequest } from "../types/api.ts";

const LAYOUT_STORAGE_KEY = "super-spc-chart-layout";

interface SavedLayout {
  rows: string[][];
  colWeights: number[][];
  rowWeights: number[];
  chartOrder: string[];
  focusedChartId: string;
  nextChartId: number;
  chartParams: Record<string, ChartParams | null>;
  cascadeMemory: Record<string, CascadeMemory | null>;
}

/** Pre-validate chart params before hitting the backend. */
export function validatedRunAnalysis(datasetId: string, params: ChartParams): Promise<AnalysisResult> {
  if (!params.chart_type) {
    return Promise.reject(new Error("No chart type selected."));
  }
  if (SUBGROUP_REQUIRED.has(params.chart_type) && !params.subgroup_column) {
    return Promise.reject(new Error(
      `${CHART_TYPE_LABELS[params.chart_type] || params.chart_type} requires a subgroup column. Select one in the Subgroup chip.`
    ));
  }
  return runAnalysis(datasetId, params);
}

/** Load a dataset by ID: fetch points+columns, run analysis per chart, finalize. */
export async function loadDatasetById(datasetId: string): Promise<void> {
  spcStore.setState(setLoadingState(spcStore.getState(), true));
  try {
    const [points, columns] = await Promise.all([
      fetchRows(datasetId),
      fetchColumns(datasetId).catch(() => []),
    ]);
    spcStore.setState(setColumns(spcStore.getState(), columns));

    const state = spcStore.getState();
    const analysisResults = await Promise.allSettled(
      state.chartOrder.map((id: string) => validatedRunAnalysis(datasetId, state.charts[id].params))
    );
    const { nextState } = finalizeDatasetLoad(spcStore.getState(), {
      datasetId,
      datasets: spcStore.getState().datasets,
      points,
      columns,
      analysisResults,
    });
    spcStore.setState(nextState);
  } catch (err) {
    spcStore.setState(setError(spcStore.getState(), (err as Error).message));
  }
}

/** Re-fetch points and re-run analysis for the active dataset. */
export async function reanalyze(): Promise<void> {
  const state = spcStore.getState();
  if (!state.activeDatasetId) return;
  try {
    const dsId = state.activeDatasetId;
    const points = await fetchRows(dsId);
    const freshState = spcStore.getState();
    const analysisResults = await Promise.allSettled(
      freshState.chartOrder.map((id: string) => validatedRunAnalysis(dsId, freshState.charts[id].params))
    );
    const { nextState } = finalizeReanalysis(spcStore.getState(), { points, analysisResults });
    spcStore.setState(nextState);
  } catch (err) {
    spcStore.setState(setError(spcStore.getState(), (err as Error).message));
  }
}

/** Parse a CSV file, create a dataset via API, then load it. */
export async function uploadCSV(file: File): Promise<void> {
  spcStore.setState(setLoadingState(spcStore.getState(), true));
  try {
    const parsed = await parseCSV(file);
    const arqueroTable = createTable(parsed.rows, parsed.columns);

    const name = file.name.replace(/\.csv$/i, "");
    const newDs = await createDataset({
      name,
      columns: parsed.columns,
      rows: parsed.rows,
    });

    const datasets = await fetchDatasets();
    spcStore.setState(setDatasets(spcStore.getState(), datasets));
    spcStore.setState(setPrepParsedData(spcStore.getState(), {
      rawRows: parsed.rows,
      arqueroTable,
      columns: parsed.columns,
    }));

    await loadDatasetById(newDs.id);
  } catch (err) {
    spcStore.setState(setError(spcStore.getState(), (err as Error).message));
  }
}

/** Persist the current chart layout to localStorage. */
export function saveLayout(): void {
  try {
    const state = spcStore.getState();
    const data: SavedLayout = {
      rows: state.chartLayout.rows,
      colWeights: state.chartLayout.colWeights,
      rowWeights: state.chartLayout.rowWeights,
      chartOrder: state.chartOrder,
      focusedChartId: state.focusedChartId,
      nextChartId: state.nextChartId,
      chartParams: {},
      cascadeMemory: {},
    };
    for (const id of state.chartOrder) {
      data.chartParams[id] = state.charts[id]?.params || null;
      data.cascadeMemory[id] = state.charts[id]?._cascadeMemory || null;
    }
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(data));
  } catch { /* localStorage unavailable or full */ }
}

/** Read chart layout from localStorage, with migration support for legacy tree format. */
export function restoreLayout(): SavedLayout | null {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SavedLayout;
    if (!data.chartOrder || !data.chartParams) return null;
    if (!data.rows) {
      const migrated = migrateTreeToRows(data as unknown as Parameters<typeof migrateTreeToRows>[0]);
      data.rows = migrated.rows;
      data.colWeights = migrated.colWeights;
      data.rowWeights = migrated.rowWeights;
      if (!data.rows || data.rows.length === 0) {
        data.rows = [data.chartOrder];
        data.colWeights = [data.chartOrder.map(() => 1)];
        data.rowWeights = [1];
      }
    }
    if (!data.colWeights) {
      data.colWeights = data.rows.map((r: string[]) => r.map(() => 1));
    }
    if (!data.rowWeights) {
      data.rowWeights = data.rows.map(() => 1);
    }
    return data;
  } catch { return null; }
}

/** Boot sequence: fetch datasets, restore layout, load the first dataset. */
export async function bootApp(): Promise<void> {
  // Apply theme before anything renders
  spcStore.setState(initTheme(spcStore.getState()));
  try {
    const datasets = await fetchDatasets();
    spcStore.setState(setDatasets(spcStore.getState(), datasets));
    const id = datasets[0]?.id;
    if (!id) {
      spcStore.setState(setLoadingState(spcStore.getState(), false));
      return;
    }

    const saved = restoreLayout();
    if (saved && saved.chartOrder.length > 0) {
      const restoredCharts: Record<string, ChartSlot> = {};
      for (const cid of saved.chartOrder) {
        const p = saved.chartParams[cid];
        const mem = saved.cascadeMemory?.[cid] || null;
        // Restore as-is; setChartParams reconciles on next param change
        restoredCharts[cid] = createSlot(p ? { params: p, _cascadeMemory: mem } as Partial<ChartSlot> : {});
      }
      const state = spcStore.getState();
      spcStore.setState({
        ...state,
        charts: restoredCharts,
        chartOrder: saved.chartOrder,
        nextChartId: saved.nextChartId || saved.chartOrder.length + 1,
        focusedChartId: saved.focusedChartId || saved.chartOrder[0],
        chartLayout: { rows: saved.rows, colWeights: saved.colWeights, rowWeights: saved.rowWeights },
      });
    }

    await loadDatasetById(id);
  } catch (err) {
    spcStore.setState(setError(spcStore.getState(), (err as Error).message));
  }
}
