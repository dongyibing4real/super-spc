/**
 * csv-engine.js — Client-side CSV parsing with type detection and role suggestion.
 *
 * Replaces the server-side csv_parser.py with a client-first approach.
 * Uses PapaParse for parsing, then adds dtype detection and SPC role suggestion.
 */
import Papa from 'papaparse';

type ColumnDtype = 'numeric' | 'datetime' | 'text';
type ColumnRole = 'value' | 'subgroup' | 'phase' | 'label' | null;

export interface CSVColumn {
  name: string;
  ordinal: number;
  dtype: ColumnDtype;
  role: ColumnRole;
}

export interface CSVParseResult {
  columns: CSVColumn[];
  rows: Record<string, string>[];
  errors: Papa.ParseError[];
  delimiter: string;
}

export interface CSVPreviewResult {
  columns: CSVColumn[];
  rows: Record<string, string>[];
}

// SPC-specific column name conventions
const VALUE_NAMES: Set<string> = new Set([
  'thickness', 'value', 'measurement', 'result', 'reading',
  'weight', 'length', 'width', 'height', 'diameter',
  'temperature', 'pressure', 'concentration',
]);
const SUBGROUP_NAMES: Set<string> = new Set([
  'hour', 'subgroup', 'batch', 'sample', 'group',
  'lot', 'shift', 'operator', 'machine', 'cavity', 'stream',
]);
const PHASE_NAMES: Set<string> = new Set(['phase', 'period', 'stage', 'run']);
const LABEL_NAMES: Set<string> = new Set(['label', 'id', 'name', 'serial', 'part']);

// Datetime patterns for detection
const DATE_PATTERNS: RegExp[] = [
  /^\d{4}-\d{2}-\d{2}$/,                          // YYYY-MM-DD
  /^\d{1,2}\/\d{1,2}\/\d{4}$/,                    // M/D/YYYY
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/,     // YYYY-MM-DD HH:MM:SS
  /^\d{1,2}\/\d{1,2}\/\d{4} \d{2}:\d{2}$/,        // M/D/YYYY HH:MM
];

/**
 * Detect column dtype by sampling values.
 */
export function detectDtype(values: string[]): ColumnDtype {
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
 */
export function suggestRole(name: string, _dtype: ColumnDtype): ColumnRole {
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
 */
export function parseCSV(file: File): Promise<CSVParseResult> {
  return new Promise((resolve, reject) => {
    const completeHandler = (results: Papa.ParseResult<Record<string, string>>): void => {
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

      const columns: CSVColumn[] = fields.map((name: string, ordinal: number) => {
        const colValues = results.data.map((row: Record<string, string>) => row[name] ?? '');
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
    };

    const errorHandler = (err: Error): void => {
      reject(err);
    };

    // Try Web Worker, fall back to main thread
    const baseConfig = { header: true, dynamicTyping: false as const, skipEmptyLines: true, complete: completeHandler, error: errorHandler };
    try {
      (Papa.parse as unknown as (input: File, config: Record<string, unknown>) => void)(file, { ...baseConfig, worker: true });
    } catch {
      (Papa.parse as unknown as (input: File, config: Record<string, unknown>) => void)(file, { ...baseConfig, worker: false });
    }
  });
}

/**
 * Parse only the first N rows for preview.
 */
export function previewCSV(file: File, previewRows: number = 100): Promise<CSVPreviewResult> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      dynamicTyping: false,
      skipEmptyLines: true,
      preview: previewRows,
      complete(results: Papa.ParseResult<Record<string, string>>) {
        if (!results.meta.fields || results.meta.fields.length === 0) {
          reject(new Error('CSV has no headers'));
          return;
        }
        const fields = results.meta.fields;
        const columns: CSVColumn[] = fields.map((name: string, ordinal: number) => {
          const colValues = results.data.map((row: Record<string, string>) => row[name] ?? '');
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
