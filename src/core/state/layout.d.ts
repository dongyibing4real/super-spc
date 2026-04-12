import type { ChartLayout } from "../../types/state.ts";

export function collectChartIds(layout: ChartLayout): string[];
export function removeChartFromLayout(layout: ChartLayout, chartId: string): ChartLayout;
