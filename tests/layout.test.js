import { test } from "vitest";
import assert from "node:assert/strict";

import {
  collectChartIds,
  insertChart,
  computeGridPreview,
  setColWeight,
  setRowWeight,
} from "../src/core/state/layout.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(rows, colWeights, rowWeights) {
  return {
    chartLayout: {
      rows,
      colWeights: colWeights || rows.map((r) => r.map(() => 1)),
      rowWeights: rowWeights || rows.map(() => 1),
    },
  };
}

function makeLayout(rows, colWeights, rowWeights) {
  return {
    rows,
    colWeights: colWeights || rows.map((r) => r.map(() => 1)),
    rowWeights: rowWeights || rows.map(() => 1),
  };
}

// ---------------------------------------------------------------------------
// collectChartIds
// ---------------------------------------------------------------------------

test("collectChartIds returns flat array from single row", () => {
  const layout = makeLayout([["a", "b", "c"]]);
  assert.deepStrictEqual(collectChartIds(layout), ["a", "b", "c"]);
});

test("collectChartIds flattens multiple rows", () => {
  const layout = makeLayout([["a", "b"], ["c"], ["d", "e"]]);
  assert.deepStrictEqual(collectChartIds(layout), ["a", "b", "c", "d", "e"]);
});

test("collectChartIds returns empty array for empty rows", () => {
  const layout = makeLayout([]);
  assert.deepStrictEqual(collectChartIds(layout), []);
});

test("collectChartIds returns empty array for null layout", () => {
  assert.deepStrictEqual(collectChartIds(null), []);
  assert.deepStrictEqual(collectChartIds(undefined), []);
});

test("collectChartIds falls back to legacy tree", () => {
  const layout = {
    tree: {
      type: "split",
      children: [
        { type: "pane", chartId: "x" },
        { type: "pane", chartId: "y" },
      ],
    },
  };
  assert.deepStrictEqual(collectChartIds(layout), ["x", "y"]);
});

test("collectChartIds falls back to legacy slots", () => {
  const layout = { slots: ["m", "n", "o"] };
  assert.deepStrictEqual(collectChartIds(layout), ["m", "n", "o"]);
});

// ---------------------------------------------------------------------------
// insertChart
// ---------------------------------------------------------------------------

test("insertChart center zone swaps two chart positions", () => {
  const state = makeState([["a"], ["b"]]);
  const result = insertChart(state, "b", "a", "center");
  assert.deepStrictEqual(result.chartLayout.rows, [["b"], ["a"]]);
});

test("insertChart center zone swaps weights along with positions", () => {
  const state = makeState([["a", "b"]], [[2, 3]], [1]);
  const result = insertChart(state, "a", "b", "center");
  assert.deepStrictEqual(result.chartLayout.rows, [["b", "a"]]);
  assert.deepStrictEqual(result.chartLayout.colWeights, [[3, 2]]);
});

test("insertChart right zone places chart to the right of target", () => {
  const state = makeState([["a", "b"]]);
  const result = insertChart(state, "b", "a", "right");
  const row = result.chartLayout.rows.find((r) => r.includes("a"));
  assert.equal(row.indexOf("b"), row.indexOf("a") + 1);
});

test("insertChart left zone places chart to the left of target", () => {
  const state = makeState([["a", "b"]]);
  const result = insertChart(state, "b", "a", "left");
  const row = result.chartLayout.rows.find((r) => r.includes("a"));
  assert.equal(row.indexOf("b"), row.indexOf("a") - 1);
});

test("insertChart bottom zone creates new row below target", () => {
  const state = makeState([["a", "b"]]);
  const result = insertChart(state, "b", "a", "bottom");
  assert.deepStrictEqual(result.chartLayout.rows, [["a"], ["b"]]);
  assert.equal(result.chartLayout.rowWeights.length, 2);
});

test("insertChart top zone creates new row above target", () => {
  const state = makeState([["a", "b"]]);
  const result = insertChart(state, "b", "a", "top");
  assert.deepStrictEqual(result.chartLayout.rows, [["b"], ["a"]]);
  assert.equal(result.chartLayout.rowWeights.length, 2);
});

