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
  { action: 'prep-filter',       label: 'Filter',  short: 'Flt', panel: 'filter', key: 'F' },
  { action: 'prep-find-replace', label: 'Find',    short: 'Fnd', panel: 'find', key: 'D' },
  { action: 'prep-dedup',        label: 'Dedup',   short: 'Dup', panel: 'dedup' },
  { action: 'prep-missing',      label: 'Missing', short: 'Miss', panel: 'missing' },
  { action: 'prep-trim',         label: 'Trim',    short: 'Trm', panel: null },
];

const COL_OPS = [
  { action: 'prep-rename',      label: 'Rename',  panel: 'rename', key: 'R' },
  { action: 'prep-change-type', label: 'Type',    panel: 'change_type', key: 'T' },
  { action: 'prep-calc',        label: 'Calc',    panel: 'calculated', key: 'C' },
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
  const resetting = dataPrep.confirmingReset;

  return `
    <div class="prep-menubar">
      <div class="prep-menubar-left">
        <div class="prep-ds-block">
          <span class="prep-ds-nameplate">
            ${ds
              ? `<span class="prep-ds-nameplate-name">${ds.name}</span>`
              : `<span class="prep-ds-nameplate-empty">No dataset selected</span>`}
          </span>
          <div class="prep-meta-strip">
            ${unsaved ? `<span class="prep-meta-chip prep-meta-chip--warn">Unsaved</span>` : ''}
            ${ds && totalRows > 0 ? `<span class="prep-meta-chip">${totalRows.toLocaleString()} rows</span>` : ''}
            ${ds && totalRows > 0 ? `<span class="prep-meta-chip">${cols} cols</span>` : ''}
            ${count > 0 ? `<span class="prep-meta-chip">${count} transforms</span>` : ''}
            ${excl > 0 ? `<span class="prep-meta-chip prep-meta-chip--warn">${excl} excluded</span>` : ''}
          </div>
        </div>
      </div>
      <div class="prep-menubar-right">
        <div class="prep-menubar-actions">
          <button data-action="prep-save" type="button"
            class="prep-mbtn prep-mbtn-primary${unsaved ? ' prep-mbtn-primary-active' : ''}"
            title="Save cleaned dataset">Save</button>
          <button data-action="prep-undo" type="button"
            class="prep-mbtn" title="Undo last transform (Z)"
            ${count === 0 ? 'disabled' : ''}>Undo${count > 0 ? `<span class="prep-undo-badge">${count}</span>` : ''}</button>
          <button data-action="prep-export-csv" type="button"
            class="prep-mbtn prep-mbtn-quiet" title="Download current data as CSV"
            ${!ds ? 'disabled' : ''}>Export</button>
          <button data-action="prep-validate" type="button"
            class="prep-mbtn prep-mbtn-quiet" title="Validate data quality rules">Validate</button>
        </div>
        <div class="prep-menubar-dangerzone">
          <button data-action="prep-reset" type="button"
            class="prep-mbtn prep-mbtn-danger${resetting ? ' prep-mbtn-danger-confirm' : ''}" title="Discard all transforms and restore original data"
            ${count === 0 ? 'disabled' : ''}>${resetting ? 'Confirm?' : 'Reset'}</button>
        </div>
      </div>
    </div>`;
}

