## Working Style 

When asked for a design review or architectural analysis, provide the full critique FIRST before implementing any fixes. Do not rush to code changes unless explicitly asked.

## Tools & Conventions 

For UI/visual work, use Playwright for screenshots — never use the preview tool for visual verification.

## Design Principles

Prefer the simplest UX solution first (e.g., hide invalid options) rather than adding validation warnings or complex error handling. Ask before adding complexity.

## File Organization

Save project files (plans, docs, skills) inside the project repo under `.claude/` or `docs/` — never in global config directories unless explicitly told.

## Design System

Before making any visual or UI decisions, always read the **latest** design files in `.claude/design/`:

- **Document Map**: `.claude/design/2026-04-01_design-document-map-v1.md` — master index of all design files
- **Core System**: `.claude/design/2026-04-01_design-system-core-v1.md` — typography, color, spacing, motion, do-not-do
- **Layout & Shell**: `.claude/design/2026-04-01_design-layout-shell-v1.md` — app shell, breakpoints, sidebar
- **Chart Components**: `.claude/design/2026-04-01_design-chart-components-v1.md` — chart hero, adaptive layout, focus, multi-chart
- **Panels & Rails**: `.claude/design/2026-04-01_design-panels-rails-v1.md` — recipe rail, evidence rail, context menu, findings, method lab, data prep
- **Interaction Model**: `.claude/design/2026-04-01_design-interaction-model-v1.md` — JMP/Palantir principles, axis interaction, forecast interaction
- **Keyboard Shortcuts**: `.claude/design/2026-04-01_design-keyboard-shortcuts-v1.md` — all shortcuts by context
- **Feature Checklist**: `.claude/design/2026-04-01_design-feature-checklist-v1.md` — implementation status
- **Decisions Log**: `.claude/design/2026-04-01_design-decisions-log-v1.md` — all design decisions with rationale

Read the relevant file(s) for the area you're working on. Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match the design system.

## .claude/ Directory Convention

Project documentation lives in `.claude/` organized **type-first, then component**. When creating new files, follow these rules.

### Directory Structure

| Directory | Purpose | When to create files here |
|-----------|---------|--------------------------|
| `spec/<component>/` | **What** to build — architecture, schemas, API surfaces, data models, contracts | Writing a new component design or documenting an existing system's structure |
| `plan/<component>/` | **How** to build it — step-by-step implementation plans, task breakdowns, phased rollouts | Planning implementation work before coding |
| `memory/<component>/` | **What happened** — session notes, decisions made, bugs found/fixed, patterns discovered | Recording context that future sessions need but git history doesn't capture well |
| `design/` | **Design system + feature specs** — DESIGN.md (master design system) and detailed UI/UX feature specs | Adding or updating design system rules, or adding a new feature spec |
| `roadmap/` | **What's next** — prioritized feature tiers | Adding or updating feature priorities |
| `reference/` | **External sources** — third-party docs, papers, standards | Adding reference material from outside the project |

### Component Names

Use the same component names across all type directories. Current components:

- `algo` — Python algorithm package (`algo/`)
- `api` — FastAPI backend (`api/`)
- `src-chart` — Frontend chart system (`src/chart/`)
- `src-core` — Frontend core/state (`src/core/`)
- `src-data` — Frontend data layer (`src/data/`)

To add a new component, use it consistently across all relevant type directories.

### File Naming

**Pattern:** `YYYY-MM-DD_<subject>-<object>-v<N>.md`

All files in `.claude/` (design, spec, memory, plan, roadmap, reference) **must** include:

1. **Date** — `YYYY-MM-DD` prefix (the date the file was created)
2. **Subject** — what area/component this relates to (e.g., `chart`, `algo`, `api`, `toolbar`)
3. **Object** — what the file is about (e.g., `spec`, `plan`, `layout-fix`, `sigma-config`)
4. **Version** — `-v<N>` suffix

- Always include a version suffix: `-v1`, `-v2`, etc.
- Use lowercase kebab-case for all parts.
- Examples:
  - `2026-03-26_algo-control-charts-spec-v1.md`
  - `2026-04-01_api-backend-implementation-v2.md`
  - `2026-03-26_src-chart-split-view-redesign-v1.md`
  - `2026-04-01_toolbar-zoom-feature-v1.md`

### Version Control & Change Log Protocol

When any **feature, bug fix, plan, roadmap, design change, or spec** is generated during a conversation and the user gives final approval:

1. **Compare** the approved version against the most recent previous file for the same subject/object.
2. If the content differs from the previous version:
   - **Ask the user**: "Should I revise the existing file in-place, or create a new versioned file (v<N+1>)?"
   - If **revise**: update the existing file and append a `## Change Log` section at the bottom documenting what changed and when.
   - If **new version**: create a new file with bumped version number. Include a `## Change Log` section at the top of the new file showing the diff summary vs. the previous version.
3. **Change Log format**:
   ```
   ## Change Log
   ### v<N> -> v<N+1> (YYYY-MM-DD)
   - **Added**: ...
   - **Changed**: ...
   - **Removed**: ...
   - **Previous file**: `<path-to-previous-version>`
   ```

### Creating a New File — Checklist

1. **Pick the type directory** — Is this a spec, plan, memory, design, roadmap, or reference?
2. **Pick or create the component subdirectory** — Which part of the project does this belong to?
3. **Name with date, subject, object, version** — `YYYY-MM-DD_<subject>-<object>-v1.md`
4. **Add a header** — First line: `# <Title>`, second line: `> <type> for <component> — v<N>`
5. **Update Document Map** — If the file is a spec, plan, or design doc that other sessions should find, add a row to the Document Map in `.claude/design/2026-04-01_design-document-map-v1.md`.

### Examples

```
# New algorithm spec for short-run charts:
.claude/spec/algo/2026-04-01_algo-short-run-charts-spec-v1.md

# Implementation plan for CSV import feature:
.claude/plan/src-data/2026-04-01_src-data-csv-import-plan-v1.md

# Session memory about a debugging session:
.claude/memory/api/2026-04-01_api-auth-middleware-debug-v1.md

# New feature design for histogram sidebar:
.claude/design/2026-04-01_chart-histogram-sidebar-v1.md

# Adding a new reference document:
.claude/reference/2026-04-01_spc-western-electric-rules-v1.pdf

# Roadmap update:
.claude/roadmap/2026-04-01_project-tier1-priorities-v2.md
```
