import test from "node:test";
import assert from "node:assert/strict";

import { shouldPreserveDuringMorph } from "../src/core/morph.js";

test("chart mount containers are preserved during morph for dynamic chart ids", () => {
  const chartMount = { id: "chart-mount-chart-7", tagName: "DIV" };

  assert.equal(shouldPreserveDuringMorph(chartMount, null), true);
});

test("legacy chart mount ids remain preserved during morph", () => {
  const legacyPrimary = { id: "chart-mount-primary", tagName: "DIV" };
  const legacyChallenger = { id: "chart-mount-challenger", tagName: "DIV" };

  assert.equal(shouldPreserveDuringMorph(legacyPrimary, null), true);
  assert.equal(shouldPreserveDuringMorph(legacyChallenger, null), true);
});

test("focused input elements are preserved during morph", () => {
  const input = { id: "metric-chip", tagName: "INPUT" };

  assert.equal(shouldPreserveDuringMorph(input, input), true);
});

test("focused select elements are preserved during morph", () => {
  const select = { id: "sigma-method", tagName: "SELECT" };

  assert.equal(shouldPreserveDuringMorph(select, select), true);
});

test("non-chart, non-focused elements are not preserved during morph", () => {
  const ordinaryDiv = { id: "notice-bar", tagName: "DIV" };
  const activeElement = { id: "other", tagName: "BUTTON" };

  assert.equal(shouldPreserveDuringMorph(ordinaryDiv, activeElement), false);
});
