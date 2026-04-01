import test from "node:test";
import assert from "node:assert/strict";

import { buildForecastView } from "../src/prediction/build-forecast-view.js";

function makePoints(count = 20) {
  return Array.from({ length: count }, (_, i) => ({
    primaryValue: 10 + i * 0.05,
    excluded: false,
  }));
}

const limits = { center: 10.5, ucl: 12, lcl: 9 };

test("forecast result is stable under viewport-only x overrides", () => {
  const points = makePoints();
  const baseArgs = {
    points,
    limits,
    forecast: { mode: "active", selected: true, horizon: 6 },
    xDefaultDomain: { min: 0, max: 25 },
  };

  const a = buildForecastView({ ...baseArgs, xDomainOverride: { min: 0, max: 25 } });
  const b = buildForecastView({ ...baseArgs, xDomainOverride: { min: 8, max: 22 } });

  assert.deepEqual(a.result.projected, b.result.projected);
  assert.deepEqual(a.result.confidence, b.result.confidence);
  assert.equal(a.driftSummary.label, b.driftSummary.label);
});

test("visibleHorizon shrinks when the viewport clips forecast space", () => {
  const points = makePoints();
  const view = buildForecastView({
    points,
    limits,
    forecast: { mode: "active", selected: true, horizon: 6 },
    xDefaultDomain: { min: 0, max: 25 },
    xDomainOverride: { min: 10, max: 21.5 },
  });

  assert.equal(view.horizon, 6);
  assert.equal(view.visibleHorizon, 2.5);
  assert.equal(view.result.projected.length, 6);
});

test("hidden forecast returns no result or drift summary", () => {
  const view = buildForecastView({
    points: makePoints(),
    limits,
    forecast: { mode: "hidden", selected: false, horizon: 6 },
    xDefaultDomain: { min: 0, max: 25 },
  });

  assert.equal(view.result, null);
  assert.equal(view.driftSummary, null);
});

test("prompt mode exposes visible horizon without executing prediction", () => {
  const view = buildForecastView({
    points: makePoints(),
    limits,
    forecast: { mode: "prompt", selected: false, horizon: 6 },
    xDefaultDomain: { min: 0, max: 25 },
  });

  assert.equal(view.visibleHorizon, 6);
  assert.equal(view.result, null);
});
