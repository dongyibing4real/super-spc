import test from "node:test";
import assert from "node:assert/strict";

import { createInitialState, addChart } from "../src/core/state.js";
import { renderMethodLab } from "../src/views/methodlab.js";

test("renderMethodLab uses dynamic chart ids from chartOrder", () => {
  let state = createInitialState();
  state = addChart(state, { chartType: "ewma" });

  const html = renderMethodLab(state);

  assert.match(html, /Method Lab/);
  assert.match(html, /Primary/);
  assert.match(html, /Challenger/);
  assert.match(html, /IMR|EWMA/);
  assert.doesNotMatch(html, /undefined/);
});
