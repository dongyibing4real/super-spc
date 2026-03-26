/**
 * Render the selection halo circle at the selected point.
 * @param {string} [seriesKey='primaryValue'] - Which value key to position on
 */
export function renderSelection(layer, scales, data, seriesKey = 'primaryValue') {
  const { x, y } = scales;
  const { points, selectedIndex } = data;
  const sp = points[selectedIndex];
  if (!sp) return;

  const cx = x(selectedIndex);
  const cy = y(sp[seriesKey]);

  const halo = layer.selectAll('circle.selection-halo').data([1]);

  halo.enter()
    .append('circle')
    .attr('class', 'selection-halo')
    .attr('r', 10)
    .merge(halo)
    .attr('cx', cx)
    .attr('cy', cy);
}
