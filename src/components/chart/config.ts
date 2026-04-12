import { fmt } from './utils.js';

/**
 * Monospace character width as a fraction of font size (IBM Plex Mono).
 */
const MONOSPACE_CHAR_WIDTH_RATIO = 0.6;

interface ChartLimitsForPadding {
  ucl: number;
  center: number;
  lcl: number;
}

interface PointForPadding {
  label?: string;
}

interface PhaseForPadding {
  start: number;
  end: number;
}

interface DataForPadding {
  points: PointForPadding[];
  limits: ChartLimitsForPadding;
  phases?: PhaseForPadding[];
  metric?: { label?: string };
}

export interface AdaptivePadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface AdaptiveLayout {
  padding: AdaptivePadding;
  yLabelFontSize: number;
  edgeLabelFontSize: number;
  showAxisTitles: boolean;
  phaseHeaderHeight: number;
}

export interface ChartCallbacks {
  onSelectPoint?: ((index: number | null) => void) | null;
  onSelectPhase?: ((index: number | null) => void) | null;
  onContextMenu?: ((x: number, y: number, info: { axis: string | null; target: string }) => void) | null;
  onAxisDrag?: ((info: AxisDragInfo) => void) | null;
  onAxisDragLive?: ((info: AxisDragInfo) => void) | null;
  onAxisReset?: ((axis: 'x' | 'y') => void) | null;
  onSelectPoints?: ((indices: number[] | null) => void) | null;
  onForecastActivity?: (() => void) | null;
  onActivateForecast?: (() => void) | null;
  onCancelForecast?: (() => void) | null;
  onForecastPromptEligibilityChange?: ((info: { eligible: boolean }) => void) | null;
}

export interface AxisDragInfo {
  axis: 'x' | 'y';
  min?: number;
  max?: number;
  yMin?: number;
  yMax?: number;
}

export interface SizedConfig extends ChartCallbacks {
  padding: AdaptivePadding;
  yLabelFontSize: number;
  edgeLabelFontSize: number;
  showAxisTitles: boolean;
  phaseHeaderHeight: number;
  width: number;
  height: number;
  xDomainOverride: { min: number; max: number } | null;
  xDefaultDomain: { min: number; max: number } | null;
  yDomainOverride: { yMin: number; yMax: number } | null;
  visibleForecastHorizon: number;
  forecastMode: string;
}

/**
 * Estimate pixel width of a string rendered in monospace at a given font size.
 */
function textWidth(str: string, fontSize: number): number {
  return str.length * fontSize * MONOSPACE_CHAR_WIDTH_RATIO;
}

/**
 * Pick a font size that keeps `text` within `budget` pixels.
 * Steps down from `max` to `min` in 1px increments.
 */
function fitFontSize(text: string, budget: number, max: number = 10, min: number = 7): number {
  for (let fs = max; fs > min; fs--) {
    if (textWidth(text, fs) <= budget) return fs;
  }
  return min;
}

/**
 * Adaptive padding algorithm: compute dynamic padding + font sizes from
 * actual data values and container dimensions.
 */
