# Tier 2 — Required for Serious SPC Users

These features are what separate a demo from a usable tool. After Tier 1 makes the product credible, Tier 2 makes it useful for real SPC workflows.

**Priority:** High — implement after Tier 1
**Estimated effort:** ~3-4 weeks CC+gstack
**Depends on:** Tier 1 complete (data import, IMR, paired charts, auto-detect, Nelson rules)

---

## 2.1 Attribute Charts (P, NP, C, U)

**Why required:** Defect-rate monitoring is a core SPC workflow in manufacturing. Without attribute charts, the product can't handle count/proportion data at all — it's continuous-only.

### Tasks
- [ ] Implement P chart: proportion defective per subgroup, binomial sigma, variable subgroup sizes
- [ ] Implement NP chart: count defective per subgroup, binomial sigma, constant subgroup sizes
- [ ] Implement C chart: count of defects per unit, Poisson sigma, constant inspection units
- [ ] Implement U chart: defects per unit, Poisson sigma, variable inspection units
- [ ] Handle the n Trials zone: UI for assigning lot size / subgroup sample size column
- [ ] Control limits: variable-width limits for P and U charts (limits change per subgroup based on subgroup size)
- [ ] Display variable-width limits as stepped lines (not smooth curves)
- [ ] Event Chooser: for nominal/ordinal Y data, let user select which levels count as "events" vs "non-events"
- [ ] Tests: Nelson rules apply to attribute charts (except zone-based rules when limits aren't symmetric)
- [ ] Show/hide lower control limit option (lower limit often not meaningful for attribute charts)

### Acceptance Criteria
- Import count data → auto-detects P or U chart based on data characteristics
- Variable-width control limits display correctly for varying subgroup sizes
- Event Chooser works for ordinal data (e.g., pass/fail selection)
- All applicable Nelson rules fire correctly on attribute charts

### Dependencies
- 1.1 (Data Import), 1.3 (Paired Layout — though attribute charts may not have dispersion companion), 1.4 (Auto-Detection)

### DESIGN.md Reference
- "Chart Type Inventory" → Shewhart Attribute Charts table
- "Variable Configuration" → n Trials zone

---

## 2.2 Laney P' and Laney U' Charts

**Why required:** Standard P and U charts assume binomial/Poisson variance. With very large subgroups (common in semiconductor), overdispersion causes massive false alarm rates. Laney charts adjust for this. JMP users know to switch to Laney when they see too many false alarms.

### Tasks
- [ ] Implement Laney P' chart: moving range adjustment to binomial sigma
- [ ] Implement Laney U' chart: moving range adjustment to Poisson sigma
- [ ] Calculate sigma adjustment factor from moving ranges of standardized residuals
- [ ] When adjustment factor ≈ 1.0, chart is equivalent to standard P/U (no harm in using Laney by default)
- [ ] Add chart type options in selector: P → Laney P' toggle, U → Laney U' toggle
- [ ] Show the sigma adjustment factor in the Sigma Report

### Acceptance Criteria
- Laney P' chart shows wider control limits than standard P when overdispersion exists
- When no overdispersion, Laney chart is visually identical to standard chart
- Sigma adjustment factor visible in report

### Dependencies
- 2.1 (Attribute Charts)

---

## 2.3 CUSUM Platform

**Why required:** CUSUM is the standard method for detecting small sustained shifts — the kind of drift that Shewhart charts miss until it's too late. Semiconductor process engineers use CUSUM alongside Shewhart charts routinely.

### Tasks
- [ ] Build CUSUM as a dedicated view/screen (accessible from nav sidebar or from chart type selector)
- [ ] Implement tabular CUSUM algorithm: one-sided upper (C+) and lower (C-) cumulative sums
- [ ] Parameters: Target, Sigma, h (decision limit), k (reference value), Head Start (FIR)
- [ ] Build parameter control panel per DESIGN.md CUSUM layout spec
- [ ] Support standard deviation units (default) and data units toggle
- [ ] Decision limits as horizontal dashed lines
- [ ] Shift detection lines: vertical line at shift start (first point after most recent C+ or C- zero)
- [ ] Test Beyond Limits: red circle on points exceeding decision limits
- [ ] ARL Report: table of average run length values for shifts 0–3σ in 0.25 increments
- [ ] ARL Profiler: interactive graph of ARL vs shift size, updates as h/k change
- [ ] "Tune Chart" mode: user specifies acceptable range, system computes optimal k
- [ ] Save Summaries: subgroup number, size, mean, sigma, shift indicators, C+/C-, N+/N-, LCL/UCL
- [ ] Evidence Rail adaptation: show shift narrative (where shifts detected, cumulative sum values)
- [ ] Support subgroup data (plot mean of each subgroup on CUSUM chart)

### Acceptance Criteria
- CUSUM chart correctly detects small shifts that the Shewhart chart misses
- Parameter changes update the chart live
- ARL profiler shows how sensitivity changes with parameters
- Shift lines appear at correct positions

### Dependencies
- 1.1 (Data Import), 1.3 (Paired Layout concepts for chart rendering)

### DESIGN.md Reference
- "CUSUM Platform Design" section (layout wireframe)
- "Chart-Specific Color Extensions" (CUSUM colors)

---

## 2.4 Spec Limits Management

**Why required:** Capability analysis (Cpk, Ppk) requires spec limits. Without a way to enter, edit, save, and load spec limits, capability analysis is dead.

### Tasks
- [ ] Build Spec Limits inline editor per DESIGN.md spec (USL, Target, LSL fields)
- [ ] Support manual entry and loading from column property
- [ ] "Save to Data" persists as column property on Y variable
- [ ] When spec limits are set: show USL/LSL as dashed purple lines on chart
- [ ] When spec limits are set: enable Process Capability Report (see 2.6)
- [ ] Spec limits persist across chart type changes (they're engineering specs, not data-dependent)
- [ ] Phase handling: same spec limits across all phases by default; no per-phase spec limits

### Acceptance Criteria
- User can enter USL/LSL/Target via inline editor
- Spec limit lines appear on chart immediately
- Spec limits persist when chart type changes
- Saving to data stores as column property

### Dependencies
- Existing chart rendering infrastructure

### DESIGN.md Reference
- "Specification Limits & Control Limits Management" → "Spec Limits Dialog" (wireframe)

---

## 2.5 Statistic & Sigma Method Selectors

**Why required:** SPC practitioners need to control how sigma is estimated and which statistic is plotted. These are not obscure options — they're fundamental choices that affect limit calculations.

### Tasks
- [ ] Build Statistic selector chip in Control Panel Config section
  - Dropdown showing applicable statistics for current chart type
  - Changing statistic may change chart type (e.g., Average → Individual changes XBar to IMR)
- [ ] Build Sigma selector chip in Control Panel Config section
  - Dropdown showing applicable sigma methods for current chart type
  - Changing sigma method recalculates all limits immediately
- [ ] Build K-Sigma input in Control Panel Config section
  - Numeric input, default 3.0, range 1.0–5.0
  - Changing K recalculates UCL/LCL immediately
- [ ] Implement all sigma estimation methods per DESIGN.md:
  - Range (R̄/d₂), Standard Deviation (S̄/c₄), Moving Range (MR̄/d₂)
  - Median Moving Range (median(MR)/d₄)
  - Levey-Jennings (overall std dev)
  - Binomial, Poisson (for attribute charts)
- [ ] Store selected statistic and sigma method in analysis state for reproducibility

### Acceptance Criteria
- Changing sigma method visibly changes control limit positions on chart
- Changing K-sigma visibly widens/narrows limits
- Incompatible combinations are prevented (grayed out options)

### Dependencies
- 1.4 (Auto-Detection — selector needs multiple chart types to be meaningful)

### DESIGN.md Reference
- "Statistic & Sigma Configuration" section (both tables)

---

## 2.6 Process Capability Report

**Why required:** Cpk/Ppk values are already shown, but a proper report with confidence intervals, PPM estimates, sigma report, and per-phase comparison is what engineers need for quality reviews and audits.

### Tasks
- [ ] Build expandable Capability Report section below chart per DESIGN.md spec
- [ ] Calculate and display: Cp, Cpk, Pp, Ppk with color coding (green ≥1.33, amber 1.0–1.33, red <1.0)
- [ ] Calculate PPM estimates: below LSL, above USL, total (both overall and within)
- [ ] Display sigma details: overall sigma, within sigma, stability index
- [ ] Per-phase capability: when phases exist, show indices per phase with comparison
- [ ] Build Sigma Report table (overall sigma, within sigma, between sigma for Three Way, stability index, sample size, N subgroups, sample mean)
- [ ] Build Limit Summaries table (LCL, CL, UCL, points statistic, limits sigma, subgroup size)
- [ ] Toggle visibility from toolbar or Control Panel

### Acceptance Criteria
- Spec limits set → Capability Report appears below chart
- All indices correctly calculated and color-coded
- Per-phase comparison when phases exist
- Sigma Report shows correct sigma estimates

### Dependencies
- 2.4 (Spec Limits — capability requires USL/LSL)

---

## 2.7 XBar-S Chart

**Why required:** XBar-R is appropriate for small subgroups (2–8). For larger subgroups (≥9), the range becomes a poor estimator of variability and XBar-S (using standard deviation) is the correct choice. Auto-detection should select XBar-S for large subgroups.

### Tasks
- [ ] Implement S chart (dispersion): plot subgroup standard deviations, CL = S̄, UCL = B₄×S̄, LCL = B₃×S̄
- [ ] Sigma estimation from S: σ̂ = S̄/c₄
- [ ] Wire XBar-S as a chart type option (XBar location chart + S dispersion chart)
- [ ] Auto-detection: subgroup size ≥ 9 → XBar-S instead of XBar-R
- [ ] Allow manual switch between R and S dispersion via Dispersion Chart selector in Config section

### Acceptance Criteria
- Data with subgroup size 10 → auto-selects XBar-S
- S chart shows correct limits using B₃/B₄ constants
- User can manually switch between R and S for any subgroup size

### Dependencies
- 1.3 (Paired Layout), 1.4 (Auto-Detection)

---

## Implementation Order

```
Tier 1 complete
       │
       ├──→ 2.1 Attribute Charts ──→ 2.2 Laney Charts
       │
       ├──→ 2.3 CUSUM Platform (independent)
       │
       ├──→ 2.4 Spec Limits ──→ 2.6 Capability Report
       │
       ├──→ 2.5 Statistic/Sigma Selectors (independent)
       │
       └──→ 2.7 XBar-S (independent, small scope)
```

- **2.7 (XBar-S)** is smallest scope — can be done first as a quick win.
- **2.3 (CUSUM)** is the largest scope but independent — can be parallelized.
- **2.4 → 2.6** is a dependency chain (spec limits before capability report).
- **2.1 → 2.2** is a dependency chain (base attribute charts before Laney variants).
- **2.5 (Selectors)** is independent and benefits all chart types.
