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
  selectPoint,
  setChallengerStatus,
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
