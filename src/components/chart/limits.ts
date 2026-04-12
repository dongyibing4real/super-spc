import type { Selection } from 'd3-selection';
import type { ScaleLinear } from 'd3-scale';
import type { ChartScales, SigmaValues } from './scales.js';
import { fmt } from './utils.js';

interface LimitsData {
  limits: {
    ucl: number;
    center: number;
    lcl: number;
    usl?: number | null;
    lsl?: number | null;
    target?: number | null;
  };
  phases?: PhaseWithLimits[];
  selectedPhaseIndex?: number | null;
}

interface PhaseWithLimits {
  start: number;
  end: number;
  limits: { ucl: number; center: number; lcl: number };
}

interface LimitsConfig {
  padding: { top: number; right: number; bottom: number; left: number };
  width: number;
  height: number;
  edgeLabelFontSize?: number;
}

interface LimitLine {
  y: number;
  cls: string;
  dash?: string | null;
  color?: string;
}

interface SigmaLine {
  y: number;
  color: string;
}

interface PhaseLimitLine {
  yVal: number;
  cls: string;
}

interface PhaseSigmaRef {
  yVal: number;
  color: string;
}

interface EdgeLabel {
  y: number;
  text: string;
  fill: string;
  pillFill?: string;
  fontSize?: number;
}

/**
 * Render limit lines (UCL/CL/LCL/USL/LSL), sigma reference lines, and edge labels.
 */
