import type { ChartSlot, SPCState } from "../../types/state.ts";

export function getFirstChart(state: SPCState): ChartSlot;
export function getFocused(state: SPCState): ChartSlot;
export function getFailedTransformCount(state: SPCState): number;
export function getCapability(state: SPCState, chartId: string): { cp: number; cpk: number; ppk: number } | null;
export function detectRuleViolations(state: SPCState, chartId: string): Map<number, string[]>;
export function buildMethodLabComparison(state: SPCState): unknown[];
export function buildDisagreements(state: SPCState, chartIds: string[]): unknown[];
export function deriveWorkspace(state: SPCState): Record<string, unknown>;
