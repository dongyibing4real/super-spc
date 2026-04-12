/**
 * data-prep-engine.js — Client-side data transformation engine using Arquero.
 *
 * Provides 7 Phase 1 transforms: filter, sort, find/replace, dedup,
 * missing values, trim/clean, column reorder/hide.
 *
 * All functions take an Arquero table and return a new Arquero table (immutable).
 * The original table is never modified, enabling undo by replaying from original.
 */
import type { ColumnTable } from 'arquero';
import { from, op, escape, desc } from 'arquero';

export type FilterOperator = 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'not_contains' | 'between' | 'is_null' | 'is_not_null';
export type MissingStrategy = 'remove' | 'fill_mean' | 'fill_median' | 'fill_zero' | 'fill_custom' | 'fill_down' | 'fill_up';
export type CleanOperation = 'trim' | 'lower' | 'upper' | 'title';
export type ColumnDtype = 'numeric' | 'text';
export type InferredType = 'number' | 'string' | 'boolean';

export interface ColumnMeta {
  name: string;
  dtype: string;
}

export interface SortSpec {
  column: string;
  direction: 'asc' | 'desc';
}

export interface TypeConversionPreview {
  convertible: number;
  total: number;
}

export interface NumericProfile {
  count: number;
  missing: number;
  missingPct: number;
  distinct: number;
  mean: number;
  std: number;
  min: number;
  max: number;
  q1: number;
  q3: number;
  median: number;
  p10: number;
  p90: number;
  skewness: number;
  kurtosis: number;
  cv: number | null;
  outlierCount: number;
  histogram: number[];
}

interface TopValue {
  value: string;
  count: number;
}

export interface TextProfile {
  count: number;
  missing: number;
  missingPct: number;
  distinct: number;
  topValues: TopValue[];
  minLength: number;
  maxLength: number;
  emptyStrings: number;
  balanceRatio: number | null;
  histogram: number[];
}

export interface ColumnStats {
  count: number;
  mean: number;
  std: number;
  min: number;
  max: number;
  median: number;
  missing: number;
}

export interface ValidationRule {
  type: 'range' | 'allowed' | 'regex';
  min?: number;
  max?: number;
  values?: string[];
  pattern?: string;
}

export interface ColumnWithValidation {
  name: string;
  validation?: ValidationRule;
}

/**
 * Create an Arquero table from parsed CSV rows.
 * Types values appropriately (numbers become numbers, strings stay strings).
 * The raw string rows are kept separately for server storage.
 */
export function createTable(rows: Record<string, string>[], columns: ColumnMeta[]): ColumnTable {
  const typed = rows.map((row: Record<string, string>) => {
    const out: Record<string, number | string | null> = {};
    for (const col of columns) {
      const raw = row[col.name];
      if (raw == null || raw === '') {
        out[col.name] = null;
      } else if (col.dtype === 'numeric') {
        const num = Number(raw);
        out[col.name] = isNaN(num) ? null : num;
      } else {
        out[col.name] = raw;
      }
    }
    return out;
  });
  return from(typed);
}

/**
 * Infer the JavaScript type actually stored in a column by sampling non-null values.
 */
function inferColumnType(table: ColumnTable, column: string): InferredType {
  const arr = table.array(column);
  for (let i = 0; i < Math.min(arr.length, 20); i++) {
    if (arr[i] != null) return typeof arr[i] as InferredType;
  }
  return 'string';
}

/**
 * Coerce a DOM string value to match the actual stored column type.
 */
function coerceToColumnType(value: string, colType: InferredType): number | string {
  if (colType === 'number') return Number(value);
  return value;
}

/**
 * Filter rows by column value.
 */
