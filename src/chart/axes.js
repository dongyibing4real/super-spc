/**
 * Render X-axis baseline and lot labels.
 */
export function renderAxes(layer, scales, data, config) {
  const { x, y } = scales;
  const L = config.padding.left;
  const R = config.width - config.padding.right;
  const B = config.height - config.padding.bottom;

  layer.selectAll('*').remove();

  // X-axis baseline
  layer.append('line')
    .attr('x1', L).attr('x2', R)
    .attr('y1', B).attr('y2', B)
    .attr('stroke', 'var(--chart-grid)')
    .attr('stroke-width', 0.5);

  // X-axis lot labels (every other + always show selected)
  data.points.forEach((p, i) => {
    const label = p.lot.replace('LOT-', '');
    const isSelected = i === data.selectedIndex;
    if (!isSelected && i % 2 !== 0) return;

    const text = layer.append('text')
      .attr('class', 'x-axis-label')
      .attr('x', x(i))
      .attr('y', B + 16)
      .attr('text-anchor', 'middle')
      .text(label);

    if (isSelected) {
      text.style('fill', 'var(--blue)').style('font-weight', '600');
    }
  });
}
