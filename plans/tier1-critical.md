# Tier 1 — Critical Gaps (Must-Have for Credibility)

Without these, the product cannot be taken seriously by JMP/Minitab users. These are the foundations that everything else builds on.

**Priority:** Highest — implement first
**Estimated effort:** ~2-3 weeks CC+gstack

---

## 1.1 Real Data Import (CSV)

**Why critical:** Everything downstream (charts, tests, capability) depends on real data. Mock data is a prototype; real data is a product.

### Tasks
- [ ] Build CSV parser (handle delimiters, headers, missing values, quoted fields)
- [ ] Build import modal UI per DESIGN.md spec (file drop zone, preview table, column mapping dropdowns)
- [ ] Auto-detect column types (continuous, nominal, ordinal) from data values
- [ ] Auto-suggest column role assignments (Y, Subgroup, Phase, Label) from column names
- [ ] Show data summary after import: row count, column count, detected subgroup size, recommended chart type
- [ ] Store imported data in state (replace mock data pathway)
- [ ] Log import event in audit trail
- [ ] Handle edge cases: empty file, single column, no header row, malformed CSV, very large files (>100k rows)
- [ ] Build data table viewer (read-only) in Data Prep screen: row display, column headers with type icons, click-to-highlight on chart

### Acceptance Criteria
- User can drop a CSV file and see a chart within 3 clicks
- Column mapping is auto-suggested but manually overridable
- Data table viewer shows all imported rows with sort/filter
- Imported data persists for the session (no backend needed yet)

### Dependencies
None — this is the foundation.

### DESIGN.md Reference
- "Data Import & Management" section
- "Data Import Flow" subsection (CSV Import UX wireframe)
- "Data Table Viewer" subsection

---

## 1.2 IMR Chart (Individual & Moving Range)

**Why critical:** IMR is the most common chart type in semiconductor fabs. When subgroup size = 1 (which is the majority of inline metrology data), IMR is what engineers expect. Not having it means the product can't handle the most common use case.

### Tasks
- [ ] Implement Individual Measurement chart (location): plot raw values, calculate CL = x̄, UCL/LCL = x̄ ± 3σ̂
- [ ] Implement Moving Range chart (dispersion): plot |xi - xi-1|, calculate CL = MR̄, UCL = D4 × MR̄
- [ ] Sigma estimation: σ̂ = MR̄ / d2 (where d2 = 1.128 for n=2)
- [ ] Support Median Moving Range sigma method as alternative: σ̂ = median(MR) / d4
- [ ] Render as paired charts per DESIGN.md "Paired Chart Layout" spec (location 65% height, dispersion 35%)
- [ ] Shared X-axis between location and dispersion charts
- [ ] Zone shading on both charts
- [ ] Apply Nelson rules to both charts
- [ ] Phase-aware: separate limits per phase on both charts
- [ ] Connect the selected point state between both charts (click point on location → highlights corresponding MR on dispersion)

### Acceptance Criteria
- Import CSV with individual measurements → IMR chart auto-generates
- Both charts show with correct limits, zones, and rule violations
- Clicking a point on either chart updates the readout bar and highlights the corresponding point on the other chart

### Dependencies
- 1.1 (Real Data Import) — needs real data to chart

### DESIGN.md Reference
- "Chart Type Inventory" → Shewhart Variable Charts table
- "Paired Chart Layout" section
- "Chart Type Auto-Detection" section

---

## 1.3 Paired Location + Dispersion Chart Layout

**Why critical:** JMP always shows location above dispersion. A single chart without its dispersion companion looks incomplete to any trained SPC user.

### Tasks
- [ ] Refactor chart canvas from single SVG to a stacked two-SVG layout
- [ ] Location chart: 65% of chart card height, full zone shading, all limit lines
- [ ] Dispersion chart: 35% of chart card height, own limit lines (D3/D4 for R, B3/B4 for S)
- [ ] Shared X-axis: labels appear only on the bottom (dispersion) chart
- [ ] Synchronized zoom/pan (if implemented): both charts move together
- [ ] Synchronized point selection: click on either chart highlights the same subgroup on both
- [ ] Toggle to hide dispersion chart (via Control Panel "Show Dispersion Chart" toggle)
- [ ] Automatic pairing: XBar → R or S (based on sigma method), Individual → Moving Range
- [ ] Chart resizes proportionally when window resizes

### Acceptance Criteria
- XBar-R shows as two vertically stacked charts with shared X-axis
- IMR shows Individual above Moving Range
- Hiding dispersion chart gives location chart full height
- Point selection syncs between charts

