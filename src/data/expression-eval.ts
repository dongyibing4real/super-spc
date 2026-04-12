/**
 * expression-eval.js — Safe expression evaluator for calculated columns.
 *
 * Supports: +, -, *, /, (), column refs as [ColName],
 * functions: round, abs, log, sqrt, pow, min, max
 *
 * No eval() — compiles expression to a safe JS function via whitelist.
 */

type RowAccessor = (row: Record<string, number | string | null>) => number;

export interface CompileResult {
  fn: RowAccessor | null;
  error: string | null;
}

const ALLOWED_FUNCTIONS: Set<string> = new Set([
  'round', 'abs', 'log', 'sqrt', 'pow', 'min', 'max',
  'floor', 'ceil', 'exp',
]);

const BLOCKED_TOKENS: RegExp = /\b(import|require|fetch|window|document|eval|Function|setTimeout|setInterval|alert|prompt|confirm)\b/;
const BLOCKED_CHARS: RegExp = /[`;{}\\]/;

/**
 * Compile a simple arithmetic expression into a reusable function.
 *
 * Column references use bracket syntax: [ColumnName]
 * Example: "[Thickness] * 25.4 + round([Offset])"
 */
export function compileExpression(expression: string, columnNames: string[]): CompileResult {
  if (!expression || !expression.trim()) {
    return { fn: null, error: 'Expression is empty' };
  }

  // Security checks
  if (BLOCKED_TOKENS.test(expression)) {
    return { fn: null, error: 'Expression contains blocked keywords' };
  }
  if (BLOCKED_CHARS.test(expression)) {
    return { fn: null, error: 'Expression contains invalid characters' };
  }

  // Extract and validate column references
  const colRefs: string[] = [];
  const colPattern = /\[([^\]]+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = colPattern.exec(expression)) !== null) {
    const colName = match[1];
    if (!columnNames.includes(colName)) {
      return { fn: null, error: `Unknown column: [${colName}]` };
    }
    colRefs.push(colName);
  }

  if (colRefs.length === 0) {
    return { fn: null, error: 'Expression must reference at least one column using [ColumnName]' };
  }

  // Build the function body:
  // 1. Replace [ColName] with row['ColName']
  let body = expression.replace(colPattern, (_: string, name: string) => `__row__[${JSON.stringify(name)}]`);

  // 2. Replace function names with Math.xxx
  for (const fname of ALLOWED_FUNCTIONS) {
    const fnPattern = new RegExp(`\\b${fname}\\b`, 'g');
    body = body.replace(fnPattern, `Math.${fname}`);
  }

  // 3. Validate remaining tokens — only allow digits, operators, parens, dots, commas, whitespace, Math.xxx, __row__
  const cleaned = body
    .replace(/Math\.\w+/g, '')      // remove Math.xxx
    .replace(/__row__\[[^\]]+\]/g, '') // remove row accessors
    .replace(/[\d.]+/g, '')          // remove numbers
    .replace(/[+\-*/(),\s]/g, '');   // remove operators, parens, commas, whitespace

  if (cleaned.length > 0) {
    return { fn: null, error: `Invalid tokens in expression: "${cleaned}"` };
  }

  // 4. Compile to function
  try {
    // Using Function constructor with strict whitelist — the body has been validated above
    const fn = new Function('__row__', `"use strict"; return (${body});`) as RowAccessor;

    // Test with a dummy row to catch syntax errors
    const testRow: Record<string, number> = {};
    for (const c of colRefs) testRow[c] = 1;
    const testResult = fn(testRow);
    if (typeof testResult !== 'number' || isNaN(testResult)) {
      // Not necessarily an error — could be valid with real data
    }

    return { fn, error: null };
  } catch (err) {
    return { fn: null, error: `Syntax error: ${(err as Error).message}` };
  }
}
