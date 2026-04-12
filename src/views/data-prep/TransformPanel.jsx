import { useState, useCallback, useRef } from "react";
import { spcStore } from "../../store/spc-store.js";
import {
  ROW_OPS,
  COL_OPS,
  TRANSFORM_LABELS,
  transformSummary,
  applyTransform,
} from "./data-prep-utils.js";
import {
  previewTypeConversion,
  filterRows,
  findReplace,
  removeDuplicates,
  handleMissing,
  cleanText,
  renameColumn,
  changeColumnType,
  addCalculatedColumn,
  recodeValues,
  binColumn,
  splitColumn,
  concatColumns,
} from "../../data/data-prep-engine.js";
import {
  setPrepError,
  clearPrepTransforms,
  setActivePanel,
  closeActivePanel,
  addPrepTransform,
  setPrepTable,
  markPrepSaved,
  undoPrepTransform,
  updateColumnMeta,
} from "../../core/state/data-prep.js";
import { setColumns, setProfileCache } from "../../core/state/columns.js";
import { setDatasets } from "../../core/state/ui.js";
import {
  createDataset,
  fetchDatasets,
} from "../../data/api.js";
import { replayPrepTransforms } from "../../runtime/prep-runtime.js";

/* ── UtilityBar ──────────────────────────────────────────────────────── */

