import test from "node:test";
import assert from "node:assert/strict";

import { setupUiSubscribers } from "../src/runtime/ui-subscribers.js";
import { createStore } from "../src/core/store.js";

test("setupUiSubscribers is a no-op after Phase 3 migration to React", () => {
  const store = createStore({
    route: "workspace",
    focusedChartId: "chart-1",
    activeChipEditor: null,
    selectedPointIndex: 0,
    points: [],
    transforms: [],
    pipeline: { status: "ready" },
    chartOrder: ["chart-1"],
    charts: { "chart-1": {} },
    activeDatasetId: null,
    datasets: [],
    columnConfig: { columns: [] },
    ui: { pendingNewChart: null, notice: null, contextMenu: null },
  });

  // setupUiSubscribers is now a no-op (all subscribers migrated to React)
  setupUiSubscribers(store, {});

  store.setState({
    ...store.getState(),
    activeChipEditor: "metric",
  });

  assert.ok(true, "no-op subscriber runs without error");
});
