import type { SPCState } from "../../types/state.js";
import type { ColumnTable } from "arquero";
import { spcStore } from "../../store/spc-store.js";
import {
  addPrepTransform,
  setPrepTable,
  updateColumnMeta,
  addColumnMeta,
  closeActivePanel,
  setPrepError,
} from "../../core/state/data-prep.js";

interface OpEntry {
  action: string;
  label: string;
  short: string;
  panel: string | null;
  key?: string;
}

interface ColOpEntry {
  action: string;
  label: string;
  panel: string;
  key?: string;
}

export const ROW_OPS: OpEntry[] = [
  { action: "prep-filter", label: "Filter", short: "Flt", panel: "filter", key: "F" },
  { action: "prep-find-replace", label: "Find", short: "Fnd", panel: "find", key: "D" },
  { action: "prep-dedup", label: "Dedup", short: "Dup", panel: "dedup" },
  { action: "prep-missing", label: "Missing", short: "Miss", panel: "missing" },
  { action: "prep-trim", label: "Trim", short: "Trm", panel: null },
];

export const COL_OPS: ColOpEntry[] = [
  { action: "prep-rename", label: "Rename", panel: "rename", key: "R" },
  { action: "prep-change-type", label: "Type", panel: "change_type", key: "T" },
  { action: "prep-calc", label: "Calc", panel: "calculated", key: "C" },
  { action: "prep-recode", label: "Recode", panel: "recode" },
  { action: "prep-bin", label: "Bin", panel: "bin" },
  { action: "prep-split", label: "Split", panel: "split" },
  { action: "prep-concat", label: "Concat", panel: "concat" },
];

export const TRANSFORM_LABELS: Record<string, string> = {
  filter: "Filter",
  find: "Find/Replace",
  dedup: "Dedup",
  missing: "Missing",
  trim: "Trim",
  rename: "Rename",
  change_type: "Type",
  calculated: "Calc",
  recode: "Recode",
  bin: "Bin",
  split: "Split",
  concat: "Concat",
  validate: "Validate",
};

export const ROLE_LABELS: Record<string, string> = { value: "Y", subgroup: "SG", phase: "PH", label: "LB" };

/* ── formatting helpers ──────────────────────────────────────────────── */

export function fmtMini(v: number | null | undefined): string {
  if (v == null) return "\u2014";
  const abs = Math.abs(v);
  if (abs >= 1000 || (abs > 0 && abs < 0.01)) return v.toExponential(1);
  if (abs >= 100) return v.toFixed(0);
  if (abs >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

export function fmt(v: number | null | undefined): string {
  if (v == null) return "\u2014";
  const abs = Math.abs(v);
  if (abs >= 1000 || (abs < 0.01 && v !== 0)) return v.toExponential(3);
  return v.toFixed(4);
}

export function fmtShort(v: number | null | undefined): string {
  if (v == null) return "\u2014";
  const abs = Math.abs(v);
  if (abs >= 1000 || (abs < 0.01 && v !== 0)) return v.toExponential(2);
  return v.toFixed(3);
}

interface PrepTransform {
  type: string;
  params?: Record<string, unknown>;
  [key: string]: unknown;
}

export function transformSummary(tr: PrepTransform): string {
  const p = tr.params || {};
  switch (tr.type) {
    case "filter":
      return `${p.column} ${p.op} ${p.value || ""}`;
    case "find":
      return `${p.column === "__all__" ? "All" : p.column}: ${p.search}\u2192${p.replace}`;
    case "dedup":
      return `${((p.columns as string[]) || []).length} keys`;
    case "missing":
      return `${p.column}: ${p.strategy}`;
    case "trim":
      return "";
    case "rename":
      return `${p.oldName}\u2192${p.newName}`;
    case "change_type":
      return `${p.column}\u2192${p.targetType}`;
    case "calculated":
      return (p.newColName as string) || "";
    case "recode":
      return (p.column as string) || "";
    case "bin":
      return `${p.column}\u2192${p.newColName || "binned"}`;
    case "split":
      return `${p.column} by "${p.delimiter}"`;
    case "concat":
      return (p.newColName as string) || "";
    default:
      return "";
  }
}

/* ── helpers for store dispatch ─────────────────────────────────────── */

interface TransformResult {
  table: ColumnTable;
  transform: PrepTransform;
  meta?: {
    updateCol?: { name: string; updates: Record<string, unknown> };
    addCols?: { name: string; ordinal: number; dtype: string; role: string | null }[];
  };
}

export function applyTransform(transformFn: (state: SPCState) => TransformResult): void {
  const state = spcStore.getState();
  if (!state.dataPrep.arqueroTable) return;
  try {
    const { table, transform, meta } = transformFn(state);
    let next = addPrepTransform(state, transform);
    next = setPrepTable(next, table);
    if (meta?.updateCol) next = updateColumnMeta(next, meta.updateCol.name, meta.updateCol.updates);
    if (meta?.addCols) next = addColumnMeta(next, meta.addCols);
    next = closeActivePanel(next);
    spcStore.setState(next);
  } catch (err) {
    spcStore.setState(setPrepError(state, (err as Error).message));
  }
}