export function filterRows(table: ColumnTable, column: string, operator: FilterOperator, value: string | [string, string]): ColumnTable {
  switch (operator) {
    case 'eq': {
      const cmp = coerceToColumnType(value as string, inferColumnType(table, column));
      return table.filter(escape((d: Record<string, unknown>) => d[column] === cmp));
    }
    case 'neq': {
      const cmp = coerceToColumnType(value as string, inferColumnType(table, column));
      return table.filter(escape((d: Record<string, unknown>) => d[column] !== cmp));
    }
    case 'gt':
      return table.filter(escape((d: Record<string, unknown>) => (d[column] as number) > Number(value)));
    case 'lt':
      return table.filter(escape((d: Record<string, unknown>) => (d[column] as number) < Number(value)));
    case 'gte':
      return table.filter(escape((d: Record<string, unknown>) => (d[column] as number) >= Number(value)));
    case 'lte':
      return table.filter(escape((d: Record<string, unknown>) => (d[column] as number) <= Number(value)));
    case 'contains':
      return table.filter(escape((d: Record<string, unknown>) =>
        d[column] != null && String(d[column]).includes(value as string)
      ));
    case 'not_contains':
      return table.filter(escape((d: Record<string, unknown>) =>
        d[column] == null || !String(d[column]).includes(value as string)
      ));
    case 'between': {
      const lo = Number((value as [string, string])[0]);
      const hi = Number((value as [string, string])[1]);
      return table.filter(escape((d: Record<string, unknown>) => (d[column] as number) >= lo && (d[column] as number) <= hi));
    }
    case 'is_null':
      return table.filter(escape((d: Record<string, unknown>) => d[column] == null || d[column] === ''));
    case 'is_not_null':
      return table.filter(escape((d: Record<string, unknown>) => d[column] != null && d[column] !== ''));
    default:
      throw new Error(`Unknown filter operator: ${operator}`);
  }
}

/**
 * Sort table by one or more columns.
 */
export function sortTable(table: ColumnTable, sortSpec: SortSpec[]): ColumnTable {
  if (!sortSpec || sortSpec.length === 0) return table;

  const keys = sortSpec.map(({ column, direction }: SortSpec) =>
    direction === 'desc' ? desc(column) : column
  );

  return table.orderby(...keys);
}

/**
 * Find and replace values in a column.
 */
export function findReplace(table: ColumnTable, column: string, find: string, replacement: string, useRegex: boolean = false): ColumnTable {
  const pattern: string | RegExp = useRegex ? new RegExp(find, 'g') : find;
  return table.derive({
    [column]: escape((d: Record<string, unknown>) => {
      const val = d[column];
      return val == null ? val : String(val).replace(pattern, replacement);
    }),
  });
}

/**
 * Remove duplicate rows based on key columns.
 */
export function removeDuplicates(table: ColumnTable, keyColumns: string[]): ColumnTable {
  return table.dedupe(...keyColumns);
}

/**
 * Handle missing values in a column.
 */
export function handleMissing(table: ColumnTable, column: string, strategy: MissingStrategy, customValue: unknown = null): ColumnTable {
  switch (strategy) {
    case 'remove':
      return table.filter(escape((d: Record<string, unknown>) => d[column] != null && d[column] !== ''));

    case 'fill_mean': {
      // Compute mean first, then fill with escape() closure
      const stats = table.rollup({ _mean: op.mean(column) }).object() as { _mean: number };
      const meanVal = stats._mean;
      return table.derive({
        [column]: escape((d: Record<string, unknown>) => d[column] == null ? meanVal : d[column]),
      });
    }

    case 'fill_median': {
      const stats = table.rollup({ _median: op.median(column) }).object() as { _median: number };
      const medianVal = stats._median;
      return table.derive({
        [column]: escape((d: Record<string, unknown>) => d[column] == null ? medianVal : d[column]),
      });
    }

    case 'fill_zero':
      return table.derive({
        [column]: escape((d: Record<string, unknown>) => d[column] == null ? 0 : d[column]),
      });

    case 'fill_custom':
      return table.derive({
        [column]: escape((d: Record<string, unknown>) => d[column] == null ? customValue : d[column]),
      });

    case 'fill_down': {
      const data = table.objects() as Record<string, unknown>[];
      let lastVal: unknown = null;
      for (const row of data) {
        if (row[column] != null && row[column] !== '') {
          lastVal = row[column];
        } else {
          row[column] = lastVal;
        }
      }
      return from(data);
    }

    case 'fill_up': {
      const data = table.objects() as Record<string, unknown>[];
      let lastVal: unknown = null;
      for (let i = data.length - 1; i >= 0; i--) {
        if (data[i][column] != null && data[i][column] !== '') {
          lastVal = data[i][column];
        } else {
          data[i][column] = lastVal;
        }
      }
      return from(data);
    }

    default:
      throw new Error(`Unknown missing value strategy: ${strategy}`);
  }
}

