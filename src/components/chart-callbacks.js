/**
 * chart-callbacks.js — Factory that builds per-chart D3 callback options.
 *
 * Each chart instance needs its own callbacks closed over `chartId`.
 * This wires Zustand store actions to the D3 chart engine's callback interface.
 * Includes forecast prompt timer management (per-chart, module-level Maps).
 */
import { spcStore } from "../store/spc-store.js";
import { getChartPoints, ensureForecastVisible, extendForecastToViewport } from "../data/chart-data-builder.js";
import {
  focusChart,
  selectPoint,
  selectPoints,
  selectPhase,
  setXDomainOverride,
  setYDomainOverride,
  setForecastHorizon,
  setForecastPrompt,
  activateForecast,
  selectForecast,
  cancelForecast,
  resetAxis,
} from "../core/state/chart.js";
import { openContextMenu } from "../core/state/ui.js";
import { DEFAULT_FORECAST_HORIZON } from "../prediction/constants.js";

// --- Forecast prompt timers (per-chart, module-level) ---
const forecastPromptTimers = new Map();
const forecastPromptEligibility = new Map();

function clearForecastPromptTimer(id) {
  const timer = forecastPromptTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    forecastPromptTimers.delete(id);
  }
}

function scheduleForecastPrompt(id, { force = false } = {}) {
  const state = spcStore.getState();
  const slot = state.charts[id];
  if (!slot || slot.forecast?.mode !== "hidden" || !forecastPromptEligibility.get(id)) {
    clearForecastPromptTimer(id);
    return;
  }
  if (forecastPromptTimers.has(id) && !force) return;
  clearForecastPromptTimer(id);
  forecastPromptTimers.set(id, window.setTimeout(() => {
    forecastPromptTimers.delete(id);
    const current = spcStore.getState().charts[id];
    if (!current || current.forecast?.mode !== "hidden" || !forecastPromptEligibility.get(id)) return;
    spcStore.setState(setForecastPrompt(spcStore.getState(), true, id));
  }, 900));
}

function handleForecastPromptEligibility(id, eligible) {
  forecastPromptEligibility.set(id, eligible);
  const state = spcStore.getState();
  const slot = state.charts[id];
  if (!slot) return;
  if (!eligible) {
    clearForecastPromptTimer(id);
    if (slot.forecast?.mode === "prompt") {
      spcStore.setState(setForecastPrompt(state, false, id));
    }
    return;
  }
  if (slot.forecast?.mode === "hidden") {
    scheduleForecastPrompt(id);
  }
}

function handleForecastActivity(id) {
  const state = spcStore.getState();
  const slot = state.charts[id];
  if (!slot || slot.forecast?.mode === "active") return;
  clearForecastPromptTimer(id);
  if (slot.forecast?.mode === "prompt") {
    spcStore.setState(setForecastPrompt(state, false, id));
  }
  if (forecastPromptEligibility.get(id)) {
    scheduleForecastPrompt(id, { force: true });
  }
}

/** Clean up forecast state when a chart unmounts. */
export function cleanupChartCallbacks(chartId) {
  clearForecastPromptTimer(chartId);
  forecastPromptEligibility.delete(chartId);
}

/**
 * Build the callback options object for a specific chart instance.
 * @param {string} chartId
 */
export function buildChartCallbacks(chartId) {
  return {
    onSelectPoint: (index) => {
      const s = spcStore.getState();
      spcStore.setState(selectPoint(focusChart(s, chartId), index, chartId));
    },
    onSelectPoints: (indices) => {
      const s = spcStore.getState();
      spcStore.setState(selectPoints(focusChart(s, chartId), indices, chartId));
    },
    onSelectPhase: (phaseIndex) => {
      const s = spcStore.getState();
      spcStore.setState(selectPhase(focusChart(s, chartId), phaseIndex, chartId));
    },
    onContextMenu: (x, y, info) => {
      const s = spcStore.getState();
      spcStore.setState(openContextMenu(focusChart(s, chartId), x, y, { ...info, role: chartId }));
    },
    onAxisDrag: (info) => {
      const s = spcStore.getState();
      const focused = focusChart(s, chartId);
      if (info.axis === "x") {
        let next = setXDomainOverride(focused, info.min, info.max, chartId);
        next = extendForecastToViewport(next, chartId, info.max);
        spcStore.setState(next);
        return;
      }
      if (info.axis === "y") {
        spcStore.setState(setYDomainOverride(focused, info.yMin, info.yMax, chartId));
      }
    },
    onForecastDrag: (info) => {
      const s = spcStore.getState();
      const focused = focusChart(s, chartId);
      let next = setForecastHorizon(focused, info.horizon, chartId);
      next = setXDomainOverride(next, info.min, info.max, chartId);
      spcStore.setState(next);
    },
    onForecastActivity: () => {
      handleForecastActivity(chartId);
    },
    onForecastPromptEligibilityChange: (payload) => {
      handleForecastPromptEligibility(chartId, payload.eligible);
    },
    onActivateForecast: () => {
      const s = spcStore.getState();
      let next = activateForecast(focusChart(s, chartId), chartId);
      const sl = next.charts[chartId];
      if (sl?.overrides?.x) {
        const pts = getChartPoints(sl, next.points);
        const lastPtIdx = Math.max(0, pts.length - 1);
        const gapIndices = Math.max(1, Math.ceil(sl.overrides.x.max - lastPtIdx));
        if (gapIndices > (sl.forecast?.horizon ?? DEFAULT_FORECAST_HORIZON)) {
          next = setForecastHorizon(next, gapIndices, chartId);
        }
      }
      next = ensureForecastVisible(next, chartId);
      spcStore.setState(next);
    },
    onSelectForecast: (selected) => {
      const s = spcStore.getState();
      spcStore.setState(selectForecast(focusChart(s, chartId), selected, chartId));
    },
    onCancelForecast: () => {
      const s = spcStore.getState();
      spcStore.setState(cancelForecast(focusChart(s, chartId), chartId));
    },
    onAxisReset: (axis) => {
      spcStore.setState(resetAxis(spcStore.getState(), axis, chartId));
    },
  };
}
