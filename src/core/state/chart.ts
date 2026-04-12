import { updateSlot, createSlot, DEFAULT_PARAMS } from './init.js';
import { clamp } from '../../helpers.js';
import { getFocused } from './selectors.js';
import { collectChartIds } from './layout.js';
import { CHART_TYPE_LABELS } from '../../constants.js';
import type { ChartSlot, ForecastState, SPCState } from '../../types/state.ts';

export function selectPoint(state: SPCState, index: number | null, chartId: string | null = null): SPCState {
  if (index == null) {
    if (chartId && state.charts[chartId]) {
      const slot = state.charts[chartId];
      return {
        ...state,
        charts: { ...state.charts, [chartId]: { ...slot, selectedPointIndex: null, selectedPointIndices: null } },
        selectedPointIndices: null,
        ui: { ...state.ui, contextMenu: null },
      } as SPCState;
    }
    return {
      ...state,
      selectedPointIndex: null,
      selectedPointIndices: null,
      ui: { ...state.ui, contextMenu: null }
    } as SPCState;
  }

  if (chartId && state.charts[chartId]) {
    const slot = state.charts[chartId];
    const hasChartValues = slot.chartValues && slot.chartValues.length > 0;
    if (hasChartValues) {
      const clamped = clamp(index, 0, Math.max(0, slot.chartValues.length - 1));
      return {
        ...state,
        charts: { ...state.charts, [chartId]: { ...slot, selectedPointIndex: clamped, selectedPointIndices: null } },
        selectedPointIndices: null,
        ui: { ...state.ui, contextMenu: null },
      } as SPCState;
    }
  }
  return {
    ...state,
    selectedPointIndex: clamp(index, 0, Math.max(0, state.points.length - 1)),
    selectedPointIndices: null,
    ui: { ...state.ui, contextMenu: null }
  } as SPCState;
}

export function selectPhase(state: SPCState, phaseIndex: number | null, chartId: string | null = null): SPCState {
  if (chartId && state.charts[chartId]) {
    const slot = state.charts[chartId] as ChartSlot & { selectedPhaseIndex?: number | null };
    const current = slot.selectedPhaseIndex;
    const next = (phaseIndex == null || phaseIndex === current) ? null : phaseIndex;
    return {
      ...state,
      charts: { ...state.charts, [chartId]: { ...slot, selectedPhaseIndex: next } },
      ui: { ...state.ui, contextMenu: null },
    } as SPCState;
  }
  const current = (state as SPCState & { selectedPhaseIndex?: number | null }).selectedPhaseIndex;
  const next = (phaseIndex == null || phaseIndex === current) ? null : phaseIndex;
  return {
    ...state,
    selectedPhaseIndex: next,
    ui: { ...state.ui, contextMenu: null },
  } as SPCState;
}

/** Multi-point selection (marquee / rubber-band). */
export function selectPoints(state: SPCState, indices: number[] | null, chartId: string | null = null): SPCState {
  if (!indices || indices.length === 0) {
    if (chartId && state.charts[chartId]) {
      const slot = state.charts[chartId];
      return {
        ...state,
        charts: { ...state.charts, [chartId]: { ...slot, selectedPointIndices: null } },
        selectedPointIndices: null,
        ui: { ...state.ui, contextMenu: null },
      } as SPCState;
    }
    return {
      ...state,
      selectedPointIndices: null,
      ui: { ...state.ui, contextMenu: null },
    } as SPCState;
  }

  const unique = [...new Set(indices)].sort((a, b) => a - b);

  if (chartId && state.charts[chartId]) {
    const slot = state.charts[chartId];
    const hasChartValues = slot.chartValues && slot.chartValues.length > 0;
    if (hasChartValues) {
      const maxIdx = Math.max(0, slot.chartValues.length - 1);
      const clamped = unique.filter(i => i >= 0 && i <= maxIdx);
      return {
        ...state,
        charts: { ...state.charts, [chartId]: { ...slot, selectedPointIndices: clamped, selectedPointIndex: null } },
        selectedPointIndex: null,
        selectedPointIndices: null,
        ui: { ...state.ui, contextMenu: null },
      } as SPCState;
    }
  }

  const maxIdx = Math.max(0, state.points.length - 1);
  const clamped = unique.filter(i => i >= 0 && i <= maxIdx);
  return {
    ...state,
    selectedPointIndices: clamped,
    selectedPointIndex: null,
    ui: { ...state.ui, contextMenu: null },
  } as SPCState;
}

export function moveSelection(state: SPCState, delta: number): SPCState {
  return selectPoint(state, (state.selectedPointIndex ?? 0) + delta);
}

/** Merge params into a chart slot. No validation — use setRecipeParams for recipe fields. */
export function setChartParams(state: SPCState, chartId: string, params: Partial<ChartSlot["params"]>): SPCState {
  return updateSlot(state, chartId, { params: { ...state.charts[chartId].params, ...params } });
}

