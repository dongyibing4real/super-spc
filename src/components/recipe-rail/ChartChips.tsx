import { spcStore } from "../../store/spc-store.js";
import { setChartParams, setActiveChipEditor } from "../../core/state/chart.js";
import { setRecipeParams } from "../../core/state/reconcile-params.js";
import { reanalyze } from "../../store/actions.js";
import { getDisabledChartTypes } from "../../data/params.js";
import { ChipSelect, ChipGroupSelect } from "./ChipSelect.jsx";
import {
  CHART_TYPES,
  SIGMA_METHODS,
  NELSON_RULES,
  SIGMA_METHOD_CHARTS,
  NO_SIGMA_CHARTS,
  RECIPE_KEYS,
  parseNullableNumber,
  specSummary,
} from "./recipe-rail-constants.js";

/* --- Dispatch helpers for chart param changes --- */

export function dispatchChartParam(prefix, paramUpdate) {
  const needsReconcile = Object.keys(paramUpdate).some((k) => RECIPE_KEYS.has(k));
  if (prefix === "_pending") {
    spcStore.setState((s) => {
      const pending = { ...s.ui.pendingNewChart, ...paramUpdate };
      let next = { ...s, ui: { ...s.ui, pendingNewChart: pending } };
      return setActiveChipEditor(next, null);
    });
  } else {
    spcStore.setState((s) => {
      const setter = needsReconcile ? setRecipeParams : setChartParams;
      let next = setter(s, prefix, paramUpdate);
      return setActiveChipEditor(next, null);
    });
    reanalyze();
  }
}

export function dispatchPendingParamNoClose(prefix, paramUpdate) {
  if (prefix === "_pending") {
    spcStore.setState((s) => ({
      ...s,
      ui: { ...s.ui, pendingNewChart: { ...s.ui.pendingNewChart, ...paramUpdate } },
    }));
  } else {
    const needsReconcile = Object.keys(paramUpdate).some((k) => RECIPE_KEYS.has(k));
    const setter = needsReconcile ? setRecipeParams : setChartParams;
    spcStore.setState((s) => setter(s, prefix, paramUpdate));
    reanalyze();
  }
}

export function SpecEditor({ prefix, params }) {
  return (
    <span className="chip-sigma-editor">
      <label className="chip-sigma-row">
        <span className="chip-sigma-label">LSL</span>
        <input
          type="number"
          className="chip-k-input"
          onChange={(e) => dispatchChartParam(prefix, { lsl: parseNullableNumber(e.target.value) })}
          defaultValue={params.lsl ?? ""}
          step="any"
          onClick={(e) => e.stopPropagation()}
          placeholder="\u2014"
        />
      </label>
      <label className="chip-sigma-row">
        <span className="chip-sigma-label">Target</span>
        <input
          type="number"
          className="chip-k-input"
          onChange={(e) => dispatchChartParam(prefix, { target: parseNullableNumber(e.target.value) })}
          defaultValue={params.target ?? ""}
          step="any"
          onClick={(e) => e.stopPropagation()}
          placeholder="\u2014"
        />
      </label>
      <label className="chip-sigma-row">
        <span className="chip-sigma-label">USL</span>
        <input
          type="number"
          className="chip-k-input"
          onChange={(e) => dispatchChartParam(prefix, { usl: parseNullableNumber(e.target.value) })}
          defaultValue={params.usl ?? ""}
          step="any"
          onClick={(e) => e.stopPropagation()}
          placeholder="\u2014"
        />
      </label>
    </span>
  );
}

export function SigmaEditor({ prefix, params }) {
  const showMethod = SIGMA_METHOD_CHARTS.has(params.chart_type);
  return (
    <span className="chip-sigma-editor">
      <label className="chip-sigma-row">
        <span className="chip-sigma-label">k</span>
        <input
          type="number"
          className="chip-k-input"
          onChange={(e) => {
            const k = parseFloat(e.target.value);
            if (k > 0 && k <= 6) dispatchPendingParamNoClose(prefix, { k_sigma: k });
          }}
          defaultValue={params.k_sigma}
          min="0.5"
          max="6"
          step="0.5"
          onClick={(e) => e.stopPropagation()}
        />
      </label>
      {showMethod && (
        <label className="chip-sigma-row">
          <span className="chip-sigma-label">Method</span>
          <ChipSelect
            resetKey={prefix}
            onChange={(e) => dispatchChartParam(prefix, { sigma_method: e.target.value })}
            options={SIGMA_METHODS}
            current={params.sigma_method}
          />
        </label>
      )}
    </span>
  );
}