function UtilityBar({ dataPrep, datasets, columns }) {
  const count = dataPrep.transforms.length;
  const unsaved = dataPrep.unsavedChanges;
  const ds = datasets.find((d) => d.id === dataPrep.selectedDatasetId);
  const table = dataPrep.arqueroTable;
  const totalRows = table ? table.numRows() : dataPrep.datasetPoints.length;
  const cols = (columns || []).length;
  const excl = dataPrep.excludedRows.length;
  const resetting = dataPrep.confirmingReset;
  const resetTimerRef = useRef(null);

  const handleSave = useCallback(async () => {
    const state = spcStore.getState();
    if (!state.dataPrep.rawRows || !state.dataPrep.selectedDatasetId) return;
    try {
      await createDataset({
        name: `${state.datasets.find((d) => d.id === state.dataPrep.selectedDatasetId)?.name} (cleaned)`,
        columns: state.columnConfig.columns,
        rows: state.dataPrep.arqueroTable
          ? state.dataPrep.arqueroTable.objects().map((row) => {
              const out = {};
              for (const [key, rawValue] of Object.entries(row)) out[key] = rawValue != null ? String(rawValue) : "";
              return out;
            })
          : state.dataPrep.rawRows,
      });
      const dsList = await fetchDatasets();
      let next = setDatasets(spcStore.getState(), dsList);
      next = markPrepSaved(next);
      spcStore.setState(next);
    } catch (err) {
      spcStore.setState(setPrepError(spcStore.getState(), err.message));
    }
  }, []);

  const handleUndo = useCallback(() => {
    const state = spcStore.getState();
    if (state.dataPrep.transforms.length === 0) return;
    let next = undoPrepTransform(state);
    const replayed = replayPrepTransforms(next);
    if (replayed) {
      next = setPrepTable(next, replayed.table);
      next = setColumns(next, replayed.columns);
      next = setProfileCache(next, {});
      if (next.dataPrep.transforms.length === 0) next = markPrepSaved(next);
    }
    spcStore.setState(next);
  }, []);

  const handleExportCSV = useCallback(() => {
    const state = spcStore.getState();
    const exportTable = state.dataPrep.arqueroTable;
    const exportCols = state.columnConfig.columns || [];
    if (exportTable && exportCols.length > 0) {
      const header = exportCols.map((c) => c.name).join(",");
      const rows = exportTable.objects().map((row) =>
        exportCols.map((c) => {
          const rawValue = row[c.name];
          if (rawValue == null) return "";
          const stringValue = String(rawValue);
          return stringValue.includes(",") || stringValue.includes("\"") || stringValue.includes("\n")
            ? `"${stringValue.replace(/"/g, "\"\"")}"` : stringValue;
        }).join(",")
      );
      const csv = [header, ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const dataset = state.datasets.find((item) => item.id === state.dataPrep.selectedDatasetId);
      anchor.href = url;
      anchor.download = `${dataset?.name || "export"}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    }
  }, []);

  const handleValidate = useCallback(() => {
    spcStore.setState(setActivePanel(spcStore.getState(), "validate"));
  }, []);

  const handleReset = useCallback(() => {
    const state = spcStore.getState();
    if (state.dataPrep.transforms.length === 0) return;
    if (state.dataPrep.confirmingReset) {
      clearTimeout(resetTimerRef.current);
      let next = clearPrepTransforms(state);
      next = { ...next, dataPrep: { ...next.dataPrep, confirmingReset: false } };
      spcStore.setState(next);
    } else {
      const next = { ...state, dataPrep: { ...state.dataPrep, confirmingReset: true } };
      spcStore.setState(next);
      resetTimerRef.current = setTimeout(() => {
        const current = spcStore.getState();
        if (current.dataPrep.confirmingReset) {
          spcStore.setState({ ...current, dataPrep: { ...current.dataPrep, confirmingReset: false } });
        }
      }, 3000);
    }
  }, []);

  return (
    <div className="prep-menubar">
      <div className="prep-menubar-left">
        <div className="prep-ds-block">
          <span className="prep-ds-nameplate">
            {ds ? (
              <span className="prep-ds-nameplate-name">{ds.name}</span>
            ) : (
              <span className="prep-ds-nameplate-empty">No dataset selected</span>
            )}
          </span>
          <div className="prep-meta-strip">
            {unsaved && (
              <span className="prep-meta-chip prep-meta-chip--warn">Unsaved</span>
            )}
            {ds && totalRows > 0 && (
              <span className="prep-meta-chip">{totalRows.toLocaleString()} rows</span>
            )}
            {ds && totalRows > 0 && (
              <span className="prep-meta-chip">{cols} cols</span>
            )}
            {count > 0 && (
              <span className="prep-meta-chip">{count} transforms</span>
            )}
            {excl > 0 && (
              <span className="prep-meta-chip prep-meta-chip--warn">{excl} excluded</span>
            )}
          </div>
        </div>
      </div>
      <div className="prep-menubar-right">
        <div className="prep-menubar-actions">
          <button
            onClick={handleSave}
            type="button"
            className={`prep-mbtn prep-mbtn-primary${unsaved ? " prep-mbtn-primary-active" : ""}`}
            title="Save cleaned dataset"
          >
            Save
          </button>
          <button
            onClick={handleUndo}
            type="button"
            className="prep-mbtn"
            title="Undo last transform (Z)"
            disabled={count === 0}
          >
            Undo{count > 0 && <span className="prep-undo-badge">{count}</span>}
          </button>
          <button
            onClick={handleExportCSV}
            type="button"
            className="prep-mbtn prep-mbtn-quiet"
            title="Download current data as CSV"
            disabled={!ds}
          >
            Export
          </button>
          <button
            onClick={handleValidate}
            type="button"
            className="prep-mbtn prep-mbtn-quiet"
            title="Validate data quality rules"
          >
            Validate
          </button>
        </div>
        <div className="prep-menubar-dangerzone">
          <button
            onClick={handleReset}
            type="button"
            className={`prep-mbtn prep-mbtn-danger${resetting ? " prep-mbtn-danger-confirm" : ""}`}
            title="Discard all transforms and restore original data"
            disabled={count === 0}
          >
            {resetting ? "Confirm?" : "Reset"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── TransformToolbar ────────────────────────────────────────────────── */

function OpGroup({ label, groupClass, ops, activePanel, onSetPanel, onTrim }) {
  return (
    <div className={`prep-op-group prep-op-group--${groupClass}`}>
      <span className="prep-op-group-label">{label}</span>
      <div className="prep-op-group-actions" aria-label={`${label} operations`}>
        {ops.map((op) => (
          <button
            key={op.action}
            onClick={() => {
              if (op.panel) {
                onSetPanel(op.panel);
              } else if (op.action === "prep-trim") {
                onTrim();
              }
            }}
            type="button"
            className={`prep-op-tab${op.panel && activePanel === op.panel ? " active" : ""}`}
            title={op.key ? `${op.label} (${op.key})` : undefined}
          >
            {op.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TransformToolbar({ activePanel }) {
  const handleSetPanel = useCallback((panel) => {
    spcStore.setState(setActivePanel(spcStore.getState(), panel));
  }, []);

  const handleTrim = useCallback(() => {
    const state = spcStore.getState();
    const cols = state.columnConfig.columns.filter((c) => c.dtype === "text");
    if (cols.length === 0 || !state.dataPrep.arqueroTable) return;
    let table = state.dataPrep.arqueroTable;
    for (const column of cols) {
      try { table = cleanText(table, column.name, "trim"); } catch { /* skip */ }
    }
    let next = addPrepTransform(state, { type: "trim", params: { columns: cols.map((c) => c.name) } });
    next = setPrepTable(next, table);
    spcStore.setState(next);
  }, []);

  return (
    <div className="prep-transform-toolbar">
      <OpGroup label="Column" groupClass="column" ops={COL_OPS} activePanel={activePanel} onSetPanel={handleSetPanel} onTrim={handleTrim} />
      <OpGroup label="Row" groupClass="row" ops={ROW_OPS} activePanel={activePanel} onSetPanel={handleSetPanel} onTrim={handleTrim} />
    </div>
  );
}

/* ── PrepPanel ───────────────────────────────────────────────────────── */

function ColOptions({ cols }) {
  return cols.map((c) => (
    <option key={c.name} value={c.name}>
      {c.name}
    </option>
  ));
}

function PrepPanel({ dataPrep, columns }) {
  const ap = dataPrep.activePanel;
  const cols = columns || [];

  // Form state for visibility toggles
  const [filterOp, setFilterOp] = useState("eq");
  const [missingStrategy, setMissingStrategy] = useState("remove");
  const [recodeNewCol, setRecodeNewCol] = useState(false);
  const [binCustom, setBinCustom] = useState(false);
  const [validateType, setValidateType] = useState("range");
  const [recodeMappings, setRecodeMappings] = useState([{ old: "", new: "" }]);

  // Refs for form values
  const filterColRef = useRef(null);
  const filterValRef = useRef(null);
  const filterVal2Ref = useRef(null);
  const findColRef = useRef(null);
  const findSearchRef = useRef(null);
  const findReplaceRef = useRef(null);
  const findRegexRef = useRef(null);
  const missingColRef = useRef(null);
  const missingCustomRef = useRef(null);
  const renameColRef = useRef(null);
  const renameNewRef = useRef(null);
  const typeColRef = useRef(null);
  const typeTargetRef = useRef(null);
  const calcNameRef = useRef(null);
  const calcExprRef = useRef(null);
  const recodeColRef = useRef(null);
  const recodeNewNameRef = useRef(null);
  const binColRef = useRef(null);
  const binCountRef = useRef(null);
  const binBreaksRef = useRef(null);
  const binNameRef = useRef(null);
  const splitColRef = useRef(null);
  const splitDelimRef = useRef(null);
  const splitPartsRef = useRef(null);
  const concatSepRef = useRef(null);
  const concatNameRef = useRef(null);
  const validateColRef = useRef(null);
  const validateMinRef = useRef(null);
  const validateMaxRef = useRef(null);
  const validateValuesRef = useRef(null);
  const validatePatternRef = useRef(null);
  const dedupFormRef = useRef(null);
  const concatFormRef = useRef(null);

  if (!ap) return null;

  if (ap === "filter") {
    const showVal2 = filterOp === "between";
    const hideVal = filterOp === "is_null" || filterOp === "is_not_null";
    return (
      <div className="prep-panel">
        <span className="prep-panel-label">Column</span>
        <select ref={filterColRef}>
          <ColOptions cols={cols} />
        </select>
        <span className="prep-panel-label">Op</span>
        <select value={filterOp} onChange={(e) => setFilterOp(e.target.value)}>
          <option value="eq">=</option>
          <option value="neq">{"\u2260"}</option>
          <option value="gt">&gt;</option>
          <option value="lt">&lt;</option>
          <option value="gte">{"\u2265"}</option>
          <option value="lte">{"\u2264"}</option>
          <option value="contains">contains</option>
          <option value="not_contains">excludes</option>
          <option value="between">between</option>
          <option value="is_null">is null</option>
          <option value="is_not_null">not null</option>
        </select>
        {!hideVal && <input type="text" ref={filterValRef} placeholder="value" />}
        {showVal2 && <input type="text" ref={filterVal2Ref} placeholder="max" />}
        <button
          onClick={() => {
            const column = filterColRef.current?.value;
            const operator = filterOp;
            const val = filterValRef.current?.value;
            const val2 = filterVal2Ref.current?.value;
            if (!column || !operator) return;
            const filterVal = operator === "between" ? [val, val2] : (operator === "is_null" || operator === "is_not_null") ? null : val;
            applyTransform((state) => ({
              table: filterRows(state.dataPrep.arqueroTable, column, operator, filterVal),
              transform: { type: "filter", params: { column, operator, value: filterVal } },
            }));
          }}
          type="button"
          className="prep-panel-apply"
        >
          Apply
        </button>
      </div>
    );
  }

  if (ap === "find") {
    return (
      <div className="prep-panel">
        <span className="prep-panel-label">Column</span>
        <select ref={findColRef}>
          <option value="__all__">All columns</option>
          <ColOptions cols={cols} />
        </select>
        <span className="prep-panel-label">Find</span>
        <input type="text" ref={findSearchRef} placeholder="search" />
        <span className="prep-panel-label">Replace</span>
        <input type="text" ref={findReplaceRef} placeholder="replace with" />
        <label className="prep-panel-check">
          <input type="checkbox" ref={findRegexRef} /> Regex
        </label>
        <button
          onClick={() => {
            const column = findColRef.current?.value;
            const search = findSearchRef.current?.value;
            const replace = findReplaceRef.current?.value ?? "";
            const useRegex = findRegexRef.current?.checked || false;
            if (!search) return;
            applyTransform((state) => {
              let table = state.dataPrep.arqueroTable;
              if (column === "__all__") {
                for (const col of table.columnNames()) {
                  try { table = findReplace(table, col, search, replace, useRegex); } catch { /* skip */ }
                }
              } else {
                table = findReplace(table, column, search, replace, useRegex);
              }
              return {
                table,
                transform: { type: "find_replace", params: { column, find: search, replace, useRegex } },
              };
            });
          }}
          type="button"
          className="prep-panel-apply"
        >
          Replace All
        </button>
      </div>
    );
  }

  if (ap === "dedup") {
    return (
      <div className="prep-panel" ref={dedupFormRef}>
        <span className="prep-panel-label">Key columns</span>
        {cols.map((c) => (
          <label key={c.name} className="prep-panel-check">
            <input type="checkbox" value={c.name} defaultChecked className="dedup-col-check" /> {c.name}
          </label>
        ))}
        <div className="prep-panel-sep" />
        <button
          onClick={() => {
            const checkboxes = dedupFormRef.current?.querySelectorAll(".dedup-col-check:checked") || [];
            const selectedColumns = [...checkboxes].map((el) => el.value);
            if (selectedColumns.length === 0) return;
            applyTransform((state) => ({
              table: removeDuplicates(state.dataPrep.arqueroTable, selectedColumns),
              transform: { type: "dedup", params: { keyColumns: selectedColumns } },
            }));
          }}
          type="button"
          className="prep-panel-apply"
        >
          Remove Duplicates
        </button>
      </div>
    );
  }

  if (ap === "missing") {
    return (
      <div className="prep-panel">
        <span className="prep-panel-label">Column</span>
        <select ref={missingColRef}>
          <ColOptions cols={cols} />
        </select>
        <span className="prep-panel-label">Strategy</span>
        <select value={missingStrategy} onChange={(e) => setMissingStrategy(e.target.value)}>
          <option value="remove">Remove rows</option>
          <option value="fill_mean">Fill with mean</option>
          <option value="fill_median">Fill with median</option>
          <option value="fill_zero">Fill with zero</option>
          <option value="fill_custom">Fill with value</option>
          <option value="fill_down">Fill down</option>
          <option value="fill_up">Fill up</option>
        </select>
        {missingStrategy === "fill_custom" && (
          <input type="text" ref={missingCustomRef} placeholder="custom value" />
        )}
        <button
          onClick={() => {
            const column = missingColRef.current?.value;
            const strategy = missingStrategy;
            const customValue = missingCustomRef.current?.value || null;
            if (!column || !strategy) return;
            applyTransform((state) => ({
              table: handleMissing(state.dataPrep.arqueroTable, column, strategy, customValue),
              transform: { type: "missing", params: { column, strategy, customValue } },
            }));
          }}
          type="button"
          className="prep-panel-apply"
        >
          Apply
        </button>
      </div>
    );
  }

  /* Phase 2 panels */

  if (ap === "rename") {
    return (
      <div className="prep-panel">
        <span className="prep-panel-label">Column</span>
        <select ref={renameColRef}>
          <ColOptions cols={cols} />
        </select>
        <span className="prep-panel-label">New name</span>
        <input type="text" ref={renameNewRef} placeholder="new column name" />
        <button
          onClick={() => {
            const oldName = renameColRef.current?.value;
            const newName = renameNewRef.current?.value?.trim();
            if (!oldName || !newName) return;
            const state = spcStore.getState();
            const existing = state.columnConfig.columns.map((c) => c.name);
            if (existing.includes(newName)) {
              spcStore.setState(setPrepError(state, `Column "${newName}" already exists`));
              return;
            }
            applyTransform((s) => ({
              table: renameColumn(s.dataPrep.arqueroTable, oldName, newName),
              transform: { type: "rename", params: { oldName, newName } },
              meta: { updateCol: { name: oldName, updates: { name: newName } } },
            }));
          }}
          type="button"
          className="prep-panel-apply"
        >
          Rename
        </button>
      </div>
    );
  }

  if (ap === "change_type") {
    let previewHtml = null;
    if (dataPrep.arqueroTable && cols.length > 0) {
      const firstCol = cols[0].name;
      const firstTarget = cols[0].dtype === "numeric" ? "text" : "numeric";
      const pv = previewTypeConversion(dataPrep.arqueroTable, firstCol, firstTarget);
      previewHtml = (
        <span className="prep-preview-badge">
          {pv.convertible}/{pv.total} convertible
        </span>
      );
    }
    return (
      <div className="prep-panel">
        <span className="prep-panel-label">Column</span>
        <select ref={typeColRef}>
          <ColOptions cols={cols} />
        </select>
        <span className="prep-panel-label">Convert to</span>
        <select ref={typeTargetRef}>
          <option value="numeric">Numeric</option>
          <option value="text">Text</option>
        </select>
        {previewHtml}
        <button
          onClick={() => {
            const column = typeColRef.current?.value;
            const targetType = typeTargetRef.current?.value;
            if (!column || !targetType) return;
            applyTransform((state) => ({
              table: changeColumnType(state.dataPrep.arqueroTable, column, targetType),
              transform: { type: "change_type", params: { column, targetType } },
              meta: { updateCol: { name: column, updates: { dtype: targetType } } },
            }));
          }}
          type="button"
          className="prep-panel-apply"
        >
          Convert
        </button>
      </div>
    );
  }

  if (ap === "calculated") {
    return (
      <div className="prep-panel">
        <span className="prep-panel-label">Name</span>
        <input
          type="text"
          ref={calcNameRef}
          placeholder="new_column"
          style={{ width: "100px" }}
        />
        <span className="prep-panel-label">Expression</span>
        <input
          type="text"
          ref={calcExprRef}
          placeholder="[Thickness] * 25.4"
          style={{ minWidth: "200px" }}
        />
        <button
          onClick={() => {
            const newColName = calcNameRef.current?.value?.trim();
            const expression = calcExprRef.current?.value?.trim();
            if (!newColName || !expression) return;
            const state = spcStore.getState();
            const columns = state.columnConfig.columns.map((c) => c.name);
            if (columns.includes(newColName)) {
              spcStore.setState(setPrepError(state, `Column "${newColName}" already exists`));
              return;
            }
            applyTransform((s) => ({
              table: addCalculatedColumn(s.dataPrep.arqueroTable, newColName, expression, columns),
              transform: { type: "calculated", params: { newColName, expression, columns } },
              meta: { addCols: [{ name: newColName, dtype: "numeric" }] },
            }));
          }}
          type="button"
          className="prep-panel-apply"
        >
          Create
        </button>
        <span className="prep-hint">
          Columns: [Name] Functions: round, abs, log, sqrt, pow, min, max
        </span>
      </div>
    );
  }

  if (ap === "recode") {
    return (
      <div className="prep-panel" style={{ flexDirection: "column", alignItems: "stretch" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span className="prep-panel-label">Column</span>
          <select ref={recodeColRef}>
            <ColOptions cols={cols} />
          </select>
          <label className="prep-panel-check">
            <input type="checkbox" checked={recodeNewCol} onChange={(e) => setRecodeNewCol(e.target.checked)} /> Save as new column
          </label>
          {recodeNewCol && (
            <input
              type="text"
              ref={recodeNewNameRef}
              placeholder="new column name"
              style={{ width: "120px" }}
            />
          )}
          <button
            onClick={() => {
              const column = recodeColRef.current?.value;
              const asNew = recodeNewCol;
              const newColName = asNew ? recodeNewNameRef.current?.value?.trim() : null;
              if (!column || (asNew && !newColName)) return;
              const mapping = {};
              for (const m of recodeMappings) {
                if (m.old != null && m.old !== "") mapping[m.old] = m.new ?? "";
              }
              if (Object.keys(mapping).length === 0) return;
              applyTransform((state) => ({
                table: recodeValues(state.dataPrep.arqueroTable, column, mapping, newColName),
                transform: { type: "recode", params: { column, mapping, newColName } },
                meta: newColName ? { addCols: [{ name: newColName, dtype: "text" }] } : undefined,
              }));
            }}
            type="button"
            className="prep-panel-apply"
          >
            Recode
          </button>
        </div>
        <div className="prep-mapping-rows">
          {recodeMappings.map((m, i) => (
            <div key={i} className="prep-mapping-row">
              <input
                type="text"
                placeholder="old value"
                value={m.old}
                onChange={(e) => {
                  const updated = [...recodeMappings];
                  updated[i] = { ...updated[i], old: e.target.value };
                  setRecodeMappings(updated);
                }}
              />
              <span className="prep-panel-label">{"\u2192"}</span>
              <input
                type="text"
                placeholder="new value"
                value={m.new}
                onChange={(e) => {
                  const updated = [...recodeMappings];
                  updated[i] = { ...updated[i], new: e.target.value };
                  setRecodeMappings(updated);
                }}
              />
            </div>
          ))}
        </div>
        <button
          onClick={() => setRecodeMappings([...recodeMappings, { old: "", new: "" }])}
          type="button"
          className="prep-mapping-add"
        >
          + Add mapping
        </button>
      </div>
    );
  }

  if (ap === "bin") {
    const numericOpts = cols.filter((c) => c.dtype === "numeric");
    const binCols = numericOpts.length > 0 ? numericOpts : cols;
    return (
      <div className="prep-panel">
        <span className="prep-panel-label">Column</span>
        <select ref={binColRef}>
          <ColOptions cols={binCols} />
        </select>
        <span className="prep-panel-label">Bins</span>
        <input
          type="number"
          ref={binCountRef}
          defaultValue="5"
          min="2"
          max="100"
          style={{ width: "50px" }}
        />
        <label className="prep-panel-check">
          <input type="checkbox" checked={binCustom} onChange={(e) => setBinCustom(e.target.checked)} /> Custom breaks
        </label>
        {binCustom && (
          <input
            type="text"
            ref={binBreaksRef}
            placeholder="10, 20, 30"
            style={{ minWidth: "120px" }}
          />
        )}
        <span className="prep-panel-label">Name</span>
        <input
          type="text"
          ref={binNameRef}
          placeholder="binned_col"
          style={{ width: "100px" }}
        />
        <button
          onClick={() => {
            const column = binColRef.current?.value;
            const binCount = parseInt(binCountRef.current?.value || "5", 10);
            const useCustom = binCustom;
            const newColName = binNameRef.current?.value?.trim() || `${column}_binned`;
            let customBreaks = null;
            if (useCustom) {
              const breaksStr = binBreaksRef.current?.value || "";
              customBreaks = breaksStr.split(",").map((p) => parseFloat(p.trim())).filter((n) => !isNaN(n)).sort((a, b) => a - b);
              if (customBreaks.length === 0) {
                spcStore.setState(setPrepError(spcStore.getState(), "Enter valid break values"));
                return;
              }
            }
            if (!column) return;
            applyTransform((state) => ({
              table: binColumn(state.dataPrep.arqueroTable, column, binCount, newColName, customBreaks),
              transform: { type: "bin", params: { column, binCount, newColName, customBreaks } },
              meta: { addCols: [{ name: newColName, dtype: "text" }] },
            }));
          }}
          type="button"
          className="prep-panel-apply"
        >
          Bin
        </button>
      </div>
    );
  }

  if (ap === "split") {
    return (
      <div className="prep-panel">
        <span className="prep-panel-label">Column</span>
        <select ref={splitColRef}>
          <ColOptions cols={cols} />
        </select>
        <span className="prep-panel-label">Delimiter</span>
        <input
          type="text"
          ref={splitDelimRef}
          defaultValue=","
          style={{ width: "40px" }}
        />
        <span className="prep-panel-label">Parts</span>
        <input
          type="number"
          ref={splitPartsRef}
          defaultValue="2"
          min="2"
          max="10"
          style={{ width: "50px" }}
        />
        <button
          onClick={() => {
            const column = splitColRef.current?.value;
            const delimiter = splitDelimRef.current?.value || ",";
            const maxParts = parseInt(splitPartsRef.current?.value || "2", 10);
            if (!column) return;
            applyTransform((state) => {
              const table = splitColumn(state.dataPrep.arqueroTable, column, delimiter, maxParts);
              const newCols = Array.from({ length: maxParts }, (_, i) => ({ name: `${column}_${i + 1}`, dtype: "text" }));
              return {
                table,
                transform: { type: "split", params: { column, delimiter, maxParts } },
                meta: { addCols: newCols },
              };
            });
          }}
          type="button"
          className="prep-panel-apply"
        >
          Split
        </button>
      </div>
    );
  }

  if (ap === "concat") {
    return (
      <div className="prep-panel" ref={concatFormRef}>
        <span className="prep-panel-label">Columns</span>
        {cols.map((c) => (
          <label key={c.name} className="prep-panel-check">
            <input type="checkbox" value={c.name} className="concat-col-check" /> {c.name}
          </label>
        ))}
        <div className="prep-panel-sep" />
        <span className="prep-panel-label">Separator</span>
        <input
          type="text"
          ref={concatSepRef}
          defaultValue=" "
          style={{ width: "40px" }}
        />
        <span className="prep-panel-label">Name</span>
        <input
          type="text"
          ref={concatNameRef}
          placeholder="combined"
          style={{ width: "100px" }}
        />
        <button
          onClick={() => {
            const checkboxes = concatFormRef.current?.querySelectorAll(".concat-col-check:checked") || [];
            const columns = [...checkboxes].map((el) => el.value);
            const separator = concatSepRef.current?.value ?? " ";
            const newColName = concatNameRef.current?.value?.trim() || "combined";
            if (columns.length < 2) return;
            applyTransform((state) => ({
              table: concatColumns(state.dataPrep.arqueroTable, columns, separator, newColName),
              transform: { type: "concat", params: { columns, separator, newColName } },
              meta: { addCols: [{ name: newColName, dtype: "text" }] },
            }));
          }}
          type="button"
          className="prep-panel-apply"
        >
          Concat
        </button>
      </div>
    );
  }

  /* Phase 3 panels */

  if (ap === "validate") {
    return (
      <div className="prep-panel">
        <span className="prep-panel-label">Column</span>
        <select ref={validateColRef}>
          <ColOptions cols={cols} />
        </select>
        <span className="prep-panel-label">Rule</span>
        <select value={validateType} onChange={(e) => setValidateType(e.target.value)}>
          <option value="range">Range (min&ndash;max)</option>
          <option value="allowed">Allowed values</option>
          <option value="regex">Regex pattern</option>
        </select>
        {validateType === "range" && (
          <>
            <input type="number" ref={validateMinRef} placeholder="min" style={{ width: "60px" }} />
            <input type="number" ref={validateMaxRef} placeholder="max" style={{ width: "60px" }} />
          </>
        )}
        {validateType === "allowed" && (
          <input type="text" ref={validateValuesRef} placeholder="a, b, c" style={{ minWidth: "120px" }} />
        )}
        {validateType === "regex" && (
          <input type="text" ref={validatePatternRef} placeholder="^[A-Z]+" style={{ minWidth: "120px" }} />
        )}
        <button
          onClick={() => {
            const column = validateColRef.current?.value;
            const type = validateType;
            if (!column || !type) return;
            let rule;
            if (type === "range") {
              const min = validateMinRef.current?.value;
              const max = validateMaxRef.current?.value;
              rule = { type: "range", min: min !== "" ? Number(min) : null, max: max !== "" ? Number(max) : null };
            } else if (type === "allowed") {
              const values = (validateValuesRef.current?.value || "").split(",").map((p) => p.trim()).filter(Boolean);
              rule = { type: "allowed", values };
            } else if (type === "regex") {
              rule = { type: "regex", pattern: validatePatternRef.current?.value || "" };
            }
            if (rule) {
              const state = spcStore.getState();
              let next = updateColumnMeta(state, column, { validation: rule });
              next = closeActivePanel(next);
              spcStore.setState(next);
            }
          }}
          type="button"
          className="prep-panel-apply"
        >
          Apply
        </button>
        <button
          onClick={() => {
            const column = validateColRef.current?.value;
            if (column) {
              const state = spcStore.getState();
              let next = updateColumnMeta(state, column, { validation: null });
              next = closeActivePanel(next);
              spcStore.setState(next);
            }
          }}
          type="button"
          className="prep-tool-btn"
          title="Clear validation rule for selected column"
        >
          Clear
        </button>
      </div>
    );
  }

  return null;
}

/* ── TransformLedger ─────────────────────────────────────────────────── */

function TransformLedger({ transforms }) {
  if (transforms.length === 0) return null;

  const handleUndo = useCallback(() => {
    const state = spcStore.getState();
    if (state.dataPrep.transforms.length === 0) return;
    let next = undoPrepTransform(state);
    const replayed = replayPrepTransforms(next);
    if (replayed) {
      next = setPrepTable(next, replayed.table);
      next = setColumns(next, replayed.columns);
      next = setProfileCache(next, {});
      if (next.dataPrep.transforms.length === 0) next = markPrepSaved(next);
    }
    spcStore.setState(next);
  }, []);

  return (
    <div className="prep-ledger">
      {transforms.map((tr, i) => {
        const label = TRANSFORM_LABELS[tr.type] || tr.type;
        const detail = transformSummary(tr);
        const isLast = i === transforms.length - 1;
        return (
          <div key={i} className={`ledger-step${isLast ? " ledger-step-last" : ""}`}>
            <span className="ledger-step-idx">{i + 1}</span>
            <span className="ledger-step-type">{label}</span>
            {detail && <span className="ledger-step-detail">{detail}</span>}
            {isLast && (
              <button
                className="ledger-undo"
                onClick={handleUndo}
                type="button"
                title="Undo last"
              >
                &times;
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── TransformPanel (default export) ─────────────────────────────────── */

export default function TransformPanel({ dataPrep, columns, datasets }) {
  if (!dataPrep.selectedDatasetId || dataPrep.loading || dataPrep.error) return null;
  return (
    <>
      <UtilityBar dataPrep={dataPrep} datasets={datasets} columns={columns} />
      <TransformToolbar activePanel={dataPrep.activePanel} />
      <PrepPanel dataPrep={dataPrep} columns={columns} />
      <TransformLedger transforms={dataPrep.transforms} />
    </>
  );
}
