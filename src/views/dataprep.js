import { computeStats, formatDate } from "../helpers.js";

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

function renderPrepTable(state) {
  const { dataPrep } = state;

  if (!dataPrep.selectedDatasetId) {
    return '<div class="prep-table-wrap"><div class="prep-empty">Select a dataset to view its data.</div></div>';
  }
  if (dataPrep.loading) {
    return '<div class="prep-table-wrap"><div class="prep-empty">Loading\u2026</div></div>';
  }
  if (dataPrep.error) {
    return `<div class="prep-table-wrap"><div class="prep-empty" style="color:var(--red);">${dataPrep.error}</div></div>`;
  }

  const pts = [...dataPrep.datasetPoints];
  const { sortColumn, sortDirection } = dataPrep;
  if (sortColumn) {
    pts.sort((a, b) => {
      const av = a[sortColumn], bv = b[sortColumn];
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number") return sortDirection === "asc" ? av - bv : bv - av;
      return sortDirection === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
  }

  const arrow = (col) => sortColumn === col ? `<span class="sort-arrow">${sortDirection === "asc" ? "\u25b2" : "\u25bc"}</span>` : "";

  const rows = pts.map(p => `
    <tr>
      <td>${p.sequence_index + 1}</td>
      <td>${p.value != null ? p.value.toFixed(3) : "\u2014"}</td>
      <td>${p.subgroup || "\u2014"}</td>
    </tr>`).join("");

  return `
    <div class="prep-table-wrap">
      <table class="prep-table">
        <thead><tr>
          <th class="sortable" data-action="sort-prep" data-column="sequence_index"># ${arrow("sequence_index")}</th>
          <th class="sortable" data-action="sort-prep" data-column="value">Value ${arrow("value")}</th>
          <th class="sortable" data-action="sort-prep" data-column="subgroup">Subgroup ${arrow("subgroup")}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="prep-table-footer">${pts.length} rows</div>
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

  const roleOptions = (currentRole) => `
    <option value="" ${!currentRole ? "selected" : ""}>None</option>
    <option value="value" ${currentRole === "value" ? "selected" : ""}>Value</option>
    <option value="subgroup" ${currentRole === "subgroup" ? "selected" : ""}>Subgroup</option>
    <option value="phase" ${currentRole === "phase" ? "selected" : ""}>Phase</option>
    <option value="label" ${currentRole === "label" ? "selected" : ""}>Label</option>
  `;

  const statRow = (label, value) => `
    <div class="stat-row"><span class="stat-label">${label}</span><span class="stat-value">${value}</span></div>`;

  return `
    <div class="column-info">
      <div class="panel-card">
        <h4>Columns</h4>
        ${cols.length > 0 ? `
          <table class="column-role-table">
            <thead><tr><th>Column</th><th>Type</th><th>Role</th></tr></thead>
            <tbody>
              ${cols.map(c => `
                <tr>
                  <td class="mono" style="font-size:10px;">${c.name}</td>
                  <td style="font-size:9px;color:var(--t-3);">${c.dtype}</td>
                  <td><select data-action="set-column-role" data-column="${c.name}" style="font-size:10px;padding:2px;background:var(--bg-2);color:var(--t-1);border:1px solid var(--border-2);border-radius:2px;width:80px;">${roleOptions(c.role)}</select></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        ` : `<p class="muted" style="font-size:10px;">No column metadata available.</p>`}
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
