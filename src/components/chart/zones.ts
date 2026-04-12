import type { Selection } from 'd3-selection';
import type { ChartScales } from './scales.js';

interface ZonePhase {
  start: number;
  end: number;
  limits: { ucl: number; center: number; lcl: number };
}

interface ZonesData {
  limits: { ucl: number; center: number; lcl: number };
  phases?: ZonePhase[];
}

interface ZonesConfig {
  padding: { top: number; right: number; bottom: number; left: number };
  width: number;
}

interface ZoneRect {
  y: number;
  h: number;
  fill: string;
  key?: string;
}

/**
 * Render Western Electric zone shading (1sigma/2sigma/3sigma bands).
 */
export function renderZones(
  layer: Selection<SVGGElement, unknown, null, undefined>,
  scales: ChartScales,
  data: ZonesData,
  config: ZonesConfig
): void {
  const { x, y } = scales;
  const L = config.padding.left;
  const R = config.width - config.padding.right;

  layer.selectAll('*').remove();

  const phases = data.phases && data.phases.length > 1 ? data.phases : null;

  if (phases) {
    // Per-phase zones: each phase gets its own sigma bands
    phases.forEach((phase: ZonePhase, pi: number) => {
      const px1 = Math.max(x(phase.start), L);
      const px2 = Math.min(x(phase.end), R);
      const pw = px2 - px1;
      if (pw < 2) return;

      const pLimits = phase.limits;
      const sigmaVal = (pLimits.ucl - pLimits.center) / 3;

      const yUCL = y(pLimits.ucl);
      const yS2U = y(pLimits.center + 2 * sigmaVal);
      const yS1U = y(pLimits.center + sigmaVal);
      const yCL  = y(pLimits.center);
      const yS1L = y(pLimits.center - sigmaVal);
      const yS2L = y(pLimits.center - 2 * sigmaVal);
      const yLCL = y(pLimits.lcl);

      const zones: ZoneRect[] = [
        { key: `${pi}-a-upper`, y: yUCL, h: yS2U - yUCL, fill: 'rgba(205,66,70,0.05)' },
        { key: `${pi}-b-upper`, y: yS2U, h: yS1U - yS2U, fill: 'rgba(200,118,25,0.03)' },
        { key: `${pi}-c-upper`, y: yS1U, h: yCL - yS1U,  fill: 'rgba(35,133,81,0.025)' },
        { key: `${pi}-c-lower`, y: yCL,  h: yS1L - yCL,  fill: 'rgba(35,133,81,0.025)' },
        { key: `${pi}-b-lower`, y: yS1L, h: yS2L - yS1L, fill: 'rgba(200,118,25,0.03)' },
        { key: `${pi}-a-lower`, y: yS2L, h: yLCL - yS2L, fill: 'rgba(205,66,70,0.05)' },
      ];

      zones.forEach((z: ZoneRect) => {
        if (z.h <= 0) return;
        layer.append('rect')
          .attr('x', px1).attr('y', z.y)
          .attr('width', pw).attr('height', z.h)
          .attr('fill', z.fill);
      });
    });
  } else {
    // Single-phase: full-width zones from global limits
    const { sigma } = scales;
    const w = R - L;
    const yUCL = y(data.limits.ucl);
    const yS2U = y(sigma.s2u);
    const yS1U = y(sigma.s1u);
    const yCL  = y(data.limits.center);
    const yS1L = y(sigma.s1l);
    const yS2L = y(sigma.s2l);
    const yLCL = y(data.limits.lcl);

    const zones: ZoneRect[] = [
      { y: yUCL, h: yS2U - yUCL, fill: 'rgba(205,66,70,0.05)' },
      { y: yS2U, h: yS1U - yS2U, fill: 'rgba(200,118,25,0.03)' },
      { y: yS1U, h: yCL - yS1U,  fill: 'rgba(35,133,81,0.025)' },
      { y: yCL,  h: yS1L - yCL,  fill: 'rgba(35,133,81,0.025)' },
      { y: yS1L, h: yS2L - yS1L, fill: 'rgba(200,118,25,0.03)' },
      { y: yS2L, h: yLCL - yS2L, fill: 'rgba(205,66,70,0.05)' },
    ];

    zones.forEach((z: ZoneRect) => {
      if (z.h <= 0) return;
      layer.append('rect')
        .attr('x', L).attr('y', z.y)
        .attr('width', w).attr('height', z.h)
        .attr('fill', z.fill);
    });
  }
}
