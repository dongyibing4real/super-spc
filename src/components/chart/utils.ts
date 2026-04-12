/** Format a number to 3 decimal places, handling null/undefined/non-finite gracefully. */
export function fmt(v) {
  return v != null && Number.isFinite(v) ? v.toFixed(3) : '—';
}

/** Re-exported from helpers.js — single canonical copy. */
export { clamp } from '../../helpers.js';