/**
 * Trim whitespace and clean text in a column.
 */
export function cleanText(table: ColumnTable, column: string, operation: CleanOperation = 'trim'): ColumnTable {
  switch (operation) {
    case 'trim':
      return table.derive({
        [column]: escape((d: Record<string, unknown>) => {
          const val = d[column];
          return val == null ? val : String(val).trim();
        }),
      });
    case 'lower':
      return table.derive({
        [column]: escape((d: Record<string, unknown>) => {
          const val = d[column];
          return val == null ? val : String(val).toLowerCase();
        }),
      });
    case 'upper':
      return table.derive({
        [column]: escape((d: Record<string, unknown>) => {
          const val = d[column];
          return val == null ? val : String(val).toUpperCase();
        }),
      });
    case 'title':
      // Arquero lacks a title-case op; use escape() for native JS
      return table.derive({
        [column]: escape((d: Record<string, unknown>) => {
          const val = d[column];
          if (val == null) return val;
          return String(val).toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase());
        }),
      });
    default:
      throw new Error(`Unknown clean operation: ${operation}`);
  }
}

/**
 * Reorder columns in the table.
 */
export function reorderColumns(table: ColumnTable, columnOrder: string[]): ColumnTable {
  const existing = table.columnNames();
  const remaining = existing.filter((c: string) => !columnOrder.includes(c));
  return table.select([...columnOrder, ...remaining]);
}

/**
 * Hide columns from view (select subset).
 */
export function selectColumns(table: ColumnTable, visibleColumns: string[]): ColumnTable {
  return table.select(visibleColumns);
}

/**
 * Get table as array of objects (for rendering).
 */
export function getPage(table: ColumnTable, offset: number = 0, limit: number = 50): Record<string, unknown>[] {
  return table.slice(offset, offset + limit).objects() as Record<string, unknown>[];
}

/**
 * Get basic statistics for a numeric column.
 */
export function columnStats(table: ColumnTable, column: string): ColumnStats {
  return table.rollup({
    count:   op.count(),
    mean:    op.mean(column),
    std:     op.stdev(column),
    min:     op.min(column),
    max:     op.max(column),
    median:  op.median(column),
    missing: (d: Record<string, unknown>) => op.sum(d[column] == null ? 1 : 0),
  }).object() as ColumnStats;
}

// ═══════════════════════════════════════════════════════════════════
// Phase 2 — Column Operations
// ═══════════════════════════════════════════════════════════════════

import { compileExpression } from './expression-eval.js';

/**
 * Rename a column.
 */
export function renameColumn(table: ColumnTable, oldName: string, newName: string): ColumnTable {
  return table.rename({ [oldName]: newName });
}

/**
 * Change column data type (numeric↔text).
 */
export function changeColumnType(table: ColumnTable, column: string, targetType: ColumnDtype): ColumnTable {
  if (targetType === 'numeric') {
    return table.derive({
      [column]: escape((d: Record<string, unknown>) => {
        const v = d[column];
        if (v == null) return null;
        const n = Number(v);
        return isNaN(n) ? null : n;
      }),
    });
  }
  // text
  return table.derive({
    [column]: escape((d: Record<string, unknown>) => d[column] == null ? null : String(d[column])),
  });
}

/**
 * Preview how many values in a column can convert to a target type.
 */
export function previewTypeConversion(table: ColumnTable, column: string, targetType: ColumnDtype): TypeConversionPreview {
  const arr = table.array(column);
  let convertible = 0;
  let total = 0;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] == null) continue;
    total++;
    if (targetType === 'numeric') {
      if (!isNaN(Number(arr[i]))) convertible++;
    } else {
      convertible++; // everything can become text
    }
  }
  return { convertible, total };
}

/**
 * Add a calculated column using a simple arithmetic expression.
 * Expression syntax: [ColName] for column refs, +,-,*,/,() for math,
 * round/abs/log/sqrt/pow/min/max for functions.
 */
