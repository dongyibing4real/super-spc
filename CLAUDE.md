## Design System
Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.

## .claude/ Directory Convention

Project documentation lives in `.claude/` organized **type-first, then component**. When creating new files, follow these rules.

### Directory Structure

| Directory | Purpose | When to create files here |
|-----------|---------|--------------------------|
| `spec/<component>/` | **What** to build — architecture, schemas, API surfaces, data models, contracts | Writing a new component design or documenting an existing system's structure |
| `plan/<component>/` | **How** to build it — step-by-step implementation plans, task breakdowns, phased rollouts | Planning implementation work before coding |
| `memory/<component>/` | **What happened** — session notes, decisions made, bugs found/fixed, patterns discovered | Recording context that future sessions need but git history doesn't capture well |
| `design/` | **Feature specs** — detailed UI/UX specs extracted from DESIGN.md | Adding a new feature spec or updating an existing one (general design system stays in DESIGN.md) |
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

**Pattern:** `<descriptive-name>-v<N>.md`

- Always include a version suffix: `-v1`, `-v2`, etc.
- When updating a file significantly, bump the version (create `-v2`, keep `-v1` as history).
- Use lowercase kebab-case for the descriptive name.
- Examples: `control-charts-spec-v1.md`, `backend-implementation-v2.md`, `2026-03-26_split-view-redesign-v1.md`
- Memory files may prefix with date: `YYYY-MM-DD_<name>-v<N>.md`

### Creating a New File — Checklist

1. **Pick the type directory** — Is this a spec, plan, memory, design, roadmap, or reference?
2. **Pick or create the component subdirectory** — Which part of the project does this belong to?
3. **Name with version** — `<name>-v1.md`
4. **Add a header** — First line: `# <Title>`, second line: `> <type> for <component> — v<N>`
5. **Update DESIGN.md Document Map** — If the file is a spec, plan, or design doc that other sessions should find, add a row to the Document Map table in DESIGN.md.

### Examples

```
# New algorithm spec for short-run charts:
.claude/spec/algo/short-run-charts-spec-v1.md

# Implementation plan for CSV import feature:
.claude/plan/src-data/csv-import-plan-v1.md

# Session memory about a debugging session:
.claude/memory/api/2026-04-01_auth-middleware-debug-v1.md

# New feature design for histogram sidebar:
.claude/design/histogram-sidebar-v1.md

# Adding a new reference document:
.claude/reference/western-electric-rules.pdf
```
