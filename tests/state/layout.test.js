import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createInitialState, migrateTreeToRows } from "../../src/core/state/init.js";
import { addChart } from "../../src/core/state/chart.js";
import { collectChartIds, insertChart, computeGridPreview, setColWeight, setRowWeight } from "../../src/core/state/layout.js";

// ---------------------------------------------------------------------------
// collectChartIds
// ---------------------------------------------------------------------------
describe("collectChartIds", () => {
  it("returns IDs from a single-row layout", () => {
    const layout = { rows: [["a", "b", "c"]], colWeights: [[1, 1, 1]], rowWeights: [1] };
    assert.deepStrictEqual(collectChartIds(layout), ["a", "b", "c"]);
  });

  it("returns IDs from a multi-row layout", () => {
    const layout = {
      rows: [["a", "b"], ["c"]],
      colWeights: [[1, 1], [1]],
      rowWeights: [1, 1],
    };
    assert.deepStrictEqual(collectChartIds(layout), ["a", "b", "c"]);
  });

  it("returns empty array for empty rows", () => {
    const layout = { rows: [], colWeights: [], rowWeights: [] };
    assert.deepStrictEqual(collectChartIds(layout), []);
  });

  it("handles legacy tree layout via fallback", () => {
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

  it("handles legacy slots layout via fallback", () => {
    const layout = { slots: ["m", "n"] };
    assert.deepStrictEqual(collectChartIds(layout), ["m", "n"]);
  });

  it("returns empty array for null/undefined layout", () => {
    assert.deepStrictEqual(collectChartIds(null), []);
    assert.deepStrictEqual(collectChartIds(undefined), []);
  });

  it("returns IDs from initial state layout", () => {
    const state = createInitialState();
    assert.deepStrictEqual(collectChartIds(state.chartLayout), ["chart-1"]);
  });
});

// ---------------------------------------------------------------------------
// migrateTreeToRows
// ---------------------------------------------------------------------------
describe("migrateTreeToRows", () => {
  it("returns already-migrated layout unchanged", () => {
    const layout = { rows: [["a"]], colWeights: [[1]], rowWeights: [1] };
    const result = migrateTreeToRows(layout);
    assert.deepStrictEqual(result, layout);
  });

  it("adds default weights when rows exist but weights missing", () => {
    const layout = { rows: [["a", "b"], ["c"]] };
    const result = migrateTreeToRows(layout);
    assert.deepStrictEqual(result.rows, [["a", "b"], ["c"]]);
    assert.deepStrictEqual(result.colWeights, [[1, 1], [1]]);
    assert.deepStrictEqual(result.rowWeights, [1, 1]);
  });

  it("migrates legacy tree to single row", () => {
    const layout = {
      tree: {
        type: "split",
        children: [
          { type: "pane", chartId: "a" },
          { type: "pane", chartId: "b" },
        ],
      },
    };
    const result = migrateTreeToRows(layout);
    assert.deepStrictEqual(result.rows, [["a", "b"]]);
    assert.deepStrictEqual(result.colWeights, [[1, 1]]);
    assert.deepStrictEqual(result.rowWeights, [1]);
  });

  it("migrates legacy slots to single row", () => {
    const layout = { slots: ["x", "y", "z"] };
    const result = migrateTreeToRows(layout);
    assert.deepStrictEqual(result.rows, [["x", "y", "z"]]);
    assert.deepStrictEqual(result.colWeights, [[1, 1, 1]]);
    assert.deepStrictEqual(result.rowWeights, [1]);
  });

  it("returns empty layout for unknown format", () => {
    const result = migrateTreeToRows({});
    assert.deepStrictEqual(result, { rows: [], colWeights: [], rowWeights: [] });
  });

  it("migrates nested tree correctly", () => {
    const layout = {
      tree: {
        type: "split",
        children: [
          { type: "pane", chartId: "a" },
          {
            type: "split",
            children: [
              { type: "pane", chartId: "b" },
              { type: "pane", chartId: "c" },
            ],
          },
        ],
      },
    };
    const result = migrateTreeToRows(layout);
    assert.deepStrictEqual(result.rows, [["a", "b", "c"]]);
  });
});

// ---------------------------------------------------------------------------
// insertChart
// ---------------------------------------------------------------------------
describe("insertChart", () => {
  function twoChartState() {
    let state = createInitialState();
    state = addChart(state);
    // state now has chart-1 and chart-2
    return state;
  }

  it("inserts chart to the right of target", () => {
    const state = twoChartState();
    // chart-1 in row 0, chart-2 in row 0 (auto-placed beside chart-1)
    // Move chart-2 to the right of chart-1 (may already be there, but tests the zone logic)
    const result = insertChart(state, "chart-2", "chart-1", "right");
    const row = result.chartLayout.rows.find((r) => r.includes("chart-1"));
    const idx1 = row.indexOf("chart-1");
    const idx2 = row.indexOf("chart-2");
    assert.ok(idx2 === idx1 + 1, "chart-2 should be right of chart-1");
  });

  it("inserts chart to the left of target", () => {
    const state = twoChartState();
    const result = insertChart(state, "chart-2", "chart-1", "left");
    const row = result.chartLayout.rows.find((r) => r.includes("chart-1"));
    const idx1 = row.indexOf("chart-1");
    const idx2 = row.indexOf("chart-2");
    assert.ok(idx2 === idx1 - 1, "chart-2 should be left of chart-1");
  });

  it("inserts chart below target in a new row", () => {
    const state = twoChartState();
    const result = insertChart(state, "chart-2", "chart-1", "bottom");
    const r1 = result.chartLayout.rows.findIndex((r) => r.includes("chart-1"));
    const r2 = result.chartLayout.rows.findIndex((r) => r.includes("chart-2"));
    assert.ok(r2 === r1 + 1, "chart-2 should be in row below chart-1");
    assert.deepStrictEqual(result.chartLayout.rows[r2], ["chart-2"]);
  });

  it("inserts chart above target in a new row", () => {
    const state = twoChartState();
    const result = insertChart(state, "chart-2", "chart-1", "top");
    const r1 = result.chartLayout.rows.findIndex((r) => r.includes("chart-1"));
    const r2 = result.chartLayout.rows.findIndex((r) => r.includes("chart-2"));
    assert.ok(r2 === r1 - 1, "chart-2 should be in row above chart-1");
    assert.deepStrictEqual(result.chartLayout.rows[r2], ["chart-2"]);
  });

  it("center zone swaps chart positions", () => {
    let state = createInitialState();
    state = addChart(state);
    // Arrange: put chart-2 in a separate row below
    state = insertChart(state, "chart-2", "chart-1", "bottom");
    assert.deepStrictEqual(state.chartLayout.rows, [["chart-1"], ["chart-2"]]);

    const result = insertChart(state, "chart-2", "chart-1", "center");
    assert.deepStrictEqual(result.chartLayout.rows, [["chart-2"], ["chart-1"]]);
  });

  it("removes empty source row after moving chart out", () => {
    let state = createInitialState();
    state = addChart(state);
    // Put them in separate rows
    state = insertChart(state, "chart-2", "chart-1", "bottom");
    assert.equal(state.chartLayout.rows.length, 2);

    // Move chart-2 to the right of chart-1 -- its old row should be removed
    const result = insertChart(state, "chart-2", "chart-1", "right");
    assert.equal(result.chartLayout.rows.length, 1);
    assert.deepStrictEqual(result.chartLayout.rows[0], ["chart-1", "chart-2"]);
  });

  it("with three charts, moves third chart left of first", () => {
    let state = createInitialState();
    state = addChart(state);
    state = addChart(state);
    const result = insertChart(state, "chart-3", "chart-1", "left");
    const row = result.chartLayout.rows.find((r) => r.includes("chart-1"));
    const idx1 = row.indexOf("chart-1");
    const idx3 = row.indexOf("chart-3");
    assert.ok(idx3 < idx1, "chart-3 should be left of chart-1");
  });
});

// ---------------------------------------------------------------------------
// computeGridPreview
// ---------------------------------------------------------------------------
describe("computeGridPreview", () => {
  it("returns original layout when dragging onto self", () => {
    const layout = { rows: [["a", "b"]], colWeights: [[1, 1]], rowWeights: [1] };
    const result = computeGridPreview(layout, "a", "a", "right");
    assert.deepStrictEqual(result, layout);
  });

  it("returns original layout when draggingId is null", () => {
    const layout = { rows: [["a", "b"]], colWeights: [[1, 1]], rowWeights: [1] };
    const result = computeGridPreview(layout, null, "b", "right");
    assert.deepStrictEqual(result, layout);
  });

  it("center zone swaps IDs in preview", () => {
    const layout = { rows: [["a", "b"]], colWeights: [[1, 2]], rowWeights: [1] };
    const result = computeGridPreview(layout, "a", "b", "center");
    assert.deepStrictEqual(result.rows, [["b", "a"]]);
    // Weights stay in original positions
    assert.deepStrictEqual(result.colWeights, [[1, 2]]);
  });

  it("right zone places dragged item right of target", () => {
    const layout = {
      rows: [["a"], ["b"]],
      colWeights: [[1], [1]],
      rowWeights: [1, 1],
    };
    const result = computeGridPreview(layout, "a", "b", "right");
    assert.deepStrictEqual(result.rows, [["b", "a"]]);
  });

  it("left zone places dragged item left of target", () => {
    const layout = {
      rows: [["a"], ["b"]],
      colWeights: [[1], [1]],
      rowWeights: [1, 1],
    };
    const result = computeGridPreview(layout, "a", "b", "left");
    assert.deepStrictEqual(result.rows, [["a", "b"]]);
  });

  it("bottom zone creates a new row below target", () => {
    const layout = { rows: [["a", "b"]], colWeights: [[1, 1]], rowWeights: [1] };
    const result = computeGridPreview(layout, "a", "b", "bottom");
    assert.deepStrictEqual(result.rows, [["b"], ["a"]]);
    assert.equal(result.rowWeights.length, 2);
  });

  it("top zone creates a new row above target", () => {
    const layout = { rows: [["a", "b"]], colWeights: [[1, 1]], rowWeights: [1] };
    const result = computeGridPreview(layout, "a", "b", "top");
    assert.deepStrictEqual(result.rows, [["a"], ["b"]]);
    assert.equal(result.rowWeights.length, 2);
  });

  it("removes empty rows from source after moving", () => {
    const layout = {
      rows: [["a"], ["b"], ["c"]],
      colWeights: [[1], [1], [1]],
      rowWeights: [1, 1, 1],
    };
    const result = computeGridPreview(layout, "b", "c", "right");
    assert.deepStrictEqual(result.rows, [["a"], ["c", "b"]]);
    assert.equal(result.rowWeights.length, 2);
  });

  it("returns original layout when target not found after removal", () => {
    // Edge case: target doesn't exist
    const layout = { rows: [["a"]], colWeights: [[1]], rowWeights: [1] };
    const result = computeGridPreview(layout, "a", "nonexistent", "right");
    assert.deepStrictEqual(result, layout);
  });
});

// ---------------------------------------------------------------------------
// setColWeight
// ---------------------------------------------------------------------------
describe("setColWeight", () => {
  it("sets column weights proportionally with ratio 0.5", () => {
    let state = createInitialState();
    state = addChart(state);
    // Now row 0 has [chart-1, chart-2] with weights [1, 1]
    const result = setColWeight(state, 0, 0, 0.5);
    const w = result.chartLayout.colWeights[0];
    assert.equal(w[0], 1); // total=2, ratio=0.5 -> 1
    assert.equal(w[1], 1); // total=2, ratio=0.5 -> 1
  });

  it("shifts weight left with ratio 0.75", () => {
    let state = createInitialState();
    state = addChart(state);
    const result = setColWeight(state, 0, 0, 0.75);
    const w = result.chartLayout.colWeights[0];
    assert.equal(w[0], 1.5); // total=2, 0.75*2=1.5
    assert.equal(w[1], 0.5); // total=2, 0.25*2=0.5
  });

  it("shifts weight right with ratio 0.25", () => {
    let state = createInitialState();
    state = addChart(state);
    const result = setColWeight(state, 0, 0, 0.25);
    const w = result.chartLayout.colWeights[0];
    assert.equal(w[0], 0.5);
    assert.equal(w[1], 1.5);
  });

  it("ratio 0 gives all weight to the right column", () => {
    let state = createInitialState();
    state = addChart(state);
    const result = setColWeight(state, 0, 0, 0);
    const w = result.chartLayout.colWeights[0];
    assert.equal(w[0], 0);
    assert.equal(w[1], 2);
  });

  it("ratio 1 gives all weight to the left column", () => {
    let state = createInitialState();
    state = addChart(state);
    const result = setColWeight(state, 0, 0, 1);
    const w = result.chartLayout.colWeights[0];
    assert.equal(w[0], 2);
    assert.equal(w[1], 0);
  });

  it("does not mutate original state", () => {
    let state = createInitialState();
    state = addChart(state);
    const originalWeights = state.chartLayout.colWeights[0].slice();
    setColWeight(state, 0, 0, 0.75);
    assert.deepStrictEqual(state.chartLayout.colWeights[0], originalWeights);
  });
});

// ---------------------------------------------------------------------------
// setRowWeight
// ---------------------------------------------------------------------------
describe("setRowWeight", () => {
  function twoRowState() {
    let state = createInitialState();
    state = addChart(state);
    // Put chart-2 in a new row below
    state = insertChart(state, "chart-2", "chart-1", "bottom");
    return state;
  }

  it("sets row weights proportionally with ratio 0.5", () => {
    const state = twoRowState();
    const result = setRowWeight(state, 0, 0.5);
    assert.equal(result.chartLayout.rowWeights[0], 1);
    assert.equal(result.chartLayout.rowWeights[1], 1);
  });

  it("shifts weight to top row with ratio 0.75", () => {
    const state = twoRowState();
    const result = setRowWeight(state, 0, 0.75);
    assert.equal(result.chartLayout.rowWeights[0], 1.5);
    assert.equal(result.chartLayout.rowWeights[1], 0.5);
  });

  it("shifts weight to bottom row with ratio 0.25", () => {
    const state = twoRowState();
    const result = setRowWeight(state, 0, 0.25);
    assert.equal(result.chartLayout.rowWeights[0], 0.5);
    assert.equal(result.chartLayout.rowWeights[1], 1.5);
  });

  it("ratio 0 gives all weight to bottom row", () => {
    const state = twoRowState();
    const result = setRowWeight(state, 0, 0);
    assert.equal(result.chartLayout.rowWeights[0], 0);
    assert.equal(result.chartLayout.rowWeights[1], 2);
  });

  it("ratio 1 gives all weight to top row", () => {
    const state = twoRowState();
    const result = setRowWeight(state, 0, 1);
    assert.equal(result.chartLayout.rowWeights[0], 2);
    assert.equal(result.chartLayout.rowWeights[1], 0);
  });

  it("does not mutate original state", () => {
    const state = twoRowState();
    const originalWeights = state.chartLayout.rowWeights.slice();
    setRowWeight(state, 0, 0.75);
    assert.deepStrictEqual(state.chartLayout.rowWeights, originalWeights);
  });
});

// ---------------------------------------------------------------------------
// addChart layout integration
// ---------------------------------------------------------------------------
describe("addChart layout placement", () => {
  it("first addChart places chart-2 beside chart-1 in same row", () => {
    let state = createInitialState();
    state = addChart(state);
    assert.deepStrictEqual(state.chartLayout.rows, [["chart-1", "chart-2"]]);
    assert.deepStrictEqual(state.chartLayout.colWeights, [[1, 1]]);
  });

  it("second addChart creates a new row when first row is full", () => {
    let state = createInitialState();
    state = addChart(state); // chart-2 beside chart-1
    // maxInRow is determined by rowAbove; with only 1 row, default maxInRow is 2
    // so row is now full, next chart goes to new row
    state = addChart(state); // chart-3 in new row
    assert.equal(state.chartLayout.rows.length, 2);
    assert.deepStrictEqual(state.chartLayout.rows[1], ["chart-3"]);
  });

  it("adds chart IDs to chartOrder", () => {
    let state = createInitialState();
    state = addChart(state);
    state = addChart(state);
    assert.deepStrictEqual(state.chartOrder, ["chart-1", "chart-2", "chart-3"]);
  });
});
