import { computeStats, formatDate } from "../helpers.js";
import { getPage } from "../data/data-prep-engine.js";

const ROW_HEIGHT = 28;
const VISIBLE_BUFFER = 5;

function renderDatasetList(state) {
  const { datasets, dataPrep } = state;
  const cards = datasets.map(ds => {
    const active = ds.id === dataPrep.selectedDatasetId;
    const meta = ds.metadata || {};
    return `
      <div class="ds-card ${active ? "active" : ""}" data-action="select-prep-dataset" data-dataset-id="${ds.id}">
        <div class="ds-card-name">${ds.name}</div>
        <div class="ds-card-meta">${ds.point_count} pts \u00b7 ${formatDate(ds.created_at)}</div>
        ${meta.value_column ? `<div class="ds-card-meta">col: ${meta.value_column}</div>` : ""}
        ${active ? `
          <div class="ds-card-actions">
            <button data-action="load-prep-to-chart" type="button">Load to Chart</button>
            <button class="danger" data-action="delete-dataset" data-dataset-id="${ds.id}" type="button">Delete</button>
          </div>
        ` : ""}
      </div>`;
  }).join("");

  return `
    <div class="panel-card" style="overflow:hidden;display:flex;flex-direction:column;">
      <h4>Datasets</h4>
      <div class="ds-list">${cards || '<p class="muted" style="font-size:11px;">No datasets uploaded yet.</p>'}</div>
      <label class="ds-upload-btn">
        + Upload CSV
        <input type="file" accept=".csv" data-action="upload-csv" hidden />
      </label>
    </div>`;
}

function renderTransformBar(state) {
  const { dataPrep } = state;
  const count = dataPrep.transforms.length;
  const unsaved = dataPrep.unsavedChanges;
  const ap = dataPrep.activePanel;

  const btn = (action, label, panel) =>
    `<button data-action="${action}" type="button" class="prep-tool-btn${ap === panel ? ' active' : ''}" title="${label}">${label}</button>`;

  return `
    <div class="prep-toolbar">
      <div class="prep-toolbar-left">
        ${btn('prep-filter', 'Filter', 'filter')}
        ${btn('prep-find-replace', 'Find', 'find')}
        ${btn('prep-dedup', 'Dedup', 'dedup')}
        ${btn('prep-missing', 'Missing', 'missing')}
        <button data-action="prep-trim" type="button" class="prep-tool-btn" title="Trim whitespace">Trim</button>
      </div>
      <div class="prep-toolbar-right">
        ${count > 0 ? `<span class="prep-transform-count">${count} transform${count !== 1 ? "s" : ""}</span>` : ""}
        ${unsaved ? '<span class="prep-unsaved">unsaved</span>' : ""}
        ${count > 0 ? `<button data-action="prep-undo" type="button" class="prep-tool-btn" title="Undo last transform">Undo</button>` : ""}
        ${unsaved ? `<button data-action="prep-save" type="button" class="prep-tool-btn prep-save-btn" title="Save to server">Save</button>` : ""}
      </div>
    </div>`;
}