### Dependencies
- Works with existing XBar-R data; fully functional with 1.2 (IMR)

### DESIGN.md Reference
- "Paired Chart Layout" section (ASCII wireframe)
- "Chart (THE HERO)" → "Histogram sidebar (future): plan for this in the layout"

---

## 1.4 Chart Type Auto-Detection & Selector

**Why critical:** Users expect to assign data and get the right chart. Making them manually choose between 20+ chart types is hostile UX for the 90% case.

### Tasks
- [ ] Implement auto-detection logic per DESIGN.md spec:
  - Continuous data, subgroup size = 1 → IMR
  - Continuous data, subgroup size 2–8 → XBar-R
  - Continuous data, subgroup size ≥ 9 → XBar-S
  - Attribute data (binomial context) → P chart
  - Attribute data (poisson context) → U chart
- [ ] Build chart type selector chip in Control Panel Variables section
- [ ] Show auto-detected type as default, allow manual override
- [ ] Dropdown shows all applicable types for current data; incompatible types grayed out with tooltip
- [ ] Changing chart type triggers full recalculation (new limits, new sigma, new statistic)
- [ ] Show confirmation when changing type would clear manual limits
- [ ] Dispersion chart type follows: XBar → R or S configurable, Individual → MR

### Acceptance Criteria
- Import data with subgroup size 1 → auto-selects IMR
- Import data with subgroup size 5 → auto-selects XBar-R
- User can override to XBar-S from the dropdown
- Incompatible types (e.g., P chart for continuous data) are visually disabled

### Dependencies
- 1.1 (Real Data Import) — auto-detection needs real data characteristics
- 1.2 (IMR) and existing XBar-R implementation

### DESIGN.md Reference
- "Chart Type Auto-Detection" section (decision tree)
- Variable Configuration → chart type selector chip

---

## 1.5 Complete Nelson Rules (All 8)

**Why critical:** Super SPC currently implements 3 of 8 Nelson rules. Trained statisticians know all 8. Shipping with 3 signals "toy product" — it's like a spell checker that only checks nouns.

### Tasks
- [ ] Audit existing rules: verify Rule 1 (beyond limits), Rule 4 (8 same side), Rule 5 (6 trending) are correct per standard definitions
- [ ] Implement Rule 2: 2 of 3 consecutive points in Zone A (same side)
- [ ] Implement Rule 3: 4 of 5 consecutive points in Zone B or beyond (same side)
- [ ] Implement Rule 6: 8 consecutive points alternating up and down (mixture)
- [ ] Implement Rule 7: 15 consecutive points within Zone C (both sides) — stratification
- [ ] Implement Rule 8: 8 consecutive points outside Zone C (both sides) — overcontrol
- [ ] Build test configuration UI per DESIGN.md spec: checkbox list in Control Panel Config section
- [ ] Rules 1-5 default ON, Rules 6-8 default OFF (match JMP defaults)
- [ ] Each rule independently toggleable — toggling recalculates violations immediately
- [ ] Rule violations on chart: colored ring per DESIGN.md (red for single rule, filled red + count for multiple)
- [ ] Evidence Rail: when a point is selected that has violations, show which rule(s) fired with explanation
- [ ] Alarm Report: summary table of OOC counts per chart, per rule

### Acceptance Criteria
- All 8 Nelson rules correctly detect their patterns
- UI shows checkboxes for each rule, default states match JMP
- Toggling a rule immediately updates chart markers
- Evidence Rail explains which rules fired for the selected point
- Alarm Report shows correct OOC counts and percentages

### Dependencies
- Existing rule detection infrastructure in state.js

### DESIGN.md Reference
- "Statistical Tests & Rules" section (Nelson Rules table)
- "Test Configuration UI" section (wireframe)
- "Alarm Report" section

---

## Implementation Order

```
1.1 Data Import  ──────┐
                        ├──→ 1.4 Auto-Detection ──→ DONE
1.2 IMR Chart    ──────┤
                        │
1.3 Paired Layout ─────┘

1.5 Nelson Rules ─────────────────────────────────→ DONE
(can be parallelized with 1.1-1.4)
```

- **1.5 (Nelson Rules)** is independent — can be built in parallel with everything else.
- **1.1 (Data Import)** unblocks 1.4 (Auto-Detection) and makes 1.2/1.3 testable with real data.
- **1.2 (IMR)** and **1.3 (Paired Layout)** can be built together since IMR requires the paired layout.
- **1.4 (Auto-Detection)** ties it all together — needs at least 2 chart types (XBar-R + IMR) to be meaningful.
