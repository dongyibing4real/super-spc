import { fmt } from './utils.js';

/** Monospace character width as a fraction of font size (IBM Plex Mono). */
const MONO_RATIO = 0.6;

/**
 * Estimate pixel width of a string rendered in monospace at a given font size.
 */
function textWidth(str, fontSize) {
  return str.length * fontSize * MONO_RATIO;
}

/**
 * Pick a font size that keeps `text` within `budget` pixels.
 * Steps down from `max` to `min` in 1px increments.
 */
function fitFontSize(text, budget, max = 10, min = 7) {
  for (let fs = max; fs > min; fs--) {
    if (textWidth(text, fs) <= budget) return fs;
  }
  return min;
}

/**
 * Compute dynamic padding + font sizes from actual data values.
 * Called at the start of every render so the chart adapts to any dataset.
 *
 * Height-aware: when the container is small, padding scales down proportionally
 * to preserve at least 60% of height for the plot area. Font sizes reduce and
 * axis title space is dropped at very small sizes.
 *
 * @param {object} data - chart data (points, limits, metric)
 * @param {number} width - container width in px
 * @param {number} height - container height in px
 * @returns {{ padding, yLabelFontSize, edgeLabelFontSize, showAxisTitles }}
 */
export function computeLayout(data, width, height) {
  // ── Height pressure: scale factor for vertical padding ────────
  // At height ≥ 300px: full padding. Below that, linearly compress.
  // Floor at 0.4 prevents labels from disappearing entirely.
  const vScale = Math.max(0.4, Math.min(1, height / 300));
  // Whether to show axis titles (hide below 180px to save space)
  const showAxisTitles = height >= 180;
  // Title space contribution to padding
  const titleSpace = showAxisTitles ? 28 : 8;

  // ── Width pressure: scale factor for horizontal padding ───────
  const hScale = Math.max(0.5, Math.min(1, width / 400));

  // ── Y-axis (left) ────────────────────────────────────────────
  const yValues = [data.limits.ucl, data.limits.center, data.limits.lcl];
  const longestY = yValues.reduce((a, v) => {
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
  const edgeTexts = [
    `UCL ${fmt(data.limits.ucl)}`,
    `CL ${fmt(data.limits.center)}`,
    `LCL ${fmt(data.limits.lcl)}`,
  ];
  const longestEdge = edgeTexts.reduce((a, t) => (t.length > a.length ? t : a), '');
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

  let labelDescent;
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
 *  Padding is computed dynamically per render via computeLayout().
 *  Width/height are derived from the container via ResizeObserver.
 */
export const DEFAULT_CONFIG = {
  padding: { top: 16, right: 40, bottom: 34, left: 36 }, // fallback only

  // Callbacks (set by app)
  onSelectPoint: null,
  onContextMenu: null,
};