export function renderLimits(
  layer: Selection<SVGGElement, unknown, null, undefined>,
  labelLayer: Selection<SVGGElement, unknown, null, undefined>,
  scales: ChartScales,
  data: LimitsData,
  config: LimitsConfig
): void {
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
function _renderSinglePhaseLimits(
  layer: Selection<SVGGElement, unknown, null, undefined>,
  labelLayer: Selection<SVGGElement, unknown, null, undefined>,
  y: ScaleLinear<number, number>,
  sigma: SigmaValues,
  data: LimitsData,
  config: LimitsConfig,
  L: number,
  R: number
): void {
  const yUCL = y(data.limits.ucl);
  const yCL = y(data.limits.center);
  const yLCL = y(data.limits.lcl);
  const yUSL = data.limits.usl != null ? y(data.limits.usl) : null;
  const yLSL = data.limits.lsl != null ? y(data.limits.lsl) : null;
  const yTarget = data.limits.target != null ? y(data.limits.target) : null;
  const yS1U = y(sigma.s1u);
  const yS2U = y(sigma.s2u);
  const yS1L = y(sigma.s1l);
  const yS2L = y(sigma.s2l);

  // Main limit lines
  const mainLines: LimitLine[] = [
    { y: yUCL, cls: 'limit-line critical', dash: null },
    { y: yCL, cls: 'limit-line center', dash: null },
    { y: yLCL, cls: 'limit-line critical', dash: null },
    ...(yUSL != null ? [{ y: yUSL, cls: 'limit-line spec', dash: '3 4', color: 'rgba(139,92,246,0.30)' }] : []),
    ...(yLSL != null ? [{ y: yLSL, cls: 'limit-line spec', dash: '3 4', color: 'rgba(139,92,246,0.30)' }] : []),
    ...(yTarget != null ? [{ y: yTarget, cls: 'limit-line spec target', dash: '2 3', color: 'rgba(139,92,246,0.40)' }] : []),
  ];

  mainLines.forEach((d: LimitLine) => {
    const line = layer.append('line')
      .attr('class', d.cls)
      .attr('x1', L).attr('x2', R)
      .attr('y1', d.y).attr('y2', d.y);
    if (d.dash) line.attr('stroke-dasharray', d.dash);
    if (d.color) line.attr('stroke', d.color).attr('stroke-width', 0.75);
  });

  // Sigma reference lines
  const sigmaLines: SigmaLine[] = [
    { y: yS1U, color: 'rgba(35,133,81,0.30)' },
    { y: yS2U, color: 'rgba(200,118,25,0.30)' },
    { y: yS1L, color: 'rgba(35,133,81,0.30)' },
    { y: yS2L, color: 'rgba(200,118,25,0.30)' },
  ];

  sigmaLines.forEach((d: SigmaLine) => {
    layer.append('line')
      .attr('x1', L).attr('x2', R)
      .attr('y1', d.y).attr('y2', d.y)
      .attr('stroke', d.color)
      .attr('stroke-width', 0.75);
  });

  // Edge labels
  _renderEdgeLabels(labelLayer, y, sigma, data, config, R);
}

/** Per-phase rendering — each phase gets its own limit line segments. */
function _renderPerPhaseLimits(
  layer: Selection<SVGGElement, unknown, null, undefined>,
  labelLayer: Selection<SVGGElement, unknown, null, undefined>,
  x: ScaleLinear<number, number>,
  y: ScaleLinear<number, number>,
  phases: PhaseWithLimits[],
  data: LimitsData,
  config: LimitsConfig,
  L: number,
  R: number
): void {
  const yUSL = data.limits.usl != null ? y(data.limits.usl) : null;
  const yLSL = data.limits.lsl != null ? y(data.limits.lsl) : null;
  const yTarget = data.limits.target != null ? y(data.limits.target) : null;

  // Spec limits span the full chart (not phase-specific)
  const specLines: LimitLine[] = [
    ...(yUSL != null ? [{ y: yUSL, cls: 'limit-line spec', dash: '3 4', color: 'rgba(139,92,246,0.30)' }] : []),
    ...(yLSL != null ? [{ y: yLSL, cls: 'limit-line spec', dash: '3 4', color: 'rgba(139,92,246,0.30)' }] : []),
    ...(yTarget != null ? [{ y: yTarget, cls: 'limit-line spec target', dash: '2 3', color: 'rgba(139,92,246,0.40)' }] : []),
  ];
  specLines.forEach((d: LimitLine) => {
    const line = layer.append('line')
      .attr('class', d.cls)
      .attr('x1', L).attr('x2', R)
      .attr('y1', d.y).attr('y2', d.y);
    if (d.dash) line.attr('stroke-dasharray', d.dash);
    if (d.color) line.attr('stroke', d.color).attr('stroke-width', 0.75);
  });

  // Per-phase control limits and sigma lines
  phases.forEach((phase: PhaseWithLimits) => {
    const x1 = Math.max(x(phase.start), L);
    const x2 = Math.min(x(phase.end), R);
    const yUCL = y(phase.limits.ucl);
    const yCL = y(phase.limits.center);
    const yLCL = y(phase.limits.lcl);

    // UCL / CL / LCL
    const phaseLimitLines: PhaseLimitLine[] = [
      { yVal: yUCL, cls: 'limit-line critical' },
      { yVal: yCL, cls: 'limit-line center' },
      { yVal: yLCL, cls: 'limit-line critical' },
    ];
    phaseLimitLines.forEach((d: PhaseLimitLine) => {
      layer.append('line')
        .attr('class', d.cls)
        .attr('x1', x1).attr('x2', x2)
        .attr('y1', d.yVal).attr('y2', d.yVal);
    });

    // Sigma reference lines per phase
    const sigmaVal = (phase.limits.ucl - phase.limits.center) / 3;
    const sigmaRefs: PhaseSigmaRef[] = [
      { yVal: y(phase.limits.center + sigmaVal), color: 'rgba(35,133,81,0.30)' },
      { yVal: y(phase.limits.center + 2 * sigmaVal), color: 'rgba(200,118,25,0.30)' },
      { yVal: y(phase.limits.center - sigmaVal), color: 'rgba(35,133,81,0.30)' },
      { yVal: y(phase.limits.center - 2 * sigmaVal), color: 'rgba(200,118,25,0.30)' },
    ];
    sigmaRefs.forEach((d: PhaseSigmaRef) => {
      layer.append('line')
        .attr('x1', x1).attr('x2', x2)
        .attr('y1', d.yVal).attr('y2', d.yVal)
        .attr('stroke', d.color)
        .attr('stroke-width', 0.75);
    });
  });

  // Edge labels: show only for the selected phase (if any).
  const selectedPhaseIndex = data.selectedPhaseIndex;
  if (selectedPhaseIndex != null && phases[selectedPhaseIndex]) {
    const selPhase = phases[selectedPhaseIndex];
    const sigmaVal = (selPhase.limits.ucl - selPhase.limits.center) / 3;
    const phaseSigma: SigmaValues = {
      value: sigmaVal,
      s1u: selPhase.limits.center + sigmaVal,
      s2u: selPhase.limits.center + 2 * sigmaVal,
      s1l: selPhase.limits.center - sigmaVal,
      s2l: selPhase.limits.center - 2 * sigmaVal,
    };
    const phaseLimits = { ucl: selPhase.limits.ucl, center: selPhase.limits.center, lcl: selPhase.limits.lcl };
    _renderEdgeLabels(labelLayer, y, phaseSigma, { limits: phaseLimits }, config, R);
  }
}

/** Render edge labels (UCL/CL/LCL + sigma markers) at the right side of the chart. */
function _renderEdgeLabels(
  labelLayer: Selection<SVGGElement, unknown, null, undefined>,
  y: ScaleLinear<number, number>,
  sigma: SigmaValues,
  data: { limits: { ucl: number; center: number; lcl: number } },
  config: LimitsConfig,
  R: number
): void {
  const edgeFontSize = config.edgeLabelFontSize || 10;
  const MONOSPACE_CHAR_WIDTH_RATIO = 0.6;
  const pillPadH = 6;

  const yUCL = y(data.limits.ucl);
  const yCL = y(data.limits.center);
  const yLCL = y(data.limits.lcl);
  const yS1U = y(sigma.s1u);
  const yS2U = y(sigma.s2u);
  const yS1L = y(sigma.s1l);
  const yS2L = y(sigma.s2l);

  const edgeLabels: EdgeLabel[] = [
    { y: yUCL, text: `UCL ${fmt(data.limits.ucl)}`, fill: 'rgba(205,66,70,0.8)', pillFill: 'rgba(205,66,70,0.06)' },
    { y: yCL, text: `CL ${fmt(data.limits.center)}`, fill: 'rgba(35,133,81,0.9)', pillFill: 'rgba(35,133,81,0.06)' },
    { y: yLCL, text: `LCL ${fmt(data.limits.lcl)}`, fill: 'rgba(205,66,70,0.8)', pillFill: 'rgba(205,66,70,0.06)' },
    { y: yS1U, text: '+1\u03c3', fill: 'rgba(35,133,81,0.35)', fontSize: Math.max(7, edgeFontSize - 2) },
    { y: yS2U, text: '+2\u03c3', fill: 'rgba(200,118,25,0.35)', fontSize: Math.max(7, edgeFontSize - 2) },
    { y: yS1L, text: '-1\u03c3', fill: 'rgba(35,133,81,0.35)', fontSize: Math.max(7, edgeFontSize - 2) },
    { y: yS2L, text: '-2\u03c3', fill: 'rgba(200,118,25,0.35)', fontSize: Math.max(7, edgeFontSize - 2) },
  ];

  // Pill backgrounds for UCL/CL/LCL
  edgeLabels.filter((d: EdgeLabel) => d.pillFill).forEach((d: EdgeLabel) => {
    const pillW = d.text.length * edgeFontSize * MONOSPACE_CHAR_WIDTH_RATIO + pillPadH * 2;
    labelLayer.append('rect')
      .attr('x', R + 2).attr('y', d.y - 8)
      .attr('width', pillW).attr('height', 14)
      .attr('rx', 2).attr('fill', d.pillFill!);
  });

  // Edge label texts
  edgeLabels.forEach((d: EdgeLabel) => {
    const fs = d.fontSize || edgeFontSize;
    labelLayer.append('text')
      .attr('class', 'edge-label')
      .attr('x', R + 5).attr('y', d.y + 3)
      .attr('fill', d.fill)
      .style('font-size', `${fs}px`)
      .text(d.text);
  });
}
