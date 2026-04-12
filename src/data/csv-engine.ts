/**
 * csv-engine.js — Client-side CSV parsing with type detection and role suggestion.
 *
 * Replaces the server-side csv_parser.py with a client-first approach.
 * Uses PapaParse for parsing, then adds dtype detection and SPC role suggestion.
 */
import Papa from 'papaparse';

// SPC-specific column name conventions
const VALUE_NAMES = new Set([
  'thickness', 'value', 'measurement', 'result', 'reading',
  'weight', 'length', 'width', 'height', 'diameter',
  'temperature', 'pressure', 'concentration',
]);
const SUBGROUP_NAMES = new Set([
  'hour', 'subgroup', 'batch', 'sample', 'group',
  'lot', 'shift', 'operator', 'machine', 'cavity', 'stream',
]);
const PHASE_NAMES = new Set(['phase', 'period', 'stage', 'run']);
const LABEL_NAMES = new Set(['label', 'id', 'name', 'serial', 'part']);

// Datetime patterns for detection
const DATE_PATTERNS = [
  /^\d{4}-\d{2}-\d{2}$/,                          // YYYY-MM-DD
  /^\d{1,2}\/\d{1,2}\/\d{4}$/,                    // M/D/YYYY
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/,     // YYYY-MM-DD HH:MM:SS
  /^\d{1,2}\/\d{1,2}\/\d{4} \d{2}:\d{2}$/,        // M/D/YYYY HH:MM
];

/**
 * Detect column dtype by sampling values.
 * @param {string[]} values - Raw string values from the column
 * @returns {'numeric' | 'datetime' | 'text'}
 */
export function detectDtype(values) {
  const sample = values.slice(0, 50);
  let total = 0, numericCount = 0, dateCount = 0;

  for (const v of sample) {
    const trimmed = (v ?? '').toString().trim();
    if (!trimmed) continue;
    total++;

    // Try numeric
    if (!isNaN(Number(trimmed))) {
      numericCount++;
      continue;
    }

    // Try datetime patterns
    if (DATE_PATTERNS.some(p => p.test(trimmed))) {
      dateCount++;
    }
  }

  if (total === 0) return 'text';
  if (numericCount / total > 0.8) return 'numeric';
  if (dateCount / total > 0.8) return 'datetime';
  return 'text';
}

/**
 * Suggest SPC role for a column based on its name.
 * @param {string} name - Column name
 * @param {string} dtype - Detected dtype
 * @returns {'value' | 'subgroup' | 'phase' | 'label' | null}
 */
export function suggestRole(name, dtype) {
  const lower = name.trim().toLowerCase();
  if (VALUE_NAMES.has(lower)) return 'value';
  if (SUBGROUP_NAMES.has(lower)) return 'subgroup';
  if (PHASE_NAMES.has(lower)) return 'phase';
  if (LABEL_NAMES.has(lower)) return 'label';
  return null;
}

/**
 * Parse a CSV file and return structured data.
 *
 * Returns raw string values for server storage (round-trip safe)
 * and column metadata with dtype/role suggestions.
 *
 * @param {File} file - The CSV file to parse
 * @returns {Promise<{columns: Array, rows: Array<Object>, errors: Array, delimiter: string}>}
 */
export function parseCSV(file) {
  return new Promise((resolve, reject) => {
    const config = {
      header: true,
      dynamicTyping: false,  // Keep raw strings for round-trip fidelity
      skipEmptyLines: true,
      complete(results) {
        if (!results.meta.fields || results.meta.fields.length === 0) {
          reject(new Error('CSV has no headers'));
          return;
        }
        if (results.data.length === 0) {
          reject(new Error('CSV has no data rows'));
          return;
        }

        const fields = results.meta.fields;
        let valueSuggested = false;

        const columns = fields.map((name, ordinal) => {
          const colValues = results.data.map(row => row[name] ?? '');
          const dtype = detectDtype(colValues);
          let role = suggestRole(name, dtype);

          // Only suggest one value column
          if (role === 'value') {
            if (valueSuggested) role = null;
            else valueSuggested = true;
          }

          return { name, ordinal, dtype, role };
        });

        // If no value column suggested by name, pick first numeric
        if (!valueSuggested) {
          const firstNumeric = columns.find(c => c.dtype === 'numeric');
          if (firstNumeric) firstNumeric.role = 'value';
        }

        resolve({
          columns,
          rows: results.data,
          errors: results.errors,
          delimiter: results.meta.delimiter,
        });
      },
      error(err) {
        reject(err);
      },
    };

    // Try Web Worker, fall back to main thread
    try {
      Papa.parse(file, { ...config, worker: true });
    } catch {
      Papa.parse(file, { ...config, worker: false });
    }
  });
}

/**
 * Parse only the first N rows for preview.
 * @param {File} file
 * @param {number} previewRows
 * @returns {Promise<{columns: Array, rows: Array<Object>}>}
 */
export function previewCSV(file, previewRows = 100) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      dynamicTyping: false,
      skipEmptyLines: true,
      preview: previewRows,
      complete(results) {
        if (!results.meta.fields || results.meta.fields.length === 0) {
          reject(new Error('CSV has no headers'));
          return;
        }
        const fields = results.meta.fields;
        const columns = fields.map((name, ordinal) => {
          const colValues = results.data.map(row => row[name] ?? '');
          const dtype = detectDtype(colValues);
          const role = suggestRole(name, dtype);
          return { name, ordinal, dtype, role };
        });
        resolve({ columns, rows: results.data });
      },
      error: reject,
    });
  });
}
