import React, { useState, useCallback, useRef } from "react";
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
import type { FilterOperator, MissingStrategy, ColumnDtype } from "../../data/data-prep-engine.js";
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
import type { DataPrepState, SPCState } from "../../types/state.js";
import type { ColumnOut } from "../../types/api.js";
import type { ColumnTable } from "arquero";

/* ── Shared interfaces ──────────────────────────────── */

interface ColumnInfo {
  name: string;
  ordinal: number;
  dtype: string;
  role: string | null;
}

interface DatasetItem {
  id: string;
  name: string;
}

interface TransformRecord {
  type: string;
  params: Record<string, unknown>;
}

interface OpDef {
  action: string;
  label: string;
  panel: string | null;
  key?: string;
  short?: string;
}

/* ── UtilityBar ──────────────────────────────────────────────────────── */

interface UtilityBarProps {
  dataPrep: DataPrepState;
  datasets: DatasetItem[];
  columns: ColumnInfo[];
}

function UtilityBar({ dataPrep, datasets, columns }: UtilityBarProps): React.JSX.Element {
  const count: number = dataPrep.transforms.length;
  const unsaved: boolean = dataPrep.unsavedChanges;
  const ds: DatasetItem | undefined = datasets.find((d: DatasetItem) => d.id === dataPrep.selectedDatasetId);
  const table = dataPrep.arqueroTable as ColumnTable | null;
  const totalRows: number = table ? table.numRows() : dataPrep.datasetPoints.length;
  const cols: number = (columns || []).length;
  const excl: number = dataPrep.excludedRows.length;
  const resetting: boolean = dataPrep.confirmingReset;
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSave = useCallback(async (): Promise<void> => {
    const state: SPCState = spcStore.getState();
    if (!state.dataPrep.rawRows || !state.dataPrep.selectedDatasetId) return;
    try {
      await createDataset({
        name: `${(state.datasets as unknown as DatasetItem[]).find((d: DatasetItem) => d.id === state.dataPrep.selectedDatasetId)?.name} (cleaned)`,
        columns: state.columnConfig.columns as unknown as ColumnOut[],
        rows: state.dataPrep.arqueroTable
          ? ((state.dataPrep.arqueroTable as ColumnTable).objects() as Record<string, unknown>[]).map((row: Record<string, unknown>) => {
              const out: Record<string, string> = {};
              for (const [key, rawValue] of Object.entries(row)) out[key] = rawValue != null ? String(rawValue) : "";
              return out;
            })
          : state.dataPrep.rawRows as Record<string, string>[],
      });
      const dsList = await fetchDatasets();
      let next = setDatasets(spcStore.getState(), dsList as unknown as Array<{ id: string; name: string }>);
      next = markPrepSaved(next);
      spcStore.setState(next);
    } catch (err: unknown) {
      spcStore.setState(setPrepError(spcStore.getState(), (err as Error).message));
    }
  }, []);

  const handleUndo = useCallback((): void => {
    const state: SPCState = spcStore.getState();
    if (state.dataPrep.transforms.length === 0) return;
    let next = undoPrepTransform(state);
    const replayed = replayPrepTransforms(next) as { table: ColumnTable; columns: ColumnOut[] } | null;
    if (replayed) {
      next = setPrepTable(next, replayed.table);
      next = setColumns(next, replayed.columns);
      next = setProfileCache(next, {});
      if (next.dataPrep.transforms.length === 0) next = markPrepSaved(next);
    }
    spcStore.setState(next);
  }, []);

  const handleExportCSV = useCallback((): void => {
    const state: SPCState = spcStore.getState();
    const exportTable = state.dataPrep.arqueroTable as ColumnTable | null;
    const exportCols: ColumnInfo[] = state.columnConfig.columns || [];
    if (exportTable && exportCols.length > 0) {
      const header: string = exportCols.map((c: ColumnInfo) => c.name).join(",");
      const rows: string[] = (exportTable.objects() as Record<string, unknown>[]).map((row: Record<string, unknown>) =>
        exportCols.map((c: ColumnInfo) => {
          const rawValue: unknown = row[c.name];
          if (rawValue == null) return "";
          const stringValue: string = String(rawValue);
          return stringValue.includes(",") || stringValue.includes("\"") || stringValue.includes("\n")
            ? `"${stringValue.replace(/"/g, "\"\"")}"` : stringValue;
        }).join(",")
      );
      const csv: string = [header, ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url: string = URL.createObjectURL(blob);
      const anchor: HTMLAnchorElement = document.createElement("a");
      const dataset: DatasetItem | undefined = state.datasets.find((item: DatasetItem) => item.id === state.dataPrep.selectedDatasetId);
      anchor.href = url;
      anchor.download = `${dataset?.name || "export"}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    }
  }, []);

  const handleValidate = useCallback((): void => {
    spcStore.setState(setActivePanel(spcStore.getState(), "validate"));
  }, []);

  const handleReset = useCallback((): void => {
    const state: SPCState = spcStore.getState();
    if (state.dataPrep.transforms.length === 0) return;
    if (state.dataPrep.confirmingReset) {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      let next = clearPrepTransforms(state);
      next = { ...next, dataPrep: { ...next.dataPrep, confirmingReset: false } };
      spcStore.setState(next);
    } else {
      const next: SPCState = { ...state, dataPrep: { ...state.dataPrep, confirmingReset: true } };
      spcStore.setState(next);
      resetTimerRef.current = setTimeout(() => {
        const current: SPCState = spcStore.getState();
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

interface OpGroupProps {
  label: string;
  groupClass: string;
  ops: OpDef[];
  activePanel: string | null;
  onSetPanel: (panel: string) => void;
  onTrim: () => void;
}

function OpGroup({ label, groupClass, ops, activePanel, onSetPanel, onTrim }: OpGroupProps): React.JSX.Element {
  return (
    <div className={`prep-op-group prep-op-group--${groupClass}`}>
      <span className="prep-op-group-label">{label}</span>
      <div className="prep-op-group-actions" aria-label={`${label} operations`}>
        {ops.map((op: OpDef) => (
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

interface TransformToolbarProps {
  activePanel: string | null;
}

function TransformToolbar({ activePanel }: TransformToolbarProps): React.JSX.Element {
  const handleSetPanel = useCallback((panel: string): void => {
    spcStore.setState(setActivePanel(spcStore.getState(), panel));
  }, []);

  const handleTrim = useCallback((): void => {
    const state: SPCState = spcStore.getState();
    const trimCols: ColumnInfo[] = state.columnConfig.columns.filter((c: ColumnInfo) => c.dtype === "text");
    if (trimCols.length === 0 || !state.dataPrep.arqueroTable) return;
    let table = state.dataPrep.arqueroTable as ColumnTable;
    for (const column of trimCols) {
      try { table = cleanText(table, column.name, "trim") as ColumnTable; } catch { /* skip */ }
    }
    let next = addPrepTransform(state, { type: "trim", params: { columns: trimCols.map((c: ColumnInfo) => c.name) } });
    next = setPrepTable(next, table);
    spcStore.setState(next);
  }, []);

  return (
    <div className="prep-transform-toolbar">
      <OpGroup label="Column" groupClass="column" ops={COL_OPS as OpDef[]} activePanel={activePanel} onSetPanel={handleSetPanel} onTrim={handleTrim} />
      <OpGroup label="Row" groupClass="row" ops={ROW_OPS as OpDef[]} activePanel={activePanel} onSetPanel={handleSetPanel} onTrim={handleTrim} />
    </div>
  );
}

/* ── PrepPanel ───────────────────────────────────────────────────────── */

interface ColOptionsProps {
  cols: ColumnInfo[];
}

function ColOptions({ cols }: ColOptionsProps): React.JSX.Element {
  return (
    <>
      {cols.map((c: ColumnInfo) => (
        <option key={c.name} value={c.name}>
          {c.name}
        </option>
      ))}
    </>
  );
}

interface PrepPanelProps {
  dataPrep: DataPrepState;
  columns: ColumnInfo[];
}

function PrepPanel({ dataPrep, columns }: PrepPanelProps): React.JSX.Element | null {
  const ap: string | null = dataPrep.activePanel;
  const cols: ColumnInfo[] = columns || [];

  // Form state for visibility toggles
  const [filterOp, setFilterOp] = useState<string>("eq");
  const [missingStrategy, setMissingStrategy] = useState<string>("remove");
  const [recodeNewCol, setRecodeNewCol] = useState<boolean>(false);
  const [binCustom, setBinCustom] = useState<boolean>(false);
  const [validateType, setValidateType] = useState<string>("range");
  const [recodeMappings, setRecodeMappings] = useState<{ old: string; new: string }[]>([{ old: "", new: "" }]);

  // Refs for form values
  const filterColRef = useRef<HTMLSelectElement>(null);
  const filterValRef = useRef<HTMLInputElement>(null);
  const filterVal2Ref = useRef<HTMLInputElement>(null);
  const findColRef = useRef<HTMLSelectElement>(null);
  const findSearchRef = useRef<HTMLInputElement>(null);
  const findReplaceRef = useRef<HTMLInputElement>(null);
  const findRegexRef = useRef<HTMLInputElement>(null);
  const missingColRef = useRef<HTMLSelectElement>(null);
  const missingCustomRef = useRef<HTMLInputElement>(null);
  const renameColRef = useRef<HTMLSelectElement>(null);
  const renameNewRef = useRef<HTMLInputElement>(null);
  const typeColRef = useRef<HTMLSelectElement>(null);
  const typeTargetRef = useRef<HTMLSelectElement>(null);
  const calcNameRef = useRef<HTMLInputElement>(null);
  const calcExprRef = useRef<HTMLInputElement>(null);
  const recodeColRef = useRef<HTMLSelectElement>(null);
  const recodeNewNameRef = useRef<HTMLInputElement>(null);
  const binColRef = useRef<HTMLSelectElement>(null);
  const binCountRef = useRef<HTMLInputElement>(null);
  const binBreaksRef = useRef<HTMLInputElement>(null);
  const binNameRef = useRef<HTMLInputElement>(null);
  const splitColRef = useRef<HTMLSelectElement>(null);
  const splitDelimRef = useRef<HTMLInputElement>(null);
  const splitPartsRef = useRef<HTMLInputElement>(null);
  const concatSepRef = useRef<HTMLInputElement>(null);
  const concatNameRef = useRef<HTMLInputElement>(null);
  const validateColRef = useRef<HTMLSelectElement>(null);
  const validateMinRef = useRef<HTMLInputElement>(null);
  const validateMaxRef = useRef<HTMLInputElement>(null);
  const validateValuesRef = useRef<HTMLInputElement>(null);
  const validatePatternRef = useRef<HTMLInputElement>(null);
  const dedupFormRef = useRef<HTMLDivElement>(null);
  const concatFormRef = useRef<HTMLDivElement>(null);

  if (!ap) return null;

  if (ap === "filter") {
    const showVal2: boolean = filterOp === "between";
    const hideVal: boolean = filterOp === "is_null" || filterOp === "is_not_null";
    return (
      <div className="prep-panel">
        <span className="prep-panel-label">Column</span>
        <select ref={filterColRef}>
          <ColOptions cols={cols} />
        </select>
        <span className="prep-panel-label">Op</span>
        <select value={filterOp} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilterOp(e.target.value)}>
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
            const column: string | undefined = filterColRef.current?.value;
            const operator: string = filterOp;
            const val: string | undefined = filterValRef.current?.value;
            const val2: string | undefined = filterVal2Ref.current?.value;
            if (!column || !operator) return;
            const filterVal: string | [string | undefined, string | undefined] | null = operator === "between" ? [val, val2] : (operator === "is_null" || operator === "is_not_null") ? null : val ?? null;
            applyTransform((state: SPCState) => ({
              table: filterRows(state.dataPrep.arqueroTable as ColumnTable, column, operator as FilterOperator, filterVal as string | [string, string]),
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
            const column: string = findColRef.current?.value ?? "__all__";
            const search: string | undefined = findSearchRef.current?.value;
            const replace: string = findReplaceRef.current?.value ?? "";
            const useRegex: boolean = findRegexRef.current?.checked || false;
            if (!search) return;
            applyTransform((state: SPCState) => {
              let table = state.dataPrep.arqueroTable as ColumnTable;
              if (column === "__all__") {
                for (const col of table.columnNames()) {
                  try { table = findReplace(table, col, search, replace, useRegex) as ColumnTable; } catch { /* skip */ }
                }
              } else {
                table = findReplace(table, column, search, replace, useRegex) as ColumnTable;
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
        {cols.map((c: ColumnInfo) => (
          <label key={c.name} className="prep-panel-check">
            <input type="checkbox" value={c.name} defaultChecked className="dedup-col-check" /> {c.name}
          </label>
        ))}
        <div className="prep-panel-sep" />
        <button
          onClick={() => {
            const checkboxes: NodeListOf<HTMLInputElement> = dedupFormRef.current?.querySelectorAll(".dedup-col-check:checked") || ([] as unknown as NodeListOf<HTMLInputElement>);
            const selectedColumns: string[] = [...checkboxes].map((el: HTMLInputElement) => el.value);
            if (selectedColumns.length === 0) return;
            applyTransform((state: SPCState) => ({
              table: removeDuplicates(state.dataPrep.arqueroTable as ColumnTable, selectedColumns),
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
        <select value={missingStrategy} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setMissingStrategy(e.target.value)}>
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
            const column: string | undefined = missingColRef.current?.value;
            const strategy: string = missingStrategy;
            const customValue: string | null = missingCustomRef.current?.value || null;
            if (!column || !strategy) return;
            applyTransform((state: SPCState) => ({
              table: handleMissing(state.dataPrep.arqueroTable as ColumnTable, column, strategy as MissingStrategy, customValue),
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
            const oldName: string | undefined = renameColRef.current?.value;
            const newName: string | undefined = renameNewRef.current?.value?.trim();
            if (!oldName || !newName) return;
            const state: SPCState = spcStore.getState();
            const existing: string[] = state.columnConfig.columns.map((c) => c.name);
            if (existing.includes(newName)) {
              spcStore.setState(setPrepError(state, `Column "${newName}" already exists`));
              return;
            }
            applyTransform((s: SPCState) => ({
              table: renameColumn(s.dataPrep.arqueroTable as ColumnTable, oldName, newName),
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
    let previewHtml: React.JSX.Element | null = null;
    if (dataPrep.arqueroTable && cols.length > 0) {
      const firstCol: string = cols[0].name;
      const firstTarget: string = cols[0].dtype === "numeric" ? "text" : "numeric";
      const pv = previewTypeConversion(dataPrep.arqueroTable as ColumnTable, firstCol, firstTarget as ColumnDtype) as { convertible: number; total: number };
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
            const column: string | undefined = typeColRef.current?.value;
            const targetType: string | undefined = typeTargetRef.current?.value;
            if (!column || !targetType) return;
            applyTransform((state: SPCState) => ({
              table: changeColumnType(state.dataPrep.arqueroTable as ColumnTable, column, targetType as ColumnDtype),
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
            const newColName: string | undefined = calcNameRef.current?.value?.trim();
            const expression: string | undefined = calcExprRef.current?.value?.trim();
            if (!newColName || !expression) return;
            const state: SPCState = spcStore.getState();
            const colNames: string[] = state.columnConfig.columns.map((c) => c.name);
            if (colNames.includes(newColName)) {
              spcStore.setState(setPrepError(state, `Column "${newColName}" already exists`));
              return;
            }
            applyTransform((s: SPCState) => ({
              table: addCalculatedColumn(s.dataPrep.arqueroTable as ColumnTable, newColName, expression, colNames),
              transform: { type: "calculated", params: { newColName, expression, columns: colNames } },
              meta: { addCols: [{ name: newColName, dtype: "numeric", ordinal: 0, role: null }] },
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
            <input type="checkbox" checked={recodeNewCol} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRecodeNewCol(e.target.checked)} /> Save as new column
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
              const column: string | undefined = recodeColRef.current?.value;
              const asNew: boolean = recodeNewCol;
              const newColName: string | null = asNew ? recodeNewNameRef.current?.value?.trim() ?? null : null;
              if (!column || (asNew && !newColName)) return;
              const mapping: Record<string, string> = {};
              for (const m of recodeMappings) {
                if (m.old != null && m.old !== "") mapping[m.old] = m.new ?? "";
              }
              if (Object.keys(mapping).length === 0) return;
              applyTransform((state: SPCState) => ({
                table: recodeValues(state.dataPrep.arqueroTable as ColumnTable, column, mapping, newColName),
                transform: { type: "recode", params: { column, mapping, newColName } },
                meta: newColName ? { addCols: [{ name: newColName, dtype: "text", ordinal: 0, role: null }] } : undefined,
              }));
            }}
            type="button"
            className="prep-panel-apply"
          >
            Recode
          </button>
        </div>
        <div className="prep-mapping-rows">
          {recodeMappings.map((m: { old: string; new: string }, i: number) => (
            <div key={i} className="prep-mapping-row">
              <input
                type="text"
                placeholder="old value"
                value={m.old}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
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
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
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
    const numericOpts: ColumnInfo[] = cols.filter((c: ColumnInfo) => c.dtype === "numeric");
    const binCols: ColumnInfo[] = numericOpts.length > 0 ? numericOpts : cols;
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
          <input type="checkbox" checked={binCustom} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBinCustom(e.target.checked)} /> Custom breaks
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
            const column: string | undefined = binColRef.current?.value;
            const binCount: number = parseInt(binCountRef.current?.value || "5", 10);
            const useCustom: boolean = binCustom;
            const newColName: string = binNameRef.current?.value?.trim() || `${column}_binned`;
            let customBreaks: number[] | null = null;
            if (useCustom) {
              const breaksStr: string = binBreaksRef.current?.value || "";
              customBreaks = breaksStr.split(",").map((p: string) => parseFloat(p.trim())).filter((n: number) => !isNaN(n)).sort((a: number, b: number) => a - b);
              if (customBreaks.length === 0) {
                spcStore.setState(setPrepError(spcStore.getState(), "Enter valid break values"));
                return;
              }
            }
            if (!column) return;
            applyTransform((state: SPCState) => ({
              table: binColumn(state.dataPrep.arqueroTable as ColumnTable, column, binCount, newColName, customBreaks),
              transform: { type: "bin", params: { column, binCount, newColName, customBreaks } },
              meta: { addCols: [{ name: newColName, dtype: "text", ordinal: 0, role: null }] },
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
            const column: string | undefined = splitColRef.current?.value;
            const delimiter: string = splitDelimRef.current?.value || ",";
            const maxParts: number = parseInt(splitPartsRef.current?.value || "2", 10);
            if (!column) return;
            applyTransform((state: SPCState) => {
              const table = splitColumn(state.dataPrep.arqueroTable as ColumnTable, column, delimiter, maxParts) as ColumnTable;
              const newCols = Array.from({ length: maxParts }, (_: unknown, i: number) => ({ name: `${column}_${i + 1}`, dtype: "text", ordinal: 0, role: null as string | null }));
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
        {cols.map((c: ColumnInfo) => (
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
            const checkboxes: NodeListOf<HTMLInputElement> = concatFormRef.current?.querySelectorAll(".concat-col-check:checked") || ([] as unknown as NodeListOf<HTMLInputElement>);
            const concatCols: string[] = [...checkboxes].map((el: HTMLInputElement) => el.value);
            const separator: string = concatSepRef.current?.value ?? " ";
            const newColName: string = concatNameRef.current?.value?.trim() || "combined";
            if (concatCols.length < 2) return;
            applyTransform((state: SPCState) => ({
              table: concatColumns(state.dataPrep.arqueroTable as ColumnTable, concatCols, separator, newColName),
              transform: { type: "concat", params: { columns: concatCols, separator, newColName } },
              meta: { addCols: [{ name: newColName, dtype: "text", ordinal: 0, role: null }] },
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
        <select value={validateType} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setValidateType(e.target.value)}>
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
            const column: string | undefined = validateColRef.current?.value;
            const type: string = validateType;
            if (!column || !type) return;
            let rule: Record<string, unknown> | undefined;
            if (type === "range") {
              const min: string = validateMinRef.current?.value ?? "";
              const max: string = validateMaxRef.current?.value ?? "";
              rule = { type: "range", min: min !== "" ? Number(min) : null, max: max !== "" ? Number(max) : null };
            } else if (type === "allowed") {
              const values: string[] = (validateValuesRef.current?.value || "").split(",").map((p: string) => p.trim()).filter(Boolean);
              rule = { type: "allowed", values };
            } else if (type === "regex") {
              rule = { type: "regex", pattern: validatePatternRef.current?.value || "" };
            }
            if (rule) {
              const state = spcStore.getState();
              let next = updateColumnMeta(state, column, { validation: rule } as unknown as Partial<ColumnOut>);
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
            const column: string | undefined = validateColRef.current?.value;
            if (column) {
              const state = spcStore.getState();
              let next = updateColumnMeta(state, column, { validation: null } as unknown as Partial<ColumnOut>);
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

interface TransformLedgerProps {
  transforms: TransformRecord[];
}

function TransformLedger({ transforms }: TransformLedgerProps): React.JSX.Element | null {
  const handleUndo = useCallback((): void => {
    const state: SPCState = spcStore.getState();
    if (state.dataPrep.transforms.length === 0) return;
    let next = undoPrepTransform(state);
    const replayed = replayPrepTransforms(next) as { table: ColumnTable; columns: ColumnOut[] } | null;
    if (replayed) {
      next = setPrepTable(next, replayed.table);
      next = setColumns(next, replayed.columns);
      next = setProfileCache(next, {});
      if (next.dataPrep.transforms.length === 0) next = markPrepSaved(next);
    }
    spcStore.setState(next);
  }, []);

  if (transforms.length === 0) return null;

  return (
    <div className="prep-ledger">
      {transforms.map((tr: TransformRecord, i: number) => {
        const label: string = (TRANSFORM_LABELS as Record<string, string>)[tr.type] || tr.type;
        const detail: string = transformSummary(tr as { type: string; params?: Record<string, unknown>; [key: string]: unknown });
        const isLast: boolean = i === transforms.length - 1;
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

interface TransformPanelProps {
  dataPrep: DataPrepState;
  columns: ColumnInfo[];
  datasets: DatasetItem[];
}

export default function TransformPanel({ dataPrep, columns, datasets }: TransformPanelProps): React.JSX.Element | null {
  if (!dataPrep.selectedDatasetId || dataPrep.loading || dataPrep.error) return null;
  return (
    <>
      <UtilityBar dataPrep={dataPrep} datasets={datasets} columns={columns} />
      <TransformToolbar activePanel={dataPrep.activePanel} />
      <PrepPanel dataPrep={dataPrep} columns={columns} />
      <TransformLedger transforms={dataPrep.transforms as TransformRecord[]} />
    </>
  );
}
