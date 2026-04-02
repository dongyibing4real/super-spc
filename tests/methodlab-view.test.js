import test from "node:test";
import assert from "node:assert/strict";

import { createInitialState, addChart } from "../src/core/state.js";
import { renderMethodLab } from "../src/views/methodlab.js";

test("renderMethodLab shows chart picker and comparison sections", () => {
  let state = createInitialState();
  state = addChart(state, { chartType: "ewma" });

  const html = renderMethodLab(state);

  assert.match(html, /Method Lab/);
  assert.match(html, /Configuration/);
  assert.match(html, /Detection/);
  assert.match(html, /Results/);
  assert.match(html, /IMR|EWMA/);
  assert.doesNotMatch(html, /Primary vs challenger/i);
  assert.doesNotMatch(html, /undefined/);
});

test("renderMethodLab shows disagreement section with 2+ charts", () => {
  let state = createInitialState();
  state = addChart(state, { chartType: "ewma" });

  const html = renderMethodLab(state);

  // With 2 charts, disagreement section should appear
  assert.match(html, /Method (Agreement|Disagreements)/);
});

test("renderMethodLab with single chart hides disagreement section", () => {
  const state = createInitialState();
  const html = renderMethodLab(state);

  assert.doesNotMatch(html, /Disagreements/);
  assert.match(html, /Configuration/);
});
