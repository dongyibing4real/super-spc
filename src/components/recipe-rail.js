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
    [`${prefix}-sigma`, "Sigma", ae === `${prefix}-sigma`
      ? chipSelect(`${prefix}-set-sigma-method`, SIGMA_METHODS, params.sigma_method)
      : context.sigma.label, ae === `${prefix}-sigma` ? "" : context.sigma.detail],
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
  const primarySlot = state.charts[state.chartOrder[0]];

  const chartSections = state.chartOrder.map((id, i) => {
    const slot = state.charts[id];
    const isPrimary = i === 0;
    const isConfigured = !isPrimary && (slot.params.chart_type !== primarySlot.params.chart_type
      || slot.params.sigma_method !== primarySlot.params.sigma_method);
    return `
      <div class="rail-card rail-card--${id} ${!isPrimary && !isConfigured ? "rail-card--dimmed" : ""}">
        <div class="rail-card-header rail-card-header--${id}">
          <span class="rail-card-dot"></span>
          <span class="rail-card-label">${isPrimary ? "Primary" : "Challenger"}</span>
          <span class="rail-card-method">${slot.context.chartType?.label || "—"}</span>
        </div>
        ${renderChartChips(state, id, slot.params, slot.context, ae, cols)}
      </div>`;
  }).join('<div class="recipe-divider"></div>');

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
      ${chartSections}
    </div>
  `;
}
