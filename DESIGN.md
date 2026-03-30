# Design System — Super SPC

## Product Context
- **What this is:** A semiconductor process-control decision platform for SPC review, method comparison, evidence capture, and report generation. It should feel like a precision instrument for high-stakes process judgment — not a generic BI dashboard, not a chart builder, not a SaaS analytics product.
- **Who it's for:** Process engineers, yield engineers, manufacturing quality leads, and technical reviewers inside fabs and advanced manufacturing environments. These users are trained statisticians who use JMP, Minitab, and internal tools daily. They expect statistical rigor and density.
- **Space/industry:** Semiconductor manufacturing, industrial analytics, SPC tooling. Category peers: JMP Control Chart Builder, Minitab, Northwest Analytics, InfinityQS. The product competes on trust, decision speed, and evidence traceability — not chart count or dashboard prettiness.
- **Project type:** Desktop-first analytical web app with report-generation surfaces. Minimum effective viewport: 1440×900.

## Aesthetic Direction
- **Direction:** Command-Center Analytical — Palantir product density meets JMP interaction precision
- **Decoration level:** Zero. Every pixel earns its place through information or affordance.
- **Mood:** Dark, exacting, dense, and audit-ready. The product should feel like a command center for process judgment: the kind of tool where an engineer opens it at 6am during an escalation and trusts it immediately. No marketing energy, no SaaS softness, no dashboard vibes.
- **Reference systems:**
  - **Palantir Blueprint** — Dark theme tokens, dense layout, icon-driven navigation, flat surfaces with border hierarchy
  - **JMP Control Chart Builder** — Control panel alongside chart, drag-drop variable zones, right-click contextual options, statistical overlay layers
  - **Bloomberg Terminal** — Information density, monospace data, keyboard-first interaction
- **Anti-references:** Notion, Linear, Vercel dashboard, Stripe dashboard — these are beautiful products but wrong for this domain. Too airy, too marketing-adjacent, too much whitespace.

## Typography
- **UI/Body:** `Inter` — Best-in-class for dense data UI. Tabular figures, consistent x-height, excellent legibility at 11-13px. This is what Palantir uses internally.
- **Data/Mono:** `IBM Plex Mono` — Credible technical texture for metrics, lots, limits, timestamps, and all numeric values. Tabular figures by default.
- **Code:** `IBM Plex Mono` (same family — no need for a separate code font in this product)
- **Loading:** Google Fonts for `Inter` (weights 400, 500, 600, 700, 800) and `IBM Plex Mono` (weights 400, 500, 600). Self-host before production if deploying into restricted fab networks.
- **Why not Manrope/Plus Jakarta Sans:** These are display/marketing fonts — too round, too friendly for an instrument UI. Inter has the mechanical precision this product needs. JMP uses system fonts; Bloomberg uses monospace. We split the difference with Inter for structure and IBM Plex Mono for data.
- **Scale (compact analytical — not marketing):**
  - `page-title`: 16px / 22px / 800 — pages don't need hero text
  - `section-head`: 13px / 18px / 700
  - `body`: 12px / 18px / 500
  - `body-dense`: 11px / 16px / 500
  - `label`: 10px / 14px / 600, uppercase, letter-spacing 0.06em
  - `eyebrow`: 9px / 12px / 700, uppercase, letter-spacing 0.1em
  - `data-value`: 11-12px / 16px / 600, IBM Plex Mono
  - `data-large`: 14px / 18px / 700, IBM Plex Mono — for hero metrics (Cpk, capability indices)

## Color

### Dark Theme (Primary — this is the default)

Derived from Palantir Blueprint's dark palette with SPC-specific extensions.

**Surfaces (darkest → lightest):**
| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-0` | `#111418` | App background (Blueprint BLACK) |
| `--bg-1` | `#1C2127` | Primary panels, workspace canvas (Blueprint DARK_GRAY1) |
| `--bg-2` | `#252A31` | Side rails, elevated panels (Blueprint DARK_GRAY2) |
| `--bg-3` | `#2F343C` | Cards, list items, interactive surfaces (Blueprint DARK_GRAY3) |
| `--bg-4` | `#383E47` | Hover states, active surfaces (Blueprint DARK_GRAY4) |
| `--bg-5` | `#404854` | Strong hover, pressed states (Blueprint DARK_GRAY5) |

**Text:**
| Token | Hex | Usage |
|-------|-----|-------|
| `--t-1` | `#F6F7F9` | Primary text (Blueprint LIGHT_GRAY5) |
| `--t-2` | `#C5CBD3` | Secondary text (Blueprint GRAY5) |
| `--t-3` | `#8F99A8` | Tertiary text, descriptions (Blueprint GRAY3) |
| `--t-4` | `#5F6B7C` | Disabled text, eyebrow labels (Blueprint GRAY1) |

**Borders:**
| Token | Hex | Usage |
|-------|-----|-------|
| `--border-1` | `rgba(0,0,0,0.4)` | Subtle dividers (Blueprint dark divider) |
| `--border-2` | `rgba(255,255,255,0.1)` | Panel edges, muted borders |
| `--border-3` | `rgba(255,255,255,0.2)` | Active borders, hover borders |

