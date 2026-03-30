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
        [column]: d => op.trim(d[column]),
      });
    case 'lower':
      return table.derive({
        [column]: d => op.lower(d[column]),
      });
    case 'upper':
      return table.derive({
        [column]: d => op.upper(d[column]),
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