function renderPrepPanel(state) {
  const { dataPrep, columnConfig } = state;
  const ap = dataPrep.activePanel;
  if (!ap) return '';

  const cols = columnConfig.columns || [];
  const colOpts = cols.map(c => `<option value="${c.name}">${c.name}</option>`).join('');

  if (ap === 'filter') {
    return `
      <div class="prep-panel">
        <span class="prep-panel-label">Column</span>
        <select data-field="filter-col">${colOpts}</select>
        <span class="prep-panel-label">Op</span>
        <select data-field="filter-op">
          <option value="eq">=</option>
          <option value="neq">\u2260</option>
          <option value="gt">&gt;</option>
          <option value="lt">&lt;</option>
          <option value="gte">\u2265</option>
          <option value="lte">\u2264</option>
          <option value="contains">contains</option>
          <option value="not_contains">excludes</option>
          <option value="between">between</option>
          <option value="is_null">is null</option>
          <option value="is_not_null">not null</option>
        </select>
        <input type="text" data-field="filter-val" placeholder="value" />
        <input type="text" data-field="filter-val2" placeholder="max" style="display:none" />
        <button data-action="prep-apply-filter" type="button" class="prep-panel-apply">Apply</button>
      </div>`;
  }

  if (ap === 'find') {
    return `
      <div class="prep-panel">
        <span class="prep-panel-label">Column</span>
        <select data-field="find-col">
          <option value="__all__">All columns</option>
          ${colOpts}
        </select>
        <span class="prep-panel-label">Find</span>
        <input type="text" data-field="find-search" placeholder="search" />
        <span class="prep-panel-label">Replace</span>
        <input type="text" data-field="find-replace" placeholder="replace with" />
        <label class="prep-panel-check"><input type="checkbox" data-field="find-regex" /> Regex</label>
        <button data-action="prep-apply-find" type="button" class="prep-panel-apply">Replace All</button>
      </div>`;
  }

  if (ap === 'dedup') {
    const checks = cols.map(c =>
      `<label class="prep-panel-check"><input type="checkbox" data-field="dedup-col" value="${c.name}" checked /> ${c.name}</label>`
    ).join(' ');
    return `
      <div class="prep-panel">
        <span class="prep-panel-label">Key columns</span>
        ${checks}
        <div class="prep-panel-sep"></div>
        <button data-action="prep-apply-dedup" type="button" class="prep-panel-apply">Remove Duplicates</button>
      </div>`;
  }

  if (ap === 'missing') {
    return `
      <div class="prep-panel">
        <span class="prep-panel-label">Column</span>
        <select data-field="missing-col">${colOpts}</select>
        <span class="prep-panel-label">Strategy</span>
        <select data-field="missing-strategy">
          <option value="remove">Remove rows</option>
          <option value="fill_mean">Fill with mean</option>
          <option value="fill_median">Fill with median</option>
          <option value="fill_zero">Fill with zero</option>
          <option value="fill_custom">Fill with value</option>
          <option value="fill_down">Fill down</option>
          <option value="fill_up">Fill up</option>
        </select>
        <input type="text" data-field="missing-custom" placeholder="custom value" style="display:none" />
        <button data-action="prep-apply-missing" type="button" class="prep-panel-apply">Apply</button>
      </div>`;
  }

  return '';
}

function renderPrepTable(state) {
  const { dataPrep } = state;

  if (!dataPrep.selectedDatasetId) {
    return '<div class="prep-center"><div class="prep-table-wrap"><div class="prep-empty">Select a dataset to view its data.</div></div></div>';
  }
  if (dataPrep.loading) {
    return '<div class="prep-center"><div class="prep-table-wrap"><div class="prep-empty">Loading\u2026</div></div></div>';
  }
  if (dataPrep.error) {
    return `<div class="prep-center"><div class="prep-table-wrap"><div class="prep-empty" style="color:var(--red);">${dataPrep.error}</div></div></div>`;
  }

  const allCols = state.columnConfig.columns || [];
  const hidden = new Set(dataPrep.hiddenColumns || []);
  const cols = allCols.filter(c => !hidden.has(c.name));
  const roleLabels = { value: "Y", subgroup: "SG", phase: "PH", label: "LB" };

  // Use Arquero table if available, otherwise fall back to datasetPoints
  const table = dataPrep.arqueroTable;
  const totalRows = table ? table.numRows() : dataPrep.datasetPoints.length;

  // Virtual scrolling: render only visible rows
  // We use a sentinel approach — full-height container with only visible rows rendered
  const totalHeight = totalRows * ROW_HEIGHT;

  const pts = dataPrep.datasetPoints;
  const { sortColumn, sortDirection } = dataPrep;

  // For non-Arquero path, sort client-side
  let displayRows;
  if (table) {
    // Use Arquero getPage for the full table (virtual scroll is handled at render time)
    displayRows = getPage(table, 0, Math.min(totalRows, 500));
  } else {
    const sorted = [...pts];
    if (sortColumn) {
      sorted.sort((a, b) => {
        const raw_a = a.raw_data || a.metadata || {};
        const raw_b = b.raw_data || b.metadata || {};
        const av = sortColumn === "sequence_index" ? a.sequence_index : raw_a[sortColumn];
        const bv = sortColumn === "sequence_index" ? b.sequence_index : raw_b[sortColumn];
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === "number" && typeof bv === "number") return sortDirection === "asc" ? av - bv : bv - av;
        return sortDirection === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
      });
    }
    displayRows = sorted.map(p => p.raw_data || p.metadata || {});
  }

  const arrow = (col) => sortColumn === col ? `<span class="sort-arrow">${sortDirection === "asc" ? "\u25b2" : "\u25bc"}</span>` : "";

  const headers = cols.map(c => {
    const badge = c.role ? `<span class="role-badge">${roleLabels[c.role] || c.role}</span>` : "";
    return `<th class="sortable" data-action="sort-prep" data-column="${c.name}">${c.name}${badge} ${arrow(c.name)}</th>`;
  }).join("");

  // Render rows (capped at 500 for initial render — virtual scroll handles the rest via scroll events)
  const rows = displayRows.slice(0, 500).map((raw, idx) => {
    const cells = cols.map(c => {
      const v = raw[c.name];
      return `<td class="mono">${v != null ? v : "\u2014"}</td>`;
    }).join("");
    return `<tr><td>${idx + 1}</td>${cells}</tr>`;
  }).join("");

  return `
    <div class="prep-center">
    ${renderTransformBar(state)}
    ${renderPrepPanel(state)}
    <div class="prep-table-wrap" data-action="prep-table-scroll">
      <table class="prep-table">
        <thead><tr>
          <th class="sortable" data-action="sort-prep" data-column="sequence_index"># ${arrow("sequence_index")}</th>
          ${headers}
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="prep-table-footer">
        ${totalRows} rows \u00b7 ${cols.length} columns${hidden.size > 0 ? ` \u00b7 ${hidden.size} hidden` : ""}
      </div>
    </div>
    </div>`;
}

