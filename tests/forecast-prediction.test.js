import test from "node:test";
import assert from "node:assert/strict";

import "../src/prediction/seasonal-harmonic.js";
import "../src/prediction/quadratic-trend.js";
import "../src/prediction/kalman-state-space.js";
import "../src/prediction/ewma-projection.js";
import "../src/prediction/linear-trend.js";
import { predict } from "../src/prediction/provider.js";

function makePoints(values, startX = 0) {
  return values.map((y, i) => ({ x: startX + i, y, excluded: false }));
}

test("ewma projection uses control-limit-derived sigma for confidence width", () => {
  const values = [10, 10.5, 9.5, 11, 9, 12, 8.5, 11.5, 9.8, 10.2];
  const limits = { center: 10, ucl: 13, lcl: 7 };
  const result = predict("ewma-projection", makePoints(values), { horizon: 1, limits, lambda: 0.2 });

  const expectedWidth = 3 * 1 * Math.sqrt((0.2 / 1.8) * (1 - Math.pow(0.8, 2)));
  const actualWidth = result.confidence[0].upper - result.projected[0].y;
  assert.ok(Math.abs(actualWidth - expectedWidth) < 1e-9);
});

test("ewma initializes from the process center line", () => {
  const values = [20, 10, 10, 10, 10, 10, 10, 10, 10, 10];
  const limits = { center: 10, ucl: 13, lcl: 7 };
  const result = predict("ewma-projection", makePoints(values), { horizon: 1, limits, lambda: 0.2 });

  assert.ok(Math.abs(result.projected[0].y - 10.268435456) < 1e-9);
});

test("linear trend prediction is invariant to absolute x offsets", () => {
  const limits = { center: 10, ucl: 13, lcl: 7 };
  const values = [10, 10.2, 10.4, 10.6, 10.8, 11, 11.2, 11.4, 11.6, 11.8];

  const a = predict("linear-trend", makePoints(values, 0), { horizon: 3, limits });
  const b = predict("linear-trend", makePoints(values, 130), { horizon: 3, limits });

  assert.deepEqual(
    a.projected.map((p) => Number(p.y.toFixed(10))),
    b.projected.map((p) => Number(p.y.toFixed(10))),
  );
  assert.deepEqual(
    a.confidence.map((p) => Number((p.upper - p.lower).toFixed(10))),
    b.confidence.map((p) => Number((p.upper - p.lower).toFixed(10))),
  );
});

test("kalman state-space projection carries forward upward trend", () => {
  const limits = { center: 10, ucl: 13, lcl: 7 };
  const values = [10, 10.1, 10.3, 10.5, 10.8, 11.1, 11.5, 11.9, 12.2, 12.6, 12.9, 13.3];

  const result = predict("kalman-state-space", makePoints(values), { horizon: 3, limits });

  assert.equal(result.projected.length, 3);
  assert.ok(result.projected[1].y > result.projected[0].y);
  assert.ok(result.projected[2].y > result.projected[1].y);
});

test("kalman state-space with acceleration increases forecast step sizes", () => {
  const limits = { center: 10, ucl: 18, lcl: 2 };
  const values = [10, 10.1, 10.4, 10.9, 11.6, 12.5, 13.6, 14.9, 16.4, 18.1];

  const result = predict("kalman-state-space", makePoints(values), { horizon: 3, limits });
  const increments = [
    result.projected[1].y - result.projected[0].y,
    result.projected[2].y - result.projected[1].y,
  ];

  assert.ok(increments[0] > 0);
  assert.ok(increments[1] > increments[0]);
});

test("kalman state-space confidence grows with forecast horizon", () => {
  const limits = { center: 10, ucl: 13, lcl: 7 };
  const values = [10, 10.05, 10.15, 10.2, 10.35, 10.4, 10.5, 10.55, 10.7, 10.8, 10.9, 11];

  const result = predict("kalman-state-space", makePoints(values), { horizon: 4, limits });
  const widths = result.confidence.map((point) => point.upper - point.lower);

  assert.equal(widths.length, 4);
  assert.ok(widths[1] >= widths[0]);
  assert.ok(widths[2] >= widths[1]);
  assert.ok(widths[3] >= widths[2]);
});

test("quadratic trend projection bends upward for accelerating series", () => {
  const limits = { center: 10, ucl: 18, lcl: 2 };
  const values = [10, 10.1, 10.4, 10.9, 11.6, 12.5, 13.6, 14.9, 16.4, 18.1];

  const result = predict("quadratic-trend", makePoints(values), { horizon: 3, limits });
  const increments = [
    result.projected[1].y - result.projected[0].y,
    result.projected[2].y - result.projected[1].y,
  ];

  assert.equal(result.projected.length, 3);
  assert.ok(increments[0] > 0);
  assert.ok(increments[1] > increments[0]);
});

test("quadratic trend confidence widens with horizon", () => {
  const limits = { center: 10, ucl: 18, lcl: 2 };
  const values = [10, 10.1, 10.4, 10.9, 11.6, 12.5, 13.6, 14.9, 16.4, 18.1];

  const result = predict("quadratic-trend", makePoints(values), { horizon: 4, limits });
  const widths = result.confidence.map((point) => point.upper - point.lower);

  assert.ok(widths[1] > widths[0]);
  assert.ok(widths[2] > widths[1]);
  assert.ok(widths[3] > widths[2]);
});

test("seasonal harmonic projection preserves oscillation in a periodic series", () => {
  const limits = { center: 10, ucl: 16, lcl: 4 };
  const values = Array.from({ length: 18 }, (_, i) => 10 + 2 * Math.sin((2 * Math.PI * i) / 6));

  const result = predict("seasonal-harmonic", makePoints(values), { horizon: 6, limits });
  const projectedYs = result.projected.map((point) => point.y);
  let directionChanges = 0;
  for (let i = 2; i < projectedYs.length; i++) {
    const prevDelta = projectedYs[i - 1] - projectedYs[i - 2];
    const nextDelta = projectedYs[i] - projectedYs[i - 1];
    if ((prevDelta > 0 && nextDelta < 0) || (prevDelta < 0 && nextDelta > 0)) {
      directionChanges += 1;
    }
  }

  assert.equal(result.projected.length, 6);
  assert.ok(directionChanges >= 1);
});

test("seasonal harmonic confidence widens with horizon", () => {
  const limits = { center: 10, ucl: 16, lcl: 4 };
  const values = Array.from({ length: 18 }, (_, i) => 10 + 2 * Math.sin((2 * Math.PI * i) / 6));

  const result = predict("seasonal-harmonic", makePoints(values), { horizon: 4, limits });
  const widths = result.confidence.map((point) => point.upper - point.lower);

  assert.ok(widths[1] > widths[0]);
  assert.ok(widths[2] > widths[1]);
  assert.ok(widths[3] > widths[2]);
});
