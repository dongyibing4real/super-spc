const pointValues = [
  8.042, 8.046, 8.044, 8.047, 8.049, 8.045, 8.048, 8.05, 8.052, 8.051,
  8.054, 8.056, 8.055, 8.058, 8.06, 8.063, 8.067, 8.069, 8.072, 8.076,
  8.081, 8.089, 8.097, 8.106, 8.136, 8.147, 8.151, 8.158
];

const robustValues = [
  8.041, 8.043, 8.044, 8.046, 8.048, 8.046, 8.047, 8.049, 8.05, 8.051,
  8.053, 8.054, 8.055, 8.056, 8.058, 8.061, 8.064, 8.067, 8.07, 8.073,
  8.077, 8.084, 8.092, 8.101, 8.117, 8.131, 8.141, 8.149
];

const phaseRanges = [
  { id: "P1", label: "Pre-clean baseline", start: 0, end: 8 },
  { id: "P2", label: "Ramp and cavity split", start: 9, end: 17 },
  { id: "P3", label: "Post-maintenance shift", start: 18, end: 27 }
];

const excludedIndices = [13, 17, 20, 23];

function phaseForIndex(index) {
  return phaseRanges.find((phase) => index >= phase.start && index <= phase.end);
}

function formatLot(index) {
  return `L-${2840 + index}`;
}

function buildPoints() {
  return pointValues.map((value, index) => ({
    id: `pt-${index}`,
    lot: formatLot(index),
    subgroupLabel: `Hour ${index + 1}`,
    cavity: "Cavity 1",
    phaseId: phaseForIndex(index)?.id || "P3",
    primaryValue: value,
    challengerValue: robustValues[index],
    excluded: excludedIndices.includes(index),
    annotation: index === 18 ? "M-204 chamber clean" : null,
    timestamp: `2026-03-${String(1 + index).padStart(2, "0")} 09:24`
  }));
}

export function createMockModel() {
  return {
    context: {
      title: "Etch Rate Stability",
      fab: "Fab 12",
      tool: "Tool 07",
      recipeFamily: "Recipe Family A",
      metric: { id: "thickness", label: "Thickness", unit: "nm" },
      subgroup: { id: "hour", label: "Hour / n=5", detail: "5 wafers per lot" },
      phase: { id: "cavity", label: "Cavity 1 phases", detail: "Event-sliced boundaries" },
      chartType: { id: "xbar-r", label: "XBar-R", detail: "Mean and dispersion" },
      sigma: { label: "3 Sigma", detail: "Phase-specific baseline" },
      tests: { label: "Nelson + Westgard", detail: "Rule 1, 2, 5 and run checks" },
      compare: { label: "Robust Adaptive overlay", detail: "RA-2.1 challenger" },
      window: "Last 28 lots",
      methodBadge: "Robust Adaptive",
      status: "Drift detected"
    },
    limits: {
      center: 8.078,
      ucl: 8.145,
      lcl: 8.011,
      usl: 8.165,
      lsl: 8.025,
      version: "limits-v12.4",
      scope: "Phase-specific"
    },
    challengerLimits: {
      center: 8.074,
      ucl: 8.138,
      lcl: 8.018,
      version: "ra-2.1-cal-7"
    },
    phases: phaseRanges,
    points: buildPoints(),
    transforms: [
      {
        id: "ingest",
        title: "CSV ingest and schema normalization",
        status: "complete",
        active: true,
        detail: "Validated metric, lot, timestamp, cavity, and event columns.",
        rescue: "Reject invalid columns before chart compute."
      },
      {
        id: "winsorize",
        title: "Winsorize transient spikes",
        status: "active",
        active: true,
        detail: "Discount three transient spikes while keeping them visible on-chart.",
        rescue: "Rollback to prior result if config validation fails."
      },
      {
        id: "normalize",
        title: "Normalize by target and chamber clean",
        status: "active",
        active: true,
        detail: "Applies target normalization after event alignment.",
        rescue: "Retain previous compute if target metadata is missing."
      },
      {
        id: "phase-tag",
        title: "Phase tag by maintenance event M-204",
        status: "active",
        active: true,
        detail: "Boundaries define pre-clean, ramp, and post-maintenance regions.",
        rescue: "Fallback to unphased mode when boundaries overlap."
      }
    ],
    findings: [
      {
        id: "finding-thickness-drift",
        title: "Thickness drift after maintenance transition",
        severity: "High",
        summary:
          "Sustained upward drift in thickness begins in P3 after maintenance event M-204. Classical EWMA and RA-2.1 agree on the shift.",
        confidence: 0.84,
        status: "Draft ready",
        owner: "Etch Process Eng.",
        citations: [
          { label: "Lots", value: "L-2861 to L-2867", resolved: true },
          { label: "Transform steps", value: "ingest, winsorize, normalize, phase-tag", resolved: true },
          { label: "Limits set", value: "limits-v12.4", resolved: true },
          { label: "Method versions", value: "EWMA-1.0, RA-2.1", resolved: true }
        ]
      },
      {
        id: "finding-ucl-recipe-b",
        title: "Intermittent UCL violations in Recipe Family B",
        severity: "Medium",
        summary: "Three isolated excursions are visible, but the challenger suppresses two as transient bursts.",
        confidence: 0.61,
        status: "Monitoring",
        owner: "Etch Shift Lead",
        citations: [
          { label: "Lots", value: "L-2811 to L-2819", resolved: true },
          { label: "Operator notes", value: "Pressure controller warning", resolved: true }
        ]
      }
    ],
    reportTemplate: {
      title: "Etch Thickness Drift Investigation",
      sections: ["Executive summary", "Evidence ledger", "Method comparison", "Recommended actions"]
    }
  };
}
