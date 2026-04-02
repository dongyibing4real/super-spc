# Architecture Refactor Plan

## Scope

This plan addresses the architectural bottleneck concentrated in:

- `src/app.js` (`1903` lines)
- `src/core/state.js` (`1100` lines, `69` exported functions)

The rest of the frontend is comparatively healthy:

- `views/` are mostly pure render functions
- `components/chart/` is already split into focused D3 modules
- `data/api.js`, `data/csv-engine.js`, and `data/data-prep-engine.js` are separable modules
- `prediction/` already follows a provider-style structure

The goal is not a framework migration. The goal is to remove orchestration overload from `app.js`, restore explicit boundaries in state updates, and preserve targeted rendering performance.

## Verified Findings

### `app.js` is the main bottleneck

Verified in code:

- owns global mutable `state`
- owns `charts` runtime registry
- contains `8` commit functions
- contains root `click`, `keydown`, `change`, and drag/drop handling
- contains async workflows: `loadDatasetById()` and `reanalyze()`
- contains pure business logic that does not belong to the root runtime, such as `applyTransform()`

Relevant references:

- [src/app.js](/C:/Users/dongy/Desktop/project/super-spc/src/app.js:393)
- [src/app.js](/C:/Users/dongy/Desktop/project/super-spc/src/app.js:557)
- [src/app.js](/C:/Users/dongy/Desktop/project/super-spc/src/app.js:610)
- [src/app.js](/C:/Users/dongy/Desktop/project/super-spc/src/app.js:1287)

### `state.js` is overloaded, but many functions are already reducer-like

Verified in code:

- many functions are already pure `(state, ...args) => nextState` transitions
- the real issue is not purity, but that cross-domain side effects are embedded in the same transitions
- examples include domain updates that also write `ui.notice`, focus state, or pipeline status

This means the refactor should preserve the good part: reducer-like functions stay simple. We do not need a heavy Redux rewrite.

### Manual commit coordination is real and performance-motivated

Verified in code:

- `commit()`
- `commitChart()`
- `commitLayout()`
- `commitContextMenu()`
- `commitRecipeRail()`
- `commitNotice()`
- `commitWorkspace()`
- `commitEvidenceRail()`

These are not random duplicates. They are a manual render routing system created to avoid expensive full rerenders around D3.

The replacement must keep that performance property. A single global rerender is not an acceptable end state.

### Async slot-building logic is duplicated

Verified in code:

- `loadDatasetById()` and `reanalyze()` both run per-chart analysis with `Promise.allSettled()`
- both build `slots` from transformed analysis results
- both apply partial-failure semantics

Relevant references:

- [src/app.js](/C:/Users/dongy/Desktop/project/super-spc/src/app.js:557)
- [src/app.js](/C:/Users/dongy/Desktop/project/super-spc/src/app.js:610)

This is a concrete extraction target and should become one shared workflow helper.

## Critical Corrections To The Earlier Review

### 1. Characterization tests must come first

Current tests cover part of `state.js`, but they do not lock down:

- commit routing behavior
- orchestration semantics in `app.js`
- async workflow partial-failure behavior
- render invariants around D3 ownership

So the sequence is:

1. write characterization tests for current behavior
2. refactor behind that safety net

Not the other way around.

### 2. The store should be minimal

Do not introduce a large action-type architecture upfront.

Use a thin store with only these responsibilities:

- hold current state
- run a named reducer function
- notify subscribers
- support middleware for cross-cutting reactions

Reducer functions can keep their current signature style where practical.

### 3. The subscriber model is the actual replacement for the 8 commit functions

This is the main architectural improvement and should happen early, not late.

However, it depends on a minimal store existing first. So the sequence is:

1. characterization tests
2. thin store shell
3. subscriber-based render contract
4. handler/workflow extraction

### 4. Parallel worktrees are not needed here

This refactor has shared state shape and shared render contracts. For a single developer, parallel worktrees add merge friction without saving real time.

## Target Architecture

## State layer

Introduce a thin application store:

- `getState()`
- `dispatch(reducerFn, ...args)`
- `subscribe(selector, listener)`
- `use(middleware)`

Important constraint:

- `dispatch()` should accept reducer functions directly or a thin action wrapper around them
- do not force a full stringly-typed action system before it proves useful

## Reducer organization

Split `src/core/state.js` into domain-oriented reducer modules, but derive boundaries from actual write patterns, not aesthetics alone.

Initial target split:

- `src/core/state/app-state.js` for `createInitialState`, shared slot helpers, base constants
- `src/core/state/chart-state.js`
- `src/core/state/layout-state.js`
- `src/core/state/selection-state.js`
- `src/core/state/findings-state.js`
- `src/core/state/data-prep-state.js`
- `src/core/state/pipeline-state.js`
- `src/core/state/ui-state.js`
- `src/core/state/selectors.js`

Boundary rule:

- if a reducer must update multiple domains frequently, first check whether one of those writes is actually a cross-cutting concern that belongs in middleware

Examples:

