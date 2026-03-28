/**
 * test_transforms.js — Unit tests for src/data/transforms.js
 *
 * Run: node tests/test_transforms.js
 */

import assert from "node:assert/strict";
import {
  transformPoints,
  transformAnalysis,
  buildDefaultContext,
} from "../src/data/transforms.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL  ${name}`);
    console.error(`        ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// transformPoints
// ---------------------------------------------------------------------------
console.log("\ntransformPoints");

test("maps normal measurement array", () => {
  const measurements = [
    { id: 1, value: 8.042, subgroup: "Hour 1", sequence_index: 0, metadata: {} },
    { id: 2, value: 8.046, subgroup: "Hour 2", sequence_index: 1, metadata: {} },
    { id: 3, value: 8.044, subgroup: "Hour 3", sequence_index: 2, metadata: {} },
  ];

  const points = transformPoints(measurements);
  assert.equal(points.length, 3);

  assert.equal(points[0].id, "pt-0");
  assert.equal(points[0].label, "pt-0");
  assert.equal(points[0].subgroupLabel, "Hour 1");
  assert.equal(points[0].primaryValue, 8.042);
  assert.equal(points[0].phaseId, null);
  assert.equal(points[0].challengerValue, null);
  assert.equal(points[0].excluded, false);
  assert.equal(points[0].annotation, null);

  assert.equal(points[2].id, "pt-2");
  assert.equal(points[2].primaryValue, 8.044);
});

test("returns empty array for empty input", () => {
  const points = transformPoints([]);
  assert.deepEqual(points, []);
});

test("returns empty array for non-array input", () => {
  assert.deepEqual(transformPoints(null), []);
  assert.deepEqual(transformPoints(undefined), []);
});

test("falls back to pt-index when subgroup is null", () => {
  const measurements = [
    { id: 10, value: 5.0, subgroup: null, sequence_index: 7, metadata: {} },
  ];
  const points = transformPoints(measurements);
  assert.equal(points[0].subgroupLabel, "pt-7");
});

test("falls back to pt-index when subgroup is undefined", () => {
  const measurements = [
    { id: 11, value: 6.0, sequence_index: 3, metadata: {} },
  ];
  const points = transformPoints(measurements);
  assert.equal(points[0].subgroupLabel, "pt-3");
});

test("handles single point", () => {
  const measurements = [
    { id: 99, value: 1.23, subgroup: "S1", sequence_index: 0, metadata: {} },
  ];
  const points = transformPoints(measurements);
  assert.equal(points.length, 1);
  assert.equal(points[0].primaryValue, 1.23);
  assert.equal(points[0].subgroupLabel, "S1");
});

test("uses column config for label and phase", () => {
  const measurements = [
    { id: 1, value: 8.0, subgroup: "A", sequence_index: 0, raw_data: { Batch: "B1", Stage: "Phase1" } },
  ];
  const columns = [
    { name: "Value", ordinal: 0, dtype: "numeric", role: "value" },
    { name: "Batch", ordinal: 1, dtype: "text", role: "label" },
    { name: "Stage", ordinal: 2, dtype: "text", role: "phase" },
  ];
  const points = transformPoints(measurements, columns);
  assert.equal(points[0].label, "B1");
  assert.equal(points[0].phaseId, "Phase1");
});

test("preserves raw data in point", () => {
  const measurements = [
    { id: 1, value: 8.0, subgroup: "A", sequence_index: 0, raw_data: { Temp: "21.5", Batch: "B1" } },
  ];
  const points = transformPoints(measurements);
  assert.equal(points[0].raw.Temp, "21.5");
  assert.equal(points[0].raw.Batch, "B1");
});

// ---------------------------------------------------------------------------
// transformAnalysis
// ---------------------------------------------------------------------------
console.log("\ntransformAnalysis");

test("maps full analysis result with capability", () => {
  const analysisResult = {
    id: 42,
    dataset_id: 1,
    sigma: { sigma_hat: 0.022, method: "pooled_std", n_used: 28 },
    limits: {
      ucl: [8.145],
      cl: [8.078],
      lcl: [8.011],
      k_sigma: 3,
    },
    zones: {
      zone_a_upper: 8.123,
      zone_b_upper: 8.1,
      cl: 8.078,
      zone_b_lower: 8.056,
      zone_a_lower: 8.033,
    },
    capability: { cp: 1.35, cpk: 1.12, pp: 1.28, ppk: 1.05 },
    created_at: "2026-03-27T10:00:00Z",
  };

  const result = transformAnalysis(analysisResult, 8.165, 8.025);

  assert.equal(result.limits.center, 8.078);
  assert.equal(result.limits.ucl, 8.145);
  assert.equal(result.limits.lcl, 8.011);
  assert.equal(result.limits.usl, 8.165);
  assert.equal(result.limits.lsl, 8.025);
  assert.equal(result.limits.version, 42);
  assert.equal(result.limits.scope, "Dataset");

  assert.notEqual(result.capability, null);
  assert.equal(result.capability.cp, 1.35);
  assert.equal(result.capability.cpk, 1.12);
  assert.equal(result.capability.ppk, 1.05);

  assert.notEqual(result.sigma, null);
  assert.equal(result.sigma.sigma_hat, 0.022);

  assert.notEqual(result.zones, null);
  assert.equal(result.zones.zone_a_upper, 8.123);

  assert.deepEqual(result.violations, []);
});

test("returns null capability when not present", () => {
  const analysisResult = {
    id: 7,
    dataset_id: 1,
    sigma: { sigma_hat: 0.03, method: "rbar", n_used: 10 },
    limits: { ucl: [10.5], cl: [10.0], lcl: [9.5], k_sigma: 3 },
    zones: { zone_a_upper: 10.33, zone_b_upper: 10.17, cl: 10.0, zone_b_lower: 9.83, zone_a_lower: 9.67 },
    capability: null,
    created_at: "2026-03-27T12:00:00Z",
  };

  const result = transformAnalysis(analysisResult);
  assert.equal(result.capability, null);
  assert.equal(result.limits.usl, null);
  assert.equal(result.limits.lsl, null);
});

test("maps violations array to frontend shape", () => {
  const analysisResult = {
    id: 50,
    dataset_id: 1,
    sigma: { sigma_hat: 0.042, method: "moving_range", n_used: 27 },
    limits: { ucl: [8.204], cl: [8.078], lcl: [7.952], k_sigma: 3 },
    zones: { zone_a_upper: 8.162, zone_b_upper: 8.12, cl: 8.078, zone_b_lower: 8.036, zone_a_lower: 7.994 },
    capability: null,
    violations: [
      { test_id: "1", point_indices: [5, 12, 23], description: "Point beyond control limits (Test 1)" },
      { test_id: "2", point_indices: [15, 16, 17, 18, 19, 20, 21, 22, 23], description: "9 consecutive points on same side of CL (Test 2)" },
    ],
    created_at: "2026-03-27T10:00:00Z",
  };

  const result = transformAnalysis(analysisResult);
  assert.equal(result.violations.length, 2);
  assert.equal(result.violations[0].testId, "1");
  assert.deepEqual(result.violations[0].indices, [5, 12, 23]);
});

test("backward compat: handles old response without violations/sigma/zones", () => {
  const analysisResult = {
    id: 55,
    dataset_id: 1,
    limits: { ucl: [5.0], cl: [4.5], lcl: [4.0], k_sigma: 3 },
    capability: { cp: 1.0, cpk: 0.9, pp: 0.95, ppk: 0.85 },
    created_at: "2026-03-27T10:00:00Z",
  };

  const result = transformAnalysis(analysisResult, 5.5, 3.5);
  assert.equal(result.limits.center, 4.5);
  assert.equal(result.capability.cp, 1.0);
  assert.equal(result.sigma, null);
  assert.equal(result.zones, null);
  assert.deepEqual(result.violations, []);
});

// ---------------------------------------------------------------------------
// buildDefaultContext
// ---------------------------------------------------------------------------
console.log("\nbuildDefaultContext");

test("builds context from dataset metadata", () => {
  const meta = { name: "Etch Rate Stability" };
  const ctx = buildDefaultContext(meta);

  assert.equal(ctx.title, "Etch Rate Stability");
  assert.ok(ctx.metric && ctx.metric.id);
  assert.ok(ctx.subgroup && ctx.subgroup.id);
  assert.ok(ctx.phase && ctx.phase.id);
  assert.ok(ctx.chartType && ctx.chartType.id);
  assert.ok(ctx.sigma && ctx.sigma.label);
  assert.ok(ctx.tests && ctx.tests.label);
  assert.ok(ctx.compare && ctx.compare.label);
  assert.equal(typeof ctx.window, "string");
  assert.equal(typeof ctx.methodBadge, "string");
  assert.equal(typeof ctx.status, "string");
});

test("falls back to Untitled Dataset when name is missing", () => {
  const ctx = buildDefaultContext({});
  assert.equal(ctx.title, "Untitled Dataset");
});

test("uses column config for metric/subgroup/phase labels", () => {
  const meta = { name: "My Chart" };
  const columns = [
    { name: "Temperature", ordinal: 0, dtype: "numeric", role: "value" },
    { name: "Batch", ordinal: 1, dtype: "text", role: "subgroup" },
    { name: "Stage", ordinal: 2, dtype: "text", role: "phase" },
  ];
  const ctx = buildDefaultContext(meta, columns);
  assert.equal(ctx.title, "My Chart");
  assert.equal(ctx.metric.label, "Temperature");
  assert.equal(ctx.subgroup.label, "Batch");
  assert.equal(ctx.phase.label, "Stage");
});

test("defaults to generic labels when no columns provided", () => {
  const ctx = buildDefaultContext({ name: "Test" });
  assert.equal(ctx.metric.label, "Value");
  assert.equal(ctx.subgroup.label, "Individual");
  assert.equal(ctx.phase.label, "Single phase");
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
