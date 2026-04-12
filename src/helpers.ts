/**
 * helpers.js — Shared utility functions.
 * Pure functions, no side effects, no mutable state.
 */

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function toneClass(tone) {
  return { critical: "critical", info: "info", neutral: "neutral", positive: "positive", warning: "warning" }[tone] || "neutral";
}

export function capClass(val, threshold = 1.33, marginal = 1.0) {
  const v = parseFloat(val);
  if (v >= threshold) return "good";
  if (v >= marginal) return "marginal";
  return "poor";
}

export function computeStats(points) {
  if (!points || !points.length) return null;
  const values = points.map(p => p.value).filter(v => v != null && !isNaN(v));
  const n = values.length;
  if (n === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((s, v) => s + v, 0);
  const mean = sum / n;
  const variance = n > 1 ? values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1) : 0;
  const std = Math.sqrt(variance);
  const median = n % 2 ? sorted[Math.floor(n / 2)] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const subgroups = new Set(points.map(p => p.subgroup).filter(Boolean));
  return { n, mean, std, min: sorted[0], max: sorted[n - 1], median, subgroupCount: subgroups.size };
}

export function formatDate(isoStr) {
  if (!isoStr) return "\u2014";
  const d = new Date(isoStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
