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
| Center line (CL) | `--green` (#238551) | 1px solid, 0.7 opacity |
| UCL/LCL lines | `--red` (#CD4246) | 1px dashed, 0.5 opacity |
| Spec limits (USL/LSL) | `--purple` (#8B5CF6) | 1px dashed, 0.3 opacity |
| Zone A fill (2σ–3σ) | `rgba(205,66,70,0.06)` | Subtle red tint |
| Zone B fill (1σ–2σ) | `rgba(200,118,25,0.04)` | Subtle amber tint |
| Zone C fill (0–1σ) | `rgba(35,133,81,0.04)` | Subtle green tint |
| Phase boundary | `--gold` (#D1980B) | 1px dashed, 0.4 opacity |
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

- **Organized in sections:** Variables (prominent chips), Config (compact chips for sigma/tests/compare), Layers (minimal toggle rows for chart layer visibility — limits, grid, phases, events, exclusions, confidence band; challenger overlay is NOT here, it's controlled by method selection)
- **Each parameter is a "chip"** showing: eyebrow label, current value, and optional detail text
- **Active chip** has a left-border highlight (`--blue`, 2px)
- **Clicking a chip** opens an inline inspector/editor — never a full modal
- **Collapsible** to a 40px icon strip showing section icons only
- **This is the ONLY place for overlay toggles.** Do not duplicate toggles in both the toolbar and the panel. One location, one source of truth.

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
- **Contains:** chart title (metric — chart type), data window label
- **Does NOT contain** overlay toggles (those live in the control panel) or capability indices (those live in method cards)
- **Light background** (`--chart-surface`) to match the chart island
- **Right-click context menus** on chart points may include point-specific actions (exclude, create finding) but must NOT duplicate layer/overlay toggles. Context menus are for point-level operations, not chart configuration.

### Method Comparison Bar
The method comparison is the intellectual heart of SPC — it must be explicit, not hidden as a toggle.

```
┌─────────────────────────────────────────────┐
│ ┌──────────────────┐  vs  ┌──────────────┐ │
│ │● Primary         │      │● Challenger   │ │
│ │  EWMA-1.0        │      │  Robust RA-2  │ │
│ │  Cpk 1.24  Ppk…  │      │  Cpk 1.31  …  │ │
│ └──────────────────┘      └──────────────┘ │
└─────────────────────────────────────────────┘
```

- **Two method cards** side by side with "vs" separator
- Each card shows: colored dot (blue=primary, teal=challenger), role label, method name, per-method capability indices (Cpk, Ppk)
- **Primary card** always present; **Challenger card** shows "None — Select in Method Lab" when no challenger is configured
- **Clicking a method card** navigates to Method Lab for method selection (future)
- **Challenger overlay visibility** is automatic — the teal dashed line appears when a challenger method is ready, disappears when none is selected. There is NO manual toggle for overlay visibility.
- **Light background** (`--chart-surface`), sits between toolbar and chart SVG

### Data Readout Bar
- **Bottom of the chart card**, light background
- **Shows both methods' values** for the selected point, separated by vertical dividers
- **Layout:** `Lot | ● Primary: 8.10 nm OK | ● Challenger: 8.08 nm OK | Rules`
- **Colored dots** match the method card dots (blue/teal) for visual continuity
- **Status labels** (OK/OOC/Excl) in uppercase monospace, colored semantically
- **Keyboard hint:** `← → navigate · Shift+F10 actions`

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
3. **Direct manipulation** — click points to inspect, drag to select ranges, toggle layers inline
4. **Inspector pattern** — selecting a parameter opens a focused inline editor, not a full-page modal

### Palantir-Inspired Principles
1. **Icon-driven navigation** — thin sidebar rail, not a wide nav drawer
2. **Flat hierarchy** — surfaces are differentiated by background-color steps and borders, not elevation
3. **Dense by default** — show more information in less space; trust the user's expertise
4. **Keyboard-accessible** — every critical action has a keyboard shortcut

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

## Chart Type System

Super SPC must support the full breadth of control chart types that trained SPC users expect from JMP and Minitab. The chart type is determined by data characteristics (continuous vs. attribute, subgroup size) and user intent.

### Chart Type Inventory

**Shewhart Variable Charts (continuous measurement data):**

| Chart Type | When to Use | Location Chart | Dispersion Chart |
|-----------|-------------|----------------|-----------------|
| XBar-R | Subgroup size 2–8 | Subgroup means | Subgroup ranges |
| XBar-S | Subgroup size ≥9 | Subgroup means | Subgroup std devs |
| IMR (Individual & Moving Range) | Subgroup size = 1 | Individual values | Moving range of 2 successive values |
| Run Chart | Sequence visualization, no limits | Individual values (no control limits) | None |
| Levey-Jennings | Lab QC, long-term sigma | Individual values (3s limits from overall σ) | None |
| Presummarize | Repeated measures on same unit | Summarized means or std devs | Moving range on summaries |
| Three Way | Between + within variation | Between-subgroup | Within-subgroup + combined |

**Shewhart Attribute Charts (count/proportion data):**

| Chart Type | Distribution | Statistic | When to Use |
|-----------|-------------|-----------|-------------|
| P chart | Binomial | Proportion defective | Variable subgroup sizes, tracking defect rate |
| NP chart | Binomial | Count defective | Constant subgroup sizes, tracking defect count |
| C chart | Poisson | Count of defects | Constant inspection units, tracking defect count |
| U chart | Poisson | Defects per unit | Variable inspection units, tracking defect rate |
| Laney P' | Adjusted Binomial | Proportion (MR-adjusted) | Very large subgroups with overdispersion |
| Laney U' | Adjusted Poisson | Defects/unit (MR-adjusted) | Very large subgroups with overdispersion |

**Short Run Charts (multi-product assembly lines):**

| Chart Type | Scaling | When to Use |
|-----------|---------|-------------|
| Short Run Difference | Centered by product target | Products with different targets, constant variance |
| Short Run Z | Standardized by target + sigma | Products with different targets AND different variance |
| Short Run MR (Centered) | Moving range on centered values | Dispersion companion for centered charts |
| Short Run MR (Standardized) | Moving range on standardized values | Dispersion companion for standardized charts |
| Short Run XBar (Centered/Z) | Subgroup versions of above | When subgroup size > 1 |

**Rare Event Charts:**

| Chart Type | Distribution | Measures | When to Use |
|-----------|-------------|----------|-------------|
| G chart | Negative Binomial | Counts between rare events | Low-frequency defects, unit-based tracking |
| T chart | Weibull | Time between rare events | Low-frequency defects, time-based tracking |

**Advanced Platforms (dedicated views, not in Control Chart Builder):**

| Platform | Purpose | Key Features |
|----------|---------|-------------|
| CUSUM (Tabular) | Detect small sustained shifts | Decision limits, shift detection lines, ARL profiler, h/k parameters |
| CUSUM (V-Mask) | Detect small sustained shifts (visual) | V-shaped mask overlay on cumulative sum |
| EWMA | Detect small shifts via exponential weighting | Lambda parameter, forecast point, residuals chart, ARL analysis |
| Multivariate (T²) | Monitor multiple correlated variables | Hotelling T² statistic, decomposition for root cause |
| MEWMA | Multivariate EWMA | Multivariate exponential weighting |

### Chart Type Auto-Detection

When the user assigns data to the Y zone, the system auto-selects the chart type:

```
IF data is continuous:
  IF subgroup size = 1 → IMR chart
  IF subgroup size 2–8 → XBar-R chart
  IF subgroup size ≥ 9 → XBar-S chart
IF data is attribute (count/proportion):
  IF binomial context (defective items) → P chart
  IF poisson context (defects per unit) → U chart
IF Short Run mode enabled:
  Apply centered or standardized scaling based on user selection
IF user explicitly selects chart type → override auto-detection
```

The chart type selector lives in the **Control Panel** as a prominent chip in the **Variables** section. Current auto-detected type shows as the default; clicking opens a dropdown showing all applicable chart types for the current data, with incompatible types grayed out and a tooltip explaining why.

### Paired Chart Layout (Location + Dispersion)

JMP always shows location and dispersion charts together. Super SPC must do the same.

```
┌──────────────────────────────────────────┐
│ Toolbar: Chart Title · Type · Actions    │
├──────────────────────────────────────────┤
│                                          │
│           Location Chart                 │
│        (XBar, Individual, etc.)          │
│           ~65% of chart height           │
│                                          │
├──────────────────────────────────────────┤
│                                          │
│          Dispersion Chart                │
│        (R, S, Moving Range)              │
│           ~35% of chart height           │
│                                          │
├──────────────────────────────────────────┤
│ Readout Bar: Lot · Value · Phase · Rules │
└──────────────────────────────────────────┘
```

- Location and dispersion charts share the same X-axis (subgroup/sample index). The x-axis labels appear only on the bottom chart.
- Both charts share zone shading, phase boundaries, and selected point highlight state.
- Dispersion chart can be hidden via Control Panel toggle ("Show Dispersion Chart" in Limits section). Run charts and Levey-Jennings charts have no dispersion chart.
- Charts resize proportionally. Location chart always gets ≥60% height.
- The vertical histogram sidebar, when enabled, docks to the right edge of the location chart Y-axis only.

### Multi-Chart Workspace

Users may need to chart multiple Y variables simultaneously (e.g., thickness and width of the same part).

- **"New Y Chart" action** in the Control Panel adds another paired chart stack below the current one.
- Each chart stack has its own toolbar, limits, and readout bar.
- All charts in the workspace share: phase boundaries, subgroup/sample axis, selected sample index.
- Scrolling is vertical. The workspace canvas becomes scrollable when charts exceed viewport height.
- Maximum 4 chart stacks visible before requiring scroll. Beyond 4, consider the "By" variable approach (one chart per group level in a paginated view).

### Chart-Specific Color Extensions

Additional chart-type-specific colors beyond the base SPC palette:

| Element | Color | Notes |
|---------|-------|-------|
| CUSUM upper cumulative sum (C+) | `--blue` (#2D72D2) | Filled area above zero |
| CUSUM lower cumulative sum (C-) | `--red` (#CD4246) | Filled area below zero |
| CUSUM decision limits | `--red` (#CD4246) | 1px dashed, same as UCL/LCL |
| CUSUM shift line | `--purple` (#8B5CF6) | 1px solid vertical |
| EWMA weighted average line | `--blue` (#2D72D2) | 2px solid |
| EWMA forecast point | `--blue-bright` (#4C90F0) | Hollow circle, 5px |
| EWMA residual | `--t-3` (#8F99A8) | 1px, secondary emphasis |
| Attribute chart proportion line | `--blue` (#2D72D2) | 1.5px solid |
| Short Run product separator | `--gold` (#D1980B) | 1px dashed vertical |
| Short Run product colors | Cycle: `--blue`, `--teal-bright`, `--amber`, `--purple` | One color per product/part level |
| G/T chart event markers | `--red` (#CD4246) | Triangle marker at event |
| Multivariate T² statistic | `--blue` (#2D72D2) | 2px solid |
| Multivariate T² limit (chi-sq) | `--red` (#CD4246) | 1px dashed |

---

## Data Import & Management

### Data Import Flow

The product must support getting real process data into the workspace. CSV is the minimum viable path; Excel and ODBC follow.

**CSV Import UX:**

```
┌────────────────────────────────────────────────────┐
│  IMPORT DATA                                  [×]  │
├────────────────────────────────────────────────────┤
│                                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │  Drop CSV file here or click to browse       │  │
│  │            (.csv, .tsv, .xlsx)                │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
│  FILE PREVIEW (first 10 rows)                      │
│  ┌──────┬──────────┬────────┬───────┬───────────┐  │
│  │ Row  │ Lot      │ Value  │ Phase │ Timestamp │  │
│  ├──────┼──────────┼────────┼───────┼───────────┤  │
│  │ 1    │ LOT-001  │ 8.045  │ P1    │ ...       │  │
│  │ ...  │ ...      │ ...    │ ...   │ ...       │  │
│  └──────┴──────────┴────────┴───────┴───────────┘  │
│                                                    │
│  COLUMN MAPPING                                    │
│  Y (Process Variable):    [Value      ▼]           │
│  Subgroup:                [— none —   ▼]           │
│  Phase:                   [Phase      ▼]           │
│  Label:                   [Lot        ▼]           │
│  Timestamp:               [Timestamp  ▼]           │
│                                                    │
│  Detected: 150 rows, 5 columns                     │
│  Subgroup size: 1 (individual measurements)        │
│  Recommended chart: IMR                            │
│                                                    │
│              [Cancel]  [Import & Chart]             │
└────────────────────────────────────────────────────┘
```

- Modal dialog, dark themed (`--bg-2` background, `--bg-3` for table rows).
- File preview uses `IBM Plex Mono` for data values.
- Column mapping dropdowns auto-detect likely assignments based on column names and data types (e.g., a column named "Phase" with few unique values → Phase role).
- After import, data flows into the workspace and the chart auto-generates based on detected subgroup size.
- Import history is logged in the audit trail.

**Data Table Viewer:**

A lightweight spreadsheet view accessible from the Data Prep screen. Not a full editor — read-only with select/exclude actions.

- Shows all imported rows with column headers.
- Row states visible: included (normal), excluded (dimmed with strikethrough), hidden (not shown by default, toggle to reveal).
- Click a row → highlights corresponding point on chart (cross-linking).
- Right-click row → Exclude/Include, Hide/Show, Select.
- Column headers show data type icon (continuous, nominal, ordinal) and any column properties (spec limits, control limits).
- Sort by any column. Filter by phase, subgroup, or custom expression.

### Column Properties

Following JMP's model, columns carry metadata that affects charting:

| Property | Purpose | UI Location |
|----------|---------|-------------|
| Spec Limits (USL, LSL, Target) | Capability analysis, spec limit lines on chart | Column header context menu → "Set Spec Limits" |
| Control Limits (UCL, CL, LCL) | Override calculated limits with known values | Column header context menu → "Set Control Limits" |
| Sigma | Override calculated sigma | Column header context menu → "Set Sigma" |
| Modeling Type | Continuous, Nominal, Ordinal — affects chart type auto-detection | Column header icon + context menu |

---

## Variable Configuration (Drag-and-Drop Zones)

### Interactive Workspace Zones

The Control Panel's **Variables** section implements JMP's zone-based variable assignment:

```
┌─────────────────────┐
│ VARIABLES           │
│                     │
│  Y (Process)        │
│  ┌─────────────────┐│
│  │ Thickness    [×] ││
│  └─────────────────┘│
│                     │
│  Subgroup           │
│  ┌─────────────────┐│
│  │ Hour         [×] ││
│  └─────────────────┘│
│                     │
│  Phase              │
│  ┌─────────────────┐│
│  │ Cavity       [×] ││
│  └─────────────────┘│
│                     │
│  Label              │
│  ┌─────────────────┐│
│  │ Lot ID       [×] ││
│  └─────────────────┘│
│                     │
│  Part (Short Run)   │
│  ┌─────────────────┐│
│  │ — drag here —   ││
│  └─────────────────┘│
│                     │
│  By                 │
│  ┌─────────────────┐│
│  │ — drag here —   ││
│  └─────────────────┘│
│                     │
│  n Trials (Attr.)   │
│  ┌─────────────────┐│
│  │ — drag here —   ││
│  └─────────────────┘│
└─────────────────────┘
```

**Zone descriptions:**
- **Y (Process Variable):** The measurement column to chart. Required. Multiple Y variables → multiple chart stacks.
- **Subgroup:** Defines subgroups. When assigned, each chart point = summary statistic for subgroup. Multiple columns → nested subgroups.
- **Phase:** Separate control limits per phase. Dashed vertical boundaries on chart.
- **Label:** X-axis labels for individual measurements. Ignored if subgroup size > 1.
- **Part (Short Run only):** Product/part variable. Statistics calculated per product level.
- **By:** Produces a separate chart for each level of the By variable. Paginated or stacked view.
- **n Trials (Attribute only):** Lot size for attribute charts. Required for P and NP charts.

**Interaction:**
- Zones are drop targets. User drags column names from a **Column Picker** popover (activated by a "+" button or by clicking an empty zone).
- Assigned variable shows as a chip with the column name and a [×] remove button.
- Dropping a variable into a zone triggers immediate chart recalculation.
- Zones that don't apply to the current chart type are hidden (e.g., "Part" only visible in Short Run mode, "n Trials" only visible for Attribute charts).
- The Column Picker shows all available columns with data type icons and grays out columns incompatible with the selected zone.

---

## Statistic & Sigma Configuration

### Statistic Selector

The statistic plotted on each chart is configurable. Lives in the Control Panel **Config** section.

**Location chart statistics:**
| Statistic | Applicable Charts | Description |
|-----------|------------------|-------------|
| Average | XBar charts | Subgroup mean |
| Individual | IMR, Run, Levey-Jennings | Raw measurement value |
| Proportion | P, Laney P' | Fraction defective |
| Count | NP, C | Number defective/defects |
| Moving Range | MR charts | |xi - xi-1| |
| Centered | Short Run Difference | Value - product target |
| Standardized | Short Run Z | (Value - target) / sigma |

**Dispersion chart statistics:**
| Statistic | Applicable Charts | Description |
|-----------|------------------|-------------|
| Range | R charts | Subgroup max - min |
| Standard Deviation | S charts | Subgroup std dev |
| Moving Range | MR charts | |xi - xi-1| |

The statistic selector is a dropdown chip in the Config section. Changing the statistic may change the chart type (e.g., switching from Average to Individual changes XBar to IMR).

### Sigma Method Selector

Sigma (σ) estimation method affects control limit calculation. This is a critical configuration choice for SPC practitioners.

| Sigma Method | Description | When to Use |
|-------------|-------------|-------------|
| Range | σ = R̄ / d₂ | Default for XBar-R, subgroup size 2–8 |
| Standard Deviation | σ = S̄ / c₄ | Default for XBar-S, subgroup size ≥ 9 |
| Moving Range | σ = MR̄ / d₂ | Default for IMR charts |
| Median Moving Range | σ = median(MR) / d₄ | More robust to outliers than MR |
| Levey-Jennings | σ = overall standard deviation | Lab QC applications |
| Binomial | σ = √(p̄(1-p̄)/n) | P and NP charts |
| Poisson | σ = √(ū/n) | C and U charts |
| Binomial + MR adjustment | Laney adjustment for overdispersion | Laney P' charts |
| Poisson + MR adjustment | Laney adjustment for overdispersion | Laney U' charts |

**UI:** Dropdown chip labeled "SIGMA" in the Config section. Shows current method name. Click opens dropdown with all applicable methods for the current chart type. Incompatible methods are grayed out.

### K-Sigma Multiplier

Control limits are placed at K × σ from the center line. Default K = 3.

- Configurable via a compact numeric input in the Config section, labeled "K SIGMA".
- Valid range: 1.0 – 5.0 (with 3.0 as default).
- Changing K immediately recalculates UCL/LCL on the chart.

---

## Statistical Tests & Rules

### Nelson Rules (Full Set — 8 Rules)

All 8 Nelson rules must be implemented and independently toggleable:

| Rule | Name | Description | Default |
|------|------|-------------|---------|
| 1 | Beyond Limits | 1 point beyond 3σ (UCL or LCL) | ON |
| 2 | Zone A | 2 of 3 consecutive points in Zone A (same side) | ON |
| 3 | Zone B | 4 of 5 consecutive points in Zone B or beyond (same side) | ON |
| 4 | Same Side | 8 consecutive points on same side of center line | ON |
| 5 | Trend | 6 consecutive points increasing or decreasing | ON |
| 6 | Mixture | 8 consecutive points alternating up and down | OFF |
| 7 | Stratification | 15 consecutive points within Zone C (both sides) | OFF |
| 8 | Overcontrol | 8 consecutive points outside Zone C (both sides) | OFF |

### Westgard Rules (Lab QC — used with Levey-Jennings)

| Rule | Description | Action |
|------|-------------|--------|
| 1-2s | 1 point outside ±2σ | Warning — inspect |
| 1-3s | 1 point outside ±3σ | Reject run |
| 2-2s | 2 consecutive points outside ±2σ (same side) | Reject run |
| R-4s | Range of 2 consecutive points > 4σ | Reject run (random error) |
| 4-1s | 4 consecutive points outside ±1σ (same side) | Reject run (systematic) |
| 10-x | 10 consecutive points on same side of mean | Reject run (systematic) |

### Test Configuration UI

```
┌─────────────────────┐
│ TESTS               │
│                     │
│ Nelson Rules        │
│  [✓] 1 Beyond 3σ   │
│  [✓] 2 Zone A      │
│  [✓] 3 Zone B      │
│  [✓] 4 Same Side   │
│  [✓] 5 Trend       │
│  [ ] 6 Mixture     │
│  [ ] 7 Stratif.    │
│  [ ] 8 Overctrl    │
│                     │
│ Westgard Rules      │
│  [ ] 1-2s warning  │
│  [ ] 1-3s reject   │
│  [ ] 2-2s reject   │
│  [ ] R-4s reject   │
│  [ ] 4-1s reject   │
│  [ ] 10-x reject   │
│                     │
│ [Customize...]      │
└─────────────────────┘
```

- Lives in the Control Panel **Config** section, expandable.
- Each rule is a checkbox with abbreviated name. Hover shows full description.
- **"Customize..."** opens an inline editor where the user can modify rule parameters (e.g., change Rule 4 from "8 consecutive" to "9 consecutive"). Custom parameter values are shown in parentheses.
- Failing tests are indicated on chart points with colored rings:
  - Rule violation by a single test: `--red` ring
  - Rule violation by multiple tests: `--red` filled ring with count badge
  - Warning-level (Westgard 1-2s): `--amber` ring
- The Evidence Rail shows the specific rule(s) that fired for the selected point.

### Alarm Report

A summary of all out-of-control signals across the current chart:

```
┌──────────────────────────────────────────────────────┐
│ ALARM REPORT                                         │
├───────┬────────────────┬──────────┬──────────────────┤
│ Chart │ Samples OOC    │ Alarm %  │ Failing Tests    │
├───────┼────────────────┼──────────┼──────────────────┤
│ XBar  │ 4 / 28         │ 14.3%   │ R1(2), R4(1)...  │
│ R     │ 1 / 28         │ 3.6%    │ R1(1)            │
└───────┴────────────────┴──────────┴──────────────────┘
```

- Accessible from the toolbar "Alarms" button or the Evidence Rail.
- Updates live as tests are enabled/disabled.
- Clicking a row navigates to the first OOC point on that chart.

---

## Specification Limits & Control Limits Management

### Spec Limits Dialog

Specification limits (USL, LSL, Target) come from engineering requirements, not from the data. They are used for capability analysis.

```
┌──────────────────────────────────────┐
│ SPECIFICATION LIMITS                 │
│                                      │
│  Upper Spec (USL):  [  8.200  ]      │
│  Target:            [  8.080  ]      │
│  Lower Spec (LSL):  [  7.960  ]      │
│                                      │
│  Source: ○ Manual  ○ From Data       │
│                                      │
│  [Cancel]  [Apply]  [Save to Data]   │
└──────────────────────────────────────┘
```

- Inline editor (not full modal), anchored to the "Spec Limits" chip in the Control Panel.
- Values in IBM Plex Mono, right-aligned.
- "From Data" loads from column property if available.
- "Save to Data" persists spec limits as a column property on the Y variable.
- When spec limits are set, they appear on the chart as dashed purple lines and the capability report becomes available.

### Control Limits Management

Control limits can be calculated from data (default) or specified manually (for monitoring against known historical limits).

| Action | Purpose | UI |
|--------|---------|-----|
| Calculate from data | Default behavior — limits from current data | Automatic |
| Set Control Limits | Override with manual UCL, CL, LCL | Inline editor via "Limits" chip |
| Get Control Limits | Load stored limits from data column property | Button in Limits editor |
| Save Control Limits | Persist calculated limits to column property or new table | Button in Limits editor |
| Save in Column | Store as column property on Y variable | Save dropdown option |
| Save in New Table | Export to a new data table (limits + sample size + sigma) | Save dropdown option |

When manual limits are active, the chip shows "LIMITS: MANUAL" with a warning indicator. Changing chart type or data clears manual limits (with confirmation).

---

## Capability Analysis & Reporting

### Process Capability Report

Available when spec limits are set on a Shewhart Variables chart. Shows as an expandable section below the chart (not in a separate screen).

```
┌──────────────────────────────────────────────────────┐
│ PROCESS CAPABILITY REPORT                    [▼ Hide]│
├──────────────────────────────────────────────────────┤
│                                                      │
│  INDICES                                             │
│  ┌────────┬────────┬────────┬────────┐               │
│  │  Cp    │  Cpk   │  Pp    │  Ppk   │               │
│  │  1.42  │  1.18  │  1.38  │  1.12  │               │
│  └────────┴────────┴────────┴────────┘               │
│                                                      │
│  DETAILS                                             │
│  Overall sigma:         0.0245                       │
│  Within sigma:          0.0238                       │
│  Stability index:       1.029                        │
│  Sample size:           150                          │
│  Number of subgroups:   30                           │
│  Sample mean:           8.078                        │
│                                                      │
│  SPEC LIMITS                                         │
│  USL: 8.200   Target: 8.080   LSL: 7.960            │
│                                                      │
│  PPM (Expected)                                      │
│  Below LSL:     1,240   (within: 890)                │
│  Above USL:       580   (within: 420)                │
│  Total:         1,820   (within: 1,310)              │
│                                                      │
└──────────────────────────────────────────────────────┘
```

- Indices displayed in `data-large` typography (14px IBM Plex Mono, 700 weight).
- Color-coded: Cpk ≥ 1.33 → `--green`, 1.0–1.33 → `--amber`, < 1.0 → `--red`.
- When phases exist, a separate capability section per phase with a comparison row.
- The stability index (overall σ / within σ) indicates whether the process has shifted over time. Values near 1.0 = stable; > 1.5 = unstable (highlighted `--amber`).

### Sigma Report

Shows sigma estimation details. Available for Shewhart Variables charts.

| Field | Description |
|-------|-------------|
| Overall sigma | Standard deviation of all data |
| Within sigma | Estimated from subgroup ranges or moving ranges |
| Between sigma | (Three Way only) Between-subgroup variation |
| Between-and-within sigma | (Three Way only) Combined estimate |
| Stability index | Overall / Within ratio |
| Sample size | Total observations |
| Number of subgroups | Count of subgroups |
| Sample mean | Overall mean of the charted statistic |

---

## CUSUM Platform Design

CUSUM (Cumulative Sum) charts detect small sustained shifts that Shewhart charts miss. This is a **dedicated view**, not a chart type within the main workspace.

### CUSUM Layout

```
┌─────────────────────────────────────────────────────┐
│ [Nav] │ CUSUM Control Chart                          │
│       │                                              │
│       │  ┌─────────────┬────────────────────────┐    │
│       │  │ Parameters  │                        │    │
│       │  │             │   CUSUM Chart           │    │
│       │  │ Target: [v] │   (C+ and C- plotted)  │    │
│       │  │ Sigma:  [v] │                        │    │
│       │  │ h:      [v] │   Decision limits      │    │
│       │  │ k:      [v] │   Shift lines          │    │
│       │  │ Head:   [v] │                        │    │
│       │  │             │                        │    │
│       │  │ [✓] Upper   ├────────────────────────┤    │
│       │  │ [✓] Lower   │   ARL Report / Profiler│    │
│       │  │             │                        │    │
│       │  │ [Data Units]│                        │    │
│       │  └─────────────┴────────────────────────┘    │
│       │                                              │
│       │  Evidence Rail (shift narrative)              │
└─────────────────────────────────────────────────────┘
```

- **Parameter Control Panel** (left): editable fields for Target, Sigma, h (or H in data units), k (or K in data units), Head Start. All update the chart live.
- **CUSUM Chart**: Shows C+ (upper cumulative sum) and C- (lower cumulative sum) as lines. Decision limits as horizontal dashed red lines. Shift detection lines as vertical purple lines at shift start.
- **ARL Profiler**: Interactive graph showing Average Run Length vs. shift size. Updates as h/k parameters change. Helps user understand chart sensitivity.
- **Evidence Rail** adapts to show shift narrative: when and where shifts were detected, cumulative sum values at shift points, recommended actions.
- Toggle between standard deviation units and data units via checkbox.
- "Tune Chart" mode: user specifies acceptable range for Y, system computes optimal k parameter.

---

## EWMA Platform Design

EWMA (Exponentially Weighted Moving Average) charts detect small shifts with tunable sensitivity via the Lambda parameter.

### EWMA Layout

```
┌─────────────────────────────────────────────────────┐
│ [Nav] │ EWMA Control Chart                           │
│       │                                              │
│       │  ┌─────────────┬────────────────────────┐    │
│       │  │ Parameters  │                        │    │
│       │  │             │   EWMA Chart            │    │
│       │  │ Target: [v] │   (weighted avg line)  │    │
│       │  │ Sigma:  [v] │   Decision limits      │    │
│       │  │ Lambda: [v] │   Forecast point (●)   │    │
│       │  │             │   Shift lines           │    │
│       │  │ [✓] Center  ├────────────────────────┤    │
│       │  │     Data    │   X Chart (Shewhart)   │    │
│       │  │             │   (raw data companion) │    │
│       │  │ [Constant   ├────────────────────────┤    │
│       │  │  Limits]    │   Residuals Chart      │    │
│       │  │             │   (optional)            │    │
│       │  └─────────────┴────────────────────────┘    │
│       │                                              │
│       │  Evidence Rail                               │
└─────────────────────────────────────────────────────┘
```

- Three stacked charts: EWMA chart (primary), X chart (Shewhart companion), Residuals chart (optional).
- Lambda = 0.2 default. Lower Lambda = more smoothing = more sensitive to small shifts. Higher Lambda = less smoothing = more responsive to recent data.
- Forecast point shown as a blue hollow circle at the end of the EWMA line — the predicted next value.
- Constant Limits toggle: when ON, uses asymptotic limit formula (constant width). When OFF, limits narrow as more data accumulates (exact formula).
- ARL Report available (same format as CUSUM).

---

## Multivariate Control Charts Design

For monitoring multiple correlated process variables simultaneously.

### T² Chart

- Hotelling's T² statistic plotted against chi-squared control limit.
- When T² exceeds the limit, a **decomposition panel** shows which variable(s) contributed most to the signal.
- Companion chart: individual variable contributions as a stacked bar or heatmap row.

### MEWMA Chart

- Multivariate EWMA — same Lambda-based weighting applied to a vector of variables.
- Layout similar to EWMA platform but with multi-variable parameter configuration.

---

## Alarm & Notification System

### Real-Time Alarm Behavior

When new data arrives and OOC conditions are detected:

1. **Chart marker** — red ring appears on the OOC point immediately.
2. **Evidence Rail update** — Signal section updates with new alarm narrative.
3. **Notification toast** — brief toast at top of workspace: "OOC detected: Rule 1 at sample 47" with severity badge. Auto-dismisses in 5 seconds unless clicked.
4. **Nav sidebar badge** — Workspace icon shows a red dot when unacknowledged alarms exist.
5. **Alarm log** — persistent, queryable log of all alarms with timestamps, rules fired, acknowledgment status.

### Alarm Scripts (Advanced)

User-defined scripts that execute when OOC is detected:
- Write to file, write to log, send notification (email/webhook).
- Script receives context variables: column name, test that failed, sample number, phase.
- Configured per chart via the toolbar "Alarm Script" option.

---

## Save, Export & Reproducibility

### Save Operations

| Operation | What It Saves | Format |
|-----------|--------------|--------|
| Save Control Limits (in Column) | UCL, CL, LCL as column property | Column metadata |
| Save Control Limits (in New Table) | Sigma, mean, LCL, CL, UCL, sample size, N subgroups per chart | Data table |
| Save Spec Limits | USL, Target, LSL | Column property or data table |
| Save Summaries | Per-subgroup statistics: label, size, point value, chart type, center line, limits, test results | Data table |
| Save Product Statistics (Short Run) | Target and sigma per product/part level | Data table |
| Save Script | Reproducible configuration that recreates the analysis | JSON or script format |

### Export Operations

| Export | Format | Purpose |
|--------|--------|---------|
| Chart image | PNG, SVG | For reports, presentations |
| Chart + report | PDF | Audit-ready document with chart, capability report, alarm summary |
| Data table | CSV, Excel | Export processed data with exclusions and computed columns |
| Full analysis | JSON bundle | Complete state: data, configuration, limits, exclusions, findings — for reproducibility |
| Finding | PDF with citations | Evidence package for quality review board |

### Reproducibility

Every analysis state should be serializable and reproducible:
- **Analysis script**: A JSON/config object that captures: data source, column roles, chart type, statistic, sigma method, enabled tests, spec limits, manual limits, exclusions, phase definition. Loading this script recreates the exact chart.
- **Audit trail**: Every state change (exclusion, limit override, phase change, method change) is logged with timestamp, user, and reason.

---

## Keyboard Shortcuts

| Shortcut | Action | Context |
|----------|--------|---------|
| `← →` | Navigate between points | Chart focused |
| `↑ ↓` | Navigate between charts (paired) | Chart focused |
| `Enter` | Select/inspect point | Chart focused |
| `Delete` | Exclude selected point | Chart focused |
| `Shift+Delete` | Include (un-exclude) selected point | Chart focused |
| `Shift+F10` | Open context menu for selected point | Chart focused |
| `Ctrl+Z` | Undo last action | Global |
| `Ctrl+Shift+Z` | Redo | Global |
| `Ctrl+E` | Toggle evidence rail | Workspace |
| `Ctrl+P` | Toggle control panel | Workspace |
| `F` | Toggle fullscreen chart | Workspace |
| `1-5` | Navigate to screen (WK, DP, ML, FD, RP) | Global |
| `Ctrl+I` | Open data import | Global |
| `Ctrl+S` | Save current analysis | Global |

---

## Empty, Error & Loading States

Every surface must specify what users see when there's no data, when something fails, and when something is loading.

### Workspace

| State | What User Sees |
|-------|---------------|
| **No data imported** | Chart canvas shows a centered prompt: "Import process data to begin" with a file-drop zone outline and `Ctrl+I` hint. Recipe rail shows empty zones with "drag column here" placeholders. Evidence rail shows "No signal — import data to start analysis." |
| **Data imported, no Y assigned** | Chart canvas shows the interactive workspace with labeled drop zones (Y, Subgroup, Phase, Label). Recipe rail zones are empty with subtle pulse animation on Y zone. |
| **Chart calculating** | Skeleton lines in chart area (gray placeholder for series, limits, zones). Readout bar shows "Calculating..." in `--t-3`. Duration target: < 200ms for <10k points. |
| **Chart error** | Chart canvas shows error message with technical detail in mono: "Calculation failed: insufficient data for subgroup size 5 (need ≥2 subgroups)". Red left-border on error block. Suggested fix in body text. |
| **No OOC signals** | Evidence rail Signal section shows: "Process in control — no signals detected" with `--green` badge. Still shows evidence ledger (limits, transform steps, etc.). |

### Data Prep

| State | What User Sees |
|-------|---------------|
| **No transforms defined** | "No transformation pipeline configured. Raw data flows directly to chart." with "Add Transform" button. |
| **Transform failed** | Step card shows `--red` left border, failure reason in mono text, "Recover" and "Disable" buttons. Pipeline status shows "PARTIAL — 1 step failed". |

### Findings

| State | What User Sees |
|-------|---------------|
| **No findings** | "No findings recorded. Create findings from the workspace when signals are detected." Warm but concise — no illustration, no emoji. |

### Reports

| State | What User Sees |
|-------|---------------|
| **No report draft** | "No report draft. Generate a report after recording findings." with disabled "Generate" button. |
| **Export blocked** | "Export blocked: 2 unresolved citations. Resolve before export." with link to each unresolved citation. |

---

## Accessibility

### Keyboard Navigation
- All interactive elements reachable via Tab.
- Chart points navigable via arrow keys.
- Context menus open via Shift+F10.
- Focus indicators: 2px `--blue-bright` outline, -2px offset (visible against both light and dark surfaces).

### Screen Readers
- Chart provides ARIA live region that announces: selected point value, phase, rule violations.
- Control panel sections use `role="group"` with `aria-label` for each section.
- Toggle states announced: "Zones: on", "Confidence bands: off".
- OOC alerts announced as `role="alert"`.

### Color & Contrast
- All text meets WCAG 2.1 AA (4.5:1 for body text, 3:1 for large text).
- Chart colors are distinguishable in deuteranopia (red-green): OOC points use shape (enlarged) + color. Zone fills use opacity difference, not hue alone.
- Rule violation markers use ring thickness (2px) in addition to color.
- Never rely on color alone to communicate state — always pair with shape, text, or position.

### Touch Targets
- Minimum 44×44px for all interactive elements (buttons, toggles, chips).
- Chart points have a 20px hit area around the visual 4px circle.
- Context menu items: 36px minimum height.

---

## SPC Feature Checklist (Complete — Design Must Support)

### Core Chart Features
- [ ] 1σ/2σ/3σ zone shading on all Shewhart charts
- [ ] Capability indices (Cpk, Ppk, Cp, Pp) visible near chart
- [ ] Full Process Capability Report (below chart, expandable)
- [ ] Sigma Report (overall, within, stability index)
- [ ] Rule violation markers directly on chart points
- [ ] All 8 Nelson rules (independently toggleable)
- [ ] Westgard rules (for Levey-Jennings charts)
- [ ] Custom test designer (modify rule parameters)
- [ ] Histogram sidebar docked to Y-axis
- [ ] Phase-specific limit recalculation with visual before/after
- [ ] Method comparison overlay (challenger vs. primary)
- [ ] Exclusion lineage — every excluded point traceable to a reason
- [ ] Confidence bands for modern/robust methods
- [ ] Box-and-whisker per subgroup (optional layer)
- [ ] Run-chart mode (no limits, just sequence)
- [ ] Alarm Report (OOC summary per chart)

### Chart Types — Shewhart Variables
- [ ] XBar-R (subgroup mean + range)
- [ ] XBar-S (subgroup mean + std dev)
- [ ] IMR (individual + moving range)
- [ ] Run Chart (no limits)
- [ ] Levey-Jennings (long-term sigma)
- [ ] Presummarize (repeated measures)
- [ ] Three Way (between + within)

### Chart Types — Shewhart Attributes
- [ ] P chart (proportion defective)
- [ ] NP chart (count defective)
- [ ] C chart (count of defects)
- [ ] U chart (defects per unit)
- [ ] Laney P' (overdispersion-adjusted proportion)
- [ ] Laney U' (overdispersion-adjusted rate)

### Chart Types — Short Run
- [ ] Short Run Difference (centered)
- [ ] Short Run Z (standardized)
- [ ] Short Run MR (centered and standardized)
- [ ] Short Run XBar variants

### Chart Types — Rare Event
- [ ] G chart (counts between events)
- [ ] T chart (time between events)

### Chart Types — Advanced Platforms
- [ ] CUSUM Tabular (with ARL profiler)
- [ ] CUSUM V-Mask
- [ ] EWMA (with residuals, forecast, ARL)
- [ ] Multivariate T² (Hotelling)
- [ ] MEWMA

### Data Management
- [ ] CSV import with column mapping
- [ ] Excel import
- [ ] Data table viewer (read-only with select/exclude)
- [ ] Column properties (spec limits, control limits, sigma, modeling type)
- [ ] Drag-and-drop variable zone assignment
- [ ] Multiple Y variables (multi-chart workspace)
- [ ] By-group analysis (separate chart per group level)
- [ ] Column Switcher (swap Y variable without rebuilding)
- [ ] Missing value handling (connect through missing, include missing categories)
- [ ] Sort by row order

### Configuration
- [ ] Chart type auto-detection from data characteristics
- [ ] Chart type manual override selector
- [ ] Statistic selector (average, individual, proportion, count, etc.)
- [ ] Sigma method selector (range, std dev, moving range, median MR, etc.)
- [ ] K-sigma multiplier (default 3, configurable 1-5)
- [ ] Spec limits entry/edit/save/load
- [ ] Control limits manual override/save/load
- [ ] Paired location + dispersion chart layout
- [ ] Dispersion chart type selector (R vs S)
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
