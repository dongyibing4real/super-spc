import { computeStats, formatDate } from "../helpers.js";
import { getPage, previewTypeConversion, validateAllColumns, profileColumn } from "../data/data-prep-engine.js";

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
        <div class="prep-panel-sep"></div>
        ${btn('prep-rename', 'Rename', 'rename')}
        ${btn('prep-change-type', 'Type', 'change_type')}
        ${btn('prep-calc', 'Calc', 'calculated')}
        ${btn('prep-recode', 'Recode', 'recode')}
        ${btn('prep-bin', 'Bin', 'bin')}
        ${btn('prep-split', 'Split', 'split')}
        ${btn('prep-concat', 'Concat', 'concat')}
        <div class="prep-panel-sep"></div>
        ${btn('prep-validate', 'Validate', 'validate')}
      </div>
      <div class="prep-toolbar-right">
        ${dataPrep.excludedRows.length > 0 ? `<span class="prep-excluded-count">${dataPrep.excludedRows.length} excl</span><button data-action="prep-restore-all" type="button" class="prep-tool-btn" title="Restore all excluded rows">Restore All</button>` : ""}
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

  // ═══ Phase 2 panels ═══

  if (ap === 'rename') {
    return `
      <div class="prep-panel">
        <span class="prep-panel-label">Column</span>
        <select data-field="rename-col">${colOpts}</select>
        <span class="prep-panel-label">New name</span>
        <input type="text" data-field="rename-new" placeholder="new column name" />
        <button data-action="prep-apply-rename" type="button" class="prep-panel-apply">Rename</button>
      </div>`;
  }

  if (ap === 'change_type') {
    const numCols = cols.filter(c => c.dtype === 'numeric').map(c => c.name);
    const textCols = cols.filter(c => c.dtype === 'text').map(c => c.name);
    // Show preview badge if table exists
    let previewHtml = '';
    if (dataPrep.arqueroTable && cols.length > 0) {
      const firstCol = cols[0].name;
      const firstTarget = cols[0].dtype === 'numeric' ? 'text' : 'numeric';
      const pv = previewTypeConversion(dataPrep.arqueroTable, firstCol, firstTarget);
      previewHtml = `<span class="prep-preview-badge" data-field="type-preview">${pv.convertible}/${pv.total} convertible</span>`;
    }
    return `
      <div class="prep-panel">
        <span class="prep-panel-label">Column</span>
        <select data-field="type-col">${colOpts}</select>
        <span class="prep-panel-label">Convert to</span>
        <select data-field="type-target">
          <option value="numeric">Numeric</option>
          <option value="text">Text</option>
        </select>
        ${previewHtml}
        <button data-action="prep-apply-change-type" type="button" class="prep-panel-apply">Convert</button>
      </div>`;
  }

  if (ap === 'calculated') {
    return `
      <div class="prep-panel">
        <span class="prep-panel-label">Name</span>
        <input type="text" data-field="calc-name" placeholder="new_column" style="width:100px;" />
        <span class="prep-panel-label">Expression</span>
        <input type="text" data-field="calc-expr" placeholder="[Thickness] * 25.4" style="min-width:200px;" />
        <button data-action="prep-apply-calc" type="button" class="prep-panel-apply">Create</button>
        <span class="prep-hint">Columns: [Name]  Functions: round, abs, log, sqrt, pow, min, max</span>
      </div>`;
  }

  if (ap === 'recode') {
    return `
      <div class="prep-panel" style="flex-direction:column;align-items:stretch;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="prep-panel-label">Column</span>
          <select data-field="recode-col">${colOpts}</select>
          <label class="prep-panel-check"><input type="checkbox" data-field="recode-new-col" /> Save as new column</label>
          <input type="text" data-field="recode-new-name" placeholder="new column name" style="display:none;width:120px;" />
          <button data-action="prep-apply-recode" type="button" class="prep-panel-apply">Recode</button>
        </div>
        <div class="prep-mapping-rows" data-field="recode-mappings">
          <div class="prep-mapping-row">
            <input type="text" data-field="recode-old" placeholder="old value" />
            <span class="prep-panel-label">\u2192</span>
            <input type="text" data-field="recode-new" placeholder="new value" />
          </div>
        </div>
        <button data-action="prep-recode-add-row" type="button" class="prep-mapping-add">+ Add mapping</button>
      </div>`;
  }

  if (ap === 'bin') {
    const numericOpts = cols.filter(c => c.dtype === 'numeric')
      .map(c => `<option value="${c.name}">${c.name}</option>`).join('');
    return `
      <div class="prep-panel">
        <span class="prep-panel-label">Column</span>
        <select data-field="bin-col">${numericOpts || colOpts}</select>
        <span class="prep-panel-label">Bins</span>
        <input type="number" data-field="bin-count" value="5" min="2" max="100" style="width:50px;" />
        <label class="prep-panel-check"><input type="checkbox" data-field="bin-custom" /> Custom breaks</label>
        <input type="text" data-field="bin-breaks" placeholder="10, 20, 30" style="display:none;min-width:120px;" />
        <span class="prep-panel-label">Name</span>
        <input type="text" data-field="bin-name" placeholder="binned_col" style="width:100px;" />
        <button data-action="prep-apply-bin" type="button" class="prep-panel-apply">Bin</button>
      </div>`;
  }

  if (ap === 'split') {
    return `
      <div class="prep-panel">
        <span class="prep-panel-label">Column</span>
        <select data-field="split-col">${colOpts}</select>
        <span class="prep-panel-label">Delimiter</span>
        <input type="text" data-field="split-delim" value="," style="width:40px;" />
        <span class="prep-panel-label">Parts</span>
        <input type="number" data-field="split-parts" value="2" min="2" max="10" style="width:50px;" />
        <button data-action="prep-apply-split" type="button" class="prep-panel-apply">Split</button>
      </div>`;
  }

  if (ap === 'concat') {
    const checks = cols.map(c =>
      `<label class="prep-panel-check"><input type="checkbox" data-field="concat-col" value="${c.name}" /> ${c.name}</label>`
    ).join(' ');
    return `
      <div class="prep-panel">
        <span class="prep-panel-label">Columns</span>
        ${checks}
        <div class="prep-panel-sep"></div>
        <span class="prep-panel-label">Separator</span>
        <input type="text" data-field="concat-sep" value=" " style="width:40px;" />
        <span class="prep-panel-label">Name</span>
        <input type="text" data-field="concat-name" placeholder="combined" style="width:100px;" />
        <button data-action="prep-apply-concat" type="button" class="prep-panel-apply">Concat</button>
      </div>`;
  }

  // ═══ Phase 3 panels ═══

  if (ap === 'validate') {
    const numericOpts = cols.filter(c => c.dtype === 'numeric')
      .map(c => `<option value="${c.name}">${c.name}</option>`).join('');
    return `
      <div class="prep-panel">
        <span class="prep-panel-label">Column</span>
        <select data-field="validate-col">${colOpts}</select>
        <span class="prep-panel-label">Rule</span>
        <select data-field="validate-type">
          <option value="range">Range (min–max)</option>
          <option value="allowed">Allowed values</option>
          <option value="regex">Regex pattern</option>
        </select>
        <input type="number" data-field="validate-min" placeholder="min" style="width:60px;" />
        <input type="number" data-field="validate-max" placeholder="max" style="width:60px;" />
        <input type="text" data-field="validate-values" placeholder="a, b, c" style="display:none;min-width:120px;" />
        <input type="text" data-field="validate-pattern" placeholder="^[A-Z]+" style="display:none;min-width:120px;" />
        <button data-action="prep-apply-validate" type="button" class="prep-panel-apply">Apply</button>
        <button data-action="prep-clear-validate" type="button" class="prep-tool-btn" title="Clear validation rule for selected column">Clear</button>
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

  // Profiles for column headers — use cached results, compute lazily if missing
  const cache = dataPrep.profileCache || {};
  if (table && allCols.length > 0) {
    for (const c of allCols) {
      if (!cache[c.name]) {
        try { cache[c.name] = profileColumn(table, c.name, c.dtype); } catch { /* skip */ }
      }
    }
  }

  const headers = cols.map(c => {
    const badge = c.role ? `<span class="role-badge">${roleLabels[c.role] || c.role}</span>` : "";
    const profile = renderThProfile(cache[c.name], c.dtype);
    return `<th class="sortable${profile ? ' th-with-profile' : ''}" data-action="sort-prep" data-column="${c.name}">
      <div class="th-name-row">${c.name}${badge}${arrow(c.name)}</div>
      ${profile}
    </th>`;
  }).join("");

  // Phase 3: compute validation map for cell highlighting
  const validationMap = table ? validateAllColumns(table, allCols) : new Map();
  const excludedSet = new Set(state.dataPrep.excludedRows || []);

  // Render rows (capped at 500 for initial render — virtual scroll handles the rest via scroll events)
  const rows = displayRows.slice(0, 500).map((raw, idx) => {
    const isExcluded = excludedSet.has(idx);
    const cells = cols.map(c => {
      const v = raw[c.name];
      const invalid = validationMap.get(c.name)?.has(idx);
      return `<td class="mono${invalid ? ' cell-invalid' : ''}">${v != null ? v : "\u2014"}</td>`;
    }).join("");
    return `<tr class="${isExcluded ? 'row-excluded' : ''}" data-row-idx="${idx}"><td><input type="checkbox" data-action="toggle-row-exclude" data-row="${idx}" ${!isExcluded ? 'checked' : ''} />${idx + 1}</td>${cells}</tr>`;
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
        ${totalRows} rows \u00b7 ${cols.length} columns${hidden.size > 0 ? ` \u00b7 ${hidden.size} hidden` : ""}${excludedSet.size > 0 ? ` \u00b7 ${excludedSet.size} excluded` : ""}
      </div>
    </div>
    </div>`;
}

