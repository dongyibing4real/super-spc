# Tier 3 — Competitive Parity

These features bring Super SPC to feature parity with JMP's core Control Chart Builder. After Tier 1 (credibility) and Tier 2 (usefulness), Tier 3 means users don't need to go back to JMP for common workflows.

**Priority:** Medium — implement after Tier 2
**Estimated effort:** ~3-4 weeks CC+gstack
**Depends on:** Tier 2 complete

---

## 3.1 EWMA Platform

**Why needed:** EWMA complements CUSUM for detecting small shifts. EWMA is often preferred because the Lambda parameter gives intuitive control over sensitivity, and the companion X chart shows raw data alongside the smoothed signal.

### Tasks
- [ ] Build EWMA as a dedicated view per DESIGN.md EWMA layout spec
- [ ] Implement EWMA algorithm: Zi = λxi + (1-λ)Zi-1, with Z0 = Target
- [ ] Three stacked charts: EWMA chart, X chart (Shewhart companion), Residuals chart (optional toggle)
- [ ] Parameters: Target, Sigma, Lambda (default 0.2), Center Data toggle
- [ ] Decision limits: ± L × σ√(λ/(2-λ))[1-(1-λ)^2i] — narrowing limits by default, constant limits as toggle
- [ ] Forecast point: blue hollow circle at end of EWMA line (one-step-ahead prediction)
- [ ] Shift detection lines: vertical purple lines at shift starts
- [ ] X chart: Shewhart Individual or XBar chart of raw/subgroup data (shared X-axis with EWMA)
- [ ] Residuals chart: EWMA residuals (xi - Zi-1) with their own control limits
- [ ] ARL Report: same format as CUSUM (table + graph of ARL vs shift size)
- [ ] "Restart EWMA After Empty Subgroup" option (reset or continue through gaps)
- [ ] Evidence Rail adaptation: shift narrative with Lambda sensitivity explanation

### Acceptance Criteria
- EWMA chart detects shifts earlier than companion X chart
- Changing Lambda visually changes smoothing and limit width
- Forecast point correctly predicts next EWMA value
- Constant vs exact limits toggle works correctly

### Dependencies
- 2.3 (CUSUM — shares ARL infrastructure and dedicated-view pattern)

### DESIGN.md Reference
- "EWMA Platform Design" section (layout wireframe)

---

## 3.2 Short Run Charts

**Why needed:** Multi-product assembly lines (common in semiconductor back-end) produce different products with different targets. Traditional charts across products are misleading. Short Run charts normalize by product target/sigma.

### Tasks
- [ ] Implement Short Run Difference chart: yi - Targeti (centered by product target)
- [ ] Implement Short Run Z chart: (yi - Targeti) / σi (standardized by target + sigma)
- [ ] Implement Short Run Moving Range on Centered: MR of centered values
- [ ] Implement Short Run Moving Range on Standardized: MR of standardized values
- [ ] Implement subgroup versions: Short Run XBar (centered), Short Run XBar (Z)
- [ ] Product/Part zone in Control Panel: assign product variable
- [ ] Product statistics management: Set Product Statistics dialog (target + sigma per product level)
  - Manual entry or load from data table
  - Save Product Statistics to new table
- [ ] Product separators: dashed vertical lines where product changes
- [ ] Color By Product: points colored by product/part level (cycle through DESIGN.md Short Run colors)
- [ ] Scaling Method selector: Centered vs Standardized
- [ ] Limit calculation per Wise and Fair (2006) methods

### Acceptance Criteria
- Multi-product data normalized correctly per product target
- Product separators visible at product transitions
- Product statistics editable and saveable
- Color by product clearly distinguishes products

### Dependencies
- 1.4 (Auto-Detection), 2.5 (Sigma Selectors)

### DESIGN.md Reference
- "Chart Type Inventory" → Short Run Charts table
- "Variable Configuration" → Part zone
- "Chart-Specific Color Extensions" → Short Run product colors

---

## 3.3 Custom Test Designer

**Why needed:** Power users need to modify rule parameters (e.g., change "8 consecutive same side" to "9 consecutive") or define entirely custom patterns. JMP provides this; serious SPC shops configure tests per their quality manual.

### Tasks
- [ ] Build "Customize Tests" editor accessible from Test Configuration section
- [ ] For each Nelson rule: editable parameter (e.g., Rule 4: number of consecutive points, default 8)
- [ ] For each Westgard rule: editable parameters
- [ ] Custom test template: "N of M consecutive points in Zone [A/B/C] on [same/either] side"
- [ ] Save custom test configurations to preferences (persist across sessions)
- [ ] "Restore Defaults" button to reset all test parameters
- [ ] Custom test label: user-defined name shown on chart and in Alarm Report
- [ ] Validation: prevent nonsensical parameters (e.g., N > M in "N of M" rules)

### Acceptance Criteria
- User can change Rule 4 from 8 to 9 consecutive points
- Custom test correctly detects the modified pattern
- Configuration persists across session (saved to analysis state)
- "Restore Defaults" returns all rules to standard Nelson parameters

