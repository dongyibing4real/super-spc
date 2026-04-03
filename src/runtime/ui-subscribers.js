/**
 * ui-subscribers.js -- Watch UI state changes and surgically update the DOM.
 *
 * Phase 2: Notice and context menu moved to React components.
 * Phase 3: Recipe rail and evidence rail moved to React components.
 *
 * This file is now empty of subscribers. Kept as a no-op for legacy-boot.js
 * compatibility until Phase 6 removes it entirely.
 */

export function setupUiSubscribers(_store, _root) {
  // All subscribers have been migrated to React components:
  // - Notice → Notice.jsx (Phase 2)
  // - ContextMenu → ContextMenu.jsx (Phase 2)
  // - RecipeRail → RecipeRail.jsx (Phase 3)
  // - EvidenceRail → EvidenceRail.jsx (Phase 3)
}
