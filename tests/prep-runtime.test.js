import test from "node:test";
import assert from "node:assert/strict";

import { applyPrepTransform, replayPrepTransforms } from "../src/runtime/prep-runtime.js";
import { createTable } from "../src/data/data-prep-engine.js";

test("applyPrepTransform trims declared text columns", () => {
  const table = createTable(
    [{ name: "  Alice  ", city: "  Boston " }],
    [
      { name: "name", dtype: "text" },
      { name: "city", dtype: "text" },
    ]
  );
  const result = applyPrepTransform(table, {
    type: "trim",
    params: { columns: ["name", "city"] },
  });

  const [row] = result.objects();
  assert.equal(row.name, "Alice");
  assert.equal(row.city, "Boston");
});

test("replayPrepTransforms rebuilds derived columns for rename and split transforms", () => {
  const state = {
    dataPrep: {
      rawRows: [{ value: "A-B" }],
      transforms: [
        { type: "rename", params: { oldName: "value", newName: "source_value" } },
        { type: "split", params: { column: "source_value", delimiter: "-", maxParts: 2 } },
      ],
      originalColumns: [{ name: "value", dtype: "text", ordinal: 0 }],
    },
    columnConfig: {
      columns: [{ name: "value", dtype: "text", ordinal: 0 }],
    },
  };

  const replayed = replayPrepTransforms(state);

  assert.ok(replayed);
  assert.equal(replayed.columns[0].name, "source_value");
  assert.equal(replayed.columns[1].name, "source_value_1");
  assert.equal(replayed.columns[2].name, "source_value_2");
});