export function addCalculatedColumn(table: ColumnTable, newColName: string, expression: string, columnNames: string[]): ColumnTable {
  const { fn, error } = compileExpression(expression, columnNames);
  if (error) throw new Error(error);
  return table.derive({
    [newColName]: escape((d: Record<string, unknown>) => {
      try { return fn!(d as Record<string, number | string | null>); }
      catch { return null; }
    }),
  });
}

/**
 * Recode values in a column using a mapping.
 */
export function recodeValues(table: ColumnTable, column: string, mapping: Record<string, string>, newColName: string | null = null): ColumnTable {
  const target = newColName || column;
  return table.derive({
    [target]: escape((d: Record<string, unknown>) => {
      const v = d[column];
      const key = v == null ? null : String(v);
      return key != null && key in mapping ? mapping[key] : v;
    }),
  });
}

/**
 * Bin a numeric column into categorical bins.
 */
export function binColumn(table: ColumnTable, column: string, binCount: number, newColName: string, customBreaks: number[] | null = null): ColumnTable {
  let breaks = customBreaks;
  if (!breaks) {
    const stats = table.rollup({ _min: op.min(column), _max: op.max(column) }).object() as { _min: number; _max: number };
    const range = stats._max - stats._min;
    const width = range / binCount;
    breaks = Array.from({ length: binCount - 1 }, (_: unknown, i: number) =>
      Math.round((stats._min + width * (i + 1)) * 1e6) / 1e6
    );
  }
  const b = breaks; // closure-safe copy
  return table.derive({
    [newColName]: escape((d: Record<string, unknown>) => {
      const v = d[column] as number | null;
      if (v == null) return null;
      for (let i = 0; i < b.length; i++) {
        if (v <= b[i]) return `bin_${i + 1}`;
      }
      return `bin_${b.length + 1}`;
    }),
  });
}

/**
 * Split a column by delimiter into multiple new columns.
 */
export function splitColumn(table: ColumnTable, column: string, delimiter: string, maxParts: number = 2): ColumnTable {
  const derived: Record<string, ReturnType<typeof escape>> = {};
  for (let i = 0; i < maxParts; i++) {
    const name = `${column}_${i + 1}`;
    const idx = i;
    const delim = delimiter;
    derived[name] = escape((d: Record<string, unknown>) => {
      const v = d[column];
      if (v == null) return null;
      const parts = String(v).split(delim);
      return idx < parts.length ? parts[idx].trim() : null;
    });
  }
  return table.derive(derived);
}

/**
 * Concatenate multiple columns into a new column.
 */
export function concatColumns(table: ColumnTable, columns: string[], separator: string, newColName: string): ColumnTable {
  const cols = columns; // closure-safe copy
  const sep = separator;
  return table.derive({
    [newColName]: escape((d: Record<string, unknown>) => {
      return cols.map((c: string) => d[c] ?? '').join(sep);
    }),
  });
}

// ═══════════════════════════════════════════════════════════════════
// Phase 3 — Data Validation & Quality
// ═══════════════════════════════════════════════════════════════════

/**
 * Validate a single column against a rule.
 */
export function validateColumn(table: ColumnTable, colName: string, rule: ValidationRule): Set<number> {
  const arr = table.array(colName);
  const invalid = new Set<number>();
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (v == null) continue;
    if (rule.type === 'range') {
      const num = Number(v);
      if (isNaN(num)) { invalid.add(i); continue; }
      if (rule.min != null && num < rule.min) invalid.add(i);
      if (rule.max != null && num > rule.max) invalid.add(i);
    } else if (rule.type === 'allowed') {
      if (!rule.values!.includes(String(v))) invalid.add(i);
    } else if (rule.type === 'regex') {
      try {
        if (!new RegExp(rule.pattern!).test(String(v))) invalid.add(i);
      } catch { invalid.add(i); }
    }
  }
  return invalid;
}

/**
 * Validate all columns that have validation rules.
 */
export function validateAllColumns(table: ColumnTable, columns: ColumnWithValidation[]): Map<string, Set<number>> {
  const result = new Map<string, Set<number>>();
  for (const col of columns) {
    if (col.validation) {
      result.set(col.name, validateColumn(table, col.name, col.validation));
    }
  }
  return result;
}

/**
 * Profile a column — compute stats, histogram, top values.
 */
