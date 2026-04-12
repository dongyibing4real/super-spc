/**
 * helpers.js — Shared utility functions.
 * Pure functions, no side effects, no mutable state.
 */

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function toneClass(tone: string): string {
  return ({ critical: "critical", info: "info", neutral: "neutral", positive: "positive", warning: "warning" } as Record<string, string>)[tone] || "neutral";
}

export function capClass(val: number | string, threshold: number = 1.33, marginal: number = 1.0): string {
  const v = parseFloat(String(val));
  if (v >= threshold) return "good";
  if (v >= marginal) return "marginal";
  return "poor";
}

interface StatsPoint {
  value?: number | null;
  primaryValue?: number | null;
  subgroup?: string | null;
}

interface StatsResult {
  n: number;
  mean: number;
  std: number;
  min: number;
  max: number;
  median: number;
  subgroupCount: number;
}

export function computeStats(points: StatsPoint[]): StatsResult | null {
  if (!points || !points.length) return null;
  const values = points.map(p => p.value).filter((v): v is number => v != null && !isNaN(v));
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

export function formatDate(isoStr: string | null | undefined): string {
  if (!isoStr) return "\u2014";
  const d = new Date(isoStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
