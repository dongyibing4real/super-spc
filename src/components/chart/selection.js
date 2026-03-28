/**
 * Render the selection halo circle at the selected point.
 * @param {string} [seriesKey='primaryValue'] - Which value key to position on
 * @param {object} [config] - Chart config with width/padding for density scaling
 */
export function renderSelection(layer, scales, data, seriesKey = 'primaryValue', config) {
  const { x, y } = scales;
  const { points, selectedIndex } = data;
  const sp = points[selectedIndex];
  if (!sp) return;

  // Scale halo radius to point density
  let haloR = 10;
  if (config) {
    const plotWidth = config.width - config.padding.left - config.padding.right;
    const spacing = points.length > 1 ? plotWidth / (points.length - 1) : plotWidth;
    const scale = Math.max(0.4, Math.min(1, spacing / 12));
    haloR = Math.max(4, 10 * scale);
  }

  const cx = x(selectedIndex);
  const cy = y(sp[seriesKey]);

  const halo = layer.selectAll('circle.selection-halo').data([1]);

  halo.enter()
    .append('circle')
    .attr('class', 'selection-halo')
    .merge(halo)
    .attr('r', haloR)
    .attr('cx', cx)
    .attr('cy', cy);
}
