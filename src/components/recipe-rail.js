import { getFocused, collectChartIds, DEFAULT_PARAMS } from "../core/state.js";
import { applyParamsToContext } from "../helpers.js";

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

function specSummary(params) {
  const parts = [];
  if (params.lsl != null) parts.push(`LSL ${params.lsl}`);
  if (params.target != null) parts.push(`T ${params.target}`);
  if (params.usl != null) parts.push(`USL ${params.usl}`);
  return parts.length > 0 ? parts.join(' \u2013 ') : 'Not set';
}

function renderSpecEditor(prefix, params) {
  return `<span class="chip-sigma-editor">
    <label class="chip-sigma-row"><span class="chip-sigma-label">LSL</span><input type="number" class="chip-k-input" data-action="${prefix}-set-lsl" value="${params.lsl ?? ''}" step="any" onclick="event.stopPropagation()" placeholder="\u2014" /></label>
    <label class="chip-sigma-row"><span class="chip-sigma-label">Target</span><input type="number" class="chip-k-input" data-action="${prefix}-set-target" value="${params.target ?? ''}" step="any" onclick="event.stopPropagation()" placeholder="\u2014" /></label>
    <label class="chip-sigma-row"><span class="chip-sigma-label">USL</span><input type="number" class="chip-k-input" data-action="${prefix}-set-usl" value="${params.usl ?? ''}" step="any" onclick="event.stopPropagation()" placeholder="\u2014" /></label>
  </span>`;
}

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
    [`${prefix}-specs`, "Specs", ae === `${prefix}-specs`
      ? renderSpecEditor(prefix, params)
      : specSummary(params), ""],
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

function collapsedSummary(slot) {
  if (!slot) return "\u2014";
  const metric = slot.context.metric?.label || "\u2014";
  const sigma = slot.context.sigma?.label || "";
  const tests = (slot.params.nelson_tests || []).map(id => `R${id}`).join(",");
  const parts = [metric, sigma, tests].filter(Boolean);
  return parts.join(" \u00b7 ") || "\u2014";
}

function renderCollapsedChartCard(state, chartId) {
  const slot = state.charts[chartId];
  if (!slot) return "";
  const chartLabel = slot.context.chartType?.label || "\u2014";
  const idx = state.chartOrder.indexOf(chartId) + 1;
  const accentIdx = state.chartOrder.indexOf(chartId) % 8;
  const summary = collapsedSummary(slot);

  return `
    <div class="rail-card rail-card--collapsed" data-action="focus-chart" data-chart-id="${chartId}" data-accent="${accentIdx}">
      <div class="rail-card-header rail-card-header--collapsed">
        <span class="rail-card-dot"></span>
        <span class="rail-card-label">${chartLabel}</span>
        <span class="rail-card-id">Chart ${idx}</span>
      </div>
      <div class="rail-card-summary">${summary}</div>
    </div>
  `;
}

function renderExpandedChartCard(state, chartId, slot, ae, cols) {
  const chartLabel = slot.context.chartType?.label || "\u2014";
  const idx = state.chartOrder.indexOf(chartId) + 1;
  const accentIdx = state.chartOrder.indexOf(chartId) % 8;

  return `
    <div class="rail-card rail-card--focused" data-chart-id="${chartId}" data-accent="${accentIdx}">
      <div class="rail-card-header rail-card-header--focused">
        <span class="rail-card-dot"></span>
        <span class="rail-card-label">${chartLabel}</span>
        <span class="rail-card-id">Chart ${idx}</span>
      </div>
      ${renderChartChips(state, chartId, slot.params, slot.context, ae, cols)}
      <button class="recipe-chip recipe-chip--table ${slot.showDataTable ? "chip-editing" : ""}"
              data-action="toggle-pane-table" data-chart-id="${chartId}" type="button">
        <span class="chip-label">Data Table</span>
        <strong>${slot.showDataTable ? "Visible" : "Hidden"}</strong>
      </button>
    </div>
  `;
}

function renderPendingChartCard(state) {
  const pending = state.ui.pendingNewChart;
  if (!pending) return "";
  const ae = state.activeChipEditor;
  const cols = state.columnConfig.columns || [];
  const focusedSlot = state.charts[state.focusedChartId];
  const baseContext = focusedSlot ? focusedSlot.context : { metric: { id: "", label: "Value", unit: "" }, subgroup: { id: "", label: "Individual (n=1)", detail: "" }, phase: { id: "", label: "No phases", detail: "" }, chartType: { id: "imr", label: "IMR", detail: "" }, sigma: { label: "3 Sigma", detail: "Moving Range" }, tests: { label: "R1,R2,R5", detail: "" }, methodBadge: "IMR" };
  const context = applyParamsToContext(baseContext, pending);
  // Build tests context
  const activeTests = pending.nelson_tests || [];
  context.tests = { label: activeTests.map(id => `R${id}`).join(",") || "None", detail: "" };

  return `
    <div class="rail-card rail-card--pending">
      <div class="rail-card-header rail-card-header--pending">
        <span class="rail-card-dot"></span>
        <span class="rail-card-label">New Chart</span>
      </div>
      ${renderChartChips(state, "_pending", pending, context, ae, cols)}
      <div class="rail-card-actions">
        <button class="rail-card-btn rail-card-btn--cancel" data-action="cancel-add-chart" type="button">Cancel</button>
        <button class="rail-card-btn rail-card-btn--confirm" data-action="confirm-add-chart" type="button">Add Chart</button>
      </div>
    </div>
  `;
}

function renderAddChartSection(state) {
  if (state.ui.pendingNewChart) {
    return renderPendingChartCard(state);
  }
  return `
    <button class="rail-add-chart" data-action="open-add-chart" type="button">
      <span class="rail-add-icon">+</span>
      <span class="rail-add-label">Add Chart</span>
    </button>
  `;
}

export function renderRecipeRail(state) {
  const ae = state.activeChipEditor;
  const cols = state.columnConfig.columns || [];
  const activeDs = state.datasets.find(ds => ds.id === state.activeDatasetId);
  const datasetVal = activeDs ? activeDs.name : "No dataset";
  const focusedId = state.focusedChartId;
  const focusedSlot = state.charts[focusedId];

  // Dataset card (shared, always at top)
  const datasetCard = `
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
    </div>`;

  // Focused chart card (expanded)
  const focusedCard = focusedSlot
    ? renderExpandedChartCard(state, focusedId, focusedSlot, ae, cols)
    : "";

  // Collapsed cards for non-focused charts
  const otherIds = state.chartOrder.filter(id => id !== focusedId);
  const countBadge = otherIds.length > 0
    ? `<div class="rail-collapsed-count">${otherIds.length} other chart${otherIds.length > 1 ? "s" : ""}</div>`
    : "";
  const collapsedCards = otherIds
    .map(id => renderCollapsedChartCard(state, id))
    .join("");

  return `
    <div class="recipe-rail">
      ${datasetCard}
      <div class="recipe-divider"></div>
      ${focusedCard}
      ${countBadge}
      ${collapsedCards}
      <div class="recipe-divider"></div>
      ${renderAddChartSection(state)}
    </div>
  `;
}
