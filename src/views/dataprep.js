import { computeStats, formatDate } from "../helpers.js";
import { getPage, previewTypeConversion, validateAllColumns, profileColumn } from "../data/data-prep-engine.js";

const ROW_HEIGHT = 28;
const VISIBLE_BUFFER = 5;

function renderDatasetList(state) {
  const { datasets, dataPrep } = state;
  const cards = datasets.map(ds => {
    const active = ds.id === dataPrep.selectedDatasetId;
    const confirming = dataPrep.confirmingDeleteId === ds.id;
    const meta = ds.metadata || {};
    return `
      <div class="ds-card ${active ? "active" : ""}" data-action="select-prep-dataset" data-dataset-id="${ds.id}">
        <div class="ds-card-name">${ds.name}</div>
        <div class="ds-card-meta">${ds.point_count} pts \u00b7 ${formatDate(ds.created_at)}</div>
        ${meta.value_column ? `<div class="ds-card-meta">col: ${meta.value_column}</div>` : ""}
        ${active ? `
          <div class="ds-card-actions">
            <button data-action="load-prep-to-chart" type="button">Load to Chart</button>
            ${confirming ? `
              <span class="ds-confirm-msg">Delete?</span>
              <button class="danger" data-action="delete-dataset" data-dataset-id="${ds.id}" type="button">Yes</button>
              <button data-action="cancel-delete" type="button">No</button>
            ` : `
              <button class="danger" data-action="delete-dataset" data-dataset-id="${ds.id}" type="button">Delete</button>
            `}
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

const ROW_OPS = [
  { action: 'prep-filter',       label: 'Filter',  short: 'Flt', panel: 'filter' },
  { action: 'prep-find-replace', label: 'Find',    short: 'Fnd', panel: 'find' },
  { action: 'prep-dedup',        label: 'Dedup',   short: 'Dup', panel: 'dedup' },
  { action: 'prep-missing',      label: 'Missing', short: 'Miss', panel: 'missing' },
  { action: 'prep-trim',         label: 'Trim',    short: 'Trm', panel: null },
];

const COL_OPS = [
  { action: 'prep-rename',      label: 'Rename',  panel: 'rename' },
  { action: 'prep-change-type', label: 'Type',    panel: 'change_type' },
  { action: 'prep-calc',        label: 'Calc',    panel: 'calculated' },
  { action: 'prep-recode',      label: 'Recode',  panel: 'recode' },
  { action: 'prep-bin',         label: 'Bin',     panel: 'bin' },
  { action: 'prep-split',       label: 'Split',   panel: 'split' },
  { action: 'prep-concat',      label: 'Concat',  panel: 'concat' },
];

function renderUtilityBar(state) {
  const { dataPrep, datasets } = state;
  const count = dataPrep.transforms.length;
  const unsaved = dataPrep.unsavedChanges;
  const ds = datasets.find(d => d.id === dataPrep.selectedDatasetId);
  const table = dataPrep.arqueroTable;
  const totalRows = table ? table.numRows() : dataPrep.datasetPoints.length;
  const cols = (state.columnConfig.columns || []).length;
  const excl = dataPrep.excludedRows.length;

  return `
    <div class="prep-menubar">
      <div class="prep-menubar-left">
        <span class="prep-ds-nameplate">
          ${ds
            ? `<span class="prep-ds-nameplate-name">${ds.name}</span>${unsaved ? '<span class="prep-unsaved-dot" title="Unsaved changes"></span>' : ''}`
            : `<span class="prep-ds-nameplate-empty">No dataset selected</span>`}
        </span>
        <div class="prep-menubar-divider"></div>
        <div class="prep-menu-group">
          <button data-action="prep-save" type="button"
            class="prep-mbtn${unsaved ? ' prep-mbtn-save-active' : ''}"
            title="Save cleaned dataset">Save</button>
          <button data-action="prep-export-csv" type="button"
            class="prep-mbtn" title="Download current data as CSV"
            ${!ds ? 'disabled' : ''}>Export CSV</button>
        </div>
        <div class="prep-menubar-divider"></div>
        <div class="prep-menu-group">
          <button data-action="prep-undo" type="button"
            class="prep-mbtn" title="Undo last transform"
            ${count === 0 ? 'disabled' : ''}>Undo${count > 0 ? `<span class="prep-undo-badge">${count}</span>` : ''}</button>
          <button data-action="prep-reset" type="button"
            class="prep-mbtn prep-mbtn-danger" title="Discard all transforms and restore original data"
            ${count === 0 ? 'disabled' : ''}>Reset</button>
        </div>
        <div class="prep-menubar-divider"></div>
        <button data-action="prep-validate" type="button"
          class="prep-mbtn" title="Validate data quality rules">Validate</button>
        ${excl > 0 ? `
          <div class="prep-menubar-divider"></div>
          <span class="prep-excl-chip">${excl} excluded</span>
          <button data-action="prep-restore-all" type="button" class="prep-mbtn" title="Restore all excluded rows">Restore</button>
        ` : ''}
      </div>
      <div class="prep-menubar-right">
        ${ds && totalRows > 0 ? `<span class="prep-status-chip">${totalRows.toLocaleString()} rows · ${cols} cols${count > 0 ? ` · ${count} step${count !== 1 ? 's' : ''}` : ''}</span>` : ''}
      </div>
    </div>`;
}

function renderTransformToolbar(state) {
  const ap = state.dataPrep.activePanel;
  return `
    <div class="prep-transform-toolbar">
      <span class="prep-toolbar-group-label">Col</span>
      ${COL_OPS.map(op => `
        <button data-action="${op.action}" type="button"
          class="prep-col-btn${op.panel && ap === op.panel ? ' active' : ''}">${op.label}</button>
      `).join('')}
      <div class="prep-toolbar-divider"></div>
      <span class="prep-toolbar-group-label">Row</span>
      ${ROW_OPS.map(op => `
        <button data-action="${op.action}" type="button"
          class="prep-col-btn${op.panel && ap === op.panel ? ' active' : ''}">${op.label}</button>
      `).join('')}
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

const TRANSFORM_LABELS = {
  filter: 'Filter', find: 'Find/Replace', dedup: 'Dedup', missing: 'Missing',
  trim: 'Trim', rename: 'Rename', change_type: 'Type', calculated: 'Calc',
  recode: 'Recode', bin: 'Bin', split: 'Split', concat: 'Concat', validate: 'Validate',
};

function transformSummary(tr) {
  const p = tr.params || {};
  switch (tr.type) {
    case 'filter': return `${p.column} ${p.op} ${p.value || ''}`;
    case 'find': return `${p.column === '__all__' ? 'All' : p.column}: ${p.search}\u2192${p.replace}`;
    case 'dedup': return `${(p.columns || []).length} keys`;
    case 'missing': return `${p.column}: ${p.strategy}`;
    case 'trim': return '';
    case 'rename': return `${p.oldName}\u2192${p.newName}`;
    case 'change_type': return `${p.column}\u2192${p.targetType}`;
    case 'calculated': return p.newColName || '';
    case 'recode': return p.column || '';
    case 'bin': return `${p.column}\u2192${p.newColName || 'binned'}`;
    case 'split': return `${p.column} by "${p.delimiter}"`;
    case 'concat': return p.newColName || '';
    case 'validate': return `${p.column}: ${p.type}`;
    default: return '';
  }
}

function renderTransformLedger(state) {
  const { dataPrep } = state;
  const transforms = dataPrep.transforms;
  if (transforms.length === 0) return '';

  const steps = transforms.map((tr, i) => {
    const label = TRANSFORM_LABELS[tr.type] || tr.type;
    const detail = transformSummary(tr);
    const isLast = i === transforms.length - 1;
    return `
      <div class="ledger-step${isLast ? ' ledger-step-last' : ''}">
        <span class="ledger-step-idx">${i + 1}</span>
        <span class="ledger-step-type">${label}</span>
        ${detail ? `<span class="ledger-step-detail">${detail}</span>` : ''}
        ${isLast ? `<button class="ledger-undo" data-action="prep-undo" type="button" title="Undo last">\u00d7</button>` : ''}
      </div>`;
  }).join('');

  return `<div class="prep-ledger">${steps}</div>`;
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
  const selectedCol = dataPrep.expandedProfileColumn;

  const table = dataPrep.arqueroTable;
  const totalRows = table ? table.numRows() : dataPrep.datasetPoints.length;

  let displayRows;
  if (table) {
    displayRows = getPage(table, 0, Math.min(totalRows, 500));
  } else {
    displayRows = dataPrep.datasetPoints.map(p => p.raw_data || p.metadata || {});
  }

  // Profiles for column headers
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
    const isSelected = c.name === selectedCol;
    return `<th class="${profile ? 'th-with-profile' : ''}${isSelected ? ' th-selected' : ''}" data-action="select-column" data-column="${c.name}">
      <div class="th-name-row">${c.name}${badge}</div>
      ${profile}
    </th>`;
  }).join("");

  const validationMap = table ? validateAllColumns(table, allCols) : new Map();
  const excludedSet = new Set(state.dataPrep.excludedRows || []);

  const rows = displayRows.slice(0, 500).map((raw, idx) => {
    const isExcluded = excludedSet.has(idx);
    const cells = cols.map(c => {
      const v = raw[c.name];
      const invalid = validationMap.get(c.name)?.has(idx);
      const isColSel = c.name === selectedCol;
      return `<td class="mono${invalid ? ' cell-invalid' : ''}${isColSel ? ' col-selected' : ''}">${v != null ? v : "\u2014"}</td>`;
    }).join("");
    return `<tr class="${isExcluded ? 'row-excluded' : ''}" data-row-idx="${idx}"><td><input type="checkbox" data-action="toggle-row-exclude" data-row="${idx}" ${!isExcluded ? 'checked' : ''} />${idx + 1}</td>${cells}</tr>`;
  }).join("");

  return `
    <div class="prep-center">
    ${renderUtilityBar(state)}
    ${renderTransformToolbar(state)}
    ${renderPrepPanel(state)}
    ${renderTransformLedger(state)}
    <div class="prep-table-area">
      <div class="prep-table-wrap" data-action="prep-table-scroll">
        <table class="prep-table">
          <thead><tr>
            <th data-action="select-column" data-column="sequence_index">#</th>
            ${headers}
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="prep-table-footer">
          ${totalRows} rows \u00b7 ${cols.length} columns${hidden.size > 0 ? ` \u00b7 ${hidden.size} hidden` : ""}${excludedSet.size > 0 ? ` \u00b7 ${excludedSet.size} excluded` : ""}
        </div>
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
      const relPct = maxCount > 0 ? (t.count / maxCount * 100).toFixed(0) : 0;
      const label = String(t.value).length > 8 ? String(t.value).slice(0, 8) + '\u2026' : t.value;
      return `<div class="th-top-row"><span class="th-top-label">${label}</span><div class="th-top-track"><div class="th-top-bar" style="width:${relPct}%"></div></div></div>`;
    }).join('');
    distribution = `<div class="th-mini-top">${bars}</div>`;
    const topAbsPct = profile.count > 0 ? (maxCount / profile.count * 100).toFixed(0) : 0;
    statsLine = `<div class="th-mini-stats">${profile.distinct} distinct \u00b7 top ${topAbsPct}%</div>`;
  }

  if (!distribution) return '';

  const completePct = profile.count > 0 ? ((profile.count - profile.missing) / profile.count * 100).toFixed(0) : 0;
  const completeness = profile.missing > 0
    ? `<div class="th-mini-complete"><div class="th-mini-complete-fill" style="width:${completePct}%"></div></div>`
    : '';

  return `<div class="th-profile">${completeness}${distribution}${statsLine}</div>`;
}

