import test from "node:test";
import assert from "node:assert/strict";

import {
  createFindingFromSelection,
  createInitialState,
  deriveWorkspace,
  exportReport,
  failTransformStep,
  generateReportDraft,
  recoverTransformStep,
  resetAxis,
  selectPoint,
  setChallengerStatus,
  setXDomainOverride,
  setYDomainOverride,
  togglePointExclusion
} from "../src/core/state.js";

test("selecting a point updates the evidence ledger to the selected lot", () => {
  const initial = createInitialState();
  const next = selectPoint(initial, 26);
  const workspace = deriveWorkspace(next);

  assert.equal(workspace.selectedPoint.lot, "L-2866");
  assert.match(workspace.evidence[0].value, /L-2866/);
});

test("excluding a point keeps it visible and updates exclusion count", () => {
  const initial = createInitialState();
  const next = togglePointExclusion(initial, 10);
  const workspace = deriveWorkspace(next);

  assert.equal(next.points[10].excluded, true);
  assert.equal(workspace.excludedCount, 5);
  assert.match(next.ui.notice.body, /remains visible/i);
});

test("failed transform keeps the prior chart result while marking pipeline partial", () => {
  const initial = createInitialState();
  const before = deriveWorkspace(initial).signal.title;
  const next = failTransformStep(initial, "normalize");
  const after = deriveWorkspace(next).signal.title;

  assert.equal(next.pipeline.status, "partial");
  assert.equal(next.pipeline.rescueMode, "retain-previous-compute");
  assert.equal(before, after);
});

test("finding created from partial workspace carries unresolved citations and blocks export", () => {
  const initial = createInitialState();
  const failed = failTransformStep(initial, "phase-tag");
  const findingState = createFindingFromSelection(failed);
  const draftState = generateReportDraft(findingState);
  const exported = exportReport(draftState);

  assert.equal(draftState.reportDraft.partial, true);
  assert.equal(exported.reportExport.status, "blocked");
});

test("report export succeeds after recovery and challenger completion", () => {
  const initial = createInitialState();
  const failed = failTransformStep(initial, "phase-tag");
  const recovered = recoverTransformStep(failed, "phase-tag");
  const ready = setChallengerStatus(recovered, "ready");
  const findingState = createFindingFromSelection(ready);
  const draftState = generateReportDraft(findingState);
  const exported = exportReport(draftState);

  assert.equal(draftState.reportDraft.partial, false);
  assert.equal(exported.reportExport.status, "exported");
  assert.match(exported.reportExport.lastArtifactId, /artifact-/);
});

// ── Axis interaction state tests ──────────────────────────────────

test("setXDomainOverride stores custom x-axis range", () => {
  const initial = createInitialState();
  const next = setXDomainOverride(initial, 5, 20);

  assert.deepEqual(next.chartToggles.xDomainOverride, { min: 5, max: 20 });
});

test("setYDomainOverride stores custom y-axis range", () => {
  const initial = createInitialState();
  const next = setYDomainOverride(initial, 10, 50);

  assert.deepEqual(next.chartToggles.yDomainOverride, { yMin: 10, yMax: 50 });
});

test("resetAxis('x') clears xDomainOverride", () => {
  const initial = createInitialState();
  const panned = setXDomainOverride(initial, 3, 15);
  const reset = resetAxis(panned, "x");

  assert.equal(reset.chartToggles.xDomainOverride, null);
});

test("resetAxis('y') clears yDomainOverride", () => {
  const initial = createInitialState();
  const scaled = setYDomainOverride(initial, 5, 100);
  const reset = resetAxis(scaled, "y");

  assert.equal(reset.chartToggles.yDomainOverride, null);
});

test("setXDomainOverride does not mutate original state", () => {
  const initial = createInitialState();
  const next = setXDomainOverride(initial, 2, 18);

  assert.equal(initial.chartToggles.xDomainOverride, null);
  assert.notEqual(initial, next);
});