export default function ChartChips({ state, prefix, params, context, ae, cols }) {
  const numericCols = cols.filter((c) => c.dtype === "numeric");
  const allNonValue = cols.filter((c) => c.role !== "value");
  const currentSg = params.subgroup_column || "";
  const currentPh = params.phase_column || "";
  const activeTests = params.nelson_tests || [];

  const handleToggleChip = (chipId, isLocked) => {
    if (isLocked) return;
    spcStore.setState((s) => setActiveChipEditor(s, ae === chipId ? null : chipId));
  };

  const chips = [
    {
      id: `${prefix}-metric`,
      label: "Metric",
      value: ae === `${prefix}-metric`
        ? <ChipSelect
            resetKey={prefix}
            onChange={(e) => dispatchChartParam(prefix, { value_column: e.target.value || null })}
            options={numericCols.map((c) => [c.name, c.name])}
            current={numericCols.find((c) => c.role === "value")?.name || ""}
          />
        : context.metric.label,
      detail: context.metric.unit,
    },
    {
      id: `${prefix}-subgroup`,
      label: "Subgroup",
      value: ae === `${prefix}-subgroup`
        ? <ChipSelect
            resetKey={prefix}
            onChange={(e) => dispatchChartParam(prefix, { subgroup_column: e.target.value || null })}
            options={[
              ["", "Individual (n=1)"],
              ...allNonValue.map((c) => [c.name, c.name]),
            ]}
            current={currentSg}
          />
        : context.subgroup.label,
      detail: ae === `${prefix}-subgroup` ? "" : context.subgroup.detail,
    },
    {
      id: `${prefix}-phase`,
      label: "Phase",
      value: ae === `${prefix}-phase`
        ? <ChipSelect
            resetKey={prefix}
            onChange={(e) => dispatchChartParam(prefix, { phase_column: e.target.value || null })}
            options={[["", "No phases"], ...allNonValue.map((c) => [c.name, c.name])]}
            current={currentPh}
          />
        : context.phase.label,
      detail: ae === `${prefix}-phase` ? "" : context.phase.detail,
    },
    {
      id: `${prefix}-chart`,
      label: "Chart",
      value: ae === `${prefix}-chart`
        ? <ChipGroupSelect
            resetKey={prefix}
            onChange={(e) => dispatchChartParam(prefix, { chart_type: e.target.value || null })}
            groups={CHART_TYPES}
            current={params.chart_type || ""}
            disabledSet={getDisabledChartTypes(params, cols)}
          />
        : context.chartType.label,
      detail: ae === `${prefix}-chart` ? "" : context.chartType.detail,
    },
    // Progressive disclosure: hide Sigma/Tests/Specs when chart_type is null
    ...(params.chart_type && !NO_SIGMA_CHARTS.has(params.chart_type) ? [{
      id: `${prefix}-sigma`,
      label: "Sigma",
      value: ae === `${prefix}-sigma`
        ? <SigmaEditor prefix={prefix} params={params} />
        : context.sigma.label,
      detail: ae === `${prefix}-sigma` ? "" : (SIGMA_METHOD_CHARTS.has(params.chart_type) ? context.sigma.detail : ""),
    }] : []),
    // Progressive disclosure: Tests and Specs hidden when chart_type is null
    ...(params.chart_type ? [{
      id: `${prefix}-tests`,
      label: "Tests",
      value: ae === `${prefix}-tests`
        ? (
          <span className="chip-tests-inline">
            {NELSON_RULES.map(([id, ruleLabel]) => (
              <label key={id} className="chip-test-toggle" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  onChange={(e) => {
                    const ruleId = id;
                    if (prefix === "_pending") {
                      spcStore.setState((s) => {
                        const current = s.ui.pendingNewChart.nelson_tests || [];
                        const nextRules = e.target.checked ? [...current, ruleId] : current.filter((r) => r !== ruleId);
                        return { ...s, ui: { ...s.ui, pendingNewChart: { ...s.ui.pendingNewChart, nelson_tests: nextRules } } };
                      });
                    } else {
                      spcStore.setState((s) => {
                        const current = s.charts[prefix].params.nelson_tests || [];
                        const nextRules = e.target.checked ? [...current, ruleId] : current.filter((r) => r !== ruleId);
                        return setChartParams(s, prefix, { nelson_tests: nextRules });
                      });
                      reanalyze();
                    }
                  }}
                  data-value={id}
                  defaultChecked={activeTests.includes(id)}
                />
                {id}
              </label>
            ))}
          </span>
        )
        : context.tests.label,
      detail: ae === `${prefix}-tests` ? "" : context.tests.detail,
    }] : []),
    ...(params.chart_type ? [{
      id: `${prefix}-specs`,
      label: "Specs",
      value: ae === `${prefix}-specs`
        ? <SpecEditor prefix={prefix} params={params} />
        : specSummary(params),
      detail: "",
    }] : []),
  ];

  return chips.map((chip) => {
    const isEditing = ae === chip.id;
    const isChart = chip.id.endsWith("-chart");
    const isPlaceholder = isChart && !params.chart_type;
    const specVal = chip.id.endsWith("-specs") ? (typeof chip.value === "string" ? chip.value : "") : "";
    const isSpecsUnset = chip.id.endsWith("-specs") && specVal === "Not set";
    const warnClass = isSpecsUnset ? "chip--warn" : "";
    const placeholderClass = isPlaceholder ? "chip--placeholder" : "";
    const titleAttr = isSpecsUnset
      ? "Set LSL / USL to enable Cpk, Ppk capability analysis"
      : isPlaceholder
        ? "Select a chart type to begin analysis"
        : undefined;
    const ariaLabel = isPlaceholder
      ? "Chart type: not selected. Click to choose."
      : undefined;

    return (
      <button
        key={chip.id}
        className={`recipe-chip ${isEditing ? "chip-editing" : ""} ${warnClass} ${placeholderClass}`}
        onClick={() => handleToggleChip(chip.id, false)}
        type="button"
        title={titleAttr}
        aria-label={ariaLabel}
        disabled={undefined}
      >
        <span className="chip-label">{chip.label}</span>
        <strong>{typeof chip.value === "string" ? chip.value : chip.value}</strong>
        {chip.detail ? <span className="chip-detail">{chip.detail}</span> : null}
      </button>
    );
  });
}
