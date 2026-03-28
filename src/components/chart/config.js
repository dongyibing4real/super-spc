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
 * @param {object} data - chart data (points, limits, metric)
 * @param {number} width - container width in px
 * @param {number} height - container height in px
 * @returns {{ padding, yLabelFontSize, edgeLabelFontSize }}
 */
export function computeLayout(data, width, height) {
  // ── Y-axis (left) ────────────────────────────────────────────
  // Longest formatted tick value drives left padding.
  const yValues = [data.limits.ucl, data.limits.center, data.limits.lcl];
  const longestY = yValues.reduce((a, v) => {
    const s = fmt(v);
    return s.length > a.length ? s : a;
  }, '');
  // Target: label fits in ≤15% of width, font 8–11px
  const yBudget = Math.max(50, width * 0.15);
  const yLabelFontSize = fitFontSize(longestY, yBudget);
  const yLabelWidth = textWidth(longestY, yLabelFontSize);
  const left = Math.round(Math.max(28, yLabelWidth + 10));

  // ── Edge labels (right) ──────────────────────────────────────
  const edgeTexts = [
    `UCL ${fmt(data.limits.ucl)}`,
    `CL ${fmt(data.limits.center)}`,
    `LCL ${fmt(data.limits.lcl)}`,
  ];
  const longestEdge = edgeTexts.reduce((a, t) => (t.length > a.length ? t : a), '');
  const edgeBudget = Math.max(50, width * 0.15);
  const edgeLabelFontSize = fitFontSize(longestEdge, edgeBudget);
  const edgeLabelWidth = textWidth(longestEdge, edgeLabelFontSize);
  // pill starts at R+2, has 6px padding each side → total = 2 + textWidth + 12 + 2 (safety)
  const right = Math.round(Math.max(28, edgeLabelWidth + 18));

  // ── X-axis (bottom) ─────────────────────────────────────────
  // Estimate rotation from point density vs label width, mirroring axes.js logic.
  const sampleLabel = data.points[0]?.label?.replace('LOT-', '') ?? '';
  const xBaseFontSize = sampleLabel.length > 10 ? 8 : sampleLabel.length > 6 ? 9 : 10;
  const xLabelWidth = textWidth(sampleLabel, xBaseFontSize);

  // Use provisional left/right to estimate plot width → point spacing → rotation
  const plotWidth = width - left - right;
  const nPoints = data.points.length;
  const pointSpacing = nPoints > 1 ? plotWidth / (nPoints - 1) : plotWidth;

  const rotate45 = pointSpacing < xLabelWidth * 0.8;
  const rotate90 = pointSpacing < xLabelWidth * 0.2;
  const smallFont = rotate45 && pointSpacing < xLabelWidth * 0.35;
  const xFontSize = smallFont ? Math.max(7, xBaseFontSize - 2) : xBaseFontSize;
  const renderedLabelW = textWidth(sampleLabel, xFontSize);

  // Vertical extent below the baseline depends on rotation angle.
  // rotate(-90°) and rotate(-45°) pivot at the anchor point:
  //   -90°: text runs upward — below-anchor extent is full label width
  //   -45°: text runs up-left — below-anchor extent ≈ width × sin(45°)
  //    0°:  text is horizontal — below-anchor extent is ~fontSize
  // Each includes: gap from baseline to label top (12-16px) + text extent + breathing room
  let labelDescent;
  if (rotate90) {
    labelDescent = renderedLabelW + 18;
  } else if (rotate45) {
    labelDescent = renderedLabelW * 0.707 + 18;
  } else {
    labelDescent = xFontSize + 22;
  }
  const bottom = Math.round(Math.max(52, labelDescent + 16));

  return {
    padding: { top: 16, right, bottom, left },
    yLabelFontSize,
    edgeLabelFontSize,
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