test("insertChart removes empty source row after moving last chart out", () => {
  const state = makeState([["a"], ["b"]]);
  const result = insertChart(state, "b", "a", "right");
  assert.equal(result.chartLayout.rows.length, 1);
  assert.deepStrictEqual(result.chartLayout.rows[0], ["a", "b"]);
});

test("insertChart with three charts moves across rows", () => {
  const state = makeState([["a", "b"], ["c"]]);
  const result = insertChart(state, "c", "a", "left");
  const row = result.chartLayout.rows.find((r) => r.includes("a"));
  assert.ok(row.indexOf("c") < row.indexOf("a"));
});

// ---------------------------------------------------------------------------
// computeGridPreview
// ---------------------------------------------------------------------------

test("computeGridPreview returns same layout when draggingId equals targetId", () => {
  const layout = makeLayout([["a", "b"]]);
  const result = computeGridPreview(layout, "a", "a", "right");
  assert.strictEqual(result, layout);
});

test("computeGridPreview returns same layout when draggingId is null", () => {
  const layout = makeLayout([["a", "b"]]);
  const result = computeGridPreview(layout, null, "b", "right");
  assert.strictEqual(result, layout);
});

test("computeGridPreview returns same layout when targetId is null", () => {
  const layout = makeLayout([["a", "b"]]);
  const result = computeGridPreview(layout, "a", null, "right");
  assert.strictEqual(result, layout);
});

test("computeGridPreview center zone swaps IDs without changing weights", () => {
  const layout = makeLayout([["a", "b"]], [[2, 5]], [1]);
  const result = computeGridPreview(layout, "a", "b", "center");
  assert.deepStrictEqual(result.rows, [["b", "a"]]);
  assert.deepStrictEqual(result.colWeights, [[2, 5]]);
});

test("computeGridPreview right zone moves chart beside target", () => {
  const layout = makeLayout([["a"], ["b"]]);
  const result = computeGridPreview(layout, "a", "b", "right");
  assert.deepStrictEqual(result.rows, [["b", "a"]]);
});

test("computeGridPreview left zone moves chart before target", () => {
  const layout = makeLayout([["a"], ["b"]]);
  const result = computeGridPreview(layout, "a", "b", "left");
  assert.deepStrictEqual(result.rows, [["a", "b"]]);
});

test("computeGridPreview bottom zone creates row below target", () => {
  const layout = makeLayout([["a", "b"]]);
  const result = computeGridPreview(layout, "a", "b", "bottom");
  assert.deepStrictEqual(result.rows, [["b"], ["a"]]);
  assert.equal(result.rowWeights.length, 2);
});

test("computeGridPreview top zone creates row above target", () => {
  const layout = makeLayout([["a", "b"]]);
  const result = computeGridPreview(layout, "a", "b", "top");
  assert.deepStrictEqual(result.rows, [["a"], ["b"]]);
  assert.equal(result.rowWeights.length, 2);
});

test("computeGridPreview removes empty rows from source", () => {
  const layout = makeLayout([["a"], ["b"], ["c"]]);
  const result = computeGridPreview(layout, "b", "c", "right");
  assert.deepStrictEqual(result.rows, [["a"], ["c", "b"]]);
  assert.equal(result.rowWeights.length, 2);
});

test("computeGridPreview returns original layout when target not found", () => {
  const layout = makeLayout([["a"]]);
  const result = computeGridPreview(layout, "a", "nonexistent", "right");
  assert.strictEqual(result, layout);
});

// ---------------------------------------------------------------------------
// setColWeight
// ---------------------------------------------------------------------------

test("setColWeight with ratio 0.5 keeps equal weights", () => {
  const state = makeState([["a", "b"]]);
  const result = setColWeight(state, 0, 0, 0.5);
  assert.equal(result.chartLayout.colWeights[0][0], 1);
  assert.equal(result.chartLayout.colWeights[0][1], 1);
});

