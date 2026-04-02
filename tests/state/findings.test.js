import test from "node:test";
import assert from "node:assert/strict";

import {
  createInitialState,
  setStructuralFindings,
  selectStructuralFinding,
  setFindingsChart,
} from "../../src/core/state.js";

test("setStructuralFindings stores findings and auto-selects first", () => {
  const state = createInitialState();
  const findings = [
    { id: "f1", label: "Shift detected" },
    { id: "f2", label: "Trend detected" },
  ];
  const next = setStructuralFindings(state, findings);

  assert.deepStrictEqual(next.structuralFindings, findings);
  assert.equal(next.selectedFindingId, "f1");
});

test("setStructuralFindings with empty array clears selectedFindingId", () => {
  let state = createInitialState();
  state = setStructuralFindings(state, [{ id: "f1", label: "X" }]);
  assert.equal(state.selectedFindingId, "f1");

  const next = setStructuralFindings(state, []);
  assert.deepStrictEqual(next.structuralFindings, []);
  assert.equal(next.selectedFindingId, null);
});

test("setStructuralFindings sets findingsChartId to provided chartId", () => {
  const state = createInitialState();
  const findings = [{ id: "f1", label: "Shift" }];
  const next = setStructuralFindings(state, findings, "chart-1");

  assert.equal(next.findingsChartId, "chart-1");
});

test("setStructuralFindings defaults findingsChartId to focusedChartId", () => {
  const state = createInitialState();
  // focusedChartId is "chart-1" by default
  const findings = [{ id: "f1", label: "Shift" }];
  const next = setStructuralFindings(state, findings);

  assert.equal(next.findingsChartId, "chart-1");
});

test("selectStructuralFinding sets selectedFindingId", () => {
  let state = createInitialState();
  state = setStructuralFindings(state, [
    { id: "f1", label: "A" },
    { id: "f2", label: "B" },
  ]);
  assert.equal(state.selectedFindingId, "f1");

  const next = selectStructuralFinding(state, "f2");
  assert.equal(next.selectedFindingId, "f2");
});

test("selectStructuralFinding can set to null", () => {
  let state = createInitialState();
  state = setStructuralFindings(state, [{ id: "f1", label: "A" }]);
  const next = selectStructuralFinding(state, null);
  assert.equal(next.selectedFindingId, null);
});

test("setFindingsChart sets findingsChartId", () => {
  const state = createInitialState();
  const next = setFindingsChart(state, "chart-99");
  assert.equal(next.findingsChartId, "chart-99");
});

test("setFindingsChart can set to null", () => {
  let state = createInitialState();
  state = setFindingsChart(state, "chart-1");
  const next = setFindingsChart(state, null);
  assert.equal(next.findingsChartId, null);
});