**Intent colors (Blueprint-derived):**
| Token | Hex | Usage |
|-------|-----|-------|
| `--blue` | `#2D72D2` | Primary method, selected states, trust emphasis (Blueprint BLUE3) |
| `--blue-bright` | `#4C90F0` | Links, active focus (Blueprint BLUE4) |
| `--blue-dim` | `rgba(45,114,210,0.15)` | Selected backgrounds |
| `--teal` | `#1C6E42` | Robust/alternative method, secondary positive (Blueprint GREEN2) |
| `--teal-bright` | `#32A467` | Challenger overlay, comparison (Blueprint GREEN4) |
| `--green` | `#238551` | Success, in-control, center line (Blueprint GREEN3) |
| `--green-dim` | `rgba(35,133,81,0.15)` | Success backgrounds |
| `--red` | `#CD4246` | Error, OOC points, critical alerts (Blueprint RED3) |
| `--red-dim` | `rgba(205,66,70,0.15)` | Error backgrounds |
| `--amber` | `#C87619` | Warning, maintenance events (Blueprint ORANGE3) |
| `--amber-dim` | `rgba(200,118,25,0.15)` | Warning backgrounds |
| `--gold` | `#D1980B` | Phase transitions, annotations (Blueprint GOLD3) |
| `--gold-dim` | `rgba(209,152,11,0.12)` | Gold dim backgrounds |
| `--teal-dim` | `rgba(28,110,66,0.12)` | Teal dim backgrounds |
| `--purple` | `#8B5CF6` | Spec limits, event annotations |

### Chart Island (Light-on-Dark)

The control chart is rendered on a **warm light surface** embedded in the dark workspace. This is not pure white — it's tinted to integrate with the dark environment.

| Token | Hex | Usage |
|-------|-----|-------|
| `--chart-bg` | `#F6F7F9` | Chart background (Blueprint LIGHT_GRAY5, NOT white) |
| `--chart-surface` | `#EDEFF2` | Chart toolbar, readout bar (Blueprint LIGHT_GRAY4) |
| `--chart-border` | `#DCE0E5` | Chart internal borders (Blueprint LIGHT_GRAY2) |
| `--chart-grid` | `#E5E8EB` | Grid lines (Blueprint LIGHT_GRAY3) |
| `--chart-text` | `#1C2127` | Primary chart text (Blueprint DARK_GRAY1) |
| `--chart-text-2` | `#5F6B7C` | Secondary chart text (Blueprint GRAY1) |
| `--chart-text-3` | `#8F99A8` | Tertiary chart text (Blueprint GRAY3) |