function renderThProfile(profile, dtype) {
  if (!profile) return '';

  let distribution = '';
  let statsLine = '';

  if (dtype === 'numeric' && profile.histogram?.length > 0) {
    const bars = profile.histogram.map(h =>
      `<span class="th-hist-bar" style="height:${Math.max(h * 100, 4)}%"></span>`
    ).join('');
    distribution = `<div class="th-mini-hist">${bars}</div>`;
    const fmt = v => v != null ? (Math.abs(v) >= 10000 ? v.toExponential(1) : parseFloat(v.toFixed(2))) : '\u2014';
    statsLine = `<div class="th-mini-stats">${fmt(profile.min)} \u00b7 ${fmt(profile.mean)} \u00b7 ${fmt(profile.max)}</div>`;
  } else if (dtype !== 'numeric' && profile.topValues?.length > 0) {
    const maxCount = profile.topValues[0].count;
    const bars = profile.topValues.slice(0, 3).map(t => {
      const pct = maxCount > 0 ? (t.count / maxCount * 100).toFixed(0) : 0;
      const label = String(t.value).length > 8 ? String(t.value).slice(0, 8) + '\u2026' : t.value;
      return `<div class="th-top-row"><span class="th-top-label">${label}</span><div class="th-top-track"><div class="th-top-bar" style="width:${pct}%"></div></div></div>`;
    }).join('');
    distribution = `<div class="th-mini-top">${bars}</div>`;
    statsLine = `<div class="th-mini-stats">${profile.distinct} distinct</div>`;
  }

  if (!distribution) return '';

  const completePct = profile.count > 0 ? ((profile.count - profile.missing) / profile.count * 100).toFixed(0) : 0;
  const completeness = profile.missing > 0
    ? `<div class="th-mini-complete"><div class="th-mini-complete-fill" style="width:${completePct}%"></div></div>`
    : '';

  return `<div class="th-profile">${completeness}${distribution}${statsLine}</div>`;
}