function renderColumnCard(c, profile, isHidden, roleLabels, isSelected) {
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

  const cardClasses = `col-profile-card${isHidden ? ' col-profile-hidden' : ''}${isSelected ? ' col-profile-selected' : ''}`;

  if (!profile) {
    return `<div class="${cardClasses}" data-action="select-profile-column" data-column="${c.name}">${header}<div class="col-profile-empty">\u2014</div></div>`;
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

    const skew = profile.skewness;
    let skewLabel = '';
    if (skew != null) {
      if (Math.abs(skew) < 0.5) skewLabel = 'symmetric';
      else if (skew >= 0.5 && skew < 1) skewLabel = 'right-skewed';
      else if (skew >= 1) skewLabel = 'right-heavy';
      else if (skew <= -0.5 && skew > -1) skewLabel = 'left-skewed';
      else skewLabel = 'left-heavy';
    }
    const outlierBadge = profile.outlierCount > 0
      ? `<span class="col-outlier-badge">${profile.outlierCount} outlier${profile.outlierCount !== 1 ? 's' : ''}</span>`
      : '';

    statsRow = `
      <div class="col-profile-stats">
        <span class="col-stat"><span class="col-stat-label">med</span>${fmt(profile.median)}</span>
        <span class="col-stat"><span class="col-stat-label">mean</span>${fmt(profile.mean)}</span>
        <span class="col-stat"><span class="col-stat-label">std</span>${fmt(profile.std)}</span>
        ${profile.cv != null ? `<span class="col-stat"><span class="col-stat-label">cv</span>${profile.cv.toFixed(1)}%</span>` : ''}
      </div>
      <div class="col-profile-signals">
        ${skewLabel ? `<span class="col-skew-signal">${skewLabel}</span>` : ''}
        ${outlierBadge}
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

    const br = profile.balanceRatio;
    let balanceLabel = '', balanceClass = '';
    if (br != null) {
      if (br <= 1.5) { balanceLabel = 'balanced'; balanceClass = 'col-balance-even'; }
      else if (br <= 3) { balanceLabel = 'slightly uneven'; balanceClass = 'col-balance-warn'; }
      else { balanceLabel = 'uneven'; balanceClass = 'col-balance-skewed'; }
    }

    statsRow = `
      <div class="col-profile-stats">
        <span class="col-stat"><span class="col-stat-label">distinct</span>${profile.distinct}</span>
        ${profile.minLength != null ? `<span class="col-stat"><span class="col-stat-label">len</span>${profile.minLength}\u2013${profile.maxLength}</span>` : ''}
        ${profile.emptyStrings > 0 ? `<span class="col-stat col-stat-warn"><span class="col-stat-label">empty</span>${profile.emptyStrings}</span>` : ''}
      </div>
      <div class="col-profile-signals">
        ${balanceLabel ? `<span class="col-balance-flag ${balanceClass}">${balanceLabel}</span>` : ''}
      </div>`;
  }

  return `
    <div class="${cardClasses}" data-action="select-profile-column" data-column="${c.name}">
      ${header}
      ${completeness}
      ${distribution}
      ${statsRow}
    </div>`;
}

function renderDetailedProfile(c, profile, roleLabels) {
  const roleLabel = c.role ? roleLabels[c.role] || c.role : null;
  const fmt = v => v != null ? (Math.abs(v) >= 1000 || (Math.abs(v) < 0.01 && v !== 0) ? v.toExponential(3) : v.toFixed(4)) : '\u2014';
  const fmtShort = v => v != null ? (Math.abs(v) >= 1000 || (Math.abs(v) < 0.01 && v !== 0) ? v.toExponential(2) : v.toFixed(3)) : '\u2014';

  const statRow = (label, value, cls = '') => `
    <div class="stat-row${cls ? ' ' + cls : ''}"><span class="stat-label">${label}</span><span class="stat-value">${value}</span></div>`;

  const completePct = profile.count > 0 ? ((profile.count - profile.missing) / profile.count * 100) : 0;

  let distributionHtml = '';
  let quantileHtml = '';
  let momentsHtml = '';
  let outlierHtml = '';
  let normalityChip = '';

  if (c.dtype === 'numeric' && profile.histogram && profile.histogram.length > 0) {
    const bars = profile.histogram.map(h =>
      `<span class="col-hist-bar" style="height:${Math.max(h * 100, 4)}%"></span>`
    ).join('');

    // Normality signal from skewness and kurtosis
    const skew = profile.skewness ?? 0;
    const kurt = profile.kurtosis ?? 0;
    let normLabel, normClass;
    if (Math.abs(skew) < 0.5 && Math.abs(kurt) < 1) {
      normLabel = 'Approx. normal'; normClass = 'col-normality-ok';
    } else if (Math.abs(skew) < 1 && Math.abs(kurt) < 2) {
      normLabel = 'Mild non-normality'; normClass = 'col-normality-warn';
    } else {
      normLabel = 'Non-normal'; normClass = 'col-normality-bad';
    }
    normalityChip = `<span class="col-normality-chip ${normClass}">${normLabel}</span>`;

    distributionHtml = `
      <div class="col-detail-section">
        <div class="col-detail-section-head">
          <span class="col-detail-label">Distribution</span>
          ${normalityChip}
        </div>
        <div class="col-hist col-hist-lg">${bars}</div>
      </div>`;

    // Full quantile table
    quantileHtml = `
      <div class="col-detail-section">
        <div class="col-detail-label">Quantiles</div>
        <table class="col-quant-table">
          <tr><td class="cqt-label">Min</td><td class="cqt-val">${fmtShort(profile.min)}</td><td class="cqt-label">Max</td><td class="cqt-val">${fmtShort(profile.max)}</td></tr>
          <tr><td class="cqt-label">P10</td><td class="cqt-val">${fmtShort(profile.p10)}</td><td class="cqt-label">P90</td><td class="cqt-val">${fmtShort(profile.p90)}</td></tr>
          <tr><td class="cqt-label">Q1 (25%)</td><td class="cqt-val">${fmtShort(profile.q1)}</td><td class="cqt-label">Q3 (75%)</td><td class="cqt-val">${fmtShort(profile.q3)}</td></tr>
          <tr><td class="cqt-label">Median</td><td class="cqt-val cqt-val-accent">${fmtShort(profile.median)}</td><td class="cqt-label">IQR</td><td class="cqt-val">${profile.q1 != null && profile.q3 != null ? fmtShort(profile.q3 - profile.q1) : '\u2014'}</td></tr>
        </table>
      </div>`;

    // Moments
    const cvStr = profile.cv != null ? `${profile.cv.toFixed(1)}%` : '\u2014';
    const skewStr = profile.skewness != null ? profile.skewness.toFixed(3) : '\u2014';
    const kurtStr = profile.kurtosis != null ? `${profile.kurtosis.toFixed(3)} (excess)` : '\u2014';
    momentsHtml = `
      <div class="col-detail-section">
        <div class="col-detail-label">Moments</div>
        ${statRow("Count", profile.count.toLocaleString())}
        ${statRow("Missing", profile.missing > 0 ? `${profile.missing} (${(100 - completePct).toFixed(1)}%)` : '0', profile.missing > 0 ? 'stat-row-warn' : '')}
        ${statRow("Mean", fmt(profile.mean))}
        ${statRow("Std Dev", fmt(profile.std))}
        ${statRow("CV", cvStr)}
        ${statRow("Skewness", skewStr)}
        ${statRow("Kurtosis", kurtStr)}
      </div>`;

    // Outliers
    if (profile.outlierCount != null) {
      const outlierPct = profile.count > 0 ? (profile.outlierCount / profile.count * 100).toFixed(1) : '0';
      outlierHtml = `
        <div class="col-detail-section">
          <div class="col-detail-label">Outliers (beyond \u00b13\u03c3)</div>
          <div class="col-outlier-row${profile.outlierCount > 0 ? ' col-outlier-row-warn' : ''}">
            <span class="col-outlier-count">${profile.outlierCount}</span>
            <span class="col-outlier-desc">${profile.outlierCount === 0 ? 'None detected' : `${outlierPct}% of rows \u2014 review in table`}</span>
          </div>
        </div>`;
    }

  } else if (profile.topValues && profile.topValues.length > 0) {
    const maxCount = profile.topValues[0].count;
    const bars = profile.topValues.slice(0, 10).map(t => {
      const pct = maxCount > 0 ? (t.count / maxCount * 100).toFixed(0) : 0;
      const countPct = profile.count > 0 ? (t.count / profile.count * 100).toFixed(1) : 0;
      return `
        <div class="col-top-row">
          <span class="col-top-label mono">${String(t.value).length > 16 ? String(t.value).slice(0, 16) + '\u2026' : t.value}</span>
          <div class="col-top-track"><div class="col-top-bar" style="width:${pct}%"></div></div>
          <span class="col-top-pct">${countPct}%</span>
        </div>`;
    }).join('');

    // Balance
    const br = profile.balanceRatio;
    let balanceNote = '', balanceClass = '';
    if (br != null) {
      if (br <= 1.5) { balanceNote = `Even distribution (ratio ${br.toFixed(1)}:1)`; balanceClass = 'col-normality-ok'; }
      else if (br <= 3) { balanceNote = `Slightly uneven (ratio ${br.toFixed(1)}:1)`; balanceClass = 'col-normality-warn'; }
      else { balanceNote = `Skewed distribution (ratio ${br.toFixed(0)}:1) \u2014 check subgroup balance`; balanceClass = 'col-normality-bad'; }
      normalityChip = `<span class="col-normality-chip ${balanceClass}">${balanceNote}</span>`;
    }

    distributionHtml = `
      <div class="col-detail-section">
        <div class="col-detail-section-head">
          <span class="col-detail-label">Value Frequencies</span>
          ${normalityChip}
        </div>
        <div class="col-top-values">${bars}</div>
      </div>`;

    momentsHtml = `
      <div class="col-detail-section">
        <div class="col-detail-label">Summary</div>
        ${statRow("Count", profile.count.toLocaleString())}
        ${statRow("Missing", profile.missing > 0 ? `${profile.missing} (${(100 - completePct).toFixed(1)}%)` : '0', profile.missing > 0 ? 'stat-row-warn' : '')}
        ${statRow("Distinct values", profile.distinct)}
        ${statRow("Cardinality", `${(profile.distinct / Math.max(profile.count, 1) * 100).toFixed(1)}% unique`)}
        ${profile.minLength != null ? statRow("Value length", `${profile.minLength}\u2013${profile.maxLength} chars`) : ''}
        ${profile.emptyStrings > 0 ? statRow("Empty strings", profile.emptyStrings, 'stat-row-warn') : ''}
      </div>`;
  }

  return `
    <div class="panel-card col-detail-panel">
      <div class="col-detail-header">
        <button class="col-detail-back" data-action="select-column" data-column="${c.name}" type="button">\u2190 Back</button>
      </div>
      <div class="col-detail-title">
        <span class="col-profile-name mono" style="font-size:12px;">${c.name}</span>
        <div class="col-profile-badges">
          ${roleLabel ? `<span class="role-badge">${roleLabel}</span>` : ''}
          <span class="col-dtype-pill">${c.dtype}</span>
        </div>
      </div>
      <div class="col-completeness" style="margin:8px 0;">
        <div class="col-completeness-track">
          <div class="col-completeness-fill" style="width:${completePct.toFixed(1)}%"></div>
        </div>
        <span class="col-completeness-label">${completePct.toFixed(1)}% complete${profile.missing > 0 ? ` \u00b7 ${profile.missing} missing` : ''}</span>
      </div>
      ${distributionHtml}
      ${quantileHtml}
      ${momentsHtml}
      ${outlierHtml}
    </div>`;
}

function renderColumnInfo(state) {
  const { dataPrep, datasets, columnConfig } = state;
  const ds = datasets.find(d => d.id === dataPrep.selectedDatasetId);
  if (!ds) {
    return '<div class="column-info"><div class="panel-card"><p class="muted" style="font-size:11px;">Select a dataset to see details.</p></div></div>';
  }

  const cols = columnConfig.columns || [];
  const roleLabels = { value: "Y", subgroup: "SG", phase: "PH", label: "LB" };
  const table = dataPrep.arqueroTable;
  const cache = dataPrep.profileCache || {};
  const selectedCol = dataPrep.expandedProfileColumn;

  if (table && cols.length > 0) {
    for (const c of cols) {
      if (!cache[c.name]) {
        try { cache[c.name] = profileColumn(table, c.name, c.dtype); } catch { /* skip */ }
      }
    }
  }

  // Column selected → show detailed profile
  if (selectedCol) {
    const c = cols.find(col => col.name === selectedCol);
    if (c && cache[c.name]) {
      return `<div class="column-info">${renderDetailedProfile(c, cache[c.name], roleLabels)}</div>`;
    }
  }

  // No column selected → show summary
  const totalRows = table ? table.numRows() : dataPrep.datasetPoints.length;
  const numCols = cols.filter(c => c.dtype === 'numeric');
  const textCols = cols.filter(c => c.dtype !== 'numeric');
  const totalMissing = Object.values(cache).reduce((sum, p) => sum + (p.missing || 0), 0);

  const statRow = (label, value) => `
    <div class="stat-row"><span class="stat-label">${label}</span><span class="stat-value">${value}</span></div>`;

  const hidden = new Set(dataPrep.hiddenColumns || []);
  const columnCards = cols.map(c => {
    const isHidden = hidden.has(c.name);
    return renderColumnCard(c, cache[c.name], isHidden, roleLabels, false);
  }).join('');

  return `
    <div class="column-info">
      <div class="panel-card">
        <h4>Summary</h4>
        ${totalRows > 0 ? `
          ${statRow("Rows", totalRows.toLocaleString())}
          ${statRow("Columns", cols.length)}
          ${statRow("Numeric", numCols.length)}
          ${statRow("Text", textCols.length)}
          ${totalMissing > 0 ? statRow("Missing cells", totalMissing.toLocaleString()) : ''}
          ${dataPrep.transforms.length > 0 ? statRow("Transforms", dataPrep.transforms.length) : ''}
        ` : ''}
      </div>
      <div class="panel-card">
        <h4>Columns (${cols.length})</h4>
        <div class="col-profile-list">${columnCards}</div>
      </div>
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
