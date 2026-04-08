import { useRef, useEffect } from "react";
import { spcStore } from "../store/spc-store.js";
import { useChartData } from "../hooks/useChartData.js";
import { createChart } from "./chart/index.js";
import { setForecastPrompt } from "../core/state/chart.js";
import { buildChartCallbacks } from "./chart-callbacks.js";

/**
 * React wrapper around the D3 createChart factory.
 * React manages the mount lifecycle; D3 owns the SVG content.
 */
export default function Chart({ chartId, onContextMenu: onContextMenuProp }) {
  const mountRef = useRef(null);
  const chartRef = useRef(null);

  // Single memoized selector — only recomputes when chart-relevant state changes
  const data = useChartData(chartId);

  // Create D3 chart on mount, destroy on unmount
  useEffect(() => {
    if (!mountRef.current) return;

    const callbacks = buildChartCallbacks(chartId, {
      handleForecastActivity,
      handleForecastPromptEligibility,
    });
    chartRef.current = createChart(mountRef.current, callbacks);

    return () => {
      clearForecastPromptTimer(chartId);
      forecastPromptEligibility.delete(chartId);
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [chartId]); // Only re-create if chartId changes

  // Update D3 chart when data changes.
  // Defer to rAF so flex layout has settled and syncSize reads correct dimensions.
  // `data` is memoized by useChartData — only changes when chart-relevant state changes.
  useEffect(() => {
    if (!chartRef.current || !data) return;
    let cancelled = false;
    requestAnimationFrame(() => {
      if (cancelled || !chartRef.current) return;
      requestAnimationFrame(() => {
        if (cancelled || !chartRef.current) return;
        chartRef.current.update(data);
      });
    });
    return () => { cancelled = true; };
  }, [data]);

  return (
    <div
      ref={mountRef}
      className="chart-stage"
      id={`chart-mount-${chartId}`}
      tabIndex={0}
      data-chart-focus="true"
      aria-label={`${chartId} control chart`}
      onContextMenu={onContextMenuProp}
    />
  );
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
