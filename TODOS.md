# TODOS

## CSS Modularization
**What:** Split `src/styles.css` (3,420 lines) into component-scoped CSS files.
**Why:** After JS modularization lands, CSS is the next structural concentration risk. A single file makes it hard to reason about which styles belong to which component.
**Pros:** Easier maintenance, component-level style isolation, reduced merge conflicts.
**Cons:** Need to decide on strategy (CSS modules, BEM scoping, or just file splitting). Low urgency.
**Context:** The JS refactor (store + domain split) does not touch CSS. This is the natural follow-up once the JS architecture is clean. Consider splitting along the same boundaries as the component tree: chart/, views/, components/.
**Depends on:** JS architecture refactor (Phases 0-5) should land first.
**Added:** 2026-04-02

## Chart Performance: Selector Consolidation
**What:** Replace Chart.jsx's 5 `useStore` selectors with one memoized `useChartData(chartId)` hook. Split `buildChartData` into geometry (points, limits, phases) vs visual (selection, toggles) so visual-only changes don't trigger full chart rebuilds.
**Why:** Every state change (point click, toggle, selection) triggers a full `buildChartData()` + D3 `renderAll()` with 15 render passes on 400+ points. The useStore selector on `s.charts[chartId]` fires on any slot field change including overrides and selection.
**Pros:** Snappier point selection, toggle responsiveness. No architecture change needed.
**Cons:** Need to define stable selector boundaries. Must not break the double-rAF timing for layout-dependent renders (pane add/remove, data table toggle).
**Context:** Codex review rejected a plan to move store subscription into D3 (7 problems: testability, re-entrancy, missing subscribeWithSelector, timing). The simpler fix is selector consolidation. Axis drag already fixed separately (onAxisDragLive renders in D3 directly, store commit on pointerup). Files: `src/components/Chart.jsx`, `src/store/chart-data-builder.js`.
**Depends on:** Recipe validation refactor should land first.
**Added:** 2026-04-04
