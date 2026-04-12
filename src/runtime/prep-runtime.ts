import type { ColumnTable } from 'arquero';
import {
  addCalculatedColumn,
  binColumn,
  changeColumnType,
  cleanText,
  concatColumns,
  createTable,
  filterRows,
  findReplace,
  handleMissing,
  recodeValues,
  removeDuplicates,
  renameColumn,
  sortTable,
  splitColumn,
} from "../data/data-prep-engine.js";
import type { FilterOperator, SortSpec, MissingStrategy, ColumnDtype } from "../data/data-prep-engine.js";
import type { SPCState } from "../types/state.ts";

interface TransformParams {
  column?: string;
  operator?: string;
  value?: string | [string, string];
  sortSpec?: SortSpec[];
  find?: string;
  replace?: string;
  useRegex?: boolean;
  keyColumns?: string[];
  strategy?: string;
  customValue?: unknown;
  columns?: string[];
  oldName?: string;
  newName?: string;
  targetType?: string;
  newColName?: string;
  expression?: string;
  mapping?: Record<string, string>;
  binCount?: number;
  customBreaks?: number[] | null;
  delimiter?: string;
  maxParts?: number;
  separator?: string;
}

interface Transform {
  type: string;
  params: TransformParams;
}

interface ColumnMeta {
  name: string;
  ordinal: number;
  dtype: string;
  role: string | null;
}

interface ReplayResult {
  table: ColumnTable;
  columns: ColumnMeta[];
}

export function applyPrepTransform(table: ColumnTable, transform: Transform): ColumnTable {
  switch (transform.type) {
    case "filter":
      return filterRows(table, transform.params.column!, transform.params.operator! as FilterOperator, transform.params.value!);
    case "sort":
      return sortTable(table, transform.params.sortSpec! as SortSpec[]);
    case "find_replace": {
      if (transform.params.column === "__all__") {
        let nextTable = table;
        for (const column of nextTable.columnNames()) {
          try {
            nextTable = findReplace(
              nextTable,
              column,
              transform.params.find!,
              transform.params.replace!,
              transform.params.useRegex!
            );
          } catch {
            // Skip per-column failures to preserve prior behavior.
          }
        }
        return nextTable;
      }
      return findReplace(
        table,
        transform.params.column!,
        transform.params.find!,
        transform.params.replace!,
        transform.params.useRegex!
      );
    }
    case "dedup":
      return removeDuplicates(table, transform.params.keyColumns!);
    case "missing":
      return handleMissing(table, transform.params.column!, transform.params.strategy! as MissingStrategy, transform.params.customValue);
    case "trim": {
      let nextTable = table;
      for (const column of transform.params.columns!) {
        try {
          nextTable = cleanText(nextTable, column, "trim");
        } catch {
          // Skip per-column failures to preserve prior behavior.
        }
      }
      return nextTable;
    }
    case "rename":
      return renameColumn(table, transform.params.oldName!, transform.params.newName!);
    case "change_type":
      return changeColumnType(table, transform.params.column!, transform.params.targetType! as ColumnDtype);
    case "calculated":
      return addCalculatedColumn(table, transform.params.newColName!, transform.params.expression!, transform.params.columns!);
    case "recode":
      return recodeValues(table, transform.params.column!, transform.params.mapping!, transform.params.newColName!);
    case "bin":
      return binColumn(table, transform.params.column!, transform.params.binCount!, transform.params.newColName!, transform.params.customBreaks!);
    case "split":
      return splitColumn(table, transform.params.column!, transform.params.delimiter!, transform.params.maxParts!);
    case "concat":
      return concatColumns(table, transform.params.columns!, transform.params.separator!, transform.params.newColName!);
    default:
      return table;
  }
}

export function replayPrepTransforms(state: SPCState): ReplayResult | null {
  const originalColumns = (state.dataPrep.originalColumns as ColumnMeta[]) || state.columnConfig.columns;
  if (!state.dataPrep.rawRows || originalColumns.length === 0) {
    return null;
  }

  let table = createTable(state.dataPrep.rawRows as Record<string, string>[], originalColumns);
  let columns: ColumnMeta[] = originalColumns.map((column) => ({ ...column }));

  for (const transform of state.dataPrep.transforms as Transform[]) {
    try {
      table = applyPrepTransform(table, transform);
      if (transform.type === "rename") {
        columns = columns.map((column) =>
          column.name === transform.params.oldName
            ? { ...column, name: transform.params.newName! }
            : column
        );
      } else if (transform.type === "change_type") {
        columns = columns.map((column) =>
          column.name === transform.params.column
            ? { ...column, dtype: transform.params.targetType! }
            : column
        );
      } else if (transform.type === "calculated" || transform.type === "bin" || transform.type === "concat") {
        columns.push({
          name: transform.params.newColName!,
          dtype: transform.type === "bin" || transform.type === "concat" ? "text" : "numeric",
          role: null,
          ordinal: columns.length,
        });
      } else if (transform.type === "split") {
        for (let i = 0; i < transform.params.maxParts!; i += 1) {
          columns.push({
            name: `${transform.params.column}_${i + 1}`,
            dtype: "text",
            role: null,
            ordinal: columns.length,
          });
        }
      } else if (transform.type === "recode" && transform.params.newColName) {
        columns.push({
          name: transform.params.newColName,
          dtype: "text",
          role: null,
          ordinal: columns.length,
        });
      }
    } catch {
      // Skip failed transforms to preserve prior behavior.
    }
  }

  return { table, columns };
}
