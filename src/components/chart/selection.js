/**
 * Render selection state (JMP-style).
 *
 * When a point is selected:
 *   - Selected point stays at full opacity
 *   - All other points dim to 0.35 opacity
 *   - No crosshair arms — opacity differentiation is the signal
 *
 * This matches JMP/Minitab convention where selection is communicated
 * through contrast, not added geometry.
 */
export function renderSelection(layer, scales, data, seriesKey = 'primaryValue', config) {
  // Selection layer is no longer used for crosshair rendering.
  // Instead, selection state is applied via CSS class on the points layer.
  layer.selectAll('*').remove();
}
