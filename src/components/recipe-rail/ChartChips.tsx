import type { ChangeEvent, MouseEvent as ReactMouseEvent, ReactNode } from "react";
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
import type { ChartParams, ChartContext, SPCState } from "../../types/state.ts";
import type { RecipeRailState } from "./RecipeRail.jsx";

/* --- Dispatch helpers for chart param changes --- */

export function dispatchChartParam(prefix: string, paramUpdate: Partial<ChartParams>): void {
  const needsReconcile = Object.keys(paramUpdate).some((k) => RECIPE_KEYS.has(k));
  if (prefix === "_pending") {
    spcStore.setState((s: SPCState) => {
      const pending = { ...s.ui.pendingNewChart, ...paramUpdate };
      let next: SPCState = { ...s, ui: { ...s.ui, pendingNewChart: pending } };
      return setActiveChipEditor(next, null);
    });
  } else {
    spcStore.setState((s: SPCState) => {
      const setter = needsReconcile ? setRecipeParams : setChartParams;
      let next: SPCState = setter(s, prefix, paramUpdate);
      return setActiveChipEditor(next, null);
    });
    reanalyze();
  }
}

export function dispatchPendingParamNoClose(prefix: string, paramUpdate: Partial<ChartParams>): void {
  if (prefix === "_pending") {
    spcStore.setState((s: SPCState) => ({
      ...s,
      ui: { ...s.ui, pendingNewChart: { ...s.ui.pendingNewChart, ...paramUpdate } },
    }));
  } else {
    const needsReconcile = Object.keys(paramUpdate).some((k) => RECIPE_KEYS.has(k));
    const setter = needsReconcile ? setRecipeParams : setChartParams;
    spcStore.setState((s: SPCState) => setter(s, prefix, paramUpdate));
    reanalyze();
  }
}

interface SpecEditorProps {
  prefix: string;
  params: ChartParams;
}

export function SpecEditor({ prefix, params }: SpecEditorProps) {
  return (
    <span className="chip-sigma-editor">
      <label className="chip-sigma-row">
        <span className="chip-sigma-label">LSL</span>
        <input
          type="number"
          className="chip-k-input"
          onChange={(e: ChangeEvent<HTMLInputElement>) => dispatchChartParam(prefix, { lsl: parseNullableNumber(e.target.value) })}
          defaultValue={params.lsl ?? ""}
          step="any"
          onClick={(e: ReactMouseEvent) => e.stopPropagation()}
          placeholder="\u2014"
        />
      </label>
      <label className="chip-sigma-row">
        <span className="chip-sigma-label">Target</span>
        <input
          type="number"
          className="chip-k-input"
          onChange={(e: ChangeEvent<HTMLInputElement>) => dispatchChartParam(prefix, { target: parseNullableNumber(e.target.value) })}
          defaultValue={params.target ?? ""}
          step="any"
          onClick={(e: ReactMouseEvent) => e.stopPropagation()}
          placeholder="\u2014"
        />
      </label>
      <label className="chip-sigma-row">
        <span className="chip-sigma-label">USL</span>
        <input
          type="number"
          className="chip-k-input"
          onChange={(e: ChangeEvent<HTMLInputElement>) => dispatchChartParam(prefix, { usl: parseNullableNumber(e.target.value) })}
          defaultValue={params.usl ?? ""}
          step="any"
          onClick={(e: ReactMouseEvent) => e.stopPropagation()}
          placeholder="\u2014"
        />
      </label>
    </span>
  );
}

interface SigmaEditorProps {
  prefix: string;
  params: ChartParams;
}

export function SigmaEditor({ prefix, params }: SigmaEditorProps) {
  const showMethod = SIGMA_METHOD_CHARTS.has(params.chart_type!);
  return (
    <span className="chip-sigma-editor">
      <label className="chip-sigma-row">
        <span className="chip-sigma-label">k</span>
        <input
          type="number"
          className="chip-k-input"
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            const k = parseFloat(e.target.value);
            if (k > 0 && k <= 6) dispatchPendingParamNoClose(prefix, { k_sigma: k });
          }}
          defaultValue={params.k_sigma}
          min="0.5"
          max="6"
          step="0.5"
          onClick={(e: ReactMouseEvent) => e.stopPropagation()}
        />
      </label>
      {showMethod && (
        <label className="chip-sigma-row">
          <span className="chip-sigma-label">Method</span>
          <ChipSelect
            resetKey={prefix}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => dispatchChartParam(prefix, { sigma_method: e.target.value })}
            options={SIGMA_METHODS}
            current={params.sigma_method}
          />
        </label>
      )}
    </span>
  );
}

interface ChartChipsProps {
  state: RecipeRailState;
  prefix: string;
  params: ChartParams;
  context: ChartContext;
  ae: string | null;
  cols: { name: string; ordinal: number; dtype: string; role: string | null }[];
}

interface ChipDef {
  id: string;
  label: string;
  value: ReactNode;
  detail: string | undefined;
}

export default function ChartChips({ state, prefix, params, context, ae, cols }: ChartChipsProps) {
  const numericCols = cols.filter((c) => c.dtype === "numeric");
  const allNonValue = cols.filter((c) => c.role !== "value");
  const currentSg = params.subgroup_column || "";
  const currentPh = params.phase_column || "";
  const activeTests = params.nelson_tests || [];

  const handleToggleChip = (chipId: string, isLocked: boolean): void => {
    if (isLocked) return;
    spcStore.setState((s: SPCState) => setActiveChipEditor(s, ae === chipId ? null : chipId));
  };

  const chips: ChipDef[] = [
    {
      id: `${prefix}-metric`,
      label: "Metric",
      value: ae === `${prefix}-metric`
        ? <ChipSelect
            resetKey={prefix}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => dispatchChartParam(prefix, { value_column: e.target.value || null })}
            options={numericCols.map((c) => [c.name, c.name] as [string, string])}
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
            onChange={(e: ChangeEvent<HTMLSelectElement>) => dispatchChartParam(prefix, { subgroup_column: e.target.value || null })}
            options={[
              ["", "Individual (n=1)"] as [string, string],
              ...allNonValue.map((c) => [c.name, c.name] as [string, string]),
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
            onChange={(e: ChangeEvent<HTMLSelectElement>) => dispatchChartParam(prefix, { phase_column: e.target.value || null })}
            options={[["", "No phases"] as [string, string], ...allNonValue.map((c) => [c.name, c.name] as [string, string])]}
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
            onChange={(e: ChangeEvent<HTMLSelectElement>) => dispatchChartParam(prefix, { chart_type: e.target.value || null })}
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
            {NELSON_RULES.map(([id, ruleLabel]: [number, string]) => (
              <label key={id} className="chip-test-toggle" onClick={(e: ReactMouseEvent) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    const ruleId = id;
                    if (prefix === "_pending") {
                      spcStore.setState((s: SPCState) => {
                        const current = (s.ui.pendingNewChart as unknown as ChartParams).nelson_tests || [];
                        const nextRules = e.target.checked ? [...current, ruleId] : current.filter((r: number) => r !== ruleId);
                        return { ...s, ui: { ...s.ui, pendingNewChart: { ...s.ui.pendingNewChart, nelson_tests: nextRules } } };
                      });
                    } else {
                      spcStore.setState((s: SPCState) => {
                        const current = s.charts[prefix].params.nelson_tests || [];
                        const nextRules = e.target.checked ? [...current, ruleId] : current.filter((r: number) => r !== ruleId);
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

  return chips.map((chip: ChipDef) => {
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