function renderTransformToolbar(state) {
  const ap = state.dataPrep.activePanel;
  const renderGroup = (label, groupClass, ops) => `
      <div class="prep-op-group prep-op-group--${groupClass}">
        <span class="prep-op-group-label">${label}</span>
        <div class="prep-op-group-actions" aria-label="${label} operations">
          ${ops.map(op => `
            <button data-action="${op.action}" type="button"
              class="prep-op-tab${op.panel && ap === op.panel ? ' active' : ''}"
              ${op.key ? `title="${op.label} (${op.key})"` : ''}>${op.label}</button>
          `).join('')}
        </div>
      </div>`;

  return `
    <div class="prep-transform-toolbar">
      ${renderGroup('Column', 'column', COL_OPS)}
      ${renderGroup('Row', 'row', ROW_OPS)}
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
  const visibleRows = displayRows.slice(0, 500);
  const visibleIndices = visibleRows.map((_, idx) => idx);
  const selectedVisibleCount = visibleIndices.reduce((sum, idx) => sum + (excludedSet.has(idx) ? 0 : 1), 0);
  const allVisibleSelected = visibleRows.length > 0 && selectedVisibleCount === visibleRows.length;
  const partiallySelected = selectedVisibleCount > 0 && selectedVisibleCount < visibleRows.length;

  const rows = visibleRows.map((raw, idx) => {
    const isExcluded = excludedSet.has(idx);
    const cells = cols.map(c => {
      const v = raw[c.name];
      const invalid = validationMap.get(c.name)?.has(idx);
      const isColSel = c.name === selectedCol;
      return `<td class="mono${invalid ? ' cell-invalid' : ''}${isColSel ? ' col-selected' : ''}">${v != null ? v : "\u2014"}</td>`;
    }).join("");
    return `<tr class="${isExcluded ? 'row-excluded' : ''}" data-row-idx="${idx}">
      <td class="prep-row-select-cell">
        <span class="prep-row-index mono" aria-hidden="true">${idx + 1}</span>
        <button class="prep-row-toggle${!isExcluded ? ' is-selected' : ''}" data-action="toggle-row-exclude" data-row="${idx}" type="button" aria-pressed="${!isExcluded ? 'true' : 'false'}" aria-label="${!isExcluded ? `Keep row ${idx + 1}` : `Exclude row ${idx + 1}`}" title="${!isExcluded ? 'Keep row' : 'Exclude row'}">
          <span class="prep-row-checkbox" aria-hidden="true"></span>
        </button>
      </td>
      ${cells}
    </tr>`;
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
            <th class="prep-row-select-head">
              <button class="prep-master-checkbox${allVisibleSelected ? ' is-selected' : ''}${partiallySelected ? ' is-mixed' : ''}" data-action="prep-toggle-all-visible-rows" type="button" aria-pressed="${allVisibleSelected ? 'true' : 'false'}" title="${allVisibleSelected ? 'Exclude visible rows' : 'Keep visible rows'}">
                <span class="prep-row-checkbox" aria-hidden="true"></span>
                <span class="prep-row-select-meta">${selectedVisibleCount}/${visibleRows.length}</span>
              </button>
            </th>
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

  const fmtMini = v => {
    if (v == null) return '\u2014';
    const abs = Math.abs(v);
    if (abs >= 1000 || (abs > 0 && abs < 0.01)) return v.toExponential(1);
    if (abs >= 100) return v.toFixed(0);
    if (abs >= 10) return v.toFixed(1);
    return v.toFixed(2);
  };

  let distribution = '';
  let statsLine = '';

  if (dtype === 'numeric' && profile.histogram?.length > 0) {
    const bars = profile.histogram.map(h =>
      `<span class="th-hist-bar" style="height:${Math.max(h * 100, 4)}%"></span>`
    ).join('');
    distribution = `
      <div class="th-mini-hist-wrap">
        <div class="th-mini-hist">${bars}</div>
        <div class="th-mini-axis">
          <span>${fmtMini(profile.min)}</span>
          <span>${fmtMini(profile.max)}</span>
        </div>
      </div>`;
    statsLine = `<div class="th-mini-stats">med ${fmtMini(profile.median)} \u00b7 \u03c3 ${fmtMini(profile.std)}</div>`;
  } else if (dtype !== 'numeric' && profile.topValues?.length > 0) {
    const maxCount = profile.topValues[0]?.count || 0;
    const cells = Array.from({ length: 10 }, (_, i) => {
      const count = profile.topValues[i]?.count || 0;
      const intensity = maxCount > 0 ? count / maxCount : 0;
      return `<span class="th-heat-cell${count === 0 ? ' is-empty' : ''}" style="--heat-alpha:${(0.16 + intensity * 0.72).toFixed(3)}"></span>`;
    }).join('');
    distribution = `<div class="th-mini-heatmap">${cells}</div>`;
    statsLine = `<div class="th-mini-stats">${profile.distinct} distinct${profile.minLength != null ? ` \u00b7 len ${profile.minLength}\u2013${profile.maxLength}` : ''}</div>`;
  }

  if (!distribution) return '';

  const completePct = profile.count > 0 ? ((profile.count - profile.missing) / profile.count * 100).toFixed(0) : 0;
  const completeness = profile.missing > 0
    ? `<div class="th-mini-complete"><div class="th-mini-complete-fill" style="width:${completePct}%"></div></div>`
    : '';

  return `<div class="th-profile">${completeness}${distribution}${statsLine}</div>`;
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

function renderPrepSidePanel(state) {
  const { dataPrep, datasets, columnConfig } = state;
  const ds = datasets.find(d => d.id === dataPrep.selectedDatasetId);
  if (!ds) {
    return '<div class="prep-sidepanel"><div class="panel-card"><p class="muted" style="font-size:11px;">Select a dataset to see details.</p></div></div>';
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

  let panel = '';
  if (selectedCol) {
    const c = cols.find(col => col.name === selectedCol);
    if (c && cache[c.name]) {
      panel = renderDetailedProfile(c, cache[c.name], roleLabels);
    }
  }

  const totalRows = table ? table.numRows() : dataPrep.datasetPoints.length;
  const numCols = cols.filter(c => c.dtype === 'numeric');
  const textCols = cols.filter(c => c.dtype !== 'numeric');
  const totalMissing = Object.values(cache).reduce((sum, p) => sum + (p.missing || 0), 0);

  if (!panel) {
    panel = `
      <div class="panel-card prep-summary-panel">
        <h4>Summary</h4>
        <div class="prep-summary-grid">
          <div class="prep-summary-stat">
            <span class="prep-summary-label">Rows</span>
            <strong class="prep-summary-value">${totalRows.toLocaleString()}</strong>
          </div>
          <div class="prep-summary-stat">
            <span class="prep-summary-label">Columns</span>
            <strong class="prep-summary-value">${cols.length}</strong>
          </div>
          <div class="prep-summary-stat">
            <span class="prep-summary-label">Numeric</span>
            <strong class="prep-summary-value">${numCols.length}</strong>
          </div>
          <div class="prep-summary-stat">
            <span class="prep-summary-label">Text</span>
            <strong class="prep-summary-value">${textCols.length}</strong>
          </div>
          <div class="prep-summary-stat">
            <span class="prep-summary-label">Missing</span>
            <strong class="prep-summary-value">${totalMissing.toLocaleString()}</strong>
          </div>
          <div class="prep-summary-stat">
            <span class="prep-summary-label">Transforms</span>
            <strong class="prep-summary-value">${dataPrep.transforms.length}</strong>
          </div>
        </div>
      </div>`;
  }

  return `
    <div class="prep-sidepanel">
      ${panel}
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
        ${renderPrepSidePanel(state)}
      </div>
    </section>
  `;
}
