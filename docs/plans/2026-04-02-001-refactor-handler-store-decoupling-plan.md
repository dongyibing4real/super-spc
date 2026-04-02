---
title: "refactor: Decouple event handlers from commit functions and shadow state"
type: refactor
status: active
date: 2026-04-02
origin: .claude/plan/src-core/2026-04-02_src-core-architecture-refactor-plan-v1.md
---

# Decouple Event Handlers from Commit Functions and Shadow State

## Overview

The initial store extraction created the right foundation (store.js, subscribers, chart-runtime-manager) but handlers still receive 30-40 dependency ctx objects instead of depending on the store alone. The commit functions are now all identical wrappers around `setState()` — subscribers handle all targeted rendering. This plan eliminates the coupling: handlers get the store, commit functions die, the shadow state variable goes away.

## Problem Frame

After the first round of refactoring, app.js went from 2,016 to 954 lines. Event handlers were extracted to `src/events/`. A store with selector-based subscribers was added. But the architecture landed halfway:

1. **Handlers receive massive ctx objects.** `click-handler.js` destructures 36 properties. `prep-click-handler.js` destructures 38. Each handler knows about every reducer, every commit function, and every runtime detail.
2. **8 commit functions are now identical.** `commitChart`, `commitRecipeRail`, `commitEvidenceRail`, `commitContextMenu`, `commitNotice`, `commitWorkspace` all do the same thing: call `setState(next)`. The subscribers already handle the rendering differentiation.
3. **Shadow state variable.** `let state = store.getState()` on line 120, updated via subscriber on line 124. All code reads this closure variable instead of `store.getState()`. The store is a side-channel, not the source of truth.
4. **`patchUi()` and `setState()` wrappers** add indirection without value.

The result: the god-object pattern moved from "everything in one file" to "everything passed as arguments."

## Requirements Trace

- R1. Event handlers depend only on `store` (plus DOM refs and data functions when needed)
- R2. All commit functions except `commitLayout` are eliminated — replaced by `store.setState()`
- R3. Shadow `state` variable in app.js is removed — all reads go through `store.getState()`
- R4. `render()` is kept for shell-level updates (routing, sidebar, chart lifecycle) but clearly scoped
- R5. All existing tests continue to pass
- R6. No visible behavior change

## Scope Boundaries

- State.js is NOT split into domain modules in this plan (Phase 1 of the architecture plan, separate work)
- No middleware is added (audit, notices stay in reducers for now)
- No new subscribers are added beyond what exists
- Views and components are unchanged
- Only `src/app.js` and `src/events/*.js` are modified

## Context & Research

### Relevant Code and Patterns

- `src/core/store.js` — already provides `getState()`, `setState()`, `dispatch()`, `subscribe()`
- `src/runtime/ui-subscribers.js` — already reacts to `ui.notice`, `ui.contextMenu`, recipe rail state, evidence rail state
- `src/runtime/chart-subscribers.js` — already reacts to chart data changes and focus
- Current commit function bodies (app.js:403-469) — all are `setState(next)` now
- `commitLayout` (app.js:409-414) — the only commit function with extra behavior (`render()` + `saveLayout()`)

### What Subscribers Already Cover

| Surface | Subscriber | Triggered by |
|---------|-----------|-------------|
| Notice bar | `updateNoticeSurface` | `ui.notice` change |
| Context menu | `updateContextMenuSurface` | `ui.contextMenu` or `focusedChartId` change |
| Recipe rail | `updateRecipeRailSurface` | `focusedChartId`, `activeChipEditor`, `pendingNewChart`, `chartOrder`, `charts` change |
| Evidence rail | `updateEvidenceRailSurface` | `focusedChartId`, `selectedPointIndex`, `points`, `transforms`, `pipeline`, `charts` change |
| Chart panes | `updateChartPaneSurface` | `charts`, `chartOrder`, `focusedChartId` change |
| Chart D3 data | `chartRuntime.updateVisibleCharts` | `charts`, `chartOrder`, `chartToggles`, `selectedPointIndex`, `points` change |

### What `render()` Still Handles (Not Subscriber-Driven)

1. Sidebar rendering
2. Route-based main content switching (dataprep/methodlab/findings/workspace)
3. Shortcut overlay
4. Chart runtime lifecycle (`syncWorkspace` / `destroyInactive`)

These require explicit `render()` calls on route changes, initial load, and structural layout changes.

## Key Technical Decisions

- **Keep `render()` for shell-level updates:** Subscribers handle targeted surface updates, but `render()` is still needed for sidebar, routing, and chart lifecycle management. It becomes the "full re-render" path used only for structural changes (route switch, layout change, initial load). This is the right split — not everything needs to be subscriber-driven.

