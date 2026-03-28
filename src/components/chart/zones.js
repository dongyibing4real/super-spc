/**
 * Render zone shading (1σ/2σ/3σ bands) per DESIGN.md.
 * Zone A (2σ–3σ): red tint. Zone B (1σ–2σ): amber tint. Zone C (0–1σ): green tint.
 */
export function renderZones(layer, scales, data, config) {
  const { y, sigma } = scales;
  const L = config.padding.left;
  const R = config.width - config.padding.right;
  const w = R - L;

  const yUCL = y(data.limits.ucl);
  const yS2U = y(sigma.s2u);
  const yS1U = y(sigma.s1u);
  const yCL = y(data.limits.center);
  const yS1L = y(sigma.s1l);
  const yS2L = y(sigma.s2l);
  const yLCL = y(data.limits.lcl);

  const zones = [
    { key: 'a-upper', y: yUCL, h: yS2U - yUCL, fill: 'rgba(205,66,70,0.06)' },
    { key: 'b-upper', y: yS2U, h: yS1U - yS2U, fill: 'rgba(200,118,25,0.04)' },
    { key: 'c-upper', y: yS1U, h: yCL - yS1U, fill: 'rgba(35,133,81,0.04)' },
    { key: 'c-lower', y: yCL, h: yS1L - yCL, fill: 'rgba(35,133,81,0.04)' },
    { key: 'b-lower', y: yS1L, h: yS2L - yS1L, fill: 'rgba(200,118,25,0.04)' },
    { key: 'a-lower', y: yS2L, h: yLCL - yS2L, fill: 'rgba(205,66,70,0.06)' },
  ];

  const sel = layer.selectAll('rect').data(zones, d => d.key);

  sel.enter()
    .append('rect')
    .merge(sel)
    .attr('x', L)
    .attr('y', d => d.y)
    .attr('width', w)
    .attr('height', d => d.h)
    .attr('fill', d => d.fill);

  sel.exit().remove();
}
