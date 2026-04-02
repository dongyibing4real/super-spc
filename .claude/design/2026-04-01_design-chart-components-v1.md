# Chart Components — Super SPC
> design — chart components — v1

## Chart (THE HERO)
The control chart is the single most important element in the product. Everything else serves it.

- **Rendering:** D3.js-based SVG with ResizeObserver for auto-sizing. Layered group structure with clip paths for plot area containment.
- **Zone shading is required.** Every professional SPC tool (JMP, Minitab, InfinityQS) shows 1σ/2σ/3σ zone fills. Zone C (inner) gets a subtle green tint, Zone B gets amber, Zone A gets red. Opacities use the **ambient tier** (0.025–0.05) — zones should be felt, not seen. Per-phase support: zone calculations use phase-specific limits when multiple phases exist.
- **Capability indices (Cpk, Ppk) must be visible** in the pane titlebar, inline with method name. Color-coded: green (≥1.33), amber (1.0-1.33), red (<1.0) via `capClass()` utility. Only appears when `capability` is computed.
- **Rule violation markers on points.** When a Nelson/Westgard rule fires, the triggering points are indicated by color (red for OOC, amber context in evidence rail). No concentric rings — color alone is the signal.
- **Grid lines stay soft** (`--chart-grid`, 0.5px). Grid supports reading, never dominates. Togglable via context menu.
- **Limit labels pin to chart edge** with their numeric value: `UCL 8.145`, `CL 8.078`, `LCL 8.011`. Rendered as pill-shaped edge labels outside the clip path.
- **Phase boundaries** (JMP-style): a horizontal header band sits above the plot area with phase labels in each strip. Uniform subtle gray background (0.06 opacity). Vertical gold divider lines (0.75px, opacity 0.30) extend from the header through the chart plot area. Sans-serif font, 10px, weight 500. Header band height scales with `vScale` (18px at full height). `computeLayout()` adds extra top padding when phases exist. Per-phase control limits render as independent line segments that attach to phase boundary lines (full phase width, not point-to-point). **Phase variable label:** A right-aligned label showing the phase column name (e.g. "Cavity", "Hour") renders in the left y-axis gutter at the header band's vertical center — tells the user this is a phase header and which variable defines the phases. Styled as IBM Plex Sans 600-weight, `rgba(147,153,163,0.55)`, font size adaptive to header height (7-9px). When no named variable is set, falls back to "Phase".
- **Phase selection:** Click a phase header label to select it (toggle). Selected phase gets blue highlight background and bold label. The selected phase's UCL/CL/LCL values appear as edge labels on the right y-axis. When no phase is selected in a multi-phase chart, no edge labels are shown (avoids ambiguity). Click empty space outside the phase to deselect. Clicking within the selected phase's plot area does NOT deselect it (the tinted fill rect absorbs clicks via stopPropagation). **Plot area fill:** the selected phase's plot area gets a subtle blue tint (`rgba(45,114,210,0.04)`) rendered in the clipped layer, reinforcing which phase is active. **Evidence rail integration:** the evidence rail shows a Phase tier (between Point and Chart tiers) using the product's `signal-hero` card pattern with blue left accent. Content: phase name heading, OOC status chip (red if violations, green if in control), point count badge, color-coded Control Limits section (UCL/LCL in red, CL in green with subtle tinted row backgrounds), and Spread section showing range width and 1σ value. Phase position shown as "N of M" badge in tier header.
- **Y-axis scale** adapts to the highest and lowest UCL/LCL across all phases when multiple phases exist, ensuring all limit lines are visible.
- **Selected point** stays at full opacity while all others dim to 0.35 (JMP convention). Click empty chart space to deselect. ARIA labels include: label, value, unit, rule violations list.
- **Marquee (rubber-band) multi-point selection** (JMP-style): Click-hold-drag in the plot area draws a dashed blue selection rectangle (`rgba(45,114,210,0.08)` fill, `rgba(45,114,210,0.50)` stroke, `4 3` dash). On mouseup, all points inside the rectangle are selected at full opacity, others dim to 0.35. Minimum 5px drag threshold prevents accidental activation on simple clicks. **Evidence rail integration:** Selection tier (between Point and Phase tiers) shows teal-accent hero card with point count, OOC status chip, and Summary Statistics section (Mean, Std Dev, Min, Max, Range). Click empty space or single-click a point to clear multi-selection. Single-point click on a point-hit target does not trigger marquee.
- **Excluded points** are dimmed (25% opacity) with an X-mark overlay in amber (opacity 0.30, stroke-width 0.75px). Togglable via `excludedMarkers` context menu option.
- **Histogram sidebar (planned):** A vertical histogram docked to the Y-axis showing data distribution.