### Dependencies
- 1.5 (Nelson Rules — base rules must work before customization)

---

## 3.4 Control Limits Save/Load

**Why needed:** In monitoring mode, engineers apply known historical limits to new data (rather than calculating limits from the new data). Save/Load is essential for this workflow.

### Tasks
- [ ] "Save Control Limits" with three options:
  - In Column: store LCL, CL, UCL as column property on Y variable
  - In New Table: export sigma, mean, LCL, CL, UCL, sample size, N subgroups to data table
  - In New Tall Table: one row per Y variable (when multiple Y)
- [ ] "Get Control Limits" to load stored limits from column property or data table
- [ ] "Set Control Limits" dialog: manual entry of UCL, CL, LCL (applied uniformly across chart)
- [ ] When manual limits are active: chip shows "LIMITS: MANUAL" with visual indicator
- [ ] Changing chart type or sigma method clears manual limits (with confirmation dialog)
- [ ] Phase-specific limits: manual limits can be set per phase

### Acceptance Criteria
- Save limits → load limits on new data → chart shows historical limits
- Manual limits visually distinct from calculated limits (dashed vs solid, or label indicator)
- Limit source (calculated vs manual) shown in Limit Summaries report

### Dependencies
- Existing limit calculation infrastructure

---

## 3.5 By-Group Analysis

**Why needed:** "Show me this chart for each tool" or "for each chamber" is a fundamental SPC workflow. The By variable produces a separate chart per group level.

### Tasks
- [ ] By zone in Control Panel: assign a column that splits the analysis
- [ ] Generate separate chart stack for each level of the By variable
- [ ] Each chart has independent limits calculated from its own subset of data
- [ ] Navigation: paginated tabs or vertical scroll with group-level headers
- [ ] Group header shows: level name, sample count, OOC count
- [ ] Shared spec limits across groups (engineering spec doesn't change by tool)
- [ ] "By-Group Script" save: saves a script that reproduces all group charts

### Acceptance Criteria
- Assign By variable → separate charts appear for each group level
- Each chart has correct independent limits
- Pagination/scroll works for many group levels (>10)

### Dependencies
- 1.1 (Data Import), 1.3 (Paired Layout)

### DESIGN.md Reference
- "Variable Configuration" → By zone

---

## 3.6 Column Switcher

**Why needed:** When monitoring multiple measurements (thickness, width, depth) on the same part, engineers want to quickly switch between variables without rebuilding the chart from scratch.

### Tasks
- [ ] "Switch Y" button or keyboard shortcut (Ctrl+Y) in toolbar
- [ ] Dropdown shows all compatible columns (same subgroup structure)
- [ ] Switching preserves: subgroup assignment, phase, chart type, test configuration, spec limits (if column has its own)
- [ ] Switching recalculates: limits, capability, alarms
- [ ] Animation: brief crossfade between charts (150ms per DESIGN.md Motion spec)

### Acceptance Criteria
- Switch from Thickness to Width preserves chart type and subgroup
- New limits calculated from new Y data
- Spec limits load from new column's property if available

### Dependencies
- 1.1 (Data Import — needs multiple columns)

---

## 3.7 Save Summaries & Analysis Script

**Why needed:** Reproducibility. Engineers need to export per-subgroup statistics for further analysis and save the complete analysis configuration to recreate it later.

### Tasks
- [ ] "Save Summaries" exports a table with per-subgroup rows:
  - Subgroup label, subgroup size, plotted statistic value
  - Chart type, center line, LCL, UCL
  - Test results per enabled rule (pass/fail per subgroup)
- [ ] "Save Script" exports a JSON configuration:
  - Data source reference, column roles (Y, Subgroup, Phase, Label, By)
  - Chart type, statistic, sigma method, K-sigma
  - Enabled tests with custom parameters
  - Spec limits, manual control limits
  - Exclusions list
  - Phase definitions
- [ ] "Load Script" imports a saved configuration and recreates the analysis
- [ ] Audit trail: every save operation logged

### Acceptance Criteria
- Save Summaries produces correct per-subgroup statistics
- Save Script → Load Script recreates the identical chart
- Audit trail shows save events

### Dependencies
- All chart type and configuration infrastructure from Tier 1 and 2

---

## Implementation Order

```
Tier 2 complete
       │
       ├──→ 3.1 EWMA Platform (largest scope, independent)
       │
       ├──→ 3.2 Short Run Charts (independent)
       │
       ├──→ 3.3 Custom Test Designer (independent)
       │
       ├──→ 3.4 Control Limits Save/Load (independent)
       │
       ├──→ 3.5 By-Group Analysis (independent)
       │
       ├──→ 3.6 Column Switcher (small scope, quick win)
       │
       └──→ 3.7 Save Summaries & Script (depends on all config being stable)
```

All items in Tier 3 are independent of each other. Maximize parallelization.
- **3.6 (Column Switcher)** and **3.3 (Custom Tests)** are smallest scope — quick wins.
- **3.1 (EWMA)** is largest scope — start early.
- **3.7 (Save/Script)** should come last as it serializes all configuration from other items.