**Why not pure white (#FFFFFF)?** Pure white on `#111418` creates a 21:1 surface contrast that feels like a PowerPoint slide pasted onto a terminal. `#F6F7F9` is perceptually white but integrates. Palantir and Bloomberg both use tinted light surfaces inside dark frames.

### SPC-Specific Chart Colors

These colors are reserved for statistical chart elements and must not be used for UI chrome.

| Element | Color | Notes |
|---------|-------|-------|
| Primary series line | `--blue` (#2D72D2) | 1.5-2px solid |
| Primary series points | `--blue` (#2D72D2) | 4px circles, white stroke |
| Challenger/overlay line | `--teal-bright` (#32A467) | 1px dashed |
| OOC points | `--red` (#CD4246) | Enlarged, filled red |
| Center line (CL) | `--green` (#238551) | 1.5px solid, 0.85 opacity (dominant anchor) |
| UCL/LCL lines | `--red` (#CD4246) | 1.5px solid, 0.75 opacity (primary control limits — solid, not dashed) |
| Spec limits (USL/LSL) | `--purple` (#8B5CF6) | 1px dashed `4 6`, 0.35 opacity (reference only) |
| Sigma ref lines (±1σ, ±2σ) | contextual green/amber | 0.5px solid hairline, 0.15 opacity (no dash — background reference) |
| Zone A fill (2σ–3σ) | `rgba(205,66,70,0.06)` | Subtle red tint |
| Zone B fill (1σ–2σ) | `rgba(200,118,25,0.04)` | Subtle amber tint |
| Zone C fill (0–1σ) | `rgba(35,133,81,0.04)` | Subtle green tint |
| Phase boundary | `--gold` (#D1980B) | 1px dashed `4 6`, 0.25 opacity (reduced from 0.4 — phase markers recede behind data) |
| Confidence band | `--blue` (#2D72D2) | fill opacity 0.10 (was 0.04 — now actually visible) |
| Event annotation | `#8B5CF6` | Chip with subtle background |
| Excluded point | Primary color at 25% opacity | X-mark overlay in `--amber` |
| Rule violation marker | `--red` ring or `--amber` ring | 2px ring around violated point |
| Selected point halo | `--blue` at 20% opacity | 3px stroke ring |

## Spacing
- **Base unit:** 4px
- **Density:** Dense-comfortable — tighter than typical SaaS, looser than Bloomberg
- **Scale:** 2xs(2) xs(4) sm(6) md(8) lg(12) xl(16) 2xl(24) 3xl(32)
- **Panel padding:** 8-12px (not 16-24px — that's too airy for analytical surfaces)
- **List item padding:** 6-8px vertical, 8-12px horizontal
- **Section gaps:** 0px between continuous sections (use 1px borders as dividers)

## Layout

### App Shell
```
┌─────────────────────────────────────────────────────┐
│ [Sidebar 140px]     │ [Workspace Content]           │
│  Super SPC          │                               │
│  Workspace    ◀     │  ┌──────┬─────────┬────────┐  │
│  Data Prep          │  │Ctrl  │  Chart  │Evidence│  │
│  Method Lab         │  │Panel │  Canvas │  Rail  │  │
│  Findings           │  │      │         │        │  │
│  Reports            │  │~180px│  flex   │ ~280px │  │
│  ● Pipeline ready   │  └──────┴─────────┴────────┘  │
└─────────────────────────────────────────────────────┘
```

- **Text sidebar:** 140px wide, dark (`--bg-0`), contains full text labels (Workspace, Data Prep, Method Lab, Findings, Reports) with brand block and pipeline status. Collapses to 48px icon rail below 1200px viewport width.
- **Control panel (recipe rail):** 160-180px, collapsible to ~40px icon strip. Contains JMP-style variable/parameter configuration. Background: `--bg-2`.
- **Chart canvas:** Fluid, takes all remaining space. This is the hero. Background: `--bg-1`.
- **Evidence rail:** 260-300px, scrollable. Contains signal narrative, evidence, and actions. Background: `--bg-2`.

**Critical rule:** The chart must get at least 55% of viewport width at 1440px. At 1440px with 140+180+280 = 600px of chrome, the chart gets 840px (58.3%). ✓

### Responsive Breakpoints
| Width | Behavior |
|-------|----------|
| ≥1600px | Full 3-column layout, control panel expanded |
| 1400-1599px | Control panel narrowed to 160px, evidence rail to 260px |
| 1100-1399px | Control panel collapsed to icon strip (~40px), evidence rail to 260px |
| <1100px | Single column stack: control panel horizontal → chart → evidence |

### Border Radius
- **xs:** 3px — chips, tags, inline badges
- **sm:** 4px — buttons, inputs, list items, panel cards
- **md:** 6px — context menus, step cards, report previews
- **lg:** 8px — chart card, modal dialogs
- **Never exceed 8px** in the analytical UI. 12px+ radii create a soft SaaS feel that undermines instrument credibility. JMP uses 0px. Palantir uses 2-6px. We use 3-8px.

### Surface Treatment
- **Flat planes only.** No shadows as primary hierarchy. Borders and background-color steps do the work.
- **1px solid borders** between all panel zones. No gaps, no floating cards.
- **No elevation/shadow** except: context menus (8px shadow), tooltips (4px shadow), modals (16px shadow).

## Motion
- **Approach:** Invisible-functional. Motion exists to prevent disorientation, not to delight.
- **Easing:** `ease` for all transitions (simple, fast, predictable — cubic-bezier curves add complexity without visible benefit at these durations)
- **Duration:** micro `60ms` (hover, toggle), short `100ms` (state changes), medium `150ms` (panel reveal — future), long `250ms` (screen transition — future)
- **Rule:** If removing the animation wouldn't confuse the user, remove the animation.

## Component Principles

### Chart (THE HERO)
The control chart is the single most important element in the product. Everything else serves it.

- **Zone shading is required.** Every professional SPC tool (JMP, Minitab, InfinityQS) shows 1σ/2σ/3σ zone fills. Zone C (inner) gets a subtle green tint, Zone B gets amber, Zone A gets red. This is SPC table stakes — not optional decoration.
- **Capability indices (Cpk, Ppk, Cp, Pp) must be visible** near the chart — either in the readout bar or as a compact summary. Engineers look for these immediately. Hiding them in a separate tab is a product failure.
- **Rule violation markers on points.** When a Nelson/Westgard rule fires, the triggering points must have a colored ring/marker directly on the chart. Text-only rule descriptions in the evidence rail are insufficient.
- **Grid lines stay soft** (`--chart-grid`, 0.5px). Grid supports reading, never dominates.
- **Limit labels pin to chart edge** with their numeric value: `UCL 8.145`, `CL 8.078`, `LCL 8.011`.
- **Phase boundaries** use dashed vertical lines with a labeled chip above the chart area.
- **Selected point** gets a halo ring and anchors the readout bar update. The readout should be prominent: 12px+ mono values, clear lot/value/phase/status display.
- **Excluded points** are dimmed (25% opacity) with an X-mark, never silently removed.
- **Histogram sidebar (future):** A vertical histogram docked to the Y-axis showing data distribution is standard in serious SPC tools. Plan for this in the layout.

### Control Panel (Recipe Rail — JMP-Inspired)
This is the JMP "control panel alongside chart" concept: a vertical panel that shows all current chart configuration.

- **Organized in three sections:** Dataset chip (top), Primary method chips, Challenger method chips. Each section separated by a `recipe-divider`.
- **Dataset chip** at top shows active dataset name with inline dropdown to switch datasets.
- **Primary section** contains all chart configuration chips: Metric, Subgroup, Phase, Chart type, Sigma method, Nelson tests. These are the analysis parameters for the primary chart.
- **Challenger section** mirrors Primary with its own independent set of chips, allowing a different method/sigma/test configuration for side-by-side comparison.
- **Each parameter is a "chip"** showing: eyebrow label and current value. Clicking opens an inline dropdown or checkbox editor — never a full modal.
- **Active chip** (being edited) has a `chip-editing` class. Active method chips (Metric, Chart) may use `active-chip` with left-border highlight (`--blue`, 2px).
- **Collapsible** to a 40px icon strip showing section icons only.
- **Layer toggles** are NOT in the recipe rail. They live in the chart toolbar or are accessible via context menu. The recipe rail is exclusively for analysis parameter configuration.

### Evidence Rail
The right rail is language-led, not widget-led. It explains, cites, and recommends.

- **Signal section is the hero of the rail.** Elevated background (`--bg-3`), larger heading (13px, 700 weight), severity badge, and narrative summary. This must have more visual weight than everything below it.
- **Why it triggered:** Explicit rule/method explanation with point references
- **Evidence ledger:** Key-value pairs in a compact list — lots, transform steps, phase definition, subgroup logic, limits version, method version
- **Recommended checks:** Operational suggestions, not vague AI chatter
- **Finding draft:** Title and summary with action buttons (Create, View all). Full finding detail (severity, citations, owner, export) lives on the Findings screen — the rail shows a preview only.
- **Section differentiation:** Use varying background treatments or spacing to break the monotony. The signal section should feel elevated (`--bg-3` background, larger heading); the evidence ledger should feel like a data table; checks should feel like a checklist.

### Toolbar (Chart-Local)
- **Belongs to the chart card**, not the app shell
- **Contains:** chart title (metric — chart type), data window label, data table toggle, layout controls (when challenger active)
- **Does NOT contain** analysis parameter controls (those live in the recipe rail)
- **Light background** (`--chart-surface`) to match the chart island
- **Right-click context menus** on chart points may include point-specific actions (exclude, create finding). Context menus are for point-level operations, not chart configuration.

### Compare Strip
Below the chart, a horizontal strip of summary cards shows key analysis metrics at a glance.

- **Current cards:** OOC points (count), Rules triggered (count), Method (name), Limits scope
- **Each card** is a `compare-card` with tone-based coloring (critical for OOC, neutral for method)
- **Compact layout:** horizontal flex strip with equal-width cards

### Lineage Strip
Below the compare strip, a secondary info bar shows data provenance.

- **Fields:** Data timestamp, Limits version, Transform count, Excluded count, Pipeline status
- **Purpose:** Audit trail — every chart result is traceable to its inputs

### Data Readout Bar (planned)
Selected-point detail with per-method values. Not yet implemented — currently, selected-point information is shown in the Evidence Rail signal section.

### Data Prep Page
The data prep surface is a standalone route with a 3-column grid layout, distinct from the workspace.

**Layout: `240px | 1fr | 260px`**
```
┌─────────────────────────────────────────────────────┐
│ [Sidebar 140px]  │ [Data Prep Content]              │
│                  │                                  │
│                  │  ┌────────┬────────────┬───────┐  │
│                  │  │Dataset │  Table     │Column │  │
│                  │  │List    │  Area      │Info   │  │
│                  │  │240px   │  1fr       │260px  │  │
│                  │  └────────┴────────────┴───────┘  │
└─────────────────────────────────────────────────────┘
```

- **Dataset list (240px):** Scrollable list of uploaded datasets. Each dataset shows a card with name, row count, upload date, active value column. "+ Upload CSV" as a dashed-border label button at the bottom. Active dataset has blue border + bg-3 background.
- **Table area (1fr, inside `.prep-center`):** Three stacked flex children:
  1. **Transform toolbar** — 32px min-height, bg-3 background, border-bottom. Left side: tool buttons (Filter, Find, Dedup, Missing, Trim, Sort). Right side: transform count, unsaved indicator, Undo and Save buttons.
  2. **Inline panel** (conditional) — collapses in/out below toolbar, never opens a modal. Shows filter controls, find-replace fields, dedup column selector, or missing value strategy picker.
  3. **Data table** — fills remaining height, IBM Plex Mono 11px, scrollable. Sticky header with column names + role badges (Y, SG). Monochrome row highlighting on hover. Footer shows row/column count and hidden column count.
- **Column info (260px):** Right panel with two stacked panel-cards: (1) **Columns** — lists all columns with role badge, type label, and toggle visibility button. (2) **Summary** — per-column stats (n, mean, std, min, max, median) computed from the current Arquero table.

**Transform toolbar buttons:**
- Tool buttons (`prep-tool-btn`): 10px bold, 3px 8px padding, border-2 border, 4px radius. On active: blue border + blue-dim bg.
- Undo button: same style as tool button
- Save button (`prep-save-btn`): blue border + blue-bright text; on hover: blue-dim bg

**Inline panel:**
- Background: `--bg-2`, border-bottom: `--border-2`, padding: 8px 10px
- Flex row with 8px gaps for controls — compact select/input elements
- `Apply` button: primary blue button styled as `prep-panel-apply`

**Column role badges:**
- `Y` (value column): blue background
- `SG` (subgroup column): teal background
- Other roles use neutral bg-3

**Data table:**
- Container: `.prep-center { display: flex; flex-direction: column; min-height: 0; overflow: hidden }` — critical to keep toolbar + table in one grid column
- Table wrap: `flex: 1; overflow: auto; min-height: 0` — fills remaining space and scrolls

**Architecture note (DataRow model):**
The Data Prep layer uses a client-first architecture. CSV is parsed client-side via PapaParse (raw strings, no type coercion). Data is stored as `raw_json` in `DataRow` records — a flat key→string map. Value and subgroup columns are derived at analysis time from column roles, never stored as mapped fields. Arquero is the in-memory transform engine; transforms are immutable operations stacked on `rawRows` and replayed on undo.

### Capability Indices
- **Location:** Chart pane titlebar, inline with method name
- **Shows:** Cpk and Ppk values when capability analysis is available
- **Color-coded:** Green (≥1.33), amber (1.0-1.33), red (<1.0) via `capClass()` utility
- **Visibility:** Only appears when `capability` is computed for the dataset; the titlebar gracefully omits these when no capability data exists

### Challenger Overlay
- **Challenger visibility** is automatic — the teal dashed line appears when a challenger method is marked "ready" via Method Lab, disappears when none is selected
- There is NO manual toggle for overlay visibility — it follows method selection state
- **Dual-pane layout:** When challenger is ready, the chart arena splits into primary + challenger panes with configurable arrangement (horizontal, vertical, primary-wide, primary-tall, single)
- **Layout controls** appear in the chart toolbar only when a challenger is active

### Navigation Sidebar
- **140px text sidebar** with full labels, dark background (`--bg-0`)
- **Brand block** at top: product name "Super SPC" + version number
- **Full text labels:** Workspace, Data Prep, Method Lab, Findings, Reports
- **Active section** indicated by left-border highlight (`--blue`), subtle background, and bold text
- **Pipeline status** at bottom with green dot indicator
- **Responsive:** collapses to 48px at viewport < 1200px, showing 2-letter abbreviations as fallback

### Tables and Dense Data
- **IBM Plex Mono** for all volatile values: lots, timestamps, limits, IDs, version numbers
- **Inter** for labels and explanatory text
- **Uniform row backgrounds** using `--bg-3` with `--border-2` borders for dense lists (alternating backgrounds add visual noise at this density level)
- **Right-align** numeric values in evidence lists and key-value pairs

### Reports
- More editorial than the app shell, but still technical
- Report surfaces can use slightly larger type (14px body) and more generous spacing
- Still dark-themed — no sudden mode switch to white
- Report should feel boardroom-ready without losing traceability

## Safe Choices
- Blueprint-derived color system: proven at scale across Palantir's products, WCAG 2.0 compliant
- Inter + IBM Plex Mono: the same pairing used by many data-heavy products (Vercel, Linear, various fintech)
- Dense but readable: no tiny text for critical state, no oversized marketing spacing
- Minimal surface effects: borders and color steps do hierarchy, not blur/glow/shadow
- Zone shading on control charts: industry standard, not decorative

## Risks and Tradeoffs
| Risk | Why it's worth it | Mitigation |
|------|-------------------|------------|
| Dark-first UI in a light-office environment | Creates memorable product identity; reduces eye strain during long review sessions; matches Palantir/Bloomberg category aesthetic | Chart island provides light relief; consider future light-mode toggle |
| Chart island (light surface in dark frame) | Essential for chart readability — gridlines and data points read better on light backgrounds | Use `#F6F7F9` not `#FFFFFF`; add intermediate border tint; never hard-cut |
| Mono-heavy data display | Makes numbers trustworthy and scannable | Keep mono scoped to data values only; labels stay in Inter |
| Dense layout may intimidate new users | Target users are JMP/Minitab power users who expect density | Add progressive disclosure where possible; never hide critical state |

## Interaction Model

### JMP-Inspired Principles
1. **Control panel alongside chart** — configuration is always visible and editable, not hidden behind menus
2. **Right-click context** — chart points, phases, and limits all support contextual menus
3. **Direct manipulation** — click points to inspect, drag axes to adjust, toggle layers inline
4. **Inspector pattern** — selecting a parameter opens a focused inline editor, not a full-page modal

### Palantir-Inspired Principles
1. **Icon-driven navigation** — thin sidebar rail, not a wide nav drawer
2. **Flat hierarchy** — surfaces are differentiated by background-color steps and borders, not elevation
3. **Dense by default** — show more information in less space; trust the user's expertise
4. **Keyboard-accessible** — every critical action has a keyboard shortcut

### Axis Interaction (JMP-style — unified for both axes)

Both axes follow **identical interaction logic**. The only difference is the data type
(continuous values vs categorical indices) and the corresponding tick algorithm.

**Drag interaction — same function, both axes:**
- Drag **along** the axis → **PAN** (translate the visible range)
- Drag **perpendicular** to the axis → **SCALE** (zoom in/out)
- X-axis: left/right = pan, up/down = scale
- Y-axis: up/down = pan, left/right = scale
- **No position walls** — both axes allow free pan/scale with no hard stops at data bounds
- **Range clamp only** — can zoom to 5% of original range (max zoom in) or 5× (max zoom out)

**Cursor:** `grab` on hover, `grabbing` during drag (both axes identical)

**Double-click any axis** → reset to auto-computed domain

**Tick algorithms — same 1-2-5 philosophy, different data types:**

| | Y-axis (continuous) | X-axis (categorical) |
|---|---|---|
| Algorithm | `niceStep()` — Heckbert/Wilkinson | `niceStride()` — same 1-2-5 × 10^n |
| Picks | Value steps: 0.05, 0.1, 0.2, 0.5... | Index strides: 1, 2, 5, 10, 20... |
| Density from | `plotHeight / 35px` → target count | Rotation-aware footprint / pointSpacing |
| Adapts to | Pan/scale (recomputes ticks for current domain) | Pan/scale + label rotation state |

**X-axis label collision avoidance:**
1. Determine rotation from raw density (upright → 45° → 90°)
2. Compute effective horizontal footprint per rotation state
3. Apply 24px readability floor (no dense label walls)
4. Derive stride from footprint → snap to nice stride
5. Selected-point label always wins — suppress nearby stride labels within collision radius

**Axis controls live on the axes themselves, not in the recipe rail. The axis is the affordance.**

### Rules
- Default to reveal, not hide. Signals, exclusions, lineage, and method deltas should remain visible by default.
- Prefer inline inspectors over modal configuration.
- Animate only where it prevents disorientation: screen transitions, panel collapse, point selection.
- Never make engineers wait on decorative motion.
- State is communicated through language, position, and contrast — never through motion or glow alone.

## Do Not Do
- ❌ Border radius > 8px on any analytical surface
- ❌ Pure white (#FFFFFF) backgrounds — use `#F6F7F9` minimum
- ❌ Soft, bubbly SaaS cards with large padding and rounded corners
- ❌ Gradient backgrounds, glassmorphism, frosted panels, decorative blur
- ❌ Glowing chips, neon-like selection states, animated attention-grabbing badges
- ❌ Duplicate controls (same toggle in two places)
- ❌ Hiding zone shading, capability indices, or rule markers — these are SPC essentials
- ❌ Marketing typography scale (24px+ headings in the analytical workspace)
- ❌ Dashboard-style card grids transplanted into analytical surfaces
- ❌ Shadows as primary hierarchy mechanism
- ❌ Display/hero fonts (Manrope, Plus Jakarta Sans, etc.) — wrong density for this product

---

## Document Map

Detailed feature specs have been extracted from this file into individual documents. This file contains the **general design system** (aesthetic, typography, color, spacing, layout, components, interaction model). Feature-specific details live in the files below.

| Area | File | Summary |
|------|------|---------|
| **Chart Types** | [.claude/design/chart-type-system-v1.md](.claude/design/chart-type-system-v1.md) | 24 chart types across 5 categories, auto-detection logic, paired layout, multi-chart workspace |
| **Data Import** | [.claude/design/data-import-management-v1.md](.claude/design/data-import-management-v1.md) | CSV import UX, data table viewer, column properties |
| **Variable Config** | [.claude/design/variable-config-v1.md](.claude/design/variable-config-v1.md) | JMP-style drag-and-drop zones (Y, Subgroup, Phase, Label, Part, By, n Trials) |
| **Sigma Config** | [.claude/design/sigma-config-v1.md](.claude/design/sigma-config-v1.md) | Statistic selector, sigma method selector (9 methods), K-sigma multiplier |
| **Tests & Rules** | [.claude/design/statistical-tests-rules-v1.md](.claude/design/statistical-tests-rules-v1.md) | 8 Nelson rules, 6 Westgard rules, test config UI, alarm report |
| **Spec/Control Limits** | [.claude/design/spec-limits-control-limits-v1.md](.claude/design/spec-limits-control-limits-v1.md) | Spec limits dialog, control limits management (manual override, save/load) |
| **Capability** | [.claude/design/capability-analysis-v1.md](.claude/design/capability-analysis-v1.md) | Cp/Cpk/Pp/Ppk report, sigma report, PPM estimates |
| **CUSUM** | [.claude/design/cusum-platform-v1.md](.claude/design/cusum-platform-v1.md) | Dedicated CUSUM view with ARL profiler, h/k parameters, shift detection |
| **EWMA** | [.claude/design/ewma-platform-v1.md](.claude/design/ewma-platform-v1.md) | EWMA platform with lambda tuning, forecast point, residuals chart |
| **Multivariate** | [.claude/design/multivariate-charts-v1.md](.claude/design/multivariate-charts-v1.md) | Hotelling T², MEWMA, decomposition panel |
| **Alarms** | [.claude/design/alarm-notification-v1.md](.claude/design/alarm-notification-v1.md) | Real-time alarm behavior (5 steps), alarm scripts |
| **Save/Export** | [.claude/design/save-export-v1.md](.claude/design/save-export-v1.md) | Save operations, export formats, reproducibility (analysis scripts, audit trail) |
| **Shortcuts** | [.claude/design/keyboard-shortcuts-v1.md](.claude/design/keyboard-shortcuts-v1.md) | All keyboard shortcuts with contexts |
| **States** | [.claude/design/empty-error-loading-v1.md](.claude/design/empty-error-loading-v1.md) | Empty, error, and loading states for all surfaces |
| **Accessibility** | [.claude/design/accessibility-v1.md](.claude/design/accessibility-v1.md) | Keyboard nav, screen readers, WCAG AA, touch targets |
| **Axis Spec** | [.claude/spec/src-chart/axis-interaction-spec-v1.md](.claude/spec/src-chart/axis-interaction-spec-v1.md) | Unified axis pan/scale/tick system (JMP-style) |
| **Data Prep Research** | [.claude/spec/src-data/data-prep-research-v1.md](.claude/spec/src-data/data-prep-research-v1.md) | 30-feature roadmap across 5 phases; JMP/Minitab/Tableau competitive matrix; Phase 1 complete |
| **Algo Spec** | [.claude/spec/algo/control-charts-spec-v1.md](.claude/spec/algo/control-charts-spec-v1.md) | Algorithm package design for 24 chart types |
| **Algo Plan** | [.claude/plan/algo/control-charts-plan-v1.md](.claude/plan/algo/control-charts-plan-v1.md) | 32-task implementation plan for algo package |
| **API Spec** | [.claude/spec/api/backend-architecture-v1.md](.claude/spec/api/backend-architecture-v1.md) | FastAPI + SQLite architecture, schema, API surface |
| **API Plan** | [.claude/plan/api/backend-implementation-v1.md](.claude/plan/api/backend-implementation-v1.md) | 4-phase backend implementation plan |
| **Roadmap** | [.claude/roadmap/](.claude/roadmap/) | Tier 1-4 feature priorities |
| **SPC Formulas** | [.claude/skills/spc-formulas/SKILL.md](.claude/skills/spc-formulas/SKILL.md) | All 25 chart type formulas, JMP conventions, sigma estimation, rules, capability |

---

## SPC Feature Checklist (Complete — Design Must Support)

### Core Chart Features
- [ ] 1σ/2σ/3σ zone shading on all Shewhart charts
- [ ] Capability indices (Cpk, Ppk, Cp, Pp) visible near chart
- [ ] Full Process Capability Report (below chart, expandable)
- [ ] Sigma Report (overall, within, stability index)
- [ ] Rule violation markers directly on chart points
- [x] All 8 Nelson rules (independently toggleable) — algo: implemented
- [x] Westgard rules (6 rules, for Levey-Jennings charts) — algo: implemented
- [ ] Custom test designer (modify rule parameters) — algo: RuleConfig supports custom_params
- [ ] Histogram sidebar docked to Y-axis
- [ ] Phase-specific limit recalculation with visual before/after
- [ ] Method comparison overlay (challenger vs. primary)
- [ ] Exclusion lineage — every excluded point traceable to a reason
- [ ] Confidence bands for modern/robust methods
- [ ] Box-and-whisker per subgroup (optional layer)
- [x] Run-chart mode (no limits, just sequence) — algo: implemented with runs test
- [ ] Alarm Report (OOC summary per chart)

### Chart Types — Shewhart Variables (algo: ✅ complete)
- [x] XBar-R (subgroup mean + range)
- [x] XBar-S (subgroup mean + std dev)
- [x] IMR (individual + moving range)
- [x] R chart (standalone range)
- [x] S chart (standalone std dev)
- [x] MR chart (standalone moving range)
- [x] Run Chart (no limits, runs test)
- [x] Levey-Jennings (long-term sigma)
- [x] Presummarize (repeated measures, known parameters)
- [x] Three Way (between + within)

### Chart Types — Shewhart Attributes (algo: ✅ complete)
- [x] P chart (proportion defective)
- [x] NP chart (count defective)
- [x] C chart (count of defects)
- [x] U chart (defects per unit)
- [x] Laney P' (overdispersion-adjusted proportion)
- [x] Laney U' (overdispersion-adjusted rate)

### Chart Types — Short Run (algo: ✅ complete)
- [x] Short Run Difference (centered)
- [x] Short Run Z (standardized)
- [x] Short Run MR (centered and standardized)
- [x] Short Run XBar variants

### Chart Types — Rare Event (algo: ✅ complete)
- [x] G chart (counts between events)
- [x] T chart (time between events)

### Chart Types — Advanced Platforms (algo: ✅ complete)
- [x] CUSUM Tabular (with ARL profiler)
- [x] CUSUM V-Mask
- [x] EWMA (with residuals, forecast, ARL)
- [x] Multivariate T² (Hotelling, Phase I + II, contributions decomposition)
- [x] MEWMA (exact + asymptotic covariance)

### Data Management
- [x] CSV import with column mapping — client-side PapaParse, dtype detection, SPC role suggestion (Y/SG auto-named)
- [ ] Excel import
- [x] Data table viewer — virtual scroll (500-row cap), sticky header, sortable columns, column hide/show
- [ ] Column properties (spec limits, control limits, sigma, modeling type)
- [ ] Drag-and-drop variable zone assignment
- [ ] Multiple Y variables (multi-chart workspace)
- [ ] By-group analysis (separate chart per group level)
- [ ] Column Switcher (swap Y variable without rebuilding)
- [x] Missing value handling — remove rows, fill mean/median/zero/custom/down/up
- [x] Sort by column (asc/desc, Arquero-based)
- [x] Row filtering — equals/not-equals/contains/gt/lt/between/is-null/is-not-null, Arquero escape() safe
- [x] Find & replace — across all columns or specific column, single or all occurrences
- [x] Remove duplicates — configurable key columns, keep first/last
- [x] Trim & clean text — strip whitespace, remove non-printable chars, case standardization
- [x] Column reorder & hide — toggle visibility, hidden columns preserved in data
- [ ] Rename column (Phase 2)
- [ ] Change data type (Phase 2)
- [ ] Calculated column / formula (Phase 2)
- [ ] Recode values (Phase 2)
- [ ] Binning (Phase 2)
- [ ] Split / concatenate columns (Phase 2)

### Configuration
- [ ] Chart type auto-detection from data characteristics
- [ ] Chart type manual override selector
- [ ] Statistic selector (average, individual, proportion, count, etc.)
- [ ] Sigma method selector (range, std dev, moving range, median MR, etc.)
- [ ] K-sigma multiplier (default 3, configurable 1-5)
- [ ] Spec limits entry/edit/save/load
- [ ] Control limits manual override/save/load
- [ ] Show/hide individual points within subgroups
- [ ] Show/hide box plots

### Save & Export
- [ ] Save control limits (in column, in new table, in new tall table)
- [ ] Save spec limits
- [ ] Save summaries (per-subgroup statistics)
- [ ] Save product statistics (Short Run)
- [ ] Save analysis script (reproducibility)
- [ ] Export chart image (PNG, SVG)
- [ ] Export report (PDF)
- [ ] Export data table (CSV, Excel)
- [ ] Export full analysis bundle (JSON)
- [ ] Export finding with citations (PDF)

### Alarm & Monitoring
- [ ] Alarm Report (OOC summary table)
- [ ] Alarm scripts (automated actions on rule failure)
- [ ] Real-time notification toasts
- [ ] Nav badge for unacknowledged alarms
- [ ] Alarm log (persistent, queryable)

### Accessibility
- [ ] Full keyboard navigation (all chart interactions)
- [ ] Screen reader support (ARIA live regions, role annotations)
- [ ] WCAG 2.1 AA color contrast compliance
- [ ] Colorblind-safe chart encoding (shape + color)
- [ ] 44px minimum touch targets

---

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-03-25 | Initial design system created | Created by /design-consultation based on Super SPC product context |
| 2026-03-25 | **Major rewrite: Dark-first Palantir aesthetic + JMP interaction model** | Original DESIGN.md specified Manrope/Plus Jakarta Sans fonts (too soft), light-mode neutrals (product is dark-first), oversized radii (12px+ is SaaS, not instrument), and no SPC-specific chart requirements (zones, capability indices, rule markers). Updated to use Blueprint color tokens, Inter/IBM Plex Mono typography, 3-8px radii ceiling, explicit zone shading spec, and Palantir density principles. Informed by product critique: chart must be hero (55%+ viewport), no duplicate controls, evidence rail needs hierarchy. |
| 2026-03-26 | **Complete feature design expansion** | Gap analysis against JMP Control Chart Builder revealed DESIGN.md was strong on aesthetic system (7/10) but missing feature design specs. Added: full chart type inventory (20+ types across 5 categories), paired chart layout, drag-drop variable zones, statistic/sigma/K-sigma configuration, all 8 Nelson + 6 Westgard rules, CUSUM/EWMA/multivariate platform designs, data import flow, spec/control limits management, capability report layout, alarm system, save/export operations, empty/error/loading states, accessibility spec, keyboard shortcuts. Informed by JMP Quality and Process Methods reference documentation. |
| 2026-03-26 | **Chart panel redesign: Method Comparison Bar** | "Robust overlay" toggle was hiding the core SPC concept — primary vs challenger method comparison — as a visual layer. Promoted to explicit method cards in chart toolbar with per-method capability indices and dual readout bar. Challenger overlay visibility now tied to method selection state, not a manual toggle. Removes overlay from Layers toggles. |
| 2026-03-26 | **Navigation sidebar: full text labels** | 2-letter abbreviations (WK, DP, ML) were cryptic. Redesigned to 140px text sidebar with full labels, brand block, and pipeline status. Responsive collapse to 48px at <1200px. |
| 2026-03-27 | **Algo package: 24 chart types implemented** | Full `algo/` Python package with 24 chart types (up from 16 planned), 8 Nelson tests, 6 Westgard rules, CUSUM ARL profiler, 7 sigma estimators, constants tables n=2..50. Added standalone R/S/MR charts, Run Chart with runs test, Presummarize, CUSUM V-Mask, Hotelling T² (Phase I+II with contributions decomposition), MEWMA (exact + asymptotic). 1076 tests (pytest + hypothesis property-based). Pure numpy/scipy, attrs models, no higher-level dependencies. |
| 2026-03-28 | **DESIGN.md alignment with product** | Recipe rail restructured from Variables/Config/Layers to Dataset + Primary + Challenger sections — dual-config approach enables side-by-side method comparison directly in the rail. Method Comparison Bar replaced with Compare Strip (horizontal stat cards) + Lineage Strip. Layer toggles removed from recipe rail. Capability indices live in chart pane titlebar. Data Readout Bar deferred (selected-point info in Evidence Rail for now). |
| 2026-03-29 | **DataRow model: client-first CSV architecture** | Replaced Measurement model (stored value+subgroup as mapped columns) with DataRow (stores raw_json only). CSV parsed client-side via PapaParse — no server-side CSV parsing. Value and subgroup derived at analysis time from column roles. POST /datasets accepts JSON rows rather than file upload. Rationale: full round-trip fidelity, no dtype coercion surprises, client-side Arquero transforms without round-tripping data to server. |
| 2026-03-29 | **Data Prep Phase 1 — 7 transforms, inline panel pattern** | Implemented: row filtering, sort, find-replace, dedup, missing value handling, trim/clean text, column reorder/hide. All transforms are immutable Arquero operations stacked and replayed on undo. UI: toolbar with active-state tool buttons, inline collapsible panels (no modals). Layout: 3-column grid (240px dataset list \| 1fr prep-center \| 260px column info). Critical bug found and fixed: renderPrepTable() must return a single .prep-center wrapper — emitting 3 sibling elements breaks grid placement, squashing table to 260px. |
