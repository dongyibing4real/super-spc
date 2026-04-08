import { updateSlot, createSlot, DEFAULT_PARAMS } from './init.js';
import { clamp } from '../../helpers.js';
import { getFocused } from './selectors.js';
import { collectChartIds } from './layout.js';
import { CHART_TYPE_LABELS } from '../../constants.js';

export function selectPoint(state, index, chartId = null) {
  // null/undefined index = deselect (click empty space)
  if (index == null) {
    if (chartId && state.charts[chartId]) {
      const slot = state.charts[chartId];
      return {
        ...state,
        charts: { ...state.charts, [chartId]: { ...slot, selectedPointIndex: null, selectedPointIndices: null } },
        selectedPointIndices: null,
        ui: { ...state.ui, contextMenu: null },
      };
    }
    return {
      ...state,
      selectedPointIndex: null,
      selectedPointIndices: null,
      ui: { ...state.ui, contextMenu: null }
    };
  }

  // Subgroup-based charts (X-Bar R, CUSUM, etc.) have their own point space ---
  // chartValues indices don't map to raw state.points indices.  Store selection
  // per-slot so clicks in one chart don't highlight semantically-unrelated
  // points in a chart that uses a different granularity.
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
      };
    }
  }
  // Raw-point charts (IMR, etc.) use the global index into state.points
  return {
    ...state,
    selectedPointIndex: clamp(index, 0, Math.max(0, state.points.length - 1)),
    selectedPointIndices: null,
    ui: { ...state.ui, contextMenu: null }
  };
}

export function selectPhase(state, phaseIndex, chartId = null) {
  // null = deselect. Same index = toggle off.
  if (chartId && state.charts[chartId]) {
    const slot = state.charts[chartId];
    const current = slot.selectedPhaseIndex;
    const next = (phaseIndex == null || phaseIndex === current) ? null : phaseIndex;
    return {
      ...state,
      charts: { ...state.charts, [chartId]: { ...slot, selectedPhaseIndex: next } },
      ui: { ...state.ui, contextMenu: null },
    };
  }
  const current = state.selectedPhaseIndex;
  const next = (phaseIndex == null || phaseIndex === current) ? null : phaseIndex;
  return {
    ...state,
    selectedPhaseIndex: next,
    ui: { ...state.ui, contextMenu: null },
  };
}

/** Multi-point selection (marquee / rubber-band). */
export function selectPoints(state, indices, chartId = null) {
  // null/empty = clear multi-selection
  if (!indices || indices.length === 0) {
    if (chartId && state.charts[chartId]) {
      const slot = state.charts[chartId];
      return {
        ...state,
        charts: { ...state.charts, [chartId]: { ...slot, selectedPointIndices: null } },
        selectedPointIndices: null,
        ui: { ...state.ui, contextMenu: null },
      };
    }
    return {
      ...state,
      selectedPointIndices: null,
      ui: { ...state.ui, contextMenu: null },
    };
  }

  // Store as sorted array of unique indices
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
      };
    }
  }

  const maxIdx = Math.max(0, state.points.length - 1);
  const clamped = unique.filter(i => i >= 0 && i <= maxIdx);
  return {
    ...state,
    selectedPointIndices: clamped,
    selectedPointIndex: null,
    ui: { ...state.ui, contextMenu: null },
  };
}

export function moveSelection(state, delta) {
  return selectPoint(state, state.selectedPointIndex + delta);
}

/** Merge params into a chart slot. No validation — use setRecipeParams for recipe fields. */
export function setChartParams(state, chartId, params) {
  return updateSlot(state, chartId, { params: { ...state.charts[chartId].params, ...params } });
}


export function setActiveChipEditor(state, chipId) {
  return {
    ...state,
    activeChipEditor: state.activeChipEditor === chipId ? null : chipId,
  };
}

export function toggleChartOption(state, option) {
  return {
    ...state,
    chartToggles: { ...state.chartToggles, [option]: !state.chartToggles[option] }
  };
}

export function togglePointExclusion(state, index) {
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

export function focusChart(state, chartId) {
  if (!state.charts[chartId] || state.focusedChartId === chartId) return state;
  return { ...state, focusedChartId: chartId };
}

/** Add a new chart using row-grid auto-placement rules */
export function addChart(state, { chartType = null } = {}) {
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

  // Auto-placement: fill last row first, then new row below
  const { rows, colWeights, rowWeights } = state.chartLayout;
  const lastRow = rows[rows.length - 1];
  const rowAbove = rows.length >= 2 ? rows[rows.length - 2] : null;
  const maxInRow = rowAbove ? rowAbove.length : 2;
  let newRows, newColWeights, newRowWeights;
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
export function removeChart(state, chartId) {
  if (collectChartIds(state.chartLayout).length <= 1) return state;
  if (!state.charts[chartId]) return state;

  const { rows, colWeights, rowWeights } = state.chartLayout;
  const newRows = [];
  const newColWeights = [];
  const newRowWeights = [];
  for (let r = 0; r < rows.length; r++) {
    const filtered = [];
    const filteredW = [];
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

export function setXDomainOverride(state, min, max, chartId) {
  if (!chartId) chartId = state.focusedChartId || state.chartOrder[0];
  return updateSlot(state, chartId, { overrides: { ...state.charts[chartId].overrides, x: { min, max } } });
}

export function setYDomainOverride(state, yMin, yMax, chartId) {
  if (!chartId) chartId = state.focusedChartId || state.chartOrder[0];
  return updateSlot(state, chartId, { overrides: { ...state.charts[chartId].overrides, y: { yMin, yMax } } });
}

export function resetAxis(state, axis, chartId) {
  if (!chartId) chartId = state.focusedChartId || state.chartOrder[0];
  const overrides = state.charts[chartId].overrides;
  if (axis === 'x') return updateSlot(state, chartId, { overrides: { ...overrides, x: null } });
  if (axis === 'y') return updateSlot(state, chartId, { overrides: { ...overrides, y: null } });
  return state;
}

export function activateForecast(state, chartId) {
  if (!chartId) chartId = state.focusedChartId || state.chartOrder[0];
  const slot = state.charts[chartId];
  if (!slot) return state;
  return updateSlot(state, chartId, {
    forecast: {
      ...slot.forecast,
      mode: "active",
      selected: true,
    },
  });
}

export function selectForecast(state, selected, chartId) {
  if (!chartId) chartId = state.focusedChartId || state.chartOrder[0];
  const slot = state.charts[chartId];
  if (!slot || slot.forecast?.mode !== "active") return state;
  if (slot.forecast.selected === selected) return state;
  return updateSlot(state, chartId, {
    forecast: {
      ...slot.forecast,
      selected,
    },
  });
}

export function setForecastPrompt(state, visible, chartId) {
  if (!chartId) chartId = state.focusedChartId || state.chartOrder[0];
  const slot = state.charts[chartId];
  if (!slot || slot.forecast?.mode === "active") return state;
  const nextMode = visible ? "prompt" : "hidden";
  if ((slot.forecast?.mode || "hidden") === nextMode) return state;
  return updateSlot(state, chartId, {
    forecast: {
      ...slot.forecast,
      mode: nextMode,
      selected: false,
    },
  });
}

export function setForecastHorizon(state, horizon, chartId) {
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

export function cancelForecast(state, chartId) {
  if (!chartId) chartId = state.focusedChartId || state.chartOrder[0];
  const slot = state.charts[chartId];
  if (!slot) return state;
  return updateSlot(state, chartId, {
    forecast: {
      ...slot.forecast,
      mode: "hidden",
      selected: false,
    },
  });
}
