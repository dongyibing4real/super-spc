import { fmt } from './utils.js';

/**
 * Render limit lines (UCL/CL/LCL/USL/LSL), sigma reference lines, and edge labels.
 *
 * When data.phases has multiple phases, control limit lines (UCL/CL/LCL) and
 * sigma reference lines are drawn as per-phase segments with independently
 * computed y-positions (JMP convention: each phase has its own limits).
 */
export function renderLimits(layer, labelLayer, scales, data, config) {
  const { x, y, sigma } = scales;
  const L = config.padding.left;
  const R = config.width - config.padding.right;

  // Clear and redraw
  layer.selectAll('*').remove();
  labelLayer.selectAll('*').remove();

  const phases = data.phases && data.phases.length > 1 ? data.phases : null;

  if (phases) {
    _renderPerPhaseLimits(layer, labelLayer, x, y, phases, data, config, L, R);
  } else {
    _renderSinglePhaseLimits(layer, labelLayer, y, sigma, data, config, L, R);
  }
}

/** Single-phase rendering — original behavior with full-width horizontal lines. */
function _renderSinglePhaseLimits(layer, labelLayer, y, sigma, data, config, L, R) {
  const yUCL = y(data.limits.ucl);
  const yCL = y(data.limits.center);
  const yLCL = y(data.limits.lcl);
  const yUSL = y(data.limits.usl);
  const yLSL = y(data.limits.lsl);
  const yTarget = data.limits.target != null ? y(data.limits.target) : null;
  const yS1U = y(sigma.s1u);
  const yS2U = y(sigma.s2u);
  const yS1L = y(sigma.s1l);
  const yS2L = y(sigma.s2l);

  // Main limit lines — thin and reference-grade, never heavier than the data series
  const mainLines = [
    { y: yUCL, cls: 'limit-line critical', dash: null },
    { y: yCL, cls: 'limit-line center', dash: null },
    { y: yLCL, cls: 'limit-line critical', dash: null },
    { y: yUSL, cls: 'limit-line spec', dash: '3 4', color: 'rgba(139,92,246,0.30)' },
    { y: yLSL, cls: 'limit-line spec', dash: '3 4', color: 'rgba(139,92,246,0.30)' },
    ...(yTarget != null ? [{ y: yTarget, cls: 'limit-line spec target', dash: '2 3', color: 'rgba(139,92,246,0.40)' }] : []),
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

  // Edge labels
  _renderEdgeLabels(labelLayer, y, sigma, data, config, R);
}

/** Per-phase rendering — each phase gets its own limit line segments. */
function _renderPerPhaseLimits(layer, labelLayer, x, y, phases, data, config, L, R) {
  const yUSL = y(data.limits.usl);
  const yLSL = y(data.limits.lsl);
  const yTarget = data.limits.target != null ? y(data.limits.target) : null;

  // Spec limits span the full chart (not phase-specific)
  [
    { y: yUSL, cls: 'limit-line spec', dash: '3 4', color: 'rgba(139,92,246,0.30)' },
    { y: yLSL, cls: 'limit-line spec', dash: '3 4', color: 'rgba(139,92,246,0.30)' },
    ...(yTarget != null ? [{ y: yTarget, cls: 'limit-line spec target', dash: '2 3', color: 'rgba(139,92,246,0.40)' }] : []),
  ].forEach(d => {
    const line = layer.append('line')
      .attr('class', d.cls)
      .attr('x1', L).attr('x2', R)
      .attr('y1', d.y).attr('y2', d.y);
    if (d.dash) line.attr('stroke-dasharray', d.dash);
    if (d.color) line.attr('stroke', d.color).attr('stroke-width', 1);
  });

  // Per-phase control limits and sigma lines
  phases.forEach(phase => {
    const x1 = x(phase.start);
    const x2 = x(phase.end - 1);
    const yUCL = y(phase.limits.ucl);
    const yCL = y(phase.limits.center);
    const yLCL = y(phase.limits.lcl);

    // UCL / CL / LCL
    [
      { yVal: yUCL, cls: 'limit-line critical' },
      { yVal: yCL, cls: 'limit-line center' },
      { yVal: yLCL, cls: 'limit-line critical' },
    ].forEach(d => {
      layer.append('line')
        .attr('class', d.cls)
        .attr('x1', x1).attr('x2', x2)
        .attr('y1', d.yVal).attr('y2', d.yVal);
    });

    // Sigma reference lines per phase
    const sigmaVal = (phase.limits.ucl - phase.limits.center) / 3;
    const sigmaRefs = [
      { yVal: y(phase.limits.center + sigmaVal), color: 'rgba(35,133,81,0.15)' },
      { yVal: y(phase.limits.center + 2 * sigmaVal), color: 'rgba(200,118,25,0.15)' },
      { yVal: y(phase.limits.center - sigmaVal), color: 'rgba(35,133,81,0.15)' },
      { yVal: y(phase.limits.center - 2 * sigmaVal), color: 'rgba(200,118,25,0.15)' },
    ];
    sigmaRefs.forEach(d => {
      layer.append('line')
        .attr('x1', x1).attr('x2', x2)
        .attr('y1', d.yVal).attr('y2', d.yVal)
        .attr('stroke', d.color)
        .attr('stroke-width', 0.5);
    });
  });

  // Edge labels use the last phase's limits (rightmost, closest to the label area)
  const lastPhase = phases[phases.length - 1];
  const sigmaVal = (lastPhase.limits.ucl - lastPhase.limits.center) / 3;
  const fakeSigma = {
    s1u: lastPhase.limits.center + sigmaVal,
    s2u: lastPhase.limits.center + 2 * sigmaVal,
    s1l: lastPhase.limits.center - sigmaVal,
    s2l: lastPhase.limits.center - 2 * sigmaVal,
  };
  const fakeLimits = { ucl: lastPhase.limits.ucl, center: lastPhase.limits.center, lcl: lastPhase.limits.lcl };
  _renderEdgeLabels(labelLayer, y, fakeSigma, { limits: fakeLimits }, config, R);
}

/** Render edge labels (UCL/CL/LCL + sigma markers) at the right side of the chart. */
function _renderEdgeLabels(labelLayer, y, sigma, data, config, R) {
  const edgeFontSize = config.edgeLabelFontSize || 10;
  const MONO_RATIO = 0.6;
  const pillPadH = 6;

  const yUCL = y(data.limits.ucl);
  const yCL = y(data.limits.center);
  const yLCL = y(data.limits.lcl);
  const yS1U = y(sigma.s1u);
  const yS2U = y(sigma.s2u);
  const yS1L = y(sigma.s1l);
  const yS2L = y(sigma.s2l);

  const edgeLabels = [
    { y: yUCL, text: `UCL ${fmt(data.limits.ucl)}`, fill: 'rgba(205,66,70,0.8)', pillFill: 'rgba(205,66,70,0.06)' },
    { y: yCL, text: `CL ${fmt(data.limits.center)}`, fill: 'rgba(35,133,81,0.9)', pillFill: 'rgba(35,133,81,0.06)' },
    { y: yLCL, text: `LCL ${fmt(data.limits.lcl)}`, fill: 'rgba(205,66,70,0.8)', pillFill: 'rgba(205,66,70,0.06)' },
    { y: yS1U, text: '+1\u03c3', fill: 'rgba(35,133,81,0.35)', fontSize: Math.max(7, edgeFontSize - 2) },
    { y: yS2U, text: '+2\u03c3', fill: 'rgba(200,118,25,0.35)', fontSize: Math.max(7, edgeFontSize - 2) },
    { y: yS1L, text: '-1\u03c3', fill: 'rgba(35,133,81,0.35)', fontSize: Math.max(7, edgeFontSize - 2) },
    { y: yS2L, text: '-2\u03c3', fill: 'rgba(200,118,25,0.35)', fontSize: Math.max(7, edgeFontSize - 2) },
  ];

  // Pill backgrounds for UCL/CL/LCL
  edgeLabels.filter(d => d.pillFill).forEach(d => {
    const pillW = d.text.length * edgeFontSize * MONO_RATIO + pillPadH * 2;
    labelLayer.append('rect')
      .attr('x', R + 2).attr('y', d.y - 8)
      .attr('width', pillW).attr('height', 14)
      .attr('rx', 2).attr('fill', d.pillFill);
  });

  // Edge label texts
  edgeLabels.forEach(d => {
    const fs = d.fontSize || edgeFontSize;
    labelLayer.append('text')
      .attr('class', 'edge-label')
      .attr('x', R + 5).attr('y', d.y + 3)
      .attr('fill', d.fill)
      .style('font-size', `${fs}px`)
      .text(d.text);
  });
}