test("setColWeight with ratio 0.75 shifts weight to left column", () => {
  const state = makeState([["a", "b"]]);
  const result = setColWeight(state, 0, 0, 0.75);
  assert.equal(result.chartLayout.colWeights[0][0], 1.5);
  assert.equal(result.chartLayout.colWeights[0][1], 0.5);
});

test("setColWeight with ratio 0 gives all weight to right column", () => {
  const state = makeState([["a", "b"]]);
  const result = setColWeight(state, 0, 0, 0);
  assert.equal(result.chartLayout.colWeights[0][0], 0);
  assert.equal(result.chartLayout.colWeights[0][1], 2);
});

test("setColWeight preserves total weight", () => {
  const state = makeState([["a", "b", "c"]], [[2, 4, 1]], [1]);
  const result = setColWeight(state, 0, 0, 0.5);
  const total = result.chartLayout.colWeights[0][0] + result.chartLayout.colWeights[0][1];
  assert.equal(total, 6); // 2 + 4 = 6, preserved
});

test("setColWeight does not mutate original state", () => {
  const state = makeState([["a", "b"]]);
  const original = state.chartLayout.colWeights[0].slice();
  setColWeight(state, 0, 0, 0.75);
  assert.deepStrictEqual(state.chartLayout.colWeights[0], original);
});

test("setColWeight works on non-first row", () => {
  const state = makeState([["a"], ["b", "c"]]);
  const result = setColWeight(state, 1, 0, 0.25);
  assert.equal(result.chartLayout.colWeights[1][0], 0.5);
  assert.equal(result.chartLayout.colWeights[1][1], 1.5);
  // First row unchanged
  assert.deepStrictEqual(result.chartLayout.colWeights[0], [1]);
});

// ---------------------------------------------------------------------------
// setRowWeight
// ---------------------------------------------------------------------------

test("setRowWeight with ratio 0.5 keeps equal weights", () => {
  const state = makeState([["a"], ["b"]]);
  const result = setRowWeight(state, 0, 0.5);
  assert.equal(result.chartLayout.rowWeights[0], 1);
  assert.equal(result.chartLayout.rowWeights[1], 1);
});

test("setRowWeight with ratio 0.75 shifts weight to top row", () => {
  const state = makeState([["a"], ["b"]]);
  const result = setRowWeight(state, 0, 0.75);
  assert.equal(result.chartLayout.rowWeights[0], 1.5);
  assert.equal(result.chartLayout.rowWeights[1], 0.5);
});

test("setRowWeight with ratio 0 gives all weight to bottom row", () => {
  const state = makeState([["a"], ["b"]]);
  const result = setRowWeight(state, 0, 0);
  assert.equal(result.chartLayout.rowWeights[0], 0);
  assert.equal(result.chartLayout.rowWeights[1], 2);
});

test("setRowWeight preserves total weight", () => {
  const state = makeState([["a"], ["b"], ["c"]], undefined, [3, 5, 1]);
  const result = setRowWeight(state, 0, 0.4);
  const total = result.chartLayout.rowWeights[0] + result.chartLayout.rowWeights[1];
  assert.equal(total, 8); // 3 + 5 = 8, preserved
  // Third row untouched
  assert.equal(result.chartLayout.rowWeights[2], 1);
});

test("setRowWeight does not mutate original state", () => {
  const state = makeState([["a"], ["b"]]);
  const original = state.chartLayout.rowWeights.slice();
  setRowWeight(state, 0, 0.75);
  assert.deepStrictEqual(state.chartLayout.rowWeights, original);
});

test("setRowWeight works on non-first row pair", () => {
  const state = makeState([["a"], ["b"], ["c"]]);
  const result = setRowWeight(state, 1, 0.25);
  assert.equal(result.chartLayout.rowWeights[1], 0.5);
  assert.equal(result.chartLayout.rowWeights[2], 1.5);
  // First row unchanged
  assert.equal(result.chartLayout.rowWeights[0], 1);
});