export function setActiveChipEditor(state: SPCState, chipId: string | null): SPCState {
  return {
    ...state,
    activeChipEditor: state.activeChipEditor === chipId ? null : chipId,
  };
}

export function toggleChartOption(state: SPCState, option: keyof SPCState["chartToggles"]): SPCState {
  return {
    ...state,
    chartToggles: { ...state.chartToggles, [option]: !state.chartToggles[option] }
  };
}

export function togglePointExclusion(state: SPCState, index: number): SPCState {
  const point = state.points[index];
  if (!point) return state;

  const newExcluded = !point.excluded;
  const newPoints = state.points.map((p, i) =>
    i === index ? { ...p, excluded: newExcluded } : p
  );

  return {
    ...state,
    points: newPoints,
    pipeline: { ...state.pipeline, status: "ready", rescueMode: "none" },
  };
}

export function focusChart(state: SPCState, chartId: string): SPCState {
  if (!state.charts[chartId] || state.focusedChartId === chartId) return state;
  return { ...state, focusedChartId: chartId };
}

/** Add a new chart using row-grid auto-placement rules */
export function addChart(state: SPCState, { chartType = null }: { chartType?: string | null } = {}): SPCState {
  const newId = `chart-${state.nextChartId}`;
  const focusedSlot = getFocused(state);

  const newParams = {
    ...DEFAULT_PARAMS,
    chart_type: chartType,
    value_column: focusedSlot.params.value_column,
    subgroup_column: focusedSlot.params.subgroup_column,
    phase_column: focusedSlot.params.phase_column,
  };

  const label = chartType
    ? (CHART_TYPE_LABELS[chartType] || chartType)
    : "Select\u2026";
  const newSlot = createSlot({
    params: newParams,
    accentIdx: state.chartOrder.length % 8,
    context: {
      ...focusedSlot.context,
      chartType: { id: chartType, label, detail: chartType ? "" : "No chart type selected" },
      methodBadge: chartType ? label : "",
    },
  });

  const { rows, colWeights, rowWeights } = state.chartLayout;
  const lastRow = rows[rows.length - 1];
  const rowAbove = rows.length >= 2 ? rows[rows.length - 2] : null;
  const maxInRow = rowAbove ? rowAbove.length : 2;
  let newRows: string[][], newColWeights: number[][], newRowWeights: number[];
  if (lastRow.length < maxInRow) {
    newRows = [...rows.slice(0, -1), [...lastRow, newId]];
    newColWeights = [...colWeights.slice(0, -1), [...colWeights[colWeights.length - 1], 1]];
    newRowWeights = rowWeights;
  } else {
    newRows = [...rows, [newId]];
    newColWeights = [...colWeights, [1]];
    newRowWeights = [...rowWeights, 1];
  }

  return {
    ...state,
    charts: { ...state.charts, [newId]: newSlot },
    chartOrder: [...state.chartOrder, newId],
    nextChartId: state.nextChartId + 1,
    focusedChartId: newId,
    chartLayout: { rows: newRows, colWeights: newColWeights, rowWeights: newRowWeights },
  };
}

/** Remove a chart from the row-grid layout */
export function removeChart(state: SPCState, chartId: string): SPCState {
  if (collectChartIds(state.chartLayout).length <= 1) return state;
  if (!state.charts[chartId]) return state;

  const { rows, colWeights, rowWeights } = state.chartLayout;
  const newRows: string[][] = [];
  const newColWeights: number[][] = [];
  const newRowWeights: number[] = [];
  for (let r = 0; r < rows.length; r++) {
    const filtered: string[] = [];
    const filteredW: number[] = [];
    for (let c = 0; c < rows[r].length; c++) {
      if (rows[r][c] !== chartId) {
        filtered.push(rows[r][c]);
        filteredW.push(colWeights[r][c]);
      }
    }
    if (filtered.length > 0) {
      newRows.push(filtered);
      newColWeights.push(filteredW);
      newRowWeights.push(rowWeights[r]);
    }
  }

  const newCharts = { ...state.charts };
  delete newCharts[chartId];
  const newOrder = state.chartOrder.filter(cid => cid !== chartId);
  const newFocus = state.focusedChartId === chartId ? newOrder[0] : state.focusedChartId;

  return {
    ...state,
    charts: newCharts,
    chartOrder: newOrder,
    focusedChartId: newFocus,
    chartLayout: { rows: newRows, colWeights: newColWeights, rowWeights: newRowWeights },
  };
}

export function setXDomainOverride(state: SPCState, min: number, max: number, chartId?: string): SPCState {
  if (!chartId) chartId = state.focusedChartId || state.chartOrder[0];
  return updateSlot(state, chartId, { overrides: { ...state.charts[chartId].overrides, x: { min, max } as unknown as [number, number] } });
}

