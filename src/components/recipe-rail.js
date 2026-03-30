import { getFocused } from "../core/state.js";

function chipSelect(action, options, current) {
  return `<select class="chip-select" data-action="${action}" onclick="event.stopPropagation()">${options.map(([val, label]) =>
    `<option value="${val}" ${val === current ? "selected" : ""}>${label}</option>`
  ).join("")}</select>`;
}

function chipGroupSelect(action, groups, current) {
  return `<select class="chip-select" data-action="${action}" onclick="event.stopPropagation()">${groups.map(([group, items]) =>
    `<optgroup label="${group}">${items.map(([val, label]) =>
      `<option value="${val}" ${val === current ? "selected" : ""}>${label}</option>`
    ).join("")}</optgroup>`
  ).join("")}</select>`;
}

const CHART_TYPES = [
  ["Variables", [["imr","IMR"],["xbar_r","X-Bar R"],["xbar_s","X-Bar S"],["r","R"],["s","S"],["mr","MR"]]],
  ["Attributes", [["p","P"],["np","NP"],["c","C"],["u","U"],["laney_p","Laney P\u2019"],["laney_u","Laney U\u2019"]]],
  ["Advanced", [["cusum","CUSUM"],["ewma","EWMA"],["levey_jennings","Levey-Jennings"],["cusum_vmask","CUSUM V-Mask"],["three_way","Three-Way"],["presummarize","Presummarize"],["run","Run Chart"]]],
  ["Short Run", [["short_run","Short Run"]]],
  ["Rare Event", [["g","G"],["t","T"]]],
  ["Multivariate", [["hotelling_t2","Hotelling T\u00B2"],["mewma","MEWMA"]]],
];
const SIGMA_METHODS = [["moving_range","Moving Range"],["median_moving_range","Median MR"],["range","Range"],["stddev","Std Dev"],["levey_jennings","Levey-Jennings"]];
const NELSON_RULES = [[1,"1: Beyond 3\u03c3"],[2,"2: 9 same side"],[3,"3: 6 trending"],[4,"4: 14 alternating"],[5,"5: 2/3 beyond 2\u03c3"],[6,"6: 4/5 beyond 1\u03c3"],[7,"7: 15 within 1\u03c3"],[8,"8: 8 beyond 1\u03c3"]];

const SIGMA_METHOD_CHARTS = new Set(["imr"]);
const NO_SIGMA_CHARTS = new Set(["p","np","c","u","laney_p","laney_u","cusum","ewma","cusum_vmask","hotelling_t2","mewma","run"]);

function renderSigmaEditor(prefix, params) {
  const showMethod = SIGMA_METHOD_CHARTS.has(params.chart_type);
  const kInput = `<input type="number" class="chip-k-input" data-action="${prefix}-set-k-sigma"
    value="${params.k_sigma}" min="0.5" max="6" step="0.5"
    onclick="event.stopPropagation()" />`;
  if (showMethod) {
    return `<span class="chip-sigma-editor">
      <label class="chip-sigma-row"><span class="chip-sigma-label">k</span>${kInput}</label>
      <label class="chip-sigma-row"><span class="chip-sigma-label">Method</span>${chipSelect(`${prefix}-set-sigma-method`, SIGMA_METHODS, params.sigma_method)}</label>
    </span>`;
  }
  return `<span class="chip-sigma-editor">
    <label class="chip-sigma-row"><span class="chip-sigma-label">k</span>${kInput}</label>
  </span>`;
}