function renderColumnCard(c, profile, isHidden, roleLabels) {
  const roleLabel = c.role ? roleLabels[c.role] || c.role : null;
  const validBadge = c.validation
    ? `<span class="col-profile-valid-badge" title="${c.validation.type} rule">\u2713</span>` : '';

  const header = `
    <div class="col-profile-header">
      <span class="col-profile-name mono">${c.name}</span>
      <div class="col-profile-badges">
        ${roleLabel ? `<span class="role-badge">${roleLabel}</span>` : ''}
        <span class="col-dtype-pill">${c.dtype}</span>
        ${validBadge}
        <button class="column-toggle" data-action="toggle-column-visibility" data-column="${c.name}"
          title="${isHidden ? 'Show column' : 'Hide column'}" type="button">
          ${isHidden ? '\u25cb' : '\u25cf'}
        </button>
      </div>
    </div>`;

  if (!profile) {
    return `<div class="col-profile-card${isHidden ? ' col-profile-hidden' : ''}">${header}<div class="col-profile-empty">\u2014</div></div>`;
  }

  const completePct = profile.count > 0 ? ((profile.count - profile.missing) / profile.count * 100) : 0;
  const completeness = `
    <div class="col-completeness">
      <div class="col-completeness-track">
        <div class="col-completeness-fill" style="width:${completePct.toFixed(1)}%"></div>
      </div>
      <span class="col-completeness-label">${completePct.toFixed(1)}% complete${profile.missing > 0 ? ` \u00b7 ${profile.missing} missing` : ''}</span>
    </div>`;

  let distribution = '';
  let statsRow = '';

  if (c.dtype === 'numeric' && profile.histogram && profile.histogram.length > 0) {
    const bars = profile.histogram.map(h =>
      `<span class="col-hist-bar" style="height:${Math.max(h * 100, 4)}%"></span>`
    ).join('');
    distribution = `<div class="col-hist">${bars}</div>`;

    const fmt = v => v != null ? (Math.abs(v) >= 1000 || (Math.abs(v) < 0.01 && v !== 0) ? v.toExponential(2) : v.toFixed(3)) : '\u2014';
    statsRow = `
      <div class="col-profile-stats">
        <span class="col-stat"><span class="col-stat-label">min</span>${fmt(profile.min)}</span>
        <span class="col-stat"><span class="col-stat-label">mean</span>${fmt(profile.mean)}</span>
        <span class="col-stat"><span class="col-stat-label">max</span>${fmt(profile.max)}</span>
        <span class="col-stat"><span class="col-stat-label">std</span>${fmt(profile.std)}</span>
      </div>`;
  } else if (c.dtype !== 'numeric' && profile.topValues && profile.topValues.length > 0) {
    const maxCount = profile.topValues[0].count;
    const bars = profile.topValues.slice(0, 5).map(t => {
      const pct = maxCount > 0 ? (t.count / maxCount * 100).toFixed(0) : 0;
      const countPct = profile.count > 0 ? (t.count / profile.count * 100).toFixed(1) : 0;
      return `
        <div class="col-top-row">
          <span class="col-top-label mono">${String(t.value).length > 12 ? String(t.value).slice(0, 12) + '\u2026' : t.value}</span>
          <div class="col-top-track"><div class="col-top-bar" style="width:${pct}%"></div></div>
          <span class="col-top-pct">${countPct}%</span>
        </div>`;
    }).join('');
    distribution = `<div class="col-top-values">${bars}</div>`;
    statsRow = `
      <div class="col-profile-stats">
        <span class="col-stat"><span class="col-stat-label">distinct</span>${profile.distinct}</span>
        ${profile.minLength != null ? `<span class="col-stat"><span class="col-stat-label">len</span>${profile.minLength}\u2013${profile.maxLength}</span>` : ''}
      </div>`;
  }

  return `
    <div class="col-profile-card${isHidden ? ' col-profile-hidden' : ''}">
      ${header}
      ${completeness}
      ${distribution}
      ${statsRow}
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
  const table = dataPrep.arqueroTable;
  const cache = dataPrep.profileCache || {};

  // Lazily compute profiles for visible columns
  if (table && cols.length > 0) {
    for (const c of cols) {
      if (!cache[c.name]) {
        try { cache[c.name] = profileColumn(table, c.name, c.dtype); } catch { /* skip */ }
      }
    }
  }

  const statRow = (label, value) => `
    <div class="stat-row"><span class="stat-label">${label}</span><span class="stat-value">${value}</span></div>`;

  return `
    <div class="column-info">
      <div class="panel-card">
        <h4>Columns <span style="font-weight:400;color:var(--t-4);">(${cols.length})</span></h4>
        ${cols.length > 0 ? `
          <div class="column-list">
            ${cols.map(c => {
              const isHidden = hidden.has(c.name);
              const roleLabel = c.role ? roleLabels[c.role] || c.role : null;
              const validBadge = c.validation ? `<span class="validation-badge" title="${c.validation.type} rule">\u2713</span>` : '';
              return `
                <div class="column-item${isHidden ? ' column-hidden' : ''}">
                  <span class="mono" style="font-size:10px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${c.name}</span>
                  <span style="font-size:9px;color:var(--t-4);">${c.dtype}</span>
                  ${roleLabel ? `<span class="role-badge">${roleLabel}</span>` : ''}
                  ${validBadge}
                  <button class="column-toggle" data-action="toggle-column-visibility" data-column="${c.name}" title="${isHidden ? 'Show' : 'Hide'}" type="button">
                    ${isHidden ? '\u25cb' : '\u25cf'}
                  </button>
                </div>`;
            }).join("")}
          </div>
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
