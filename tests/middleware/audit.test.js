import test from "node:test";
import assert from "node:assert/strict";
import { auditMiddleware } from "../../src/core/middleware/audit.js";

test("auditMiddleware appends entry when point exclusion changes", () => {
  const prev = {
    points: [{ label: "P1", excluded: false }, { label: "P2", excluded: false }],
    transforms: [],
    activeDatasetId: "ds-1",
    auditLog: [],
  };
  const next = {
    ...prev,
    points: [{ label: "P1", excluded: true }, { label: "P2", excluded: false }],
  };
  const result = auditMiddleware(prev, next);
  assert.equal(result.auditLog.length, 1);
  assert.match(result.auditLog[0], /P1.*excluded/);
});

test("auditMiddleware appends entry when point is restored", () => {
  const prev = {
    points: [{ label: "P1", excluded: true }],
    transforms: [],
    activeDatasetId: "ds-1",
    auditLog: ["previous entry"],
  };
  const next = {
    ...prev,
    points: [{ label: "P1", excluded: false }],
  };
  const result = auditMiddleware(prev, next);
  assert.equal(result.auditLog.length, 2);
  assert.match(result.auditLog[0], /P1.*restored/);
  assert.equal(result.auditLog[1], "previous entry");
});

test("auditMiddleware appends entry when transform is toggled", () => {
  const prev = {
    points: [],
    transforms: [{ id: "norm", active: true, status: "active" }],
    activeDatasetId: "ds-1",
    auditLog: [],
  };
  const next = {
    ...prev,
    transforms: [{ id: "norm", active: false, status: "inactive" }],
  };
  const result = auditMiddleware(prev, next);
  assert.equal(result.auditLog.length, 1);
  assert.match(result.auditLog[0], /norm.*disabled/);
});

test("auditMiddleware appends entry when transform fails", () => {
  const prev = {
    points: [],
    transforms: [{ id: "norm", active: true, status: "active" }],
    activeDatasetId: "ds-1",
    auditLog: [],
  };
  const next = {
    ...prev,
    transforms: [{ id: "norm", active: false, status: "failed" }],
  };
  const result = auditMiddleware(prev, next);
  assert.equal(result.auditLog.length, 1);
  assert.match(result.auditLog[0], /norm.*failed/);
});

test("auditMiddleware appends entry when transform recovers", () => {
  const prev = {
    points: [],
    transforms: [{ id: "norm", active: false, status: "failed" }],
    activeDatasetId: "ds-1",
    auditLog: [],
  };
  const next = {
    ...prev,
    transforms: [{ id: "norm", active: true, status: "active" }],
  };
  const result = auditMiddleware(prev, next);
  assert.equal(result.auditLog.length, 1);
  assert.match(result.auditLog[0], /norm.*recovered/);
});

test("auditMiddleware appends entry when dataset is loaded", () => {
  const prev = {
    points: [],
    transforms: [],
    activeDatasetId: null,
    auditLog: [],
  };
  const next = {
    ...prev,
    activeDatasetId: "ds-1",
    points: [{ label: "P1" }, { label: "P2" }, { label: "P3" }],
  };
  const result = auditMiddleware(prev, next);
  assert.equal(result.auditLog.length, 1);
  assert.match(result.auditLog[0], /Dataset loaded with 3 points/);
});

test("auditMiddleware returns nextState unchanged when no auditable changes", () => {
  const prev = { points: [], transforms: [], activeDatasetId: "ds-1", auditLog: [] };
  const next = { ...prev, ui: { notice: null } };
  const result = auditMiddleware(prev, next);
  assert.equal(result, next);
});

test("auditMiddleware returns nextState when states are identical", () => {
  const state = { points: [], transforms: [], activeDatasetId: "ds-1", auditLog: [] };
  assert.equal(auditMiddleware(state, state), state);
});
