---
date: 2026-04-02
topic: system-improvements
focus: open-ended
---

# Ideation: Super SPC System Improvements

## Codebase Context

- Vanilla JS + D3.js charting app, FastAPI Python backend, no framework
- app.js (2016 LOC), state.js (1238 LOC), styles.css (3420 LOC) are monoliths
- 24+ chart types, zone shading, phase boundaries, 6 forecast algorithms, evidence rail
- Architecture refactor plan exists (5 phases) but blocked on characterization tests (79 gaps)
- 45 tests exist, 22 test files, no CI/CD, no TypeScript
- No export, no undo beyond data prep, no streaming, no collaboration, no annotations

## Ranked Ideas

### 1. Export Pipeline (PDF, PNG, SVG, CSV)
**Description:** Unified export — PDF reports with findings, PNG/SVG charts, CSV/Excel data with limits and violations. Batch workspace export.
**Rationale:** Table stakes. Every SPC workflow ends with reporting. Without export, insights are trapped.
**Downsides:** PDF generation needs a library. Multi-chart PDF layout needs templating.
**Confidence:** 95%
**Complexity:** Medium
**Status:** Unexplored

### 2. Smart Import — Zero-Config Chart from CSV Drop
**Description:** Drop CSV → auto-profile columns → suggest chart type + config → optional phase boundary detection. User approves/tweaks, doesn't build from scratch.
**Rationale:** Demo moment. Collapses 5-step manual workflow into drag-and-drop. Neither JMP nor Minitab does this.
**Downsides:** Heuristics will be wrong sometimes; needs graceful fallback. Phase detection is ambitious.
**Confidence:** 85%
**Complexity:** Medium-High
**Status:** Unexplored

### 3. Closed-Loop Investigation Mode
**Description:** Clickable findings → animate to chart region → guided violation workflow (confirm signal, assign root cause, document action, exclude with audit trail) → investigation notes tied to findings.
**Rationale:** The "Palantir" differentiator. JMP shows violations and says "figure it out." This guides engineers from detection to documented action. Novel in SPC space.
**Downsides:** Needs annotation data model, persistence beyond localStorage, significant UX design.
**Confidence:** 80%
**Complexity:** High
**Status:** Explored (brainstorm 2026-04-02)

### 4. By-Group Faceted Charts
**Description:** Select grouping column → auto-generate one chart per group level, shared scales and config. One-click faceting on any chart.
**Rationale:** "Show me this by machine" is the most common SPC request. Currently requires manual filter + rebuild.
**Downsides:** Tension with "all charts are independent peers" philosophy. Needs careful design for shared vs. independent scales.
**Confidence:** 80%
**Complexity:** Medium
**Status:** Unexplored

### 5. Characterization Tests + Basic CI
**Description:** Write ~34 missing characterization tests, set up GitHub Actions (lint + test + build).
**Rationale:** Safety net that unblocks the 5-phase architecture refactor. CI makes improvements permanent.
**Downsides:** 34 tests is grunt work. CI needs maintenance.
**Confidence:** 90%
**Complexity:** Low-Medium
**Status:** Unexplored

### 6. Column Switcher
**Description:** Dropdown/drag-target on Y-axis label → swap variable without rebuilding. D3 transition animation, limits recompute, zoom/selection preserved.
**Rationale:** Exploratory SPC means checking 5-10 variables. Rebuilding per variable destroys context.
**Downsides:** Minimal — infrastructure already exists.
**Confidence:** 85%
**Complexity:** Low
**Status:** Unexplored

### 7. Data Validation with Structured Diagnostics
**Description:** Pre-chart validation: missing values, non-numeric columns, constant data, single-point phases. Structured warnings with suggested fixes.
**Rationale:** Prevents "why is my chart blank?" — the #1 onboarding confusion.
**Downsides:** Risk of over-warning.
**Confidence:** 85%
**Complexity:** Low
**Status:** Unexplored

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | Monolith Decomposition | Already approved work, not an idea — blocked on #5 |
| 2 | Event Bus replacing Switches | Refactoring for refactoring's sake; decomposes naturally during monolith split |
| 3 | TypeScript at Coupling Bottleneck | JSDoc + @ts-check is 80% value at 5% cost |
| 4 | Event-Sourced State | Architecture astronautics for a single-user app |
| 5 | Design System Enforcement | Tooling for teams, not solo dev |
| 6 | Plugin Registry Pattern | No ecosystem, premature abstraction |
| 7 | Parallel Test Runner | Not a bottleneck at 22 files |
| 8 | Canvas/WebGL Rendering | SPC data is typically <5K points; SVG handles this |
| 9 | Web Workers | Computation is single-digit ms at SPC scale |
| 10 | Dirty-Flag Recalculation | Unmeasured micro-optimization |
| 11 | Virtual Scrolling / LOD | SPC charts aren't infinite-scroll |
| 12 | Unified Undo/Redo | Deceptively expensive across all operation types |
| 13 | Auto-Detect Phase Boundaries | Folded into Smart Import as optional stretch |
| 14 | Precision Selection | Zoom is the right answer for dense data |
| 15 | Subgroup Config Assistant | Brittle heuristics; clear manual UI is more honest |
| 16 | Real-Time Streaming + Alarms | A second product, not a feature; defer |
| 17 | Histogram Sidebar | Visual filler; capability numbers already in evidence rail |
| 18 | Method Comparison Dashboard | Tiny use case for practitioners |
| 19 | Shift/Period Overlays | Visual spaghetti; faceted charts serve this better |
| 20 | Formula Bar | Unbounded scope; engineers have Excel |
| 21 | Cloud Sync Workspaces | 3 months of auth/storage for zero SPC value |
| 22 | Shareable Analysis Links | URL encoding breaks at scale; JSON export suffices |
| 23 | Offline-First Database | Over-engineering; localStorage works |

## Session Log
- 2026-04-02: Initial ideation — 47 raw ideas generated across 6 frames, 36 after dedupe + 4 cross-cutting combinations, 7 survived adversarial filtering. User selected #3 (Investigation Mode) for brainstorming.
