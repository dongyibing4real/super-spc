/**
 * chart-callbacks.ts — Factory that builds per-chart D3 callback options.
 *
 * Each chart instance needs its own callbacks closed over `chartId`.
 * This wires Zustand store actions to the D3 chart engine's callback interface.
 * Includes forecast prompt timer management (per-chart, module-level Maps).
 */
import { spcStore } from "../store/spc-store.js";
import { getChartPoints } from "../data/chart-data-builder.js";
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
  setForecastResult,
  setForecastLoading,
  setForecastPredicting,
  cancelForecast,
  resetAxis,
} from "../core/state/chart.js";
import { openContextMenu } from "../core/state/ui.js";
import { runForecast, predictForecast } from "../data/api.js";
import type { SPCState, ChartSlot, ChartPoint } from "../types/state.ts";
import type { ForecastOut } from "../types/api.ts";

const DEFAULT_FORECAST_HORIZON = 6;

// --- Forecast prompt timers (per-chart, module-level) ---
const forecastPromptTimers = new Map<string, number>();
const forecastPromptEligibility = new Map<string, boolean>();

// --- Forecast drag debounce (per-chart) ---
const forecastDragTimers = new Map<string, ReturnType<typeof setTimeout>>();

function clearForecastPromptTimer(id: string): void {
  const timer = forecastPromptTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    forecastPromptTimers.delete(id);
  }
}

