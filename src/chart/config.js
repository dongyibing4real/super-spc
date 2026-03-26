/** Default chart configuration — padding and callbacks only.
 *  Width/height are now derived from the container via ResizeObserver.
 *  Y-range is computed from data (limits + headroom).
 */
export const DEFAULT_CONFIG = {
  padding: { top: 28, right: 52, bottom: 48, left: 52 },

  // Callbacks (set by app)
  onSelectPoint: null,
  onContextMenu: null,
};
