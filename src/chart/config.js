/** Default chart configuration — dimensions, padding, value range */
export const DEFAULT_CONFIG = {
  width: 860,
  height: 400,
  padding: { top: 28, right: 52, bottom: 48, left: 52 },
  yTicks: [8.02, 8.05, 8.08, 8.11, 8.14, 8.17],
  yMin: 8.0,
  yMax: 8.17,
  confidenceBandRange: [8.038, 8.132],

  // Callbacks (set by app)
  onSelectPoint: null,
  onContextMenu: null,
};