- notice creation should usually move to middleware
- audit logging should move to middleware
- focus or navigation side effects should be explicit reactions, not hidden domain writes

## Render layer

Replace manual commit routing with subscribers:

- chart runtime subscriber
- workspace shell subscriber
- recipe rail subscriber
- evidence rail subscriber
- notice subscriber
- context menu subscriber

Each subscriber should depend on a narrow selector and update only its owned subtree.

## D3 runtime

Move chart instance lifecycle into a dedicated chart runtime manager:

- create instance when a chart id appears
- destroy instance when a chart id disappears
- call `.update()` only when chart-relevant inputs change
- keep D3-owned DOM outside generic morphing

This preserves the current performance intent without keeping render routing in `app.js`.

## Workflow layer

Extract explicit workflow functions:

- `loadDataset(store, datasetId)`
- `reanalyzeDataset(store)`
- `loadPrepDataset(store, datasetId)`
- `savePrepDataset(store, payload)` if needed

These functions own async orchestration and dispatch reducer transitions explicitly.

## Mandatory Invariants

These invariants must be protected by tests before and during refactor:

1. D3-owned chart DOM is not destroyed on unrelated UI updates.
2. Partial analysis failure preserves successful chart slots and surfaces a warning notice.
3. Focus change updates only focus-dependent UI surfaces.
4. Data-prep panel actions do not force full workspace rerender.
5. Chart add/remove/reorder preserves layout and chart instance lifecycle correctly.
6. Forecast interactions preserve current viewport semantics.

## Execution Plan

## Phase 0: Characterization Tests

Goal: lock down current behavior before structural change.

Add tests for:

- `loadDatasetById()` success and partial failure semantics
- `reanalyze()` success and partial failure semantics
- chart add/remove/reorder behavior
- focus behavior across panes
- commit routing expectations that matter semantically
- D3 subtree preservation contract

Suggested test files:

- `tests/app.workflows.test.js`
- `tests/app.render-contract.test.js`
- `tests/app.chart-runtime.test.js`

Exit criteria:

- the main orchestration paths in `app.js` are covered by characterization tests
- current behavior is reproducible without manual browser checking

## Phase 1: Introduce Thin Store Without Changing Behavior

Goal: centralize mutation and subscription without changing domain logic yet.

Work:

- add `src/core/store.js`
- move raw `state = ...` updates behind `dispatch(...)`
- keep existing reducer-like functions usable
- add subscription support

Exit criteria:

- root runtime no longer mutates state ad hoc outside the store boundary
- existing tests still pass
- no visible behavior change

## Phase 2: Replace Commit Functions With Subscribers

Goal: remove manual render routing from `app.js`.

Work:

- implement subscribers for chart arena, workspace shell, recipe rail, evidence rail, notice, context menu
- move chart runtime ownership into a chart manager
- delete the 8 commit functions after parity is proven

Exit criteria:

- `commit*` functions are gone
- rerender scope is driven by selector changes
- chart updates remain incremental

## Phase 3: Extract Async Workflows

Goal: move async orchestration out of the root runtime.

Work:

- create `src/workflows/dataset-workflows.js`
- extract shared slot-building helper
- move `loadDatasetById()` and `reanalyze()` into workflows
- move partial-failure notice logic into workflow or middleware, not inline root code

Exit criteria:

- `app.js` no longer owns dataset-loading orchestration
- duplicated slot-building logic exists in one place only

## Phase 4: Split Reducers By Domain

Goal: shrink `state.js` without reintroducing hidden coupling.

Work:

- split reducer modules gradually
- introduce selectors as first-class API
- move cross-cutting writes out of reducers where possible

Exit criteria:

- `src/core/state.js` becomes a barrel or compatibility layer
- reducer modules have clear ownership
- cross-domain writes are reduced, not merely moved across files

## Phase 5: Extract Event Translation Layer

Goal: make DOM handlers thin and semantic.

Work:

- extract click/change/keydown/drag handling into dedicated modules
- handlers translate DOM events into reducer calls or workflow calls
- keep business logic out of event handlers

Possible targets:

- `src/events/click-handler.js`
- `src/events/change-handler.js`
- `src/events/keydown-handler.js`
- `src/events/chart-dnd-handler.js`

Exit criteria:

- `app.js` is a composition root, not a control tower
- handlers are testable without deep app runtime setup

## Deliverables By The End

- `src/app.js` reduced to composition and bootstrapping
- state transitions routed through one store boundary
- render routing handled by subscriptions instead of commit variants
- async workflows extracted into dedicated modules
- state reducers split by domain with selectors
- characterization tests covering the current architecture's risky behavior

## Non-Goals

- no React/Vue/Svelte migration
- no full Redux adoption unless later justified by real complexity
- no broad rewrite of chart rendering internals
- no redesign of data-prep algorithms as part of this refactor

## Recommended First PR

The first PR should be intentionally small:

1. add characterization tests for `loadDatasetById()` and `reanalyze()`
2. extract the duplicated slot-building helper
3. keep behavior identical

This gives immediate value, reduces duplication, and creates a safe base for the store/subscriber work.
