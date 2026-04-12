import type { Selection } from 'd3-selection';
import type { ChartScales } from './scales.js';
import type { SizedConfig } from './config.js';
import { clamp } from './utils.js';

const MARQUEE_THRESHOLD = 5; // px — minimum drag to activate marquee

interface MarqueeContext {
  scales: ChartScales | null;
  sizedConfig: SizedConfig | null;
  width: number;
  height: number;
  lastData: MarqueeData | null;
}

interface MarqueeData {
  points: { [key: string]: unknown }[];
  seriesKey?: string;
}

interface MarqueeState {
  startX: number;
  startY: number;
  active: boolean;
}

interface MarqueeOptions {
  onSelectPoints?: ((indices: number[] | null) => void) | null;
}

interface MarqueeResult {
  destroy: () => void;
  wasMarqueeJustFinished: () => boolean;
}

/**
 * JMP-style marquee (rubber-band) multi-point selection.
 */
export function setupMarquee(
  svg: Selection<SVGSVGElement, unknown, null, undefined>,
  container: HTMLElement,
  marqueeLayer: Selection<SVGGElement, unknown, null, undefined>,
  getContext: () => MarqueeContext,
  { onSelectPoints }: MarqueeOptions
): MarqueeResult {
  let marqueeState: MarqueeState | null = null;
  let marqueeJustFinished = false;

  svg.on('pointerdown.marquee', (event: PointerEvent) => {
    if (event.button !== 0) return;
    const { sizedConfig, width, height } = getContext();
    if (!sizedConfig) return;
    const p = sizedConfig.padding;
    const rect = container.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;

    if (localX < p.left || localX > width - p.right) return;
    if (localY < p.top || localY > height - p.bottom) return;

    const target = event.target as Element;
    if (target.closest?.('.point-hit') || target.closest?.('.forecast-shell-hit') ||
        target.closest?.('.forecast-prompt-hit') || target.closest?.('.forecast-cancel') ||
        target.closest?.('.phase-header-hit')) return;

    marqueeState = {
      startX: localX,
      startY: localY,
      active: false,
    };
  });

  function marqueeMove(event: PointerEvent): void {
    if (!marqueeState) return;
    const rect = container.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const dx = localX - marqueeState.startX;
    const dy = localY - marqueeState.startY;

    if (!marqueeState.active && (Math.abs(dx) > MARQUEE_THRESHOLD || Math.abs(dy) > MARQUEE_THRESHOLD)) {
      marqueeState.active = true;
    }

    if (!marqueeState.active) return;

    const { sizedConfig, width, height } = getContext();
    const p = sizedConfig!.padding;
    const cx = clamp(localX, p.left, width - p.right);
    const cy = clamp(localY, p.top, height - p.bottom);
    const sx = marqueeState.startX;
    const sy = marqueeState.startY;

    const rx = Math.min(sx, cx);
    const ry = Math.min(sy, cy);
    const rw = Math.abs(cx - sx);
    const rh = Math.abs(cy - sy);

    marqueeLayer.selectAll('*').remove();
    marqueeLayer.append('rect')
      .attr('class', 'marquee-rect')
      .attr('x', rx).attr('y', ry)
      .attr('width', rw).attr('height', rh);
  }

  function marqueeUp(event: PointerEvent): void {
    if (!marqueeState) return;
    const wasActive = marqueeState.active;

    if (wasActive) {
      const { scales, sizedConfig, width, height, lastData } = getContext();
      if (scales && lastData) {
        const rect = container.getBoundingClientRect();
        const localX = event.clientX - rect.left;
        const localY = event.clientY - rect.top;
        const p = sizedConfig!.padding;
        const cx = clamp(localX, p.left, width - p.right);
        const cy = clamp(localY, p.top, height - p.bottom);
        const sx = marqueeState.startX;
        const sy = marqueeState.startY;

        const minX = Math.min(sx, cx);
        const maxX = Math.max(sx, cx);
        const minY = Math.min(sy, cy);
        const maxY = Math.max(sy, cy);

        const { x, y } = scales;
        const seriesKey = lastData.seriesKey || 'primaryValue';
        const points = lastData.points;
        const selected: number[] = [];

        for (let i = 0; i < points.length; i++) {
          const px = x(i);
          const py = y(points[i][seriesKey] as number);
          if (px >= minX && px <= maxX && py >= minY && py <= maxY) {
            selected.push(i);
          }
        }

        if (selected.length > 0) {
          onSelectPoints?.(selected);
        } else {
          onSelectPoints?.(null);
        }
      }
    }

    marqueeLayer.selectAll('*').remove();
    if (wasActive) {
      marqueeJustFinished = true;
      requestAnimationFrame(() => { marqueeJustFinished = false; });
    }
    marqueeState = null;
  }

  window.addEventListener('pointermove', marqueeMove);
  window.addEventListener('pointerup', marqueeUp);

  return {
    destroy(): void {
      window.removeEventListener('pointermove', marqueeMove);
      window.removeEventListener('pointerup', marqueeUp);
    },
    wasMarqueeJustFinished(): boolean {
      return marqueeJustFinished;
    },
  };
}
