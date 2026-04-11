/**
 * chart-data-builder.js -- Pure function that assembles chart data for D3 rendering.
 *
 * Extracted from legacy-boot.js to be importable by both legacy code and React Chart.jsx.
 */
import { detectRuleViolations, getCapability } from "../core/state/selectors.js";
import { setXDomainOverride, setForecastHorizon } from "../core/state/chart.js";

const DEFAULT_FORECAST_HORIZON = 6;

export function getChartPoints(slot, globalPoints) {
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

export function ensureForecastVisible(nextState, chartId) {
  const slot = nextState.charts[chartId];
  if (!slot) return nextState;
  const points = getChartPoints(slot, nextState.points);
  const lastIdx = Math.max(0, points.length - 1);
  const horizon = slot.forecast?.horizon ?? DEFAULT_FORECAST_HORIZON;
  const requiredMax = lastIdx + horizon;
  const currentOverride = slot.overrides?.x;
  if (!currentOverride || currentOverride.max >= requiredMax) {
    return nextState;
  }
  return setXDomainOverride(nextState, currentOverride.min, requiredMax, chartId);
}

export function growForecastHorizonToFit(nextState, chartId, nextXMax) {
  const slot = nextState.charts[chartId];
  const mode = slot?.forecast?.mode;
  if (!slot || (mode !== "active" && mode !== "loading")) return nextState;
  const points = getChartPoints(slot, nextState.points);
  const lastIdx = Math.max(0, points.length - 1);
  const requiredHorizon = Math.max(1, Math.ceil(Math.max(0, nextXMax - lastIdx)));
  const currentHorizon = slot.forecast?.horizon ?? DEFAULT_FORECAST_HORIZON;
  if (requiredHorizon <= currentHorizon) return nextState;
  return setForecastHorizon(nextState, requiredHorizon, chartId);
}

/**
 * Build the full data payload a D3 chart needs to render.
 * @param {string} chartId — chart slot ID (e.g. "chart-1")
 * @param {object} state — full app state (required)
 * @returns {object} — { points, limits, phases, forecast, toggles, selectedIndex, ... }
 */
export function buildChartData(chartId, state) {
  const slot = state.charts[chartId];
  if (!slot) return null;

  // No chart type selected: render empty canvas
  if (!slot.params?.chart_type) {
    return null;
  }

  const points = getChartPoints(slot, state.points);
  const hasChartValues = slot.chartValues && slot.chartValues.length > 0;
  const lastIdx = Math.max(0, points.length - 1);

  // Forecast data comes from backend (stored in slot.forecast by API response)
  const forecastState = slot.forecast || {};
  const forecastMode = forecastState.mode || "hidden";
  const forecastHorizon = forecastState.horizon ?? DEFAULT_FORECAST_HORIZON;

  // Extend default x domain to include forecast horizon when forecast is active/loading
  const xDefaultMax = (forecastMode === "active" || forecastMode === "loading")
    ? lastIdx + forecastHorizon
    : lastIdx;
  const xDefaultDomain = { min: 0, max: xDefaultMax };

  const visibleForecastSpace = Math.max(0, (slot.overrides.x?.max ?? xDefaultDomain.max) - lastIdx);
  const visibleHorizon = Math.max(0, Math.min(forecastHorizon, visibleForecastSpace));
  // Forecast limits: use last phase's limits if phases exist, otherwise overall.
  // The forecast extends from the last data point, which belongs to the last phase.
  const phases = slot.phases || [];
  const lastPhase = phases.length > 0 ? phases[phases.length - 1] : null;
  const forecastLimits = lastPhase?.limits
    ? { ucl: lastPhase.limits.ucl, lcl: lastPhase.limits.lcl, center: lastPhase.limits.center }
    : { ucl: slot.limits.ucl, lcl: slot.limits.lcl, center: slot.limits.center };

  const forecast = {
    mode: forecastState.mode || "hidden",
    horizon: forecastState.horizon ?? DEFAULT_FORECAST_HORIZON,
    visibleHorizon,
    result: forecastState.result || null,
    driftSummary: forecastState.driftSummary || null,
    predicting: !!forecastState.predicting,
    limits: forecastLimits,
  };

  return {
    points,
    limits: slot.limits,
    phases: slot.phases || [],
    forecast,
    toggles: {
      ...state.chartToggles,
      overlay: false,
      xDomainOverride: slot.overrides.x,
      xDefaultDomain,
      yDomainOverride: slot.overrides.y,
    },
    selectedIndex: hasChartValues ? (slot.selectedPointIndex ?? -1) : state.selectedPointIndex,
    selectedIndices: hasChartValues ? (slot.selectedPointIndices || null) : (state.selectedPointIndices || null),
    selectedPhaseIndex: slot.selectedPhaseIndex ?? null,
    violations: detectRuleViolations(state, chartId),
    capability: getCapability(state, chartId),
    metric: slot.context.metric,
    subgroup: slot.context.subgroup,
    phase: slot.context.phase,
    chartType: slot.context.chartType,
    seriesKey: "primaryValue",
    seriesType: chartId,
  };
}