- **`commitLayout` becomes a standalone function, not a commit wrapper:** It does `setState` + `render` + `saveLayout` — three distinct side effects that belong together. Rename to `applyLayoutChange()` and keep it in app.js.

- **Handlers receive `store` + minimal domain-specific deps:** Instead of 36 props, a handler gets `{ store, root }` plus only the imports it actually needs (data functions like `fetchPoints`, runtime objects like `chartRuntime`). State reducers are imported directly by the handler from `state.js`.

- **Shadow state eliminated via `store.getState()`:** Every read of `state` becomes `store.getState()`. For async operations where state might change during an await, capture `const state = store.getState()` at the top of the async block.

## Open Questions

### Resolved During Planning

- **Q: Can we eliminate all commit functions?** Yes, except `commitLayout` which has additional side effects (render + saveLayout). All others are `setState(next)` and subscribers handle the rendering.
- **Q: Will removing the shadow state break async flows?** No. The async functions (`loadDatasetById`, `reanalyze`) already capture state at the start. Replace `state` reads after awaits with `store.getState()`.
- **Q: Do handlers need `render()`?** Only for route changes and layout changes. These are rare — most handler actions only need `store.setState()`.

### Deferred to Implementation

- **Q: Should handlers import reducers directly or receive them via a lightweight action registry?** Start with direct imports. If the import lists get unwieldy, refactor to an action registry later.
- **Q: Exact subscriber triggers for future route-change subscriber.** Currently route changes go through `render()`. A future subscriber could handle this, but that's out of scope.

## Implementation Units

- [ ] **Unit 1: Handlers import reducers directly, receive minimal ctx**

**Goal:** Reduce handler dependency from 30-40 ctx properties to `{ store, root }` + direct imports.

**Requirements:** R1

**Dependencies:** None

**Files:**
- Modify: `src/events/click-handler.js`
- Modify: `src/events/app-click-handler.js`
- Modify: `src/events/prep-click-handler.js`
- Modify: `src/events/keydown-handler.js`
- Modify: `src/events/change-handler.js`
- Modify: `src/app.js` (simplify handler registration)
- Test: `tests/click-handler.test.js`
- Test: `tests/app-click-handler.test.js`
- Test: `tests/prep-click-handler.test.js`
- Test: `tests/keydown-handler.test.js`
- Test: `tests/change-handler.test.js`

**Approach:**
- Each handler file imports its own reducers from `../core/state.js`
- Each handler file imports its own data functions from `../data/api.js`, `../data/data-prep-engine.js`
- Handler signature becomes `handleXxx(event, { store, root })` or `handleXxx(event, { store, root, chartRuntime })` when needed
- Inside handlers, replace `state` reads with `store.getState()`
- Replace all `commitChart(next)`, `commitRecipeRail(next)`, etc. with `store.setState(next)`
- Replace `commit(next)` with `store.setState(next); render()` where full re-render is needed (route changes only)
- `render` is passed only to handlers that need it (route navigation, layout changes)
- `saveLayout` is passed only to handlers that call it (layout interactions)

**Patterns to follow:**
- The existing `store.setState()` + subscriber pattern already working in `commitChart`
- Direct module imports (ES module standard, no dependency injection needed for pure functions)

**Test scenarios:**
- Happy path: click handler dispatches correct state for each action type with minimal ctx
- Happy path: keydown handler updates state via store.setState for keyboard shortcuts
- Edge case: handler reads fresh state after async operation via store.getState()
- Integration: store.setState triggers subscriber rendering (notice, context menu, recipe rail, evidence rail, chart updates)

**Verification:**
- All existing handler tests pass after ctx reduction
- Handler files import only what they use (no unused destructured props)
- `grep -c 'commitChart\|commitRecipeRail\|commitNotice\|commitEvidenceRail\|commitWorkspace\|commitContextMenu' src/events/*.js` returns 0

---

- [ ] **Unit 2: Eliminate commit function wrappers from app.js**

**Goal:** Remove the 7 identical commit functions. Keep only `render()` and a renamed layout update function.

**Requirements:** R2, R4

**Dependencies:** Unit 1

**Files:**
- Modify: `src/app.js`
- Test: `tests/app.store.test.js`

**Approach:**
- Delete `commitChart`, `commitRecipeRail`, `commitNotice`, `commitContextMenu`, `commitEvidenceRail`, `commitWorkspace`
- Delete `commit` (callers now use `store.setState(next); render()` directly when needed)
- Rename `commitLayout` to `applyLayoutChange` — keeps `setState` + `render` + `saveLayout` together
- Delete `patchUi()` wrapper — callers spread UI state directly
- Keep `render()` for shell-level updates (route, sidebar, shortcut overlay, chart lifecycle)

