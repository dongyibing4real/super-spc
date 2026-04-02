/**
 * Render the selection crosshair at the selected point.
 * Industry standard (JMP): thin crosshair lines, not a halo ring.
 * @param {string} [seriesKey='primaryValue'] - Which value key to position on
 * @param {object} [config] - Chart config with width/padding for sizing
 */
export function renderSelection(layer, scales, data, seriesKey = 'primaryValue', config) {
  const { x, y } = scales;
  const { points, selectedIndex } = data;
  const sp = points[selectedIndex];

  layer.selectAll('*').remove();
  if (!sp) return;

  const cx = x(selectedIndex);
  const cy = y(sp[seriesKey]);

  // Crosshair arm length scales with density but stays subtle
  let arm = 6;
  if (config) {
    const plotWidth = config.width - config.padding.left - config.padding.right;
    const spacing = points.length > 1 ? plotWidth / (points.length - 1) : plotWidth;
    const scale = Math.max(0.4, Math.min(1, spacing / 12));
    arm = Math.max(4, 6 * scale);
  }

  const gap = 3; // gap around point center so crosshair doesn't overlap the dot

  // Horizontal crosshair segments
  layer.append('line')
    .attr('class', 'selection-crosshair')
    .attr('x1', cx - arm - gap).attr('x2', cx - gap)
    .attr('y1', cy).attr('y2', cy);
  layer.append('line')
    .attr('class', 'selection-crosshair')
    .attr('x1', cx + gap).attr('x2', cx + arm + gap)
    .attr('y1', cy).attr('y2', cy);

  // Vertical crosshair segments
  layer.append('line')
    .attr('class', 'selection-crosshair')
    .attr('x1', cx).attr('x2', cx)
    .attr('y1', cy - arm - gap).attr('y2', cy - gap);
  layer.append('line')
    .attr('class', 'selection-crosshair')
    .attr('x1', cx).attr('x2', cx)
    .attr('y1', cy + gap).attr('y2', cy + arm + gap);
}
