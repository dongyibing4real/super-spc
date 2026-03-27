/** Default chart configuration — padding and callbacks only.
 *  Width/height are now derived from the container via ResizeObserver.
 *  Y-range is computed from data (limits + headroom).
 */
export const DEFAULT_CONFIG = {
  padding: { top: 16, right: 32, bottom: 32, left: 40 },

  // Callbacks (set by app)
  onSelectPoint: null,
  onContextMenu: null,
};