function scheduleForecastPrompt(id: string, { force = false }: { force?: boolean } = {}): void {
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

function handleForecastPromptEligibility(id: string, eligible: boolean): void {
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

function handleForecastActivity(id: string): void {
  const state = spcStore.getState();
  const slot = state.charts[id];
  if (!slot) return;
  const mode = slot.forecast?.mode;
  if (mode === "active" || mode === "loading") return;
  clearForecastPromptTimer(id);
  if (mode === "prompt") {
    spcStore.setState(setForecastPrompt(state, false, id));
  }
  if (forecastPromptEligibility.get(id)) {
    scheduleForecastPrompt(id, { force: true });
  }
}

/** Clean up forecast state when a chart unmounts. */
export function cleanupForecastState(chartId: string): void {
  clearForecastPromptTimer(chartId);
  forecastPromptEligibility.delete(chartId);
  const dragTimer = forecastDragTimers.get(chartId);
  if (dragTimer) { clearTimeout(dragTimer); forecastDragTimers.delete(chartId); }
}

/**
 * Fire the forecast API call for a chart.
 * Sets loading state, calls backend, stores result.
 */
async function fetchForecast(chartId: string, { horizonOverride }: { horizonOverride?: number } = {}): Promise<void> {
  const s = spcStore.getState();
  const slot = s.charts[chartId];
  if (!slot || !s.activeDatasetId) return;

  const horizon = horizonOverride ?? slot.forecast?.horizon ?? DEFAULT_FORECAST_HORIZON;
  const timeBudget = slot.forecast?.timeBudget ?? 3;

  // Send chart-specific values so each chart gets its own model
  const chartValues = slot.chartValues?.length > 0
    ? slot.chartValues
    : s.points.map((p: ChartPoint) => p.primaryValue);

  // Send last-phase limits for OOC estimation
  const phases = slot.phases || [];
  const lastPhase = phases.length > 0 ? phases[phases.length - 1] : null;
  const limits = lastPhase?.limits
    ? { ucl: lastPhase.limits.ucl, lcl: lastPhase.limits.lcl }
    : slot.limits?.ucl != null
      ? { ucl: slot.limits.ucl, lcl: slot.limits.lcl }
      : null;

  try {
    const result: ForecastOut = await runForecast(s.activeDatasetId, {
      horizon,
      time_budget: timeBudget,
      values: chartValues,
      limits,
    });
    spcStore.setState(setForecastResult(spcStore.getState(), result, chartId));
  } catch (err) {
    console.error("Forecast failed:", err);
    spcStore.setState(setForecastResult(spcStore.getState(), null, chartId));
  }
}

/**
 * Lightweight re-predict using cached model (for horizon changes).
 * Debounced — only fires after drag settles (300ms).
 */
function debouncedRefetchForecast(chartId: string, horizon: number): void {
  const existing = forecastDragTimers.get(chartId);
  if (existing) clearTimeout(existing);
  forecastDragTimers.set(chartId, setTimeout(() => {
    forecastDragTimers.delete(chartId);
    refetchForecastPredict(chartId, horizon);
  }, 300));
}

async function refetchForecastPredict(chartId: string, horizon: number): Promise<void> {
  const s = spcStore.getState();
  if (!s.activeDatasetId) return;
  const cacheKey = s.charts[chartId]?.forecast?.cacheKey ?? null;

  // Show predicting indicator
  spcStore.setState(setForecastPredicting(spcStore.getState(), true, chartId));

  try {
    const result: ForecastOut = await predictForecast(s.activeDatasetId, { horizon, cache_key: cacheKey });
    const current = spcStore.getState().charts[chartId];
    if (current?.forecast?.mode === "active" || current?.forecast?.mode === "loading") {
      let next = setForecastResult(spcStore.getState(), result, chartId);
      next = setForecastPredicting(next, false, chartId);
      spcStore.setState(next);
    }
  } catch (err) {
    // Fallback: full fit with chart values
    try {
      const fresh = spcStore.getState();
      const slot = fresh.charts[chartId];
      const chartValues = slot?.chartValues?.length > 0
        ? slot.chartValues
        : fresh.points.map((p: ChartPoint) => p.primaryValue);
      const result: ForecastOut = await runForecast(fresh.activeDatasetId!, {
        horizon,
        time_budget: slot?.forecast?.timeBudget ?? 3,
        values: chartValues,
      });
      const current = spcStore.getState().charts[chartId];
      if (current?.forecast?.mode === "active" || current?.forecast?.mode === "loading") {
        let next = setForecastResult(spcStore.getState(), result, chartId);
        next = setForecastPredicting(next, false, chartId);
        spcStore.setState(next);
      }
    } catch (err2) {
      console.error("Forecast predict failed:", err2);
      spcStore.setState(setForecastPredicting(spcStore.getState(), false, chartId));
    }
  }
}

interface AxisDragInfo {
  axis: "x" | "y";
  min: number;
  max: number;
  yMin?: number;
  yMax?: number;
}

interface ForecastDragInfo {
  horizon: number;
  min: number;
  max: number;
}

interface ContextMenuInfo {
  role?: string;
  [key: string]: unknown;
}

interface ChartCallbacks {
  onSelectPoint: (index: number | null) => void;
  onSelectPoints: (indices: number[] | null) => void;
  onSelectPhase: (phaseIndex: number | null) => void;
  onContextMenu: (x: number, y: number, info: ContextMenuInfo) => void;
  onAxisDrag: (info: AxisDragInfo) => void;
  onForecastDrag: (info: ForecastDragInfo) => void;
  onForecastActivity: () => void;
  onForecastPromptEligibilityChange: (payload: { eligible: boolean }) => void;
  onActivateForecast: () => void;
  onCancelForecast: () => void;
  onAxisReset: (axis: "x" | "y") => void;
}

/**
 * Build the callback options object for a specific chart instance.
 */
export function buildChartCallbacks(chartId: string): ChartCallbacks {
  return {
    onSelectPoint: (index: number | null) => {
      const s = spcStore.getState();
      spcStore.setState(selectPoint(focusChart(s, chartId), index, chartId));
    },
    onSelectPoints: (indices: number[] | null) => {
      const s = spcStore.getState();
      spcStore.setState(selectPoints(focusChart(s, chartId), indices, chartId));
    },
    onSelectPhase: (phaseIndex: number | null) => {
      const s = spcStore.getState();
      spcStore.setState(selectPhase(focusChart(s, chartId), phaseIndex, chartId));
    },
    onContextMenu: (x: number, y: number, info: ContextMenuInfo) => {
      const s = spcStore.getState();
      spcStore.setState(openContextMenu(focusChart(s, chartId), x, y, { ...info, role: chartId }));
    },
    onAxisDrag: (info: AxisDragInfo) => {
      const s = spcStore.getState();
      const focused = focusChart(s, chartId);
      if (info.axis === "x") {
        const slot = focused.charts[chartId];
        const mode = slot?.forecast?.mode;
        let next: SPCState = setXDomainOverride(focused, info.min, info.max, chartId);

        // When forecast is active/loading and the visible right edge extends
        // past the last data point, request enough periods to fill the gap.
        // If the view is entirely within data range (zoomed in), skip.
        if (mode === "active" || mode === "loading") {
          const pts = getChartPoints(slot, focused.points);
          const lastIdx = Math.max(0, pts.length - 1);
          if (info.max > lastIdx) {
            const requiredHorizon = Math.max(1, Math.ceil(info.max - lastIdx));
            const currentHorizon = slot.forecast?.horizon ?? DEFAULT_FORECAST_HORIZON;

            if (requiredHorizon !== currentHorizon) {
              next = setForecastHorizon(next, requiredHorizon, chartId);
              // Only re-predict when horizon actually grew
              if (requiredHorizon > currentHorizon) {
                debouncedRefetchForecast(chartId, requiredHorizon);
              }
            }
          }
        }

        spcStore.setState(next);
        return;
      }
      if (info.axis === "y") {
        spcStore.setState(setYDomainOverride(focused, info.yMin!, info.yMax!, chartId));
      }
    },
    onForecastDrag: (info: ForecastDragInfo) => {
      const s = spcStore.getState();
      const focused = focusChart(s, chartId);
      let next: SPCState = setForecastHorizon(focused, info.horizon, chartId);
      next = setXDomainOverride(next, info.min, info.max, chartId);
      spcStore.setState(next);
      // Debounced re-predict — fires 300ms after drag settles
      debouncedRefetchForecast(chartId, info.horizon);
    },
    onForecastActivity: () => {
      handleForecastActivity(chartId);
    },
    onForecastPromptEligibilityChange: (payload: { eligible: boolean }) => {
      handleForecastPromptEligibility(chartId, payload.eligible);
    },
    onActivateForecast: () => {
      const s = spcStore.getState();
      let next: SPCState = activateForecast(focusChart(s, chartId), chartId);
      const sl = next.charts[chartId];
      const pts = getChartPoints(sl, next.points);
      const lastPtIdx = Math.max(0, pts.length - 1);

      // Compute initial horizon from visible gap, or use default
      const xMax = sl.overrides?.x?.max;
      const horizon = (xMax != null && xMax > lastPtIdx)
        ? Math.max(DEFAULT_FORECAST_HORIZON, Math.ceil(xMax - lastPtIdx))
        : DEFAULT_FORECAST_HORIZON;

      if (!xMax || xMax <= lastPtIdx) {
        next = setXDomainOverride(next,
          sl.overrides?.x?.min ?? 0,
          lastPtIdx + horizon,
          chartId);
      }
      next = setForecastHorizon(next, horizon, chartId);

      spcStore.setState(next);
      fetchForecast(chartId, { horizonOverride: horizon });
    },
    onCancelForecast: () => {
      const s = spcStore.getState();
      spcStore.setState(cancelForecast(focusChart(s, chartId), chartId));
    },
    onAxisReset: (axis: "x" | "y") => {
      spcStore.setState(resetAxis(spcStore.getState(), axis, chartId));
    },
  };
}
