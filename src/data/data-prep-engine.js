/**
 * data-prep-engine.js — Client-side data transformation engine using Arquero.
 *
 * Provides 7 Phase 1 transforms: filter, sort, find/replace, dedup,
 * missing values, trim/clean, column reorder/hide.
 *
 * All functions take an Arquero table and return a new Arquero table (immutable).
 * The original table is never modified, enabling undo by replaying from original.
 */
import { from, op, escape, desc } from 'arquero';

/**
 * Create an Arquero table from parsed CSV rows.
 * Types values appropriately (numbers become numbers, strings stay strings).
 * The raw string rows are kept separately for server storage.
 *
 * @param {Object[]} rows - Raw string rows from PapaParse
 * @param {Array<{name: string, dtype: string}>} columns - Column metadata
 * @returns {import('arquero').ColumnTable}
 */
export function createTable(rows, columns) {
  const typed = rows.map(row => {
    const out = {};
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
 * This is needed because createTable() coerces numeric-dtype columns to JS numbers,
 * while DOM input values are always strings. Without this, strict === fails:
 * e.g. the table stores 15 (number) but the filter value is "15" (string).
 *
 * @param {import('arquero').ColumnTable} table
 * @param {string} column
 * @returns {'number'|'string'|'boolean'}
 */
function inferColumnType(table, column) {
  const arr = table.array(column);
  for (let i = 0; i < Math.min(arr.length, 20); i++) {
    if (arr[i] != null) return typeof arr[i];
  }
  return 'string';
}

/**
 * Coerce a DOM string value to match the actual stored column type.
 * createTable() only produces 'number' or 'string' columns from CSV data,
 * so only those two cases are needed.
 * @param {string} value
 * @param {'number'|'string'} colType
 * @returns {number|string}
 */
function coerceToColumnType(value, colType) {
  if (colType === 'number') return Number(value);
  return value;
}

/**
 * Filter rows by column value.
 *
 * Uses Arquero's escape() helper so that the column name and comparison
 * value can be injected as closures into the table expression.
 *
 * @param {import('arquero').ColumnTable} table
 * @param {string} column - Column name
 * @param {'eq'|'neq'|'gt'|'lt'|'gte'|'lte'|'contains'|'not_contains'|'between'|'is_null'|'is_not_null'} operator
 * @param {*} value - Filter value (or [min, max] for 'between')
 * @returns {import('arquero').ColumnTable}
 */
export function filterRows(table, column, operator, value) {
  switch (operator) {
    case 'eq': {
      const cmp = coerceToColumnType(value, inferColumnType(table, column));
      return table.filter(escape(d => d[column] === cmp));
    }
    case 'neq': {
      const cmp = coerceToColumnType(value, inferColumnType(table, column));
      return table.filter(escape(d => d[column] !== cmp));
    }
    case 'gt':
      return table.filter(escape(d => d[column] > Number(value)));
    case 'lt':
      return table.filter(escape(d => d[column] < Number(value)));
    case 'gte':
      return table.filter(escape(d => d[column] >= Number(value)));
    case 'lte':
      return table.filter(escape(d => d[column] <= Number(value)));
    case 'contains':
      return table.filter(escape(d =>
        d[column] != null && String(d[column]).includes(value)
      ));
    case 'not_contains':
      return table.filter(escape(d =>
        d[column] == null || !String(d[column]).includes(value)
      ));
    case 'between': {
      const lo = Number(value[0]);
      const hi = Number(value[1]);
      return table.filter(escape(d => d[column] >= lo && d[column] <= hi));
    }
    case 'is_null':
      return table.filter(escape(d => d[column] == null || d[column] === ''));
    case 'is_not_null':
      return table.filter(escape(d => d[column] != null && d[column] !== ''));
    default:
      throw new Error(`Unknown filter operator: ${operator}`);
  }
}

/**
 * Sort table by one or more columns.
 * @param {import('arquero').ColumnTable} table
 * @param {Array<{column: string, direction: 'asc' | 'desc'}>} sortSpec
 * @returns {import('arquero').ColumnTable}
 */
export function sortTable(table, sortSpec) {
  if (!sortSpec || sortSpec.length === 0) return table;

  const keys = sortSpec.map(({ column, direction }) =>
    direction === 'desc' ? desc(column) : column
  );

  return table.orderby(...keys);
}

/**
 * Find and replace values in a column.
 * @param {import('arquero').ColumnTable} table
 * @param {string} column - Column name
 * @param {string} find - String to find
 * @param {string} replacement - Replacement string
 * @param {boolean} useRegex - Whether to treat 'find' as a regex
 * @returns {import('arquero').ColumnTable}
 */
export function findReplace(table, column, find, replacement, useRegex = false) {
  const pattern = useRegex ? new RegExp(find, 'g') : find;
  return table.derive({
    [column]: escape(d => {
      const val = d[column];
      return val == null ? val : String(val).replace(pattern, replacement);
    }),
  });
}

/**
 * Remove duplicate rows based on key columns.
 * @param {import('arquero').ColumnTable} table
 * @param {string[]} keyColumns - Columns to check for duplicates
 * @returns {import('arquero').ColumnTable}
 */
export function removeDuplicates(table, keyColumns) {
  return table.dedupe(...keyColumns);
}

/**
 * Handle missing values in a column.
 * @param {import('arquero').ColumnTable} table
 * @param {string} column - Column name
 * @param {'remove'|'fill_mean'|'fill_median'|'fill_zero'|'fill_custom'|'fill_down'|'fill_up'} strategy
 * @param {*} customValue - Value for 'fill_custom' strategy
 * @returns {import('arquero').ColumnTable}
 */
export function handleMissing(table, column, strategy, customValue = null) {
  switch (strategy) {
    case 'remove':
      return table.filter(escape(d => d[column] != null && d[column] !== ''));

    case 'fill_mean': {
      // Compute mean first, then fill with escape() closure
      const stats = table.rollup({ _mean: op.mean(column) }).object();
      const meanVal = stats._mean;
      return table.derive({
        [column]: escape(d => d[column] == null ? meanVal : d[column]),
      });
    }

    case 'fill_median': {
      const stats = table.rollup({ _median: op.median(column) }).object();
      const medianVal = stats._median;
      return table.derive({
        [column]: escape(d => d[column] == null ? medianVal : d[column]),
      });
    }

    case 'fill_zero':
      return table.derive({
        [column]: escape(d => d[column] == null ? 0 : d[column]),
      });

    case 'fill_custom':
      return table.derive({
        [column]: escape(d => d[column] == null ? customValue : d[column]),
      });

    case 'fill_down': {
      const data = table.objects();
      let lastVal = null;
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
      const data = table.objects();
      let lastVal = null;
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
 * @param {import('arquero').ColumnTable} table
 * @param {string} column - Column name
 * @param {'trim'|'lower'|'upper'|'title'} operation
 * @returns {import('arquero').ColumnTable}
 */
export function cleanText(table, column, operation = 'trim') {
  switch (operation) {
    case 'trim':
      return table.derive({
        [column]: escape(d => {
          const val = d[column];
          return val == null ? val : String(val).trim();
        }),
      });
    case 'lower':
      return table.derive({
        [column]: escape(d => {
          const val = d[column];
          return val == null ? val : String(val).toLowerCase();
        }),
      });
    case 'upper':
      return table.derive({
        [column]: escape(d => {
          const val = d[column];
          return val == null ? val : String(val).toUpperCase();
        }),
      });
    case 'title':
      // Arquero lacks a title-case op; use escape() for native JS
      return table.derive({
        [column]: escape(d => {
          const val = d[column];
          if (val == null) return val;
          return String(val).toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
        }),
      });
    default:
      throw new Error(`Unknown clean operation: ${operation}`);
  }
}

/**
 * Reorder columns in the table.
 * @param {import('arquero').ColumnTable} table
 * @param {string[]} columnOrder - New column order (columns not listed are appended)
 * @returns {import('arquero').ColumnTable}
 */
export function reorderColumns(table, columnOrder) {
  const existing = table.columnNames();
  const remaining = existing.filter(c => !columnOrder.includes(c));
  return table.select([...columnOrder, ...remaining]);
}

/**
 * Hide columns from view (select subset).
 * @param {import('arquero').ColumnTable} table
 * @param {string[]} visibleColumns - Columns to keep visible
 * @returns {import('arquero').ColumnTable}
 */
export function selectColumns(table, visibleColumns) {
  return table.select(visibleColumns);
}

/**
 * Get table as array of objects (for rendering).
 * @param {import('arquero').ColumnTable} table
 * @param {number} offset - Start row
 * @param {number} limit - Number of rows to return
 * @returns {Object[]}
 */
export function getPage(table, offset = 0, limit = 50) {
  return table.slice(offset, offset + limit).objects();
}

/**
 * Get basic statistics for a numeric column.
 * @param {import('arquero').ColumnTable} table
 * @param {string} column
 * @returns {{count: number, mean: number, std: number, min: number, max: number, median: number, missing: number}}
 */
export function columnStats(table, column) {
  return table.rollup({
    count:   op.count(),
    mean:    op.mean(column),
    std:     op.stdev(column),
    min:     op.min(column),
    max:     op.max(column),
    median:  op.median(column),
    missing: d => op.sum(d[column] == null ? 1 : 0),
  }).object();
}

// ═══════════════════════════════════════════════════════════════════
// Phase 2 — Column Operations
// ═══════════════════════════════════════════════════════════════════

import { compileExpression } from './expression-eval.js';

/**
 * Rename a column.
 * @param {import('arquero').ColumnTable} table
 * @param {string} oldName
 * @param {string} newName
 * @returns {import('arquero').ColumnTable}
 */
export function renameColumn(table, oldName, newName) {
  return table.rename({ [oldName]: newName });
}

/**
 * Change column data type (numeric↔text).
 * @param {import('arquero').ColumnTable} table
 * @param {string} column
 * @param {'numeric'|'text'} targetType
 * @returns {import('arquero').ColumnTable}
 */
export function changeColumnType(table, column, targetType) {
  if (targetType === 'numeric') {
    return table.derive({
      [column]: escape(d => {
        const v = d[column];
        if (v == null) return null;
        const n = Number(v);
        return isNaN(n) ? null : n;
      }),
    });
  }
  // text
  return table.derive({
    [column]: escape(d => d[column] == null ? null : String(d[column])),
  });
}

/**
 * Preview how many values in a column can convert to a target type.
 * @param {import('arquero').ColumnTable} table
 * @param {string} column
 * @param {'numeric'|'text'} targetType
 * @returns {{ convertible: number, total: number }}
 */
export function previewTypeConversion(table, column, targetType) {
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
 *
 * @param {import('arquero').ColumnTable} table
 * @param {string} newColName
 * @param {string} expression
 * @param {string[]} columnNames - valid column names for validation
 * @returns {import('arquero').ColumnTable}
 */
export function addCalculatedColumn(table, newColName, expression, columnNames) {
  const { fn, error } = compileExpression(expression, columnNames);
  if (error) throw new Error(error);
  return table.derive({
    [newColName]: escape(d => {
      try { return fn(d); }
      catch { return null; }
    }),
  });
}

/**
 * Recode values in a column using a mapping.
 * @param {import('arquero').ColumnTable} table
 * @param {string} column - source column
 * @param {Object<string, string>} mapping - { oldValue: newValue }
 * @param {string|null} newColName - if provided, write to new column
 * @returns {import('arquero').ColumnTable}
 */
export function recodeValues(table, column, mapping, newColName = null) {
  const target = newColName || column;
  return table.derive({
    [target]: escape(d => {
      const v = d[column];
      const key = v == null ? null : String(v);
      return key != null && key in mapping ? mapping[key] : v;
    }),
  });
}

/**
 * Bin a numeric column into categorical bins.
 * @param {import('arquero').ColumnTable} table
 * @param {string} column
 * @param {number} binCount
 * @param {string} newColName
 * @param {number[]|null} customBreaks - sorted breakpoints; if null, equal-width
 * @returns {import('arquero').ColumnTable}
 */
export function binColumn(table, column, binCount, newColName, customBreaks = null) {
  let breaks = customBreaks;
  if (!breaks) {
    const stats = table.rollup({ _min: op.min(column), _max: op.max(column) }).object();
    const range = stats._max - stats._min;
    const width = range / binCount;
    breaks = Array.from({ length: binCount - 1 }, (_, i) =>
      Math.round((stats._min + width * (i + 1)) * 1e6) / 1e6
    );
  }
  const b = breaks; // closure-safe copy
  return table.derive({
    [newColName]: escape(d => {
      const v = d[column];
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
 * @param {import('arquero').ColumnTable} table
 * @param {string} column
 * @param {string} delimiter
 * @param {number} maxParts
 * @returns {import('arquero').ColumnTable}
 */
export function splitColumn(table, column, delimiter, maxParts = 2) {
  const derived = {};
  for (let i = 0; i < maxParts; i++) {
    const name = `${column}_${i + 1}`;
    const idx = i;
    const delim = delimiter;
    derived[name] = escape(d => {
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
 * @param {import('arquero').ColumnTable} table
 * @param {string[]} columns - columns to concatenate
 * @param {string} separator
 * @param {string} newColName
 * @returns {import('arquero').ColumnTable}
 */
export function concatColumns(table, columns, separator, newColName) {
  const cols = columns; // closure-safe copy
  const sep = separator;
  return table.derive({
    [newColName]: escape(d => {
      return cols.map(c => d[c] ?? '').join(sep);
    }),
  });
}

// ═══════════════════════════════════════════════════════════════════
// Phase 3 — Data Validation & Quality
// ═══════════════════════════════��═══════════════════════════════════

/**
 * Validate a single column against a rule.
 * @param {import('arquero').ColumnTable} table
 * @param {string} colName
 * @param {{type: 'range'|'allowed'|'regex', min?: number, max?: number, values?: string[], pattern?: string}} rule
 * @returns {Set<number>} Set of invalid row indices
 */
export function validateColumn(table, colName, rule) {
  const arr = table.array(colName);
  const invalid = new Set();
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (v == null) continue;
    if (rule.type === 'range') {
      const num = Number(v);
      if (isNaN(num)) { invalid.add(i); continue; }
      if (rule.min != null && num < rule.min) invalid.add(i);
      if (rule.max != null && num > rule.max) invalid.add(i);
    } else if (rule.type === 'allowed') {
      if (!rule.values.includes(String(v))) invalid.add(i);
    } else if (rule.type === 'regex') {
      try {
        if (!new RegExp(rule.pattern).test(String(v))) invalid.add(i);
      } catch { invalid.add(i); }
    }
  }
  return invalid;
}

/**
 * Validate all columns that have validation rules.
 * @param {import('arquero').ColumnTable} table
 * @param {Array<{name: string, validation?: object}>} columns
 * @returns {Map<string, Set<number>>} column name → invalid row indices
 */
export function validateAllColumns(table, columns) {
  const result = new Map();
  for (const col of columns) {
    if (col.validation) {
      result.set(col.name, validateColumn(table, col.name, col.validation));
    }
  }
  return result;
}

/**
 * Profile a column — compute stats, histogram, top values.
 * @param {import('arquero').ColumnTable} table
 * @param {string} colName
 * @param {string} dtype - 'numeric' or 'text'
 * @returns {Object} profile result
 */
export function profileColumn(table, colName, dtype) {
  const arr = table.array(colName);
  const n = arr.length;
  let missing = 0;
  const values = [];
  for (let i = 0; i < n; i++) {
    if (arr[i] == null || arr[i] === '') missing++;
    else values.push(arr[i]);
  }
  const distinct = new Set(values.map(String)).size;
  const base = { count: n, missing, missingPct: n > 0 ? (missing / n * 100) : 0, distinct };

  if (dtype === 'numeric') {
    const nums = values.map(Number).filter(v => !isNaN(v)).sort((a, b) => a - b);
    if (nums.length === 0) return { ...base, mean: 0, std: 0, min: 0, max: 0, q1: 0, q3: 0, median: 0, p10: 0, p90: 0, skewness: 0, kurtosis: 0, cv: 0, outlierCount: 0, histogram: [] };
    const m = nums.length;
    const sum = nums.reduce((s, v) => s + v, 0);
    const mean = sum / m;
    const variance = nums.reduce((s, v) => s + (v - mean) ** 2, 0) / m;
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
    const counts = new Array(bins).fill(0);
    for (const v of nums) {
      const idx = Math.min(Math.floor((v - min) / width), bins - 1);
      counts[idx]++;
    }
    const maxCount = Math.max(...counts, 1);
    const histogram = counts.map(c => c / maxCount);

    return { ...base, mean, std, min, max, q1, q3, median, p10, p90, skewness, kurtosis, cv, outlierCount, histogram };
  }

  // Text dtype
  let emptyStrings = 0;
  for (const v of values) { if (String(v).trim() === '') emptyStrings++; }
  const freq = {};
  for (const v of values) { const s = String(v); freq[s] = (freq[s] || 0) + 1; }
  const allTopValues = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .map(([value, count]) => ({ value, count }));
  const topValues = allTopValues.slice(0, 10);
  const lengths = values.map(v => String(v).length);
  const minLength = lengths.length > 0 ? Math.min(...lengths) : 0;
  const maxLength = lengths.length > 0 ? Math.max(...lengths) : 0;

  // Balance: ratio of max to min frequency among top values (1.0 = perfectly even)
  const total = values.length || 1;
  const minFreq = allTopValues.length > 0 ? allTopValues[allTopValues.length - 1].count : 0;
  const maxFreq = allTopValues.length > 0 ? allTopValues[0].count : 0;
  const balanceRatio = minFreq > 0 ? maxFreq / minFreq : null; // 1.0 = even, high = skewed

  // Top-3 proportion bars for text sparkline
  const histogram = topValues.slice(0, 3).map(t => t.count / total);

  return { ...base, topValues, minLength, maxLength, emptyStrings, balanceRatio, histogram };
}
