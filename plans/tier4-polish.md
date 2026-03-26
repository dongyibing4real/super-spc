# Tier 4 — Polish & Differentiation

These features complete JMP parity for niche chart types and push Super SPC beyond JMP with modern capabilities. After Tiers 1-3, these are what make the product comprehensive.

**Priority:** Lower — implement after Tier 3 or as opportunity allows
**Estimated effort:** ~3-4 weeks CC+gstack
**Depends on:** Tier 3 substantially complete

---

## 4.1 Rare Event Charts (G and T)

**Why:** Low-frequency events (line shutdowns, safety incidents) need specialized charting. Standard charts don't work when events are rare — most points sit at zero.

### Tasks
- [ ] Implement G chart: plot counts between rare events, Negative Binomial distribution for sigma
- [ ] Implement T chart: plot time intervals between events, Weibull distribution for sigma
- [ ] Handle interpretation: points ABOVE UCL are GOOD (longer intervals = fewer events)
- [ ] No phase support (JMP doesn't support phases for Rare Event charts)
- [ ] No zone shading (not applicable for rare event distributions)
- [ ] Test Beyond Limits only (no Nelson zone-based tests)
- [ ] Support integer-valued data only for T charts

### Acceptance Criteria
- G chart correctly plots inter-event counts with appropriate limits
- T chart correctly plots inter-event time intervals
- Upper limit exceedances flagged as "desirable" in evidence narrative

### Dependencies
- 1.4 (Auto-Detection), 2.5 (Sigma Selectors)

---

## 4.2 Multivariate Control Charts (T² and MEWMA)

**Why:** Semiconductor processes have many correlated measurements. Monitoring each independently misses correlated shifts. T² and MEWMA detect these.

### Tasks
- [ ] Implement Hotelling's T² chart: multivariate statistic against chi-squared control limit
- [ ] Variable selection: multiple Y columns assigned simultaneously
- [ ] Decomposition panel: when T² exceeds limit, show which variable(s) contributed most
- [ ] Contribution bar chart: stacked horizontal bars showing each variable's contribution to T²
- [ ] Implement MEWMA: multivariate EWMA with configurable smoothing matrix
- [ ] MEWMA parameters: smoothing constant (scalar or per-variable), initial covariance estimate
- [ ] Handle high-dimensionality: when >10 variables, show top contributors only

### Acceptance Criteria
- T² chart detects a correlated shift across 3+ variables that individual charts miss
- Decomposition correctly identifies the contributing variable(s)
- MEWMA detects small multivariate shifts with tunable sensitivity

### Dependencies
- 3.1 (EWMA — shares exponential weighting concepts)

### DESIGN.md Reference
- "Multivariate Control Charts Design" section

---

## 4.3 Levey-Jennings Charts

**Why:** Standard in clinical/lab QC environments. Uses long-term sigma (overall standard deviation) rather than within-subgroup sigma. Also applies Westgard rules.

### Tasks
- [ ] Implement Levey-Jennings chart: individual measurements with limits at ±3s (overall σ)
- [ ] Sigma calculation: overall standard deviation (same as Distribution platform)
- [ ] Wire Westgard rules as the default test set for Levey-Jennings (instead of Nelson rules)
- [ ] Support both individual and subgroup (average) Levey-Jennings variants
- [ ] QC-specific evidence narrative: frame findings in lab QC language (run rejection, random vs systematic error)

### Acceptance Criteria
- Levey-Jennings uses overall σ (not moving range σ) for limits
- Westgard rules auto-enabled when Levey-Jennings selected
- Nelson rules auto-disabled (they use different zone definitions)

### Dependencies
- 1.5 (Nelson Rules) — Westgard rules infrastructure
- 2.5 (Sigma Selectors) — Levey-Jennings sigma method

---

## 4.4 Histogram Sidebar

**Why:** A vertical histogram docked to the Y-axis shows data distribution at a glance. Standard in serious SPC tools. Immediately reveals normality, bimodality, truncation.

### Tasks
- [ ] Render vertical histogram docked to the right edge of the location chart Y-axis
- [ ] Bins aligned to Y-axis scale (each bin spans the same range as the chart grid)
- [ ] Bar direction: horizontal, extending rightward from the Y-axis
- [ ] Overlay: normal distribution curve fitted to the data (optional toggle)
- [ ] Overlay: spec limits as horizontal dashed lines crossing the histogram
- [ ] Color: bars filled with `--blue` at 20% opacity, outlined with `--blue` at 40%
- [ ] Width: ~80px, collapsible via toggle
- [ ] Phase-aware: when phases exist, histogram shows only the data from the currently selected phase
- [ ] Exclusion-aware: excluded points not counted in histogram

### Acceptance Criteria
- Histogram visually corresponds to Y-axis scale of the chart
- Distribution shape is immediately readable (normal, skewed, bimodal)
- Spec limit lines visible on histogram
- Phase selection filters histogram data

### Dependencies
- 1.3 (Paired Layout — histogram shares the chart card space)

---

## 4.5 Alarm Scripts & Automated Actions

**Why:** In production monitoring, OOC detection should trigger automated actions (send email, write to log, call webhook). This is the bridge between SPC analysis and operational response.

### Tasks
- [ ] Alarm Script editor: text area where user writes/configures automated actions
- [ ] Available actions: write to file, write to console log, send webhook (URL + JSON payload)
- [ ] Context variables available in script: column name (qc_col), test that failed (qc_test), sample number (qc_sample), phase (qc_phase)
- [ ] Trigger: script executes when any enabled test fires on new data
- [ ] Enable/disable per chart
- [ ] Alarm log: persistent record of all alarm script executions with timestamp, trigger, action taken
- [ ] Notification preferences: configure which alarms are toast-worthy vs silent

### Acceptance Criteria
- OOC detected → alarm script fires → action recorded in alarm log
- Webhook sends correct JSON with context variables
- Alarm log queryable by date, test, severity

### Dependencies
- 1.5 (Nelson Rules), all chart types

---

## 4.6 Three Way Control Charts

**Why:** Three Way charts decompose variation into between-subgroup and within-subgroup components. Useful when both batch-to-batch and within-batch variation matter (common in semiconductor lot-based processing).

### Tasks
- [ ] Implement Three Way chart: three stacked charts
  - Chart 1: Subgroup means or std devs (between-subgroup variation)
  - Chart 2: Between-subgroup moving range or median moving range
  - Chart 3: Within-subgroup range or std dev
- [ ] Between sigma estimation: from moving ranges of subgroup means
- [ ] Within sigma estimation: from subgroup ranges or std devs
- [ ] Combined between-and-within sigma
- [ ] Grouping Method selector: Mean or Standard Deviation for first chart
- [ ] Between Chart selector: Moving Range or Median Moving Range
- [ ] Within Chart selector: Range or Standard Deviation
- [ ] All three sigma estimates shown in Sigma Report

### Acceptance Criteria
- Three charts stack correctly with shared X-axis
- Between and within sigma estimates match JMP calculations
- Sigma Report shows all three sigma components

### Dependencies
- 1.3 (Paired Layout — extended to three charts), 2.5 (Sigma Selectors)

---

## 4.7 Presummarize Charts

**Why:** When data contains repeated measurements on the same process unit, pre-summarizing into means/std devs before charting avoids artificial subgroup structure.

### Tasks
- [ ] Detect repeated measurements per unit (same label, multiple rows)
- [ ] Summarize to per-unit means and/or standard deviations
- [ ] Chart the summarized data as IMR-style charts
- [ ] Sigma methods: Moving Range on means, Median Moving Range on means, Moving Range on std devs
- [ ] Show original (unsummarized) data count per unit in tooltip

### Acceptance Criteria
- Repeated measurements correctly summarized before charting
- Limits calculated from summarized data, not raw data
- User informed that pre-summarization was applied

### Dependencies
- 1.2 (IMR — Presummarize charts are IMR-style on summarized data)

---

## 4.8 Export & Report Generation

**Why:** Audit-ready output. Engineers need to produce PDF reports for quality review boards, export charts for presentations, and bundle complete analysis packages.

### Tasks
- [ ] Chart image export: PNG (raster, for presentations), SVG (vector, for reports)
- [ ] PDF report generation: chart + capability report + alarm summary + evidence narrative
  - Dark-themed PDF matching app aesthetic (not white-background default)
  - Include: chart image, limit summaries, capability indices, OOC list, exclusion log
  - Header: date, analyst, data source, chart type, configuration summary
- [ ] CSV/Excel data export: processed data with computed columns (subgroup stats, rule results)
- [ ] JSON analysis bundle: complete serialized state for reproducibility
- [ ] Finding export: individual finding as PDF with signal description, rule citations, evidence ledger, recommended actions
- [ ] Batch export: export all By-group charts as a multi-page PDF

### Acceptance Criteria
- PDF report is boardroom-ready and audit-complete
- JSON bundle → re-import recreates identical analysis
- Finding PDF includes all citations and evidence

### Dependencies
- 3.7 (Save Summaries — shares serialization infrastructure)

---

## 4.9 Missing Value Handling

**Why:** Real manufacturing data has gaps — equipment downtime, excluded lots, missing measurements. The product must handle these gracefully rather than crashing or showing wrong results.

### Tasks
- [ ] Connect Thru Missing: option to connect chart lines across gaps vs show breaks
- [ ] Include Missing Categories: for categorical X variables, show missing as separate category
- [ ] Missing subgroups: show gap on X-axis, don't include in limit calculation
- [ ] Excluded subgroups: show dimmed on chart (when "Show Excluded Region" is ON), exclude from limit calc
- [ ] Nelson rules: missing values restart consecutive-point counts for runs-based tests
- [ ] Capability analysis: missing values excluded from Cpk/Ppk calculation

### Acceptance Criteria
- Charts with missing data render correctly (no NaN, no crashes)
- Connect Thru Missing toggle works
- Limits calculated from non-missing data only

### Dependencies
- 1.1 (Data Import — real data has missing values)

---

## 4.10 Local Data Filter

**Why:** Engineers want to filter the chart to a subset of data (e.g., "show only Tool 3" or "only last 30 days") without creating a new dataset. JMP's Local Data Filter is one of its most-used features.

### Tasks
- [ ] Filter panel: collapsible panel below the toolbar or as a popover
- [ ] Filter by column values: dropdown for categorical, range slider for continuous, date range for timestamps
- [ ] Multiple simultaneous filters (AND logic)
- [ ] Filter immediately updates chart: points outside filter are hidden, limits recalculated from visible data
- [ ] "Show Excluded Region" compatibility: excluded-but-filtered points still shown as dimmed if both options are ON
- [ ] Filter state saved in analysis script

### Acceptance Criteria
- Filter by categorical column → chart shows only matching data with recalculated limits
- Filter by date range → chart shows only data in range
- Multiple filters combine correctly
- Removing filter restores full chart

### Dependencies
- 1.1 (Data Import), all chart infrastructure

---

## Implementation Order

```
Tier 3 complete
       │
       ├──→ 4.4 Histogram Sidebar (small, high visual impact)
       │
       ├──→ 4.3 Levey-Jennings (small, extends existing infrastructure)
       │
       ├──→ 4.8 Export & Reports (high user value)
       │
       ├──→ 4.9 Missing Values (robustness)
       │
       ├──→ 4.10 Local Data Filter (high usability value)
       │
       ├──→ 4.1 Rare Event Charts (niche but independent)
       │
       ├──→ 4.6 Three Way Charts (niche)
       │
       ├──→ 4.7 Presummarize (niche)
       │
       ├──→ 4.5 Alarm Scripts (operational feature)
       │
       └──→ 4.2 Multivariate (largest scope, most complex)
```

- **4.4 (Histogram)** and **4.3 (Levey-Jennings)** are quick wins with high visual/functional impact.
- **4.8 (Export)** has high user value — engineers need to produce deliverables.
- **4.9 (Missing Values)** and **4.10 (Local Data Filter)** are robustness/usability essentials.
- **4.2 (Multivariate)** is the most complex — save for last unless user demand is high.
