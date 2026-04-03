/** Format a number to 3 decimal places, handling null/undefined/non-finite gracefully. */
export function fmt(v) {
  return v != null && Number.isFinite(v) ? v.toFixed(3) : '—';
}

/** Clamp a value to [min, max]. Shared across chart modules to avoid per-file copies. */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