export function profileColumn(table: ColumnTable, colName: string, dtype: string): NumericProfile | TextProfile {
  const arr = table.array(colName);
  const n = arr.length;
  let missing = 0;
  const values: unknown[] = [];
  for (let i = 0; i < n; i++) {
    if (arr[i] == null || arr[i] === '') missing++;
    else values.push(arr[i]);
  }
  const distinct = new Set(values.map(String)).size;
  const base = { count: n, missing, missingPct: n > 0 ? (missing / n * 100) : 0, distinct };

  if (dtype === 'numeric') {
    const nums = values.map(Number).filter((v: number) => !isNaN(v)).sort((a: number, b: number) => a - b);
    if (nums.length === 0) return { ...base, mean: 0, std: 0, min: 0, max: 0, q1: 0, q3: 0, median: 0, p10: 0, p90: 0, skewness: 0, kurtosis: 0, cv: 0, outlierCount: 0, histogram: [] };
    const m = nums.length;
    const sum = nums.reduce((s: number, v: number) => s + v, 0);
    const mean = sum / m;
    const variance = nums.reduce((s: number, v: number) => s + (v - mean) ** 2, 0) / m;
    const std = Math.sqrt(variance);
    const min = nums[0];
    const max = nums[m - 1];
    const q1 = nums[Math.floor(m * 0.25)];
    const q3 = nums[Math.floor(m * 0.75)];
    const median = m % 2 === 0
      ? (nums[m / 2 - 1] + nums[m / 2]) / 2
      : nums[Math.floor(m / 2)];
    const p10 = nums[Math.floor(m * 0.10)];
    const p90 = nums[Math.floor(m * 0.90)];

    // Skewness and excess kurtosis (population moments)
    let m3 = 0, m4 = 0;
    if (std > 0) {
      for (const v of nums) {
        const z = (v - mean) / std;
        m3 += z ** 3;
        m4 += z ** 4;
      }
    }
    const skewness = std > 0 ? m3 / m : 0;
    const kurtosis = std > 0 ? m4 / m - 3 : 0; // excess kurtosis

    // CV and outliers beyond ±3σ
    const cv = mean !== 0 ? (std / Math.abs(mean)) * 100 : null;
    const sigma3 = 3 * std;
    let outlierCount = 0;
    for (const v of nums) { if (Math.abs(v - mean) > sigma3) outlierCount++; }

    // 12-bin equal-width histogram, normalized to max=1.0
    const bins = 12;
    const range = max - min || 1;
    const width = range / bins;
    const counts = new Array<number>(bins).fill(0);
    for (const v of nums) {
      const idx = Math.min(Math.floor((v - min) / width), bins - 1);
      counts[idx]++;
    }
    const maxCount = Math.max(...counts, 1);
    const histogram = counts.map((c: number) => c / maxCount);

    return { ...base, mean, std, min, max, q1, q3, median, p10, p90, skewness, kurtosis, cv, outlierCount, histogram };
  }

  // Text dtype
  let emptyStrings = 0;
  for (const v of values) { if (String(v).trim() === '') emptyStrings++; }
  const freq: Record<string, number> = {};
  for (const v of values) { const s = String(v); freq[s] = (freq[s] || 0) + 1; }
  const allTopValues: TopValue[] = Object.entries(freq)
    .sort((a: [string, number], b: [string, number]) => b[1] - a[1])
    .map(([value, count]: [string, number]) => ({ value, count }));
  const topValues = allTopValues.slice(0, 10);
  const lengths = values.map((v: unknown) => String(v).length);
  const minLength = lengths.length > 0 ? Math.min(...lengths) : 0;
  const maxLength = lengths.length > 0 ? Math.max(...lengths) : 0;

  // Balance: ratio of max to min frequency among top values (1.0 = perfectly even)
  const total = values.length || 1;
  const minFreq = allTopValues.length > 0 ? allTopValues[allTopValues.length - 1].count : 0;
  const maxFreq = allTopValues.length > 0 ? allTopValues[0].count : 0;
  const balanceRatio = minFreq > 0 ? maxFreq / minFreq : null; // 1.0 = even, high = skewed

  // Top-3 proportion bars for text sparkline
  const histogram = topValues.slice(0, 3).map((t: TopValue) => t.count / total);

  return { ...base, topValues, minLength, maxLength, emptyStrings, balanceRatio, histogram };
}
