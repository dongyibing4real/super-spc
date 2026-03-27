import { fmt } from './utils.js';

/**
 * Render limit lines (UCL/CL/LCL/USL/LSL), sigma reference lines, and edge labels.
 */
export function renderLimits(layer, scales, data, config) {
  const { y, sigma } = scales;
  const L = config.padding.left;
  const R = config.width - config.padding.right;

  const yUCL = y(data.limits.ucl);
  const yCL = y(data.limits.center);
  const yLCL = y(data.limits.lcl);
  const yUSL = y(data.limits.usl);
  const yLSL = y(data.limits.lsl);
  const yS1U = y(sigma.s1u);
  const yS2U = y(sigma.s2u);
  const yS1L = y(sigma.s1l);
  const yS2L = y(sigma.s2l);

  // Clear and redraw (simpler than data join for static lines)
  layer.selectAll('*').remove();

  // Main limit lines
  const mainLines = [
    { y: yUCL, cls: 'limit-line critical', dash: null },
    { y: yCL, cls: 'limit-line center', dash: null },
    { y: yLCL, cls: 'limit-line critical', dash: null },
    { y: yUSL, cls: 'limit-line spec', dash: '4 6', color: 'rgba(139,92,246,0.35)' },
    { y: yLSL, cls: 'limit-line spec', dash: '4 6', color: 'rgba(139,92,246,0.35)' },
  ];

  mainLines.forEach(d => {
    const line = layer.append('line')
      .attr('class', d.cls)
      .attr('x1', L).attr('x2', R)
      .attr('y1', d.y).attr('y2', d.y);
    if (d.dash) line.attr('stroke-dasharray', d.dash);
    if (d.color) line.attr('stroke', d.color).attr('stroke-width', 1);
  });

  // Sigma reference lines (dashed, subtle)
  const sigmaLines = [
    { y: yS1U, color: 'rgba(35,133,81,0.15)' },
    { y: yS2U, color: 'rgba(200,118,25,0.15)' },
    { y: yS1L, color: 'rgba(35,133,81,0.15)' },
    { y: yS2L, color: 'rgba(200,118,25,0.15)' },
  ];

  sigmaLines.forEach(d => {
    layer.append('line')
      .attr('x1', L).attr('x2', R)
      .attr('y1', d.y).attr('y2', d.y)
      .attr('stroke', d.color)
      .attr('stroke-width', 0.5);
  });

  // Edge label pill backgrounds
  const pills = [
    { y: yUCL, fill: 'rgba(205,66,70,0.06)', w: 48 },
    { y: yCL, fill: 'rgba(35,133,81,0.06)', w: 42 },
    { y: yLCL, fill: 'rgba(205,66,70,0.06)', w: 48 },
  ];

  pills.forEach(d => {
    layer.append('rect')
      .attr('x', R + 2).attr('y', d.y - 8)
      .attr('width', d.w).attr('height', 14)
      .attr('rx', 2).attr('fill', d.fill);
  });

  // Edge label texts
  const edgeLabels = [
    { y: yUCL, text: `UCL ${fmt(data.limits.ucl)}`, fill: 'rgba(205,66,70,0.8)' },
    { y: yCL, text: `CL ${fmt(data.limits.center)}`, fill: 'rgba(35,133,81,0.9)' },
    { y: yLCL, text: `LCL ${fmt(data.limits.lcl)}`, fill: 'rgba(205,66,70,0.8)' },
    { y: yS1U, text: '+1\u03c3', fill: 'rgba(35,133,81,0.35)', size: '8px' },
    { y: yS2U, text: '+2\u03c3', fill: 'rgba(200,118,25,0.35)', size: '8px' },
    { y: yS1L, text: '-1\u03c3', fill: 'rgba(35,133,81,0.35)', size: '8px' },
    { y: yS2L, text: '-2\u03c3', fill: 'rgba(200,118,25,0.35)', size: '8px' },
  ];

  edgeLabels.forEach(d => {
    const t = layer.append('text')
      .attr('class', 'edge-label')
      .attr('x', R + 5).attr('y', d.y + 3)
      .attr('fill', d.fill)
      .text(d.text);
    if (d.size) t.style('font-size', d.size);
  });
}
