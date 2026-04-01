import { predict, MIN_POINTS, EMPTY_PREDICTION } from "./provider.js";
import { DEFAULT_FORECAST_HORIZON } from "./constants.js";
import "./seasonal-harmonic.js";
import "./quadratic-trend.js";
import "./kalman-state-space.js";
import "./ewma-projection.js";
import "./linear-trend.js";

function clampHorizon(value) {
  return Math.max(1, Math.ceil(value || DEFAULT_FORECAST_HORIZON));
}

function normalizeForecastState(forecast = {}) {
  return {
    mode: forecast.mode ?? forecast.status ?? "hidden",
    selected: Boolean(forecast.selected),
    horizon: clampHorizon(forecast.horizon),
  };
}

function buildPredictionInput(points = []) {
  return points.map((p, i) => ({
    x: i,
    y: p.primaryValue ?? p.value,
    excluded: p.excluded,
  }));
}

function buildDriftSummary(result) {
  if (!result || !result.driftScore) return null;
  const score = result.driftScore.toFixed(2);
  const intent = result.driftScore > 0.7 ? "danger" : result.driftScore >= 0.3 ? "warning" : "success";
  return {
    score,
    intent,
    oocEstimate: result.oocEstimate ?? null,
    label: result.oocEstimate ? `drift ${score} · ~${result.oocEstimate} to OOC` : `drift ${score}`,
  };
}

export function buildForecastView({
  points = [],
  limits,
  forecast,
  xDomainOverride = null,
  xDefaultDomain = null,
  chartTypeId = null,
  providerName = "seasonal-harmonic",
} = {}) {
  const normalized = normalizeForecastState(forecast);
  const lastIdx = Math.max(0, points.length - 1);
  const defaultMax = xDefaultDomain?.max ?? (lastIdx + normalized.horizon);
  const visibleForecastSpace = Math.max(0, (xDomainOverride?.max ?? defaultMax) - lastIdx);
  const visibleHorizon = Math.max(0, Math.min(normalized.horizon, visibleForecastSpace));

  const baseView = {
    ...normalized,
    visibleHorizon,
    result: null,
    driftSummary: null,
  };

  if (normalized.mode !== "active" || points.length < MIN_POINTS) {
    return baseView;
  }

  const result = predict(providerName, buildPredictionInput(points), {
    horizon: normalized.horizon,
    chartType: chartTypeId,
    limits: { ucl: limits?.ucl, lcl: limits?.lcl, center: limits?.center },
  }) || EMPTY_PREDICTION;

  if (!result.projected?.length) {
    return baseView;
  }

  return {
    ...baseView,
    result,
    driftSummary: buildDriftSummary(result),
  };
}
