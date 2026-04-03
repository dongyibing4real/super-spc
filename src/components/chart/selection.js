/**
 * Render selection state (JMP-style).
 *
 * This is currently a no-op stub. Selection is handled entirely in
 * renderPoints via opacity modulation — selected points stay at full
 * opacity, unselected dim to 0.35. No additional geometry (crosshairs,
 * halos) is rendered.
 *
 * The stub is retained so the layer contract is consistent and a future
 * implementation (e.g., crosshair overlay, tooltip anchor) can be added
 * without changing the call site in index.js renderAll().
 *
 * JMP/Minitab convention: selection is communicated through contrast,
 * not added geometry.
 */
export function renderSelection(layer, scales, data, seriesKey = 'primaryValue', config) {
  // No-op: selection visuals are applied directly in renderPoints.
  layer.selectAll('*').remove();
}
