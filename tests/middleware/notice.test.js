import test from "node:test";
import assert from "node:assert/strict";
import { noticeMiddleware } from "../../src/core/middleware/notice.js";

test("noticeMiddleware sets notice when point is excluded", () => {
  const prev = {
    points: [{ label: "P1", excluded: false }],
    transforms: [],
    ui: { notice: null },
  };
  const next = {
    ...prev,
    points: [{ label: "P1", excluded: true }],
  };
  const result = noticeMiddleware(prev, next);
  assert.equal(result.ui.notice.title, "Point excluded");
  assert.match(result.ui.notice.body, /P1.*remains visible/);
});

test("noticeMiddleware sets notice when point is restored", () => {
  const prev = {
    points: [{ label: "P1", excluded: true }],
    transforms: [],
    ui: { notice: null },
  };
  const next = {
    ...prev,
    points: [{ label: "P1", excluded: false }],
  };
  const result = noticeMiddleware(prev, next);
  assert.equal(result.ui.notice.title, "Point restored");
});

test("noticeMiddleware sets notice when transform is disabled", () => {
  const prev = {
    points: [],
    transforms: [{ id: "norm", active: true, status: "active", detail: "Normalize values" }],
    ui: { notice: null },
  };
  const next = {
    ...prev,
    transforms: [{ id: "norm", active: false, status: "inactive", detail: "Normalize values" }],
  };
  const result = noticeMiddleware(prev, next);
  assert.equal(result.ui.notice.title, "Transform disabled");
  assert.equal(result.ui.notice.body, "Normalize values");
});

test("noticeMiddleware sets warning notice when transform fails", () => {
  const prev = {
    points: [],
    transforms: [{ id: "norm", active: true, status: "active", title: "Normalize" }],
    ui: { notice: null },
  };
  const next = {
    ...prev,
    transforms: [{ id: "norm", active: false, status: "failed", title: "Normalize" }],
  };
  const result = noticeMiddleware(prev, next);
  assert.equal(result.ui.notice.tone, "warning");
  assert.equal(result.ui.notice.title, "Transform failed");
});

test("noticeMiddleware sets positive notice when transform recovers", () => {
  const prev = {
    points: [],
    transforms: [{ id: "norm", active: false, status: "failed", title: "Normalize" }],
    ui: { notice: null },
  };
  const next = {
    ...prev,
    transforms: [{ id: "norm", active: true, status: "active", title: "Normalize" }],
  };
  const result = noticeMiddleware(prev, next);
  assert.equal(result.ui.notice.tone, "positive");
  assert.equal(result.ui.notice.title, "Transform recovered");
});

test("noticeMiddleware returns nextState unchanged when no notice-worthy changes", () => {
  const prev = { points: [], transforms: [], ui: { notice: null } };
  const next = { ...prev, loading: true };
  assert.equal(noticeMiddleware(prev, next), next);
});

test("noticeMiddleware returns nextState when states are identical", () => {
  const state = { points: [], transforms: [], ui: { notice: null } };
  assert.equal(noticeMiddleware(state, state), state);
});