function renderColumnInfo(state) {
  const { dataPrep, datasets, columnConfig } = state;
  const ds = datasets.find(d => d.id === dataPrep.selectedDatasetId);
  if (!ds) {
    return '<div class="column-info"><div class="panel-card"><p class="muted" style="font-size:11px;">Select a dataset to see details.</p></div></div>';
  }

  const stats = computeStats(dataPrep.datasetPoints);
  const cols = columnConfig.columns || [];
  const hidden = new Set(dataPrep.hiddenColumns || []);
  const roleLabels = { value: "Y", subgroup: "SG", phase: "PH", label: "LB" };

  const statRow = (label, value) => `
    <div class="stat-row"><span class="stat-label">${label}</span><span class="stat-value">${value}</span></div>`;

  return `
    <div class="column-info">
      <div class="panel-card">
        <h4>Columns</h4>
        ${cols.length > 0 ? `
          <div class="column-list">
            ${cols.map(c => `
              <div class="column-item${hidden.has(c.name) ? ' column-hidden' : ''}">
                <span class="mono" style="font-size:10px;">${c.name}</span>
                <span style="font-size:9px;color:var(--t-3);">${c.dtype}</span>
                ${c.role ? `<span class="role-badge">${roleLabels[c.role] || c.role}</span>` : ""}
                <button class="column-toggle" data-action="toggle-column-visibility" data-column="${c.name}" title="${hidden.has(c.name) ? 'Show' : 'Hide'}" type="button">
                  ${hidden.has(c.name) ? '\u25cb' : '\u25cf'}
                </button>
              </div>
            `).join("")}
          </div>
        ` : `<p class="muted" style="font-size:10px;">No column metadata available.</p>`}
        <p class="muted" style="font-size:9px;margin-top:6px;">Assign column roles in the recipe rail.</p>
      </div>
      ${stats ? `
        <div class="panel-card">
          <h4>Summary</h4>
          ${statRow("Count", stats.n)}
          ${statRow("Mean", stats.mean.toFixed(3))}
          ${statRow("Std Dev", stats.std.toFixed(3))}
          ${statRow("Min", stats.min.toFixed(3))}
          ${statRow("Max", stats.max.toFixed(3))}
          ${statRow("Median", stats.median.toFixed(3))}
          ${stats.subgroupCount > 0 ? statRow("Subgroups", stats.subgroupCount) : ""}
        </div>
      ` : ""}
    </div>`;
}

export function renderDataPrep(state) {
  return `
    <section class="route-panel">
      <div class="route-header">
        <div>
          <h3>Data Prep</h3>
          <p class="muted">${state.datasets.length} dataset${state.datasets.length !== 1 ? "s" : ""} uploaded</p>
        </div>
      </div>
      <div class="dataprep-grid">
        ${renderDatasetList(state)}
        ${renderPrepTable(state)}
        ${renderColumnInfo(state)}
      </div>
    </section>
  `;
}