export function setYDomainOverride(state: SPCState, yMin: number, yMax: number, chartId?: string): SPCState {
  if (!chartId) chartId = state.focusedChartId || state.chartOrder[0];
  return updateSlot(state, chartId, { overrides: { ...state.charts[chartId].overrides, y: { yMin, yMax } as unknown as [number, number] } });
}

export function resetAxis(state: SPCState, axis: "x" | "y", chartId?: string): SPCState {
  if (!chartId) chartId = state.focusedChartId || state.chartOrder[0];
  const overrides = state.charts[chartId].overrides;
  if (axis === 'x') return updateSlot(state, chartId, { overrides: { ...overrides, x: null } });
  if (axis === 'y') return updateSlot(state, chartId, { overrides: { ...overrides, y: null } });
  return state;
}

export function activateForecast(state: SPCState, chartId?: string): SPCState {
  if (!chartId) chartId = state.focusedChartId || state.chartOrder[0];
  const slot = state.charts[chartId];
  if (!slot) return state;
  return updateSlot(state, chartId, {
    forecast: {
      ...slot.forecast,
      mode: "loading",
    },
  });
}

export function setForecastLoading(state: SPCState, chartId?: string): SPCState {
  if (!chartId) chartId = state.focusedChartId || state.chartOrder[0];
  const slot = state.charts[chartId];
  if (!slot) return state;
  return updateSlot(state, chartId, {
    forecast: {
      ...slot.forecast,
      mode: "loading",
    },
  });
}

interface ForecastAPIResult {
  projected: number[];
  confidence: { lower: number[]; upper: number[] };
  drift?: { score?: number; intent?: string; ooc_estimate?: number | null; label?: string };
  cache_key?: string;
}

export function setForecastResult(state: SPCState, result: ForecastAPIResult | null, chartId?: string): SPCState {
  if (!chartId) chartId = state.focusedChartId || state.chartOrder[0];
  const slot = state.charts[chartId];
  if (!slot) return state;

  const driftSummary = result ? {
    score: result.drift?.score ?? 0,
    intent: result.drift?.intent ?? "success",
    oocEstimate: result.drift?.ooc_estimate ?? null,
    label: result.drift?.label ?? "",
  } : null;

  return updateSlot(state, chartId, {
    forecast: {
      ...slot.forecast,
      mode: result ? "active" : "hidden",
      result: result ? {
        projected: result.projected,
        confidence: result.confidence,
        driftScore: result.drift?.score ?? 0,
        oocEstimate: result.drift?.ooc_estimate ?? null,
      } : null,
      driftSummary,
      cacheKey: result?.cache_key ?? (slot.forecast as ForecastState & { cacheKey?: string })?.cacheKey ?? null,
    },
  } as Partial<ChartSlot>);
}

export function setForecastPredicting(state: SPCState, predicting: boolean, chartId?: string): SPCState {
  if (!chartId) chartId = state.focusedChartId || state.chartOrder[0];
  const slot = state.charts[chartId];
  if (!slot) return state;
  return updateSlot(state, chartId, {
    forecast: {
      ...slot.forecast,
      predicting: !!predicting,
    },
  } as Partial<ChartSlot>);
}

export function setForecastTimeBudget(state: SPCState, timeBudget: number, chartId?: string): SPCState {
  if (!chartId) chartId = state.focusedChartId || state.chartOrder[0];
  const slot = state.charts[chartId];
  if (!slot) return state;
  return updateSlot(state, chartId, {
    forecast: {
      ...slot.forecast,
      timeBudget: Math.max(1, Math.min(120, timeBudget)),
    },
  });
}

export function setForecastPrompt(state: SPCState, visible: boolean, chartId?: string): SPCState {
  if (!chartId) chartId = state.focusedChartId || state.chartOrder[0];
  const slot = state.charts[chartId];
  if (!slot) return state;
  const currentMode = slot.forecast?.mode || "hidden";
  if (currentMode === "active" || currentMode === "loading") return state;
  const nextMode = visible ? "prompt" : "hidden";
  if (currentMode === nextMode) return state;
  return updateSlot(state, chartId, {
    forecast: {
      ...slot.forecast,
      mode: nextMode,
    },
  });
}

export function setForecastHorizon(state: SPCState, horizon: number, chartId?: string): SPCState {
  if (!chartId) chartId = state.focusedChartId || state.chartOrder[0];
  const slot = state.charts[chartId];
  if (!slot) return state;
  const nextHorizon = Math.max(1, Math.ceil(horizon));
  if (slot.forecast?.horizon === nextHorizon) return state;
  return updateSlot(state, chartId, {
    forecast: {
      ...slot.forecast,
      horizon: nextHorizon,
    },
  });
}

export function cancelForecast(state: SPCState, chartId?: string): SPCState {
  if (!chartId) chartId = state.focusedChartId || state.chartOrder[0];
  const slot = state.charts[chartId];
  if (!slot) return state;
  return updateSlot(state, chartId, {
    forecast: {
      ...slot.forecast,
      mode: "hidden",
      result: null,
      driftSummary: null,
    },
  });
}