## Point Styling (Industry-Grade — JMP/Minitab Standard)

**Design principle:** Color is the signal, not size. Points are uniform. Selection is communicated through opacity contrast (JMP convention).

| State | Visual | Color | Radius |
|-------|--------|-------|--------|
| Normal | Filled circle, 0.75px white stroke | `--blue` (#2D72D2) | r=3.5 (density-scaled, min 2.5) |
| Out-of-control (OOC) | Same size, red fill | `--red` (#CD4246) | r=3.5 (same as normal) |
| Selected | Slightly larger, full opacity | `--blue` | r=4.0 (all others dim to 0.35) |
| Excluded | 25% opacity + X-mark | Primary color dimmed, amber X overlay | r=3.5 |
| Challenger | Filled circle | `--teal-bright` (#32A467), opacity 0.7 | r=3.5 |

**Selection model** (JMP-style): Single-click selects one point at full opacity, all others dim to 0.35. Click-hold-drag draws a marquee rectangle to select multiple points (all at full opacity, others dim). Multi-selection shows aggregate stats (mean, std dev, min, max, range) in the evidence rail Selection tier. No crosshair arms, no halos — opacity differentiation is the signal.

**Rule violations:** Indicated by point color alone (red for OOC, amber tint via evidence rail). No concentric rings — ring-on-ring is visual clutter.

Hit target: invisible 8-10px radius circle expands click area for accessibility.

## Chart Design Tokens

All chart visual elements use a principled token system instead of ad-hoc values.

### Opacity Scale (5 levels)
| Token | Value | Usage |
|-------|-------|-------|
| `--chart-o-bg` | 0.03 | Zone fills, phase bands (ambient tier) |
| `--chart-o-subtle` | 0.12 | Sigma reference lines, event annotations |
| `--chart-o-muted` | 0.30 | Structure: UCL/LCL, CL, phases, specs, excluded marks |
| `--chart-o-medium` | 0.55 | Selection crosshair, challenger overlay |
| `--chart-o-full` | 1.0 | Primary data line, points |

### Stroke Weight Scale (4 levels)
| Token | Value | Usage |
|-------|-------|-------|
| `--chart-w-hair` | 0.5px | Grid, sigma reference lines |
| `--chart-w-fine` | 0.75px | UCL/LCL, specs, phases, crosshair, point stroke |
| `--chart-w-mid` | 1.0px | CL only (structural anchor) |
| `--chart-w-data` | 2px | Primary series line |

### 3-Tier Visual Hierarchy
- **TIER 1 — DATA** (dominant): Primary line 1.5px, points at full opacity. The hero.
- **TIER 2 — STRUCTURE** (subordinate): CL at 0.75 opacity/1.5px (structural anchor), UCL/LCL at 0.65 opacity/1.0px, phases/specs at 0.30 opacity/0.75px. Readable but quiet.
- **TIER 3 — AMBIENT** (felt, not seen): Zones at 0.025–0.05, grid at 0.5px. Background texture.

## Line & Limit Weights

| Element | Stroke | Opacity | Dash | Token Tier | Notes |
|---------|--------|---------|------|------------|-------|
| Primary series | 2px | 1.0 | solid | DATA | Dominant visual element |
| Challenger series | 0.75px | 0.55 | solid | MEDIUM | Recedes via opacity, no dashes |
| UCL/LCL | 1.0px | 0.65 | solid | STRUCTURE | Reference geometry, clearly visible |
| CL (center) | 1.5px | 0.75 | solid | STRUCTURE (mid weight) | Structural anchor, most prominent limit |
| Spec limits (USL/LSL) | 0.75px | 0.30 | `3 4` | STRUCTURE | Subtle dashed reference |
| Sigma refs (±1σ, ±2σ) | 0.75px | 0.30 | solid | STRUCTURE | Visible reference lines |
| Phase boundary | 0.75px | 0.30 | solid | STRUCTURE | Gold vertical line |
| Event annotation | 0.75px | 0.12 | solid | AMBIENT | Purple vertical line |

## Zone Shading (Ambient Tier)

| Zone | Range | Color | Opacity | Notes |
|------|-------|-------|---------|-------|
| Zone A | 2σ–3σ | `rgba(205,66,70)` | 0.05 | Red is perceptually dominant, needs less |
| Zone B | 1σ–2σ | `rgba(200,118,25)` | 0.03 | Amber, middle |
| Zone C | 0–1σ | `rgba(35,133,81)` | 0.025 | Green, barely there |

**Per-phase zones:** When a chart has multiple phases, zone bands are rendered per-phase using each phase's own limits (JMP convention). Each phase segment gets its own set of 6 zone rectangles with independently computed sigma values. Single-phase charts use full-width global zones.

## SVG Rendering Layers (Z-order back to front)
1. `zones` — color-coded sigma bands (clipped)
2. `confidenceBand` — ±2σ shading (clipped)
3. `grid` — y-axis grid lines (clipped)
4. `gridLabels` — y-axis tick labels (unclipped)
5. `phases` — phase boundary lines (clipped)
6. `phaseLabels` — phase chips (unclipped)
7. `limits` — control/spec limit lines (clipped)
8. `limitLabels` — edge labels with pills (unclipped)
9. `challenger` — overlay series line (teal solid, 55% opacity)
10. `primary` — main data series line (blue solid, 1.5px)
11. `projection` — forecast cone (clipped)
12. `events` — event annotation lines + chips
13. `points` — data point circles
14. `projectionUi` — forecast prompt/shell UI
15. `xAxis` — x-axis baseline + labels
16. `selection` — (reserved, no longer used — selection via point opacity)
17. `marquee` — rubber-band selection rectangle (unclipped)
18. `forecastHandle` — (reserved)

## Chart Toggles (via context menu)
| Toggle | Default | Effect |
|--------|---------|--------|
| `specLimits` | on | Zone shading + limit lines (UCL/CL/LCL) |
| `grid` | on | Y-axis grid lines and labels |
| `phaseTags` | on | Phase boundary lines and chips |
| `events` | on | Event annotation lines and chips |
| `excludedMarkers` | on | Exclusion X-marks on points |
| `confidenceBand` | off | ±2σ confidence band shading |

Toggles are stored in global `chartToggles` state and affect all visible charts uniformly.

## Multi-Chart Layout
- **Row-grid model:** charts arranged in a 2D grid (rows × columns). Each cell contains one chart.
- All charts in a row share equal width; all rows share equal height via flexible column/row weights.
- **CSS flexbox rendering** with percentage-based widths.
- **Grid dividers** between cells for manual resizing (drag handles). Dividers turn blue on hover/active.
- **Drag-drop reorder:** drag a chart's titlebar to rearrange. Ghost preview overlay shows placement.
- **"+Add Chart"** auto-places: fills first available cell, overflows to new row.
- Every chart is independent — no linked axes, no shared interaction.
- Min pane: 250×180px; max per row/column computed from viewport.

## Chart Pane Titlebar
- **Drag handle icon** (grip) + method badge + metric label
- **Cpk/Ppk** capability indices (when available) as colored pills in monospace
- **Table toggle button** (☰) — shows/hides inline data table
- **Close button** (×) — red hover state
- **Method dot** — small colored circle matching the pane's accent color

## Chart Pane Focus
- **Unfocused:** 2px left accent stripe in chart's own accent color (`--pane-accent` via `data-accent` attribute), titlebar at 0.7 opacity
- **Focused:** L-shaped accent — 2px top + left border in chart's own accent color. Titlebar at full opacity with `--chart-surface` background. Header flash animation on focus change.
- **No background tint on focus** — chart canvas stays `--chart-bg` always. Color-shifting the data visualization surface is not acceptable for a precision instrument.
- **Identity preserved:** focused pane keeps its per-chart accent color (from the 8-accent cycle), never overrides to blue. If chart 3 is amber, it stays amber when focused.
- **No layout shift:** border widths stay at 2px in both states; only color changes. Transition: `border-color 150ms var(--ease)`.

## Adaptive Chart Layout (Height-Aware Padding)

Chart padding, font sizes, and axis titles scale automatically based on available pane height. The system ensures the plot area always gets at least 60% of vertical space.

**Scaling factors:**
- `vScale = clamp(0.4, height / 300, 1.0)` — vertical padding compression
- `hScale = clamp(0.5, width / 400, 1.0)` — horizontal padding compression
- Total vertical padding capped at 40% of height

**Adaptive behaviors by pane size:**

| SVG Height | Plot Area | Axis Titles | Top Pad | Bottom Pad |
|------------|-----------|-------------|---------|------------|
| 120px | ~82% | hidden | 6px | 16px |
| 150px | ~81% | hidden | 8px | 20px |
| 180px | ~74% | shown | 10px | 36px |
| 250px+ | ~75% | shown | 13px | 50px |
| 350px+ | ~78-85% | shown | 16px | 60px |

**Overflow model (single containment boundary):**
- SVG clip path → constrains data series to plot area
- SVG `overflow: visible` → axis labels/titles can extend beyond clip path
- `.chart-stage overflow: visible` → passes through to pane
- `.chart-pane overflow: hidden` → single final containment boundary

**SVG coordinate accuracy:** `syncSize()` measures the container's content box (excluding CSS padding) so SVG attribute dimensions match rendered pixel dimensions 1:1. No scaling mismatch.

## Forecast / Prediction System

Multi-algorithm prediction system overlaid on the chart canvas.

**Modes:** hidden → prompt → active → selected

**Algorithms (6):**
- Seasonal-harmonic
- Kalman state-space
- EWMA projection
- Linear trend
- Quadratic trend
- Provider-configurable

**Visual elements:**
- **Forecast cone** with confidence band — blue inside control limits, red beyond limits
- **Dual clip paths** for within/beyond limits color split (ghost zone rendering)
- **Polygon cone** with separate strokes/fills per region
- **Drift score** with OOC estimate
- **Configurable horizon** per chart
- **Prompt state animation:** ghost-glow pulse effect (opacity 0.45 → 0.85, 2.4s infinite)

**UI controls:**
- Dashed blue rectangle hit area to trigger forecast
- Cancel button (white circle with ×)
- Forecast shell with algorithm selector
- **Adaptive label:** Wide (>=60px): horizontal "Forecast". Medium (20-60px): vertically stacked characters, font auto-scaled to fit available height/width (7-12px range). Narrow (<20px): no label.

## Compare Strip (planned)
Below the chart, a horizontal strip of summary cards showing key analysis metrics at a glance.

- **Cards:** OOC points (count), Rules triggered (count), Method (name), Limits scope
- **Each card** is a `compare-card` with tone-based coloring (critical for OOC, neutral for method)
- **Status:** Not yet implemented.

## Lineage Strip (planned)
Below the compare strip, a secondary info bar showing data provenance.

- **Fields:** Data timestamp, Limits version, Transform count, Excluded count, Pipeline status
- **Status:** Not yet implemented.

## Event Annotations
- Vertical line from top to bottom of plot area
- Floating chip with annotation text
- Color: `--purple` (#8B5CF6), styled as `.event-chip`
- Read-only from data (not user-editable yet)

## Secondary Series Overlay
- Optional secondary series per chart (not a full multi-overlay system)
- Renders as solid teal line at 55% opacity, 0.75px stroke (medium tier — no dashes)
- Toggle: `data.toggles.overlay`
- Used for visual comparison between methods in the workspace
