/**
 * Context menu: route right-clicks to point / line / axis / canvas menu.
 *
 * @param {Selection} svg - D3 SVG selection
 * @param {HTMLElement} container - DOM container element
 * @param {Function} getContext - () => { sizedConfig, width, height }
 * @param {Function} onContextMenu - (x, y, { axis, target }) callback
 */
export function setupContextMenu(svg, container, getContext, onContextMenu) {
  function hitTestAxis(localX, localY) {
    const { sizedConfig, width, height } = getContext();
    if (!sizedConfig) return null;
    const p = sizedConfig.padding;
    if (localY > height - p.bottom) return 'x';
    if (localX < p.left) return 'y';
    return null;
  }

  svg.on('contextmenu', (event) => {
    event.preventDefault();
    if (!onContextMenu) return;
    const rect = container.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const axis = hitTestAxis(localX, localY);
    const el = event.target;
    const pointGroup = el.closest?.('.point-group') || el.parentNode?.closest?.('.point-group');
    const isLine = el.classList?.contains('primary-path') || el.classList?.contains('secondary-path');
    const target = axis ? 'axis' : pointGroup ? 'point' : isLine ? 'line' : 'canvas';
    onContextMenu(localX, localY, { axis, target });
  });
}
