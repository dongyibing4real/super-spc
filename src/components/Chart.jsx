import { useRef, useEffect } from "react";
import { useStore } from "zustand";
import { spcStore } from "../store/spc-store.js";
import { buildChartData } from "../store/chart-data-builder.js";
import { createChart } from "./chart/index.js";
import {
  focusChart,
  selectPoint,
  selectPoints,
  selectPhase,
  openContextMenu,
  setXDomainOverride,
  setYDomainOverride,
  setForecastHorizon,
  setForecastPrompt,
  activateForecast,
  selectForecast,
  cancelForecast,
  resetAxis,
} from "../core/state.js";
import { DEFAULT_FORECAST_HORIZON } from "../prediction/constants.js";
import { buildForecastView } from "../prediction/build-forecast-view.js";

/**
 * React wrapper around the D3 createChart factory.
 * React manages the mount lifecycle; D3 owns the SVG content.
 */
export default function Chart({ chartId }) {
  const mountRef = useRef(null);
  const chartRef = useRef(null);

  // Subscribe to the state fields that affect this chart's data
  const slot = useStore(spcStore, (s) => s.charts[chartId]);
  const points = useStore(spcStore, (s) => s.points);
  const chartToggles = useStore(spcStore, (s) => s.chartToggles);
  const selectedPointIndex = useStore(spcStore, (s) => s.selectedPointIndex);
  const selectedPointIndices = useStore(spcStore, (s) => s.selectedPointIndices);

  // Create D3 chart on mount, destroy on unmount
  useEffect(() => {
    if (!mountRef.current) return;

    chartRef.current = createChart(mountRef.current, {
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
    });

    return () => {
      clearForecastPromptTimer(chartId);
      forecastPromptEligibility.delete(chartId);
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [chartId]); // Only re-create if chartId changes

  // Update D3 chart when data changes
  useEffect(() => {
    if (!chartRef.current || !slot) return;
    const data = buildChartData(chartId);
    if (data) chartRef.current.update(data);
  }, [chartId, slot, points, chartToggles, selectedPointIndex, selectedPointIndices]);

  return (
    <div
      ref={mountRef}
      className="chart-stage"
      id={`chart-mount-${chartId}`}
      tabIndex={0}
      data-chart-focus="true"
      aria-label={`${chartId} control chart`}
    />
  );
}

// --- Helper functions (extracted from legacy-boot.js) ---

function getChartPoints(slot, globalPoints) {
  const hasChartValues = slot.chartValues && slot.chartValues.length > 0;
  return hasChartValues
    ? slot.chartValues.map((v, i) => ({
        primaryValue: v,
        label: slot.chartLabels[i] || `pt-${i}`,
        subgroupLabel: slot.chartLabels[i] || `pt-${i}`,
        excluded: false,
        annotation: null,
        raw: {},
      }))
    : globalPoints;
}

function ensureForecastVisible(nextState, id) {
  const slot = nextState.charts[id];
  if (!slot) return nextState;
  const points = getChartPoints(slot, nextState.points);
  const lastIdx = Math.max(0, points.length - 1);
  const horizon = slot.forecast?.horizon ?? DEFAULT_FORECAST_HORIZON;
  const requiredMax = lastIdx + horizon;
  const currentOverride = slot.overrides?.x;
  if (!currentOverride || currentOverride.max >= requiredMax) {
    return nextState;
  }
  return setXDomainOverride(nextState, currentOverride.min, requiredMax, id);
}

function extendForecastToViewport(nextState, id, nextXMax) {
  const slot = nextState.charts[id];
  if (!slot || slot.forecast?.mode !== "active") return nextState;
  const points = getChartPoints(slot, nextState.points);
  const lastIdx = Math.max(0, points.length - 1);
  const requiredHorizon = Math.max(1, Math.ceil(Math.max(0, nextXMax - lastIdx)));
  const currentHorizon = slot.forecast?.horizon ?? DEFAULT_FORECAST_HORIZON;
  if (requiredHorizon <= currentHorizon) return nextState;
  return setForecastHorizon(nextState, requiredHorizon, id);
}

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
