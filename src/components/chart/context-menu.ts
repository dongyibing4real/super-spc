import type { Selection } from 'd3-selection';
import type { SizedConfig } from './config.js';

interface ContextMenuContext {
  sizedConfig: SizedConfig | null;
  width: number;
  height: number;
}

interface ContextMenuInfo {
  axis: 'x' | 'y' | null;
  target: 'axis' | 'point' | 'line' | 'canvas';
}

type ContextMenuCallback = (x: number, y: number, info: ContextMenuInfo) => void;

/**
 * Context menu: route right-clicks to point / line / axis / canvas menu.
 */
export function setupContextMenu(
  svg: Selection<SVGSVGElement, unknown, null, undefined>,
  container: HTMLElement,
  getContext: () => ContextMenuContext,
  onContextMenu: ContextMenuCallback | null | undefined
): void {
  function hitTestAxis(localX: number, localY: number): 'x' | 'y' | null {
    const { sizedConfig, width, height } = getContext();
    if (!sizedConfig) return null;
    const p = sizedConfig.padding;
    if (localY > height - p.bottom) return 'x';
    if (localX < p.left) return 'y';
    return null;
  }

  svg.on('contextmenu', (event: MouseEvent) => {
    event.preventDefault();
    if (!onContextMenu) return;
    const rect = container.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const axis = hitTestAxis(localX, localY);
    const el = event.target as Element;
    const pointGroup = el.closest?.('.point-group') || (el.parentNode as Element | null)?.closest?.('.point-group');
    const isLine = el.classList?.contains('primary-path') || el.classList?.contains('secondary-path');
    const target: ContextMenuInfo['target'] = axis ? 'axis' : pointGroup ? 'point' : isLine ? 'line' : 'canvas';
    onContextMenu(localX, localY, { axis, target });
  });
}