export function computeAdaptivePadding(data: DataForPadding, width: number, height: number): AdaptiveLayout {
  // ── Height pressure: scale factor for vertical padding ────────
  const vScale = Math.max(0.4, Math.min(1, height / 300));
  const showAxisTitles = height >= 180;
  const titleSpace = showAxisTitles ? 28 : 8;

  // ── Width pressure: scale factor for horizontal padding ───────
  const hScale = Math.max(0.5, Math.min(1, width / 400));

  // ── Y-axis (left) ────────────────────────────────────────────
  const yValues: number[] = [data.limits.ucl, data.limits.center, data.limits.lcl];
  const longestY = yValues.reduce((a: string, v: number) => {
    const s = fmt(v);
    return s.length > a.length ? s : a;
  }, '');
  const yBudget = Math.max(40, width * 0.15 * hScale);
  const yMaxFont = hScale < 0.7 ? 9 : 10;
  const yLabelFontSize = fitFontSize(longestY, yBudget, yMaxFont);
  const yLabelWidth = textWidth(longestY, yLabelFontSize);
  const yTitleGap = showAxisTitles ? 18 : 8;
  const left = Math.round(Math.max(22 * hScale, yLabelWidth + yTitleGap));

  // ── Edge labels (right) ──────────────────────────────────────
  const edgeTexts: string[] = [
    `UCL ${fmt(data.limits.ucl)}`,
    `CL ${fmt(data.limits.center)}`,
    `LCL ${fmt(data.limits.lcl)}`,
  ];
  const longestEdge = edgeTexts.reduce((a: string, t: string) => (t.length > a.length ? t : a), '');
  const edgeBudget = Math.max(40, width * 0.15 * hScale);
  const edgeMaxFont = hScale < 0.7 ? 9 : 10;
  const edgeLabelFontSize = fitFontSize(longestEdge, edgeBudget, edgeMaxFont);
  const edgeLabelWidth = textWidth(longestEdge, edgeLabelFontSize);
  const right = Math.round(Math.max(22 * hScale, edgeLabelWidth + 18 * hScale));

  // ── X-axis (bottom) ─────────────────────────────────────────
  const sampleLabel = data.points[0]?.label?.replace('LOT-', '') ?? '';
  const xBaseFontSize = sampleLabel.length > 10 ? 8 : sampleLabel.length > 6 ? 9 : 10;
  const xLabelWidth = textWidth(sampleLabel, xBaseFontSize);

  const plotWidth = width - left - right;
  const nPoints = data.points.length;
  const pointSpacing = nPoints > 1 ? plotWidth / (nPoints - 1) : plotWidth;

  const rotate45 = pointSpacing < xLabelWidth * 0.8;
  const rotate90 = pointSpacing < xLabelWidth * 0.2;
  const smallFont = rotate45 && pointSpacing < xLabelWidth * 0.35;
  const xFontSize = smallFont ? Math.max(7, xBaseFontSize - 2) : xBaseFontSize;
  const renderedLabelW = textWidth(sampleLabel, xFontSize);

  let labelDescent: number;
  if (rotate90) {
    labelDescent = renderedLabelW + 18;
  } else if (rotate45) {
    labelDescent = renderedLabelW * 0.707 + 18;
  } else {
    labelDescent = xFontSize + 22;
  }

  // Scale bottom padding with height pressure
  const idealBottom = labelDescent + titleSpace;
  const minBottom = 32 * vScale;
  let bottom = Math.round(Math.max(minBottom, idealBottom * vScale));

  // ── Phase header band (JMP-style: label strip above plot area) ──
  const hasPhases = data.phases && data.phases.length > 1;
  const phaseHeaderHeight = hasPhases ? Math.round(18 * vScale) : 0;

  // ── Clamp total vertical padding to ≤ 40% of height ─────────
  const top = Math.round(16 * vScale) + phaseHeaderHeight;
  const maxVerticalPad = height * 0.4;
  if (top + bottom > maxVerticalPad) {
    bottom = Math.round(maxVerticalPad - top);
  }

  return {
    padding: { top, right, bottom, left },
    yLabelFontSize,
    edgeLabelFontSize,
    showAxisTitles,
    phaseHeaderHeight,
  };
}

/** Default chart configuration — callbacks only.
 *  Padding is computed dynamically per render via computeAdaptivePadding().
 *  Width/height are derived from the container via ResizeObserver.
 */
export const DEFAULT_CHART_OPTIONS: ChartCallbacks & { padding: AdaptivePadding } = {
  padding: { top: 16, right: 40, bottom: 34, left: 36 }, // fallback only

  // Callbacks (set by app)
  onSelectPoint: null,
  onSelectPhase: null,
  onContextMenu: null,
};