**Patterns to follow:**
- The existing subscriber-based rendering pattern

**Test scenarios:**
- Happy path: store.setState triggers all subscriber updates without commit wrappers
- Happy path: applyLayoutChange still calls render + saveLayout
- Edge case: multiple rapid setState calls batch subscriber updates correctly

**Verification:**
- `grep -c 'function commit' src/app.js` returns 0 (no commit function definitions remain)
- Only `render()` and `applyLayoutChange()` exist as rendering coordination functions
- All tests pass

---

- [ ] **Unit 3: Remove shadow state variable**

**Goal:** Eliminate `let state = store.getState()` and the subscriber that syncs it. All reads go through `store.getState()`.

**Requirements:** R3

**Dependencies:** Unit 1, Unit 2

**Files:**
- Modify: `src/app.js`
- Test: `tests/app.store.test.js`
- Test: `tests/app.workflows.test.js`

**Approach:**
- Delete `let state = store.getState()` (line 120)
- Delete `store.subscribe((nextState) => { state = nextState; })` (line 124-126)
- In `renderRoute()`, `buildChartData()`, `render()`, `scheduleForecastPrompt()`, `handleForecastPromptEligibility()`, `handleForecastActivity()`, `ensureForecastVisible()`, `extendForecastToViewport()`, `isWorkspaceFull()`, `saveLayout()`, `restoreLayout()`, `loadDatasetById()`, `reanalyze()`, `main()`: replace `state` with `store.getState()`
- For async functions: capture `const state = store.getState()` at the start of the async block. After each await, re-capture if needed: `const freshState = store.getState()`
- For chart runtime callbacks (onSelectPoint, onAxisDrag, etc.): replace `state` closure reads with `store.getState()`
- The CSV upload handler in the change listener also needs `store.getState()` instead of `state`

**Patterns to follow:**
- Standard store pattern: always read from `store.getState()`, never cache state in a mutable variable

**Test scenarios:**
- Happy path: app boots and renders correctly with no shadow state
- Happy path: async loadDatasetById uses fresh state after each await
- Edge case: state changes during async operation — handler sees updated state via getState()
- Error path: loadDatasetById error handling uses store.getState() correctly

**Verification:**
- `grep -c 'let state' src/app.js` returns 0
- `grep -c '= store.getState()' src/app.js` shows reads going through the store
- All tests pass
- Manual QA: load dataset, switch charts, add/remove charts, data prep, forecast, keyboard shortcuts

---

- [ ] **Unit 4: Final cleanup and verification**

**Goal:** Verify the complete refactor, clean up dead code, ensure no regressions.

**Requirements:** R5, R6

**Dependencies:** Units 1-3

**Files:**
- Modify: `src/app.js` (remove any remaining dead code)
- Test: all test files

**Approach:**
- Run full test suite
- Remove any unused imports in app.js
- Verify app.js line count is significantly reduced from 954
- Manual QA walkthrough of all major user flows

**Test scenarios:**
- Integration: full app lifecycle — boot, load dataset, interact, navigate routes, data prep, forecast
- Edge case: rapid interactions don't cause stale state reads

**Verification:**
- `npm test` passes all tests
- No unused imports or dead code in app.js
- `wc -l src/app.js` shows meaningful reduction from 954 lines

## System-Wide Impact

- **Interaction graph:** Event handlers no longer go through commit functions. `store.setState()` triggers subscribers which update DOM surfaces. The flow becomes: handler -> store.setState -> subscribers -> DOM.
- **Error propagation:** Unchanged. Error handling stays in handlers and async workflows.
- **State lifecycle risks:** Removing the shadow `state` variable means all reads go through `store.getState()`. This is safer — no stale closure reads. But async code must explicitly re-read state after awaits.
- **Unchanged invariants:** All view templates, components, chart sub-components, prediction providers, and data pipeline modules are untouched. The store API (`getState`, `setState`, `dispatch`, `subscribe`) is unchanged.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Stale state in async callbacks after shadow state removal | Capture `store.getState()` at point of use. Tests verify fresh reads after awaits |
| Missing subscriber coverage for some commit function call sites | Audit found subscribers cover all targeted surfaces. Remaining gap is shell-level (handled by `render()`) |
| Test breakage from ctx interface change | Update tests in same unit. Tests use mock store, so ctx simplification is straightforward |
| Chart runtime callbacks close over removed `state` | Replace with `store.getState()` in each callback |
