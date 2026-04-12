import type { Selection } from 'd3-selection';
import type { ChartScales } from './scales.js';

interface PhaseData {
  start: number;
  end: number;
  label?: string;
  id: string;
}

interface PhasesData {
  phases?: PhaseData[];
  phase?: { label?: string };
  selectedPhaseIndex?: number | null;
}

interface PhasesConfig {
  padding: { top: number; right: number; bottom: number; left: number };
  width: number;
  height: number;
  phaseHeaderHeight?: number;
  onSelectPoint?: ((index: number | null) => void) | null;
  onSelectPhase?: ((index: number | null) => void) | null;
}

/**
 * Render SPC phase boundaries and labels (JMP-style).
 */
export function renderPhases(
  layer: Selection<SVGGElement, unknown, null, undefined>,
  labelLayer: Selection<SVGGElement, unknown, null, undefined>,
  scales: ChartScales,
  data: PhasesData,
  config: PhasesConfig
): void {
  const { x } = scales;
  const T = config.padding.top;
  const B = config.height - config.padding.bottom;
  const L = config.padding.left;
  const R = config.width - config.padding.right;
  const headerH = config.phaseHeaderHeight || 0;

  layer.selectAll('*').remove();
  labelLayer.selectAll('*').remove();

  if (!data.phases || data.phases.length <= 1) return;

  // ── Header band background strips (unclipped — above plot area) ──
  const bandTop = T - headerH;
  const bandBot = T;

  // Full-width header background
  labelLayer.append('rect')
    .attr('class', 'phase-header-bg')
    .attr('x', L).attr('y', bandTop)
    .attr('width', R - L).attr('height', headerH)
    .attr('fill', 'rgba(147,153,163,0.06)');

  // ── "Phase: {variable}" label in the left gutter of the header band ──
  const phaseVarLabel = data.phase?.label || '';
  const hasVarName = phaseVarLabel && phaseVarLabel !== 'Single phase' && phaseVarLabel !== 'No phases';
  const prefixFontSize = Math.max(7, Math.min(9, headerH * 0.55));

  labelLayer.append('text')
    .attr('class', 'phase-var-label')
    .attr('x', L - 4)
    .attr('y', bandTop + headerH / 2)
    .attr('text-anchor', 'end')
    .attr('dominant-baseline', 'central')
    .style('font-size', `${prefixFontSize}px`)
    .style('font-family', "'IBM Plex Sans', system-ui, sans-serif")
    .style('font-weight', '600')
    .style('fill', 'rgba(147,153,163,0.55)')
    .style('letter-spacing', '0.02em')
    .style('pointer-events', 'none')
    .text(hasVarName ? phaseVarLabel : 'Phase');

  const selectedPhaseIndex = data.selectedPhaseIndex;

  data.phases.forEach((ph: PhaseData, i: number) => {
    const sx = Math.max(x(ph.start), L);
    const ex = Math.min(x(ph.end), R);
    const pw = ex - sx;
    if (pw < 2) return;

    const isSelected = selectedPhaseIndex === i;

    // Selected phase fill in the plot area
    if (isSelected) {
      layer.append('rect')
        .attr('class', 'phase-selected-fill')
        .attr('x', sx).attr('y', T)
        .attr('width', pw).attr('height', B - T)
        .attr('fill', 'rgba(45,114,210,0.04)')
        .style('cursor', 'default')
        .on('click', (event: MouseEvent) => {
          event.stopPropagation();
          config.onSelectPoint?.(null);
        });
    }

    // Clickable hit area for each phase in the header band
    const hitRect = labelLayer.append('rect')
      .attr('class', 'phase-header-hit')
      .attr('x', sx).attr('y', bandTop)
      .attr('width', pw).attr('height', headerH)
      .attr('fill', isSelected ? 'rgba(45,114,210,0.10)' : 'transparent')
      .style('cursor', 'pointer');

    hitRect.on('click', (event: MouseEvent) => {
      event.stopPropagation();
      config.onSelectPhase?.(i);
    });

    // Phase label text — centered in the header band
    const labelText = ph.label || ph.id;
    const cx = (sx + ex) / 2;
    const cy = bandTop + headerH / 2;

    labelLayer.append('text')
      .attr('class', `phase-label${isSelected ? ' phase-label-selected' : ''}`)
      .attr('x', cx).attr('y', cy)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .style('pointer-events', 'none')
      .text(labelText);
  });

  // ── Bottom border of header band ──
  labelLayer.append('line')
    .attr('class', 'phase-header-border')
    .attr('x1', L).attr('x2', R)
    .attr('y1', bandBot).attr('y2', bandBot)
    .attr('stroke', 'rgba(147,153,163,0.25)')
    .attr('stroke-width', 0.5);

  // ── Vertical boundary lines between phases ──
  data.phases.slice(1).forEach((ph: PhaseData) => {
    const bx = x(ph.start);

    // Line through header band (unclipped)
    labelLayer.append('line')
      .attr('class', 'phase-header-divider')
      .attr('x1', bx).attr('x2', bx)
      .attr('y1', bandTop).attr('y2', bandBot)
      .attr('stroke', 'rgba(147,153,163,0.30)')
      .attr('stroke-width', 0.5);

    // Line through plot area (clipped)
    layer.append('line')
      .attr('class', 'phase-line')
      .attr('x1', bx).attr('x2', bx)
      .attr('y1', T).attr('y2', B);
  });
}