function renderChartChips(state, prefix, params, context, ae, cols) {
  const numericCols = cols.filter((c) => c.dtype === "numeric");
  const allNonValue = cols.filter((c) => c.role !== "value");
  const currentSg = cols.find((c) => c.role === "subgroup")?.name || "";
  const currentPh = cols.find((c) => c.role === "phase")?.name || "";
  const activeTests = params.nelson_tests || [];

  const chips = [
    [`${prefix}-metric`, "Metric", ae === `${prefix}-metric`
      ? chipSelect(`${prefix}-set-metric-column`, numericCols.map((c) => [c.name, c.name]), numericCols.find((c) => c.role === "value")?.name || "")
      : context.metric.label, context.metric.unit],
    [`${prefix}-subgroup`, "Subgroup", ae === `${prefix}-subgroup`
      ? chipSelect(`${prefix}-set-subgroup-column`, [["", "Individual (n=1)"], ...allNonValue.map((c) => [c.name, c.name])], currentSg)
      : context.subgroup.label, ae === `${prefix}-subgroup` ? "" : context.subgroup.detail],
    [`${prefix}-phase`, "Phase", ae === `${prefix}-phase`
      ? chipSelect(`${prefix}-set-phase-column`, [["", "No phases"], ...allNonValue.map((c) => [c.name, c.name])], currentPh)
      : context.phase.label, ae === `${prefix}-phase` ? "" : context.phase.detail],
    [`${prefix}-chart`, "Chart", ae === `${prefix}-chart`
      ? chipGroupSelect(`${prefix}-set-chart-type`, CHART_TYPES, params.chart_type)
      : context.chartType.label, ae === `${prefix}-chart` ? "" : context.chartType.detail],
    ...(!NO_SIGMA_CHARTS.has(params.chart_type) ? [[`${prefix}-sigma`, "Sigma", ae === `${prefix}-sigma`
      ? renderSigmaEditor(prefix, params)
      : context.sigma.label, ae === `${prefix}-sigma` ? "" : (SIGMA_METHOD_CHARTS.has(params.chart_type) ? context.sigma.detail : "")]] : []),
    [`${prefix}-tests`, "Tests", ae === `${prefix}-tests`
      ? `<span class="chip-tests-inline">${NELSON_RULES.map(([id, label]) =>
          `<label class="chip-test-toggle" onclick="event.stopPropagation()"><input type="checkbox" data-action="${prefix}-toggle-nelson" data-value="${id}" ${activeTests.includes(id) ? "checked" : ""} />${id}</label>`
        ).join("")}</span>`
      : context.tests.label, ae === `${prefix}-tests` ? "" : context.tests.detail],
  ];

  return chips.map(([id, label, value, detail]) => `
    <button class="recipe-chip ${ae === id ? "chip-editing" : ""}"
      data-action="toggle-chip-editor" data-chip="${id}" type="button">
      <span class="chip-label">${label}</span>
      <strong>${typeof value === "string" && !value.startsWith("<") ? value : ""}${typeof value === "string" && value.startsWith("<") ? value : ""}</strong>
      ${detail ? `<span class="chip-detail">${detail}</span>` : ""}
    </button>
  `).join("");
}

export function renderRecipeRail(state) {
  const ae = state.activeChipEditor;
  const cols = state.columnConfig.columns || [];
  const activeDs = state.datasets.find(ds => ds.id === state.activeDatasetId);
  const datasetVal = activeDs ? activeDs.name : "No dataset";

  // Use focused chart for the rail
  const focusedId = state.focusedChartId;
  const focusedSlot = state.charts[focusedId];
  if (!focusedSlot) return `<div class="recipe-rail"><div class="rail-card">No chart selected</div></div>`;

  const chartLabel = focusedSlot.context.chartType?.label || "\u2014";

  return `
    <div class="recipe-rail">
      <div class="rail-card rail-card--dataset">
        <div class="rail-card-header rail-card-header--dataset">
          <span class="rail-card-dot"></span>
          <span class="rail-card-label">Dataset</span>
        </div>
        <button class="recipe-chip ${ae === "dataset" ? "chip-editing" : ""}"
          data-action="toggle-chip-editor" data-chip="dataset" type="button">
          <strong>${ae === "dataset"
            ? chipSelect("switch-dataset", state.datasets.map(ds => [String(ds.id), `${ds.name} (${ds.point_count} pts)`]), String(state.activeDatasetId || ""))
            : datasetVal}</strong>
        </button>
      </div>
      <div class="recipe-divider"></div>
      <div class="rail-card rail-card--${focusedId}">
        <div class="rail-card-header rail-card-header--focused">
          <span class="rail-card-dot"></span>
          <span class="rail-card-label">${chartLabel}</span>
          <span class="rail-card-id">${focusedId}</span>
        </div>
        ${renderChartChips(state, focusedId, focusedSlot.params, focusedSlot.context, ae, cols)}
      </div>
    </div>
  `;
}
