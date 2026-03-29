"""Analysis service — orchestrates algo/ calls from API parameters."""
from __future__ import annotations

import json

import numpy as np
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from algo import (
    evaluate_rules,
    RuleConfig,
    compute_imr,
    IMRConfig,
    compute_xbar_r,
    XBarRConfig,
    compute_xbar_s,
    XBarSConfig,
    compute_levey_jennings,
    LeveyJenningsConfig,
    compute_ewma,
    EWMAConfig,
    compute_cusum,
    CUSUMConfig,
    p_chart,
    PChartConfig,
    np_chart,
    NPChartConfig,
    c_chart,
    CChartConfig,
    u_chart,
    UChartConfig,
    laney_p_chart,
    LaneyPConfig,
    laney_u_chart,
    LaneyUConfig,
    compute_r_chart,
    RChartConfig,
    compute_s_chart,
    SChartConfig,
    compute_mr_chart,
    MRChartConfig,
    compute_run_chart,
    RunChartConfig,
    compute_g_chart,
    GChartConfig,
    compute_t_chart,
    TChartConfig,
    compute_three_way,
    ThreeWayConfig,
    compute_short_run,
    ShortRunConfig,
    compute_presummarize,
    PresummarizeConfig,
    compute_cusum_vmask,
    CUSUMVMaskConfig,
    compute_hotelling_t2,
    HotellingT2Config,
    compute_mewma,
    MEWMAConfig,
)
from algo.common.enums import BetweenMethod, ScalingMethod, SigmaMethod, WithinMethod
from algo.common.sigma import (
    sigma_from_levey_jennings,
    sigma_from_median_moving_range,
    sigma_from_moving_range,
    sigma_from_ranges,
    sigma_from_stddevs,
)
from algo.common.types import ControlLimits, ZoneBreakdown
from algo.common.zones import compute_zones
from algo.capability import compute_capability

from ..models import Analysis, DatasetColumn, Measurement
from ..schemas import (
    AnalysisRequest,
    AnalysisResult,
    CapabilityOut,
    LimitsOut,
    PhaseResult,
    RuleViolationOut,
    SigmaOut,
    ZonesOut,
)


VALID_CHART_TYPES = {
    "imr", "xbar_r", "xbar_s", "r", "s", "mr",
    "p", "np", "c", "u", "laney_p", "laney_u",
    "cusum", "ewma", "levey_jennings",
    "three_way", "short_run", "g", "t",
    "run", "presummarize", "cusum_vmask",
    "hotelling_t2", "mewma",
}

SIGMA_DISPATCHERS = {
    "moving_range": SigmaMethod.MOVING_RANGE,
    "median_moving_range": SigmaMethod.MEDIAN_MOVING_RANGE,
    "levey_jennings": SigmaMethod.LEVEY_JENNINGS,
    "range": SigmaMethod.RANGE,
    "stddev": SigmaMethod.STDDEV,
}


def _group_by_subgroup(
    measurements: list[Measurement],
    subgroup_column: str | None = None,
) -> tuple[list[str], dict[str, list[float]]]:
    """Group measurements by subgroup preserving order.

    Resolves subgroup key from: (1) explicit subgroup_column in raw_json,
    (2) Measurement.subgroup field, (3) DEFAULT_SUBGROUP_KEY fallback.

    Returns (ordered_keys, groups_dict) where groups_dict maps key -> list of values.
    """
    groups: dict[str, list[float]] = {}
    ordered_keys: list[str] = []
    for m in measurements:
        if subgroup_column:
            raw = json.loads(m.raw_json) if m.raw_json else {}
            key = str(raw.get(subgroup_column) or m.subgroup or DEFAULT_SUBGROUP_KEY)
        else:
            key = m.subgroup or DEFAULT_SUBGROUP_KEY
        if key not in groups:
            groups[key] = []
            ordered_keys.append(key)
        groups[key].append(m.value)
    return ordered_keys, groups


def _build_subgroup_arrays(
    ordered_keys: list[str], groups: dict[str, list[float]],
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Compute per-subgroup stats from grouped data.

    Returns (subgroup_means, subgroup_ranges, subgroup_stddevs, subgroup_sizes).
    """
    means, ranges, stddevs, sizes = [], [], [], []
    for key in ordered_keys:
        arr = np.array(groups[key])
        n = len(arr)
        means.append(float(np.mean(arr)))
        ranges.append(float(np.ptp(arr)) if n >= 2 else 0.0)
        stddevs.append(float(np.std(arr, ddof=1)) if n >= 2 else 0.0)
        sizes.append(n)
    return (
        np.array(means),
        np.array(ranges),
        np.array(stddevs),
        np.array(sizes, dtype=int),
    )


def _split_by_phase(
    measurements: list[Measurement],
    phase_column: str | None,
) -> list[tuple[str, list[Measurement]]]:
    """Split measurements into phase groups by unique phase value.

    When a Phase variable is assigned, all measurements sharing the same phase
    value are grouped together (regardless of data ordering).  Each phase gets
    independently computed control limits.

    Returns list of (phase_id, measurements) tuples in encounter order.
    """
    if not phase_column:
        return [("all", measurements)]

    groups: dict[str, list[Measurement]] = {}
    ordered_keys: list[str] = []

    for m in measurements:
        raw = json.loads(m.raw_json) if m.raw_json else {}
        phase_val = str(raw.get(phase_column) or DEFAULT_SUBGROUP_KEY)

        if phase_val not in groups:
            groups[phase_val] = []
            ordered_keys.append(phase_val)
        groups[phase_val].append(m)

    return [(key, groups[key]) for key in ordered_keys]


def _has_subgroups(measurements: list[Measurement]) -> bool:
    """Check whether measurements have meaningful subgroup labels."""
    return any(m.subgroup is not None for m in measurements)


def _run_rule_evaluation(
    chart_values: np.ndarray,
    limits: ControlLimits,
    zones: ZoneBreakdown,
    request: AnalysisRequest,
) -> list[RuleViolationOut]:
    """Evaluate Nelson/Westgard rules and return violation output models."""
    rule_config = RuleConfig(
        nelson_tests=tuple(request.nelson_tests),
        westgard_rules=tuple(request.westgard_rules),
    )
    violations_raw = evaluate_rules(
        values=chart_values,
        limits=limits,
        zones=zones,
        config=rule_config,
    )
    return [
        RuleViolationOut(
            test_id=str(v.test_id),
            point_indices=v.point_indices.tolist(),
            description=v.description,
        )
        for v in violations_raw
    ]


def _limits_to_lists(ctrl_limits: ControlLimits) -> tuple[list[float], list[float], list[float]]:
    """Convert ControlLimits numpy arrays to Python lists."""
    return (
        ctrl_limits.ucl.tolist(),
        ctrl_limits.cl.tolist(),
        ctrl_limits.lcl.tolist(),
    )


_IMR_COMPATIBLE_METHODS = {"moving_range", "median_moving_range"}


def _dispatch_imr(
    values: np.ndarray, request: AnalysisRequest,
    measurements: list[Measurement] | None = None,
) -> tuple[
    np.ndarray, list[float], list[float], list[float], float,
    SigmaOut, ZoneBreakdown,
]:
    """IMR chart dispatch. Returns (chart_values, ucl, cl, lcl, k_sigma, sigma_out, zones).

    For IMR-compatible sigma methods (moving_range, median_moving_range), delegates
    fully to compute_imr. For other sigma methods (levey_jennings, range, stddev),
    falls back to manual sigma estimation + limit computation for backward compat.
    """
    method_key = request.sigma_method.lower()
    if method_key not in SIGMA_DISPATCHERS:
        raise ValueError(
            f"Unknown sigma method '{request.sigma_method}'. "
            f"Choose from: {', '.join(SIGMA_DISPATCHERS)}"
        )

    if method_key in _IMR_COMPATIBLE_METHODS:
        # Full IMR computation
        sigma_method = SIGMA_DISPATCHERS[method_key]
        result = compute_imr(values, IMRConfig(k_sigma=request.k_sigma, sigma_method=sigma_method))

        ucl, cl, lcl = _limits_to_lists(result.i_limits)
        sigma_out = SigmaOut(
            sigma_hat=result.sigma.sigma_hat,
            method=result.sigma.method.value,
            n_used=result.sigma.n_used,
        )
        return (result.individuals, ucl, cl, lcl, result.i_limits.k_sigma,
                sigma_out, result.zones)
    else:
        # Non-IMR sigma methods: manual sigma + limits (backward compat path)
        chart_values = values

        if method_key == "levey_jennings":
            sigma_result = sigma_from_levey_jennings(values)
        elif method_key in ("range", "stddev"):
            if measurements is None:
                raise ValueError(
                    f"Sigma method '{method_key}' requires subgrouped data but "
                    "measurements were not provided."
                )
            ordered_keys, groups = _group_by_subgroup(measurements)
            sub_means, sub_ranges, sub_stddevs, sub_sizes = _build_subgroup_arrays(
                ordered_keys, groups,
            )
            mask = sub_sizes >= 2
            if not np.any(mask):
                raise ValueError(
                    f"Sigma method '{method_key}' requires subgroups with n >= 2, "
                    "but no qualifying subgroups were found."
                )
            if method_key == "range":
                sigma_result = sigma_from_ranges(sub_ranges[mask], sub_sizes[mask])
            else:
                sigma_result = sigma_from_stddevs(sub_stddevs[mask], sub_sizes[mask])
            chart_values = sub_means
        else:
            # Shouldn't reach here since we validated above
            sigma_result = sigma_from_moving_range(values)

        n = len(chart_values)
        cl_scalar = float(np.mean(chart_values))
        ucl_arr = [cl_scalar + request.k_sigma * sigma_result.sigma_hat] * n
        cl_arr = [cl_scalar] * n
        lcl_arr = [cl_scalar - request.k_sigma * sigma_result.sigma_hat] * n

        zone_breakdown = compute_zones(cl_scalar, sigma_result.sigma_hat)

        sigma_out = SigmaOut(
            sigma_hat=sigma_result.sigma_hat,
            method=sigma_result.method.value,
            n_used=sigma_result.n_used,
        )

        return (chart_values, ucl_arr, cl_arr, lcl_arr, request.k_sigma,
                sigma_out, zone_breakdown)


def _dispatch_xbar_r(
    measurements: list[Measurement], request: AnalysisRequest,
) -> tuple[
    np.ndarray, list[float], list[float], list[float], float,
    SigmaOut, ZoneBreakdown,
]:
    """XBar-R chart dispatch."""
    ordered_keys, groups = _group_by_subgroup(measurements)
    # Build flat data array and subgroup_sizes for the algo
    flat_data = []
    subgroup_sizes = []
    for key in ordered_keys:
        flat_data.extend(groups[key])
        subgroup_sizes.append(len(groups[key]))

    result = compute_xbar_r(
        np.array(flat_data),
        np.array(subgroup_sizes, dtype=int),
        XBarRConfig(k_sigma=request.k_sigma),
    )

    ucl, cl, lcl = _limits_to_lists(result.xbar_limits)
    sigma_out = SigmaOut(
        sigma_hat=result.sigma.sigma_hat,
        method=result.sigma.method.value,
        n_used=result.sigma.n_used,
    )
    return (result.subgroup_means, ucl, cl, lcl, result.xbar_limits.k_sigma,
            sigma_out, result.zones)


def _dispatch_xbar_s(
    measurements: list[Measurement], request: AnalysisRequest,
) -> tuple[
    np.ndarray, list[float], list[float], list[float], float,
    SigmaOut, ZoneBreakdown,
]:
    """XBar-S chart dispatch."""
    ordered_keys, groups = _group_by_subgroup(measurements)
    flat_data = []
    subgroup_sizes = []
    for key in ordered_keys:
        flat_data.extend(groups[key])
        subgroup_sizes.append(len(groups[key]))

    result = compute_xbar_s(
        np.array(flat_data),
        np.array(subgroup_sizes, dtype=int),
        XBarSConfig(k_sigma=request.k_sigma),
    )

    ucl, cl, lcl = _limits_to_lists(result.xbar_limits)
    sigma_out = SigmaOut(
        sigma_hat=result.sigma.sigma_hat,
        method=result.sigma.method.value,
        n_used=result.sigma.n_used,
    )
    return (result.subgroup_means, ucl, cl, lcl, result.xbar_limits.k_sigma,
            sigma_out, result.zones)


def _dispatch_levey_jennings(
    values: np.ndarray, request: AnalysisRequest,
) -> tuple[
    np.ndarray, list[float], list[float], list[float], float,
    SigmaOut, ZoneBreakdown,
]:
    """Levey-Jennings chart dispatch."""
    result = compute_levey_jennings(values, LeveyJenningsConfig(k_sigma=request.k_sigma))
    ucl, cl, lcl = _limits_to_lists(result.limits)
    sigma_out = SigmaOut(
        sigma_hat=result.sigma.sigma_hat,
        method=result.sigma.method.value,
        n_used=result.sigma.n_used,
    )
    return (result.values, ucl, cl, lcl, result.limits.k_sigma,
            sigma_out, result.zones)


def _dispatch_attribute_chart(
    chart_type: str, measurements: list[Measurement], request: AnalysisRequest,
) -> tuple[
    np.ndarray, list[float], list[float], list[float], float,
    SigmaOut, ZoneBreakdown,
]:
    """Dispatch for attribute charts (p, np, c, u, laney_p, laney_u)."""
    ordered_keys, groups = _group_by_subgroup(measurements)

    # For attribute charts: defectives/defects = sum per subgroup, n_trials/n_units = subgroup size
    defectives = np.array([sum(groups[k]) for k in ordered_keys])
    if request.n_trials is not None:
        n_trials = np.full(len(ordered_keys), float(request.n_trials))
    else:
        n_trials = np.array([len(groups[k]) for k in ordered_keys], dtype=float)

    configs_and_funcs = {
        "p": (PChartConfig(k_sigma=request.k_sigma), p_chart),
        "np": (NPChartConfig(k_sigma=request.k_sigma), np_chart),
        "c": (CChartConfig(k_sigma=request.k_sigma), c_chart),
        "u": (UChartConfig(k_sigma=request.k_sigma), u_chart),
        "laney_p": (LaneyPConfig(k_sigma=request.k_sigma), laney_p_chart),
        "laney_u": (LaneyUConfig(k_sigma=request.k_sigma), laney_u_chart),
    }

    config, func = configs_and_funcs[chart_type]
    result = func(defectives, n_trials, config)

    ucl, cl, lcl = _limits_to_lists(result.limits)

    # Get chart values (proportions, counts, or rates depending on chart type)
    if hasattr(result, "proportions"):
        chart_values = result.proportions
    elif hasattr(result, "rates"):
        chart_values = result.rates
    elif hasattr(result, "counts"):
        chart_values = result.counts
    else:
        chart_values = defectives  # fallback

    # Sigma for attribute charts is per-point (numpy array)
    sigma_arr = result.sigma
    sigma_hat = float(np.mean(sigma_arr)) if isinstance(sigma_arr, np.ndarray) else float(sigma_arr)

    sigma_out = SigmaOut(
        sigma_hat=sigma_hat,
        method=chart_type,
        n_used=len(ordered_keys),
    )

    # Build zones from the average limits
    avg_cl = float(np.mean(result.limits.cl))
    zone_breakdown = compute_zones(avg_cl, sigma_hat)

    return (chart_values, ucl, cl, lcl, result.limits.k_sigma,
            sigma_out, zone_breakdown)


def _dispatch_ewma(
    values: np.ndarray, request: AnalysisRequest,
    measurements: list[Measurement] | None = None,
) -> tuple[
    np.ndarray, list[float], list[float], list[float], float,
    SigmaOut, ZoneBreakdown,
]:
    """EWMA chart dispatch.

    When measurements have subgroup labels, uses subgroup means as the charted
    values and passes subgroup_sizes to compute_ewma for proper limit adjustment
    (JMP convention: sigma estimated from MR of subgroup means).
    """
    subgroup_sizes = None
    chart_values = values

    if measurements and _has_subgroups(measurements):
        ordered_keys, groups = _group_by_subgroup(measurements)
        sub_means, _, _, sub_sizes = _build_subgroup_arrays(ordered_keys, groups)
        chart_values = sub_means
        subgroup_sizes = sub_sizes

    target = request.target if request.target is not None else float(np.mean(chart_values))
    sigma_est = sigma_from_moving_range(chart_values)

    result = compute_ewma(
        chart_values,
        EWMAConfig(
            target=target,
            sigma=sigma_est.sigma_hat,
            lambda_=request.lambda_ if request.lambda_ is not None else 0.2,
            k_sigma=request.k_sigma,
        ),
        subgroup_sizes=subgroup_sizes,
    )

    ucl = result.ucl.tolist()
    cl = result.center.tolist()
    lcl = result.lcl.tolist()

    sigma_out = SigmaOut(
        sigma_hat=sigma_est.sigma_hat,
        method="moving_range",
        n_used=sigma_est.n_used,
    )

    avg_cl = float(np.mean(result.center))
    zone_breakdown = compute_zones(avg_cl, sigma_est.sigma_hat)

    return (result.ewma, ucl, cl, lcl, request.k_sigma,
            sigma_out, zone_breakdown)


def _dispatch_cusum(
    values: np.ndarray, request: AnalysisRequest,
    measurements: list[Measurement] | None = None,
) -> tuple[
    np.ndarray, list[float], list[float], list[float], float,
    SigmaOut, ZoneBreakdown,
]:
    """CUSUM chart dispatch.

    When measurements have subgroup labels, charts subgroup means (JMP convention).
    Sigma is estimated from MR of subgroup means.
    """
    chart_values = values

    if measurements and _has_subgroups(measurements):
        ordered_keys, groups = _group_by_subgroup(measurements)
        sub_means, _, _, _ = _build_subgroup_arrays(ordered_keys, groups)
        chart_values = sub_means

    target = request.target if request.target is not None else float(np.mean(chart_values))
    sigma_est = sigma_from_moving_range(chart_values)

    result = compute_cusum(
        chart_values,
        CUSUMConfig(
            target=target,
            sigma=sigma_est.sigma_hat,
            h=request.h if request.h is not None else 5.0,
            k=request.k_slack if request.k_slack is not None else 0.5,
        ),
    )

    n = len(chart_values)
    ucl = [float(result.upper_limit)] * n
    cl = [0.0] * n
    lcl = [float(-result.lower_limit)] * n

    sigma_out = SigmaOut(
        sigma_hat=sigma_est.sigma_hat,
        method="moving_range",
        n_used=sigma_est.n_used,
    )

    zone_breakdown = compute_zones(0.0, sigma_est.sigma_hat)

    return (result.c_plus, ucl, cl, lcl, request.k_sigma,
            sigma_out, zone_breakdown)


def _dispatch_r_chart(
    measurements: list[Measurement], request: AnalysisRequest,
) -> tuple[
    np.ndarray, list[float], list[float], list[float], float,
    SigmaOut, ZoneBreakdown,
]:
    """R (Range) chart dispatch."""
    ordered_keys, groups = _group_by_subgroup(measurements)
    flat_data = []
    subgroup_sizes = []
    for key in ordered_keys:
        flat_data.extend(groups[key])
        subgroup_sizes.append(len(groups[key]))

    result = compute_r_chart(
        np.array(flat_data),
        np.array(subgroup_sizes, dtype=int),
        RChartConfig(k_sigma=request.k_sigma),
    )

    ucl, cl, lcl = _limits_to_lists(result.limits)
    sigma_out = SigmaOut(
        sigma_hat=result.sigma.sigma_hat,
        method=result.sigma.method.value,
        n_used=result.sigma.n_used,
    )
    return (result.subgroup_ranges, ucl, cl, lcl, result.limits.k_sigma,
            sigma_out, result.zones)


def _dispatch_s_chart(
    measurements: list[Measurement], request: AnalysisRequest,
) -> tuple[
    np.ndarray, list[float], list[float], list[float], float,
    SigmaOut, ZoneBreakdown,
]:
    """S (Standard Deviation) chart dispatch."""
    ordered_keys, groups = _group_by_subgroup(measurements)
    flat_data = []
    subgroup_sizes = []
    for key in ordered_keys:
        flat_data.extend(groups[key])
        subgroup_sizes.append(len(groups[key]))

    result = compute_s_chart(
        np.array(flat_data),
        np.array(subgroup_sizes, dtype=int),
        SChartConfig(k_sigma=request.k_sigma),
    )

    ucl, cl, lcl = _limits_to_lists(result.limits)
    sigma_out = SigmaOut(
        sigma_hat=result.sigma.sigma_hat,
        method=result.sigma.method.value,
        n_used=result.sigma.n_used,
    )
    return (result.subgroup_stddevs, ucl, cl, lcl, result.limits.k_sigma,
            sigma_out, result.zones)


def _dispatch_mr_chart(
    values: np.ndarray, request: AnalysisRequest,
) -> tuple[
    np.ndarray, list[float], list[float], list[float], float,
    SigmaOut, ZoneBreakdown,
]:
    """MR (Moving Range) chart dispatch."""
    result = compute_mr_chart(values, MRChartConfig(k_sigma=request.k_sigma))

    ucl, cl, lcl = _limits_to_lists(result.limits)
    sigma_out = SigmaOut(
        sigma_hat=result.sigma.sigma_hat,
        method=result.sigma.method.value,
        n_used=result.sigma.n_used,
    )
    return (result.moving_ranges, ucl, cl, lcl, result.limits.k_sigma,
            sigma_out, result.zones)


def _dispatch_presummarize(
    measurements: list[Measurement], request: AnalysisRequest,
) -> tuple[
    np.ndarray, list[float], list[float], list[float], float,
    SigmaOut, ZoneBreakdown,
]:
    """Presummarize chart dispatch. Requires target and sigma in request."""
    if request.target is None or request.sigma is None:
        raise ValueError(
            "Presummarize chart requires 'target' and 'sigma' parameters."
        )

    ordered_keys, groups = _group_by_subgroup(measurements)
    flat_data = []
    subgroup_sizes = []
    for key in ordered_keys:
        flat_data.extend(groups[key])
        subgroup_sizes.append(len(groups[key]))

    result = compute_presummarize(
        np.array(flat_data),
        subgroup_sizes,
        PresummarizeConfig(
            target=request.target,
            sigma=request.sigma,
            k_sigma=request.k_sigma,
            summary_stat=request.summary_stat or "mean",
        ),
    )

    ucl, cl, lcl = _limits_to_lists(result.limits)
    sigma_out = SigmaOut(
        sigma_hat=result.sigma.sigma_hat,
        method=result.sigma.method.value,
        n_used=result.sigma.n_used,
    )
    return (result.summary_values, ucl, cl, lcl, result.limits.k_sigma,
            sigma_out, result.zones)


def _dispatch_g_chart(
    values: np.ndarray, request: AnalysisRequest,
) -> tuple[
    np.ndarray, list[float], list[float], list[float], float,
    SigmaOut, ZoneBreakdown,
]:
    """G chart dispatch."""
    result = compute_g_chart(values, GChartConfig(k_sigma=request.k_sigma))

    ucl, cl, lcl = _limits_to_lists(result.limits)
    avg_cl = float(np.mean(result.limits.cl))
    avg_ucl = float(np.mean(result.limits.ucl))
    avg_lcl = float(np.mean(result.limits.lcl))
    # Use the larger of (UCL - CL) or (CL - LCL) for sigma, since G chart
    # limits can be asymmetric (LCL often floored at 0).
    spread = max(abs(avg_ucl - avg_cl), abs(avg_cl - avg_lcl))
    sigma_hat = spread / request.k_sigma if request.k_sigma else 1.0
    sigma_hat = max(sigma_hat, 1e-10)  # guard against zero

    sigma_out = SigmaOut(sigma_hat=sigma_hat, method="g_chart", n_used=len(values))
    zone_breakdown = compute_zones(avg_cl, sigma_hat)

    return (result.values, ucl, cl, lcl, result.limits.k_sigma,
            sigma_out, zone_breakdown)


def _dispatch_t_chart(
    values: np.ndarray, request: AnalysisRequest,
) -> tuple[
    np.ndarray, list[float], list[float], list[float], float,
    SigmaOut, ZoneBreakdown,
]:
    """T chart dispatch."""
    result = compute_t_chart(values, TChartConfig(k_sigma=request.k_sigma))

    ucl, cl, lcl = _limits_to_lists(result.limits)
    avg_cl = float(np.mean(result.limits.cl))
    avg_ucl = float(np.mean(result.limits.ucl))
    avg_lcl = float(np.mean(result.limits.lcl))
    spread = max(abs(avg_ucl - avg_cl), abs(avg_cl - avg_lcl))
    sigma_hat = spread / request.k_sigma if request.k_sigma else 1.0
    sigma_hat = max(sigma_hat, 1e-10)

    sigma_out = SigmaOut(sigma_hat=sigma_hat, method="t_chart", n_used=len(values))
    zone_breakdown = compute_zones(avg_cl, sigma_hat)

    return (result.values, ucl, cl, lcl, result.limits.k_sigma,
            sigma_out, zone_breakdown)


def _dispatch_three_way(
    measurements: list[Measurement], request: AnalysisRequest,
) -> tuple[
    np.ndarray, list[float], list[float], list[float], float,
    SigmaOut, ZoneBreakdown,
]:
    """Three-Way chart dispatch. Returns between-subgroup chart as primary."""
    ordered_keys, groups = _group_by_subgroup(measurements)
    subgroups = [np.array(groups[k]) for k in ordered_keys]

    within = WithinMethod.RANGE
    if request.within_method and request.within_method.lower() == "stddev":
        within = WithinMethod.STDDEV

    result = compute_three_way(
        subgroups,
        ThreeWayConfig(
            within_method=within,
            between_method=BetweenMethod.MOVING_RANGE,
            k_sigma=request.k_sigma,
        ),
    )

    ucl, cl, lcl = _limits_to_lists(result.between_chart)
    sigma_out = SigmaOut(
        sigma_hat=result.sigma_bw, method="three_way", n_used=len(subgroups),
    )
    zone_breakdown = compute_zones(float(np.mean(result.between_chart.cl)), result.sigma_bw)

    return (result.subgroup_means, ucl, cl, lcl, result.between_chart.k_sigma,
            sigma_out, zone_breakdown)


def _dispatch_short_run(
    measurements: list[Measurement], request: AnalysisRequest,
) -> tuple[
    np.ndarray, list[float], list[float], list[float], float,
    SigmaOut, ZoneBreakdown,
]:
    """Short Run chart dispatch. Uses subgroup field as product ID."""
    values = np.array([m.value for m in measurements], dtype=float)
    product_ids = np.array([m.subgroup or DEFAULT_SUBGROUP_KEY for m in measurements])

    scaling = ScalingMethod.CENTERED
    if request.scaling and request.scaling.lower() == "standardized":
        scaling = ScalingMethod.STANDARDIZED

    result = compute_short_run(
        values,
        product_ids,
        ShortRunConfig(scaling=scaling, k_sigma=request.k_sigma),
    )

    ucl, cl, lcl = _limits_to_lists(result.limits)
    sigma_hat = float(result.sigma)
    sigma_out = SigmaOut(sigma_hat=sigma_hat, method="short_run", n_used=len(values))
    avg_cl = float(np.mean(result.limits.cl))
    zone_breakdown = compute_zones(avg_cl, sigma_hat)

    return (result.transformed_values, ucl, cl, lcl, result.limits.k_sigma,
            sigma_out, zone_breakdown)


def _dispatch_run_chart(
    values: np.ndarray, request: AnalysisRequest,
) -> tuple[
    np.ndarray, list[float], list[float], list[float], float,
    SigmaOut, ZoneBreakdown,
]:
    """Run chart dispatch. No control limits — returns flat center line."""
    center_method = request.center_method or "median"
    result = compute_run_chart(values, RunChartConfig(center_method=center_method))

    n = len(values)
    cl_arr = [result.center] * n
    # Run charts have no control limits; use wide sentinel limits so rule
    # evaluation doesn't produce false violations.
    sigma_est = sigma_from_moving_range(values)
    sigma_hat = sigma_est.sigma_hat if sigma_est.sigma_hat > 0 else 1.0
    ucl_arr = [result.center + request.k_sigma * sigma_hat] * n
    lcl_arr = [result.center - request.k_sigma * sigma_hat] * n

    sigma_out = SigmaOut(sigma_hat=sigma_hat, method="run_chart", n_used=n)
    zone_breakdown = compute_zones(result.center, sigma_hat)

    return (result.values, ucl_arr, cl_arr, lcl_arr, request.k_sigma,
            sigma_out, zone_breakdown)


def _dispatch_cusum_vmask(
    values: np.ndarray, request: AnalysisRequest,
    measurements: list[Measurement] | None = None,
) -> tuple[
    np.ndarray, list[float], list[float], list[float], float,
    SigmaOut, ZoneBreakdown,
]:
    """CUSUM V-Mask chart dispatch.

    When measurements have subgroup labels, charts subgroup means.
    """
    chart_values = values

    if measurements and _has_subgroups(measurements):
        ordered_keys, groups = _group_by_subgroup(measurements)
        sub_means, _, _, _ = _build_subgroup_arrays(ordered_keys, groups)
        chart_values = sub_means

    target = request.target if request.target is not None else float(np.mean(chart_values))
    sigma_est = sigma_from_moving_range(chart_values)
    sigma_val = request.sigma if request.sigma is not None else sigma_est.sigma_hat

    result = compute_cusum_vmask(
        chart_values,
        CUSUMVMaskConfig(
            target=target,
            sigma=sigma_val,
            h=request.h if request.h is not None else 5.0,
            k=request.k_slack if request.k_slack is not None else 0.5,
            d_units=request.d_units if request.d_units is not None else 1.0,
        ),
    )

    n = len(chart_values)
    h_val = request.h if request.h is not None else 5.0
    ucl = [h_val] * n
    cl = [0.0] * n
    lcl = [-h_val] * n

    sigma_out = SigmaOut(
        sigma_hat=sigma_est.sigma_hat, method="moving_range", n_used=sigma_est.n_used,
    )
    zone_breakdown = compute_zones(0.0, sigma_est.sigma_hat)

    return (result.cumulative_sums, ucl, cl, lcl, request.k_sigma,
            sigma_out, zone_breakdown)


def _extract_multivariate(measurements: list[Measurement]) -> np.ndarray:
    """Extract 2-D multivariate data from raw_json on each Measurement."""
    rows = []
    for m in measurements:
        raw = json.loads(m.raw_json) if m.raw_json else {}
        if "variables" in raw:
            rows.append(raw["variables"])
        else:
            raise ValueError(
                "Multivariate charts require a 'variables' list in each "
                "measurement's raw_data (e.g. {\"variables\": [1.0, 2.0, 3.0]})."
            )
    return np.array(rows, dtype=float)


def _dispatch_hotelling_t2(
    measurements: list[Measurement], request: AnalysisRequest,
) -> tuple[
    np.ndarray, list[float], list[float], list[float], float,
    SigmaOut, ZoneBreakdown,
]:
    """Hotelling T-squared chart dispatch."""
    data_2d = _extract_multivariate(measurements)

    result = compute_hotelling_t2(
        data_2d,
        HotellingT2Config(
            alpha=request.alpha if request.alpha is not None else 0.0027,
            phase=request.phase if request.phase is not None else 1,
        ),
    )

    n = len(result.t2_values)
    ucl = [float(result.ucl)] * n
    cl = [0.0] * n
    lcl = [0.0] * n

    sigma_hat = float(result.ucl) / request.k_sigma if request.k_sigma else 1.0
    sigma_out = SigmaOut(sigma_hat=sigma_hat, method="hotelling_t2", n_used=n)
    zone_breakdown = compute_zones(0.0, sigma_hat)

    return (result.t2_values, ucl, cl, lcl, request.k_sigma,
            sigma_out, zone_breakdown)


def _dispatch_mewma(
    measurements: list[Measurement], request: AnalysisRequest,
) -> tuple[
    np.ndarray, list[float], list[float], list[float], float,
    SigmaOut, ZoneBreakdown,
]:
    """MEWMA chart dispatch."""
    data_2d = _extract_multivariate(measurements)

    result = compute_mewma(
        data_2d,
        MEWMAConfig(
            lambda_=request.lambda_ if request.lambda_ is not None else 0.2,
            alpha=request.alpha if request.alpha is not None else 0.0027,
        ),
    )

    n = len(result.t2_values)
    ucl = [float(result.ucl)] * n
    cl = [0.0] * n
    lcl = [0.0] * n

    sigma_hat = float(result.ucl) / request.k_sigma if request.k_sigma else 1.0
    sigma_out = SigmaOut(sigma_hat=sigma_hat, method="mewma", n_used=n)
    zone_breakdown = compute_zones(0.0, sigma_hat)

    return (result.t2_values, ucl, cl, lcl, request.k_sigma,
            sigma_out, zone_breakdown)


_NO_CAPABILITY_TYPES = {"hotelling_t2", "mewma", "run"}


def _dispatch_chart(
    chart_type: str,
    phase_measurements: list[Measurement],
    request: AnalysisRequest,
    value_column: str | None = None,
    subgroup_column: str | None = None,
) -> tuple[
    np.ndarray, list[float], list[float], list[float], float,
    SigmaOut, ZoneBreakdown,
]:
    """Dispatch to the appropriate chart-type algorithm for one phase group.

    When value_column or subgroup_column is set, overrides m.value / m.subgroup
    from raw_json before dispatching, so all downstream functions see the right data.
    """
    for m in phase_measurements:
        raw = json.loads(m.raw_json) if m.raw_json else {}
        if value_column:
            val = raw.get(value_column)
            if val is not None:
                m.value = float(val)
        if subgroup_column:
            sg_val = raw.get(subgroup_column)
            if sg_val is not None:
                m.subgroup = str(sg_val)
            elif not m.subgroup:
                m.subgroup = None

    values = np.array([m.value for m in phase_measurements], dtype=float)

    if chart_type == "imr":
        return _dispatch_imr(values, request, phase_measurements)
    elif chart_type == "xbar_r":
        return _dispatch_xbar_r(phase_measurements, request)
    elif chart_type == "xbar_s":
        return _dispatch_xbar_s(phase_measurements, request)
    elif chart_type == "levey_jennings":
        return _dispatch_levey_jennings(values, request)
    elif chart_type in ("p", "np", "c", "u", "laney_p", "laney_u"):
        return _dispatch_attribute_chart(chart_type, phase_measurements, request)
    elif chart_type == "ewma":
        return _dispatch_ewma(values, request, measurements=phase_measurements)
    elif chart_type == "cusum":
        return _dispatch_cusum(values, request, measurements=phase_measurements)
    elif chart_type == "r":
        return _dispatch_r_chart(phase_measurements, request)
    elif chart_type == "s":
        return _dispatch_s_chart(phase_measurements, request)
    elif chart_type == "mr":
        return _dispatch_mr_chart(values, request)
    elif chart_type == "presummarize":
        return _dispatch_presummarize(phase_measurements, request)
    elif chart_type == "g":
        return _dispatch_g_chart(values, request)
    elif chart_type == "t":
        return _dispatch_t_chart(values, request)
    elif chart_type == "three_way":
        return _dispatch_three_way(phase_measurements, request)
    elif chart_type == "short_run":
        return _dispatch_short_run(phase_measurements, request)
    elif chart_type == "run":
        return _dispatch_run_chart(values, request)
    elif chart_type == "cusum_vmask":
        return _dispatch_cusum_vmask(values, request, measurements=phase_measurements)
    elif chart_type == "hotelling_t2":
        return _dispatch_hotelling_t2(phase_measurements, request)
    elif chart_type == "mewma":
        return _dispatch_mewma(phase_measurements, request)
    else:
        raise ValueError(
            f"Chart type '{chart_type}' is recognized but not yet dispatched."
        )


# Chart types where each plotted point corresponds to a subgroup (not an individual measurement)
DEFAULT_SUBGROUP_KEY = "default"

# Chart types where plotted points are subgroup statistics (one per subgroup)
_SUBGROUPED_CHART_TYPES = {
    "xbar_r", "xbar_s", "r", "s",
    "p", "np", "c", "u", "laney_p", "laney_u",
    "three_way", "presummarize",
}


def _derive_chart_labels(
    chart_type: str,
    phase_measurements: list[Measurement],
    n_chart_values: int,
) -> list[str]:
    """Derive x-axis labels for chart values.

    For subgrouped charts: labels are subgroup keys (one per subgroup).
    For individual/derived charts: labels are sequential indices based on
    the number of chart values (which may differ from measurement count,
    e.g., MR chart has n-1 values for n measurements).
    """
    if chart_type in _SUBGROUPED_CHART_TYPES:
        # Subgrouped: collect unique subgroup keys in encounter order
        ordered_keys: list[str] = []
        seen: set[str] = set()
        for m in phase_measurements:
            key = m.subgroup or DEFAULT_SUBGROUP_KEY
            if key not in seen:
                ordered_keys.append(key)
                seen.add(key)
        return ordered_keys[:n_chart_values]
    else:
        # Individual/derived: sequential labels matching chart_values count.
        # Use measurement sequence indices when counts match, otherwise
        # generate 1-based indices (safe for MR, CUSUM, EWMA, etc.)
        if n_chart_values == len(phase_measurements):
            return [str(m.sequence_index) for m in phase_measurements]
        return [str(i + 1) for i in range(n_chart_values)]


def _analyze_one_phase(
    chart_type: str,
    phase_measurements: list[Measurement],
    request: AnalysisRequest,
    value_column: str | None = None,
    subgroup_column: str | None = None,
) -> tuple[
    np.ndarray, list[str], list[float], list[float], list[float], float,
    SigmaOut, ZoneBreakdown,
    list[RuleViolationOut], CapabilityOut | None,
]:
    """Run dispatch + rules + capability for a single phase group."""
    (chart_values, ucl_arr, cl_arr, lcl_arr, k_sigma,
     sigma_out, zone_breakdown) = _dispatch_chart(chart_type, phase_measurements, request, value_column, subgroup_column)

    # Derive x-axis labels from chart type and measurements
    chart_labels = _derive_chart_labels(chart_type, phase_measurements, len(chart_values))

    # Evaluate rules
    ctrl_limits = ControlLimits(
        ucl=np.array(ucl_arr),
        cl=np.array(cl_arr),
        lcl=np.array(lcl_arr),
        k_sigma=k_sigma,
    )
    violations = _run_rule_evaluation(chart_values, ctrl_limits, zone_breakdown, request)

    # Capability (optional)
    capability = None
    if (request.usl is not None and request.lsl is not None
            and chart_type not in _NO_CAPABILITY_TYPES):
        phase_values = np.array([m.value for m in phase_measurements], dtype=float)
        cap_result = compute_capability(
            phase_values, sigma_out.sigma_hat, request.usl, request.lsl,
        )
        if cap_result is not None:
            capability = CapabilityOut(
                cp=cap_result.cp, cpk=cap_result.cpk,
                pp=cap_result.pp, ppk=cap_result.ppk,
            )

    return (chart_values, chart_labels, ucl_arr, cl_arr, lcl_arr, k_sigma,
            sigma_out, zone_breakdown, violations, capability)


async def run_analysis(
    session: AsyncSession,
    dataset_id: str,
    request: AnalysisRequest,
) -> AnalysisResult:
    """Run the full analysis pipeline on a dataset.

    Queries measurements, dispatches to the appropriate chart type algorithm,
    evaluates rules, computes capability (optional), and persists the result.

    When a phase_column is specified (or a column with role='phase' exists),
    data is split into contiguous phase groups and each phase gets independent
    limits (JMP convention).
    """
    # 0. Validate chart_type
    chart_type = request.chart_type.lower()
    if chart_type not in VALID_CHART_TYPES:
        raise ValueError(
            f"Unknown chart type '{request.chart_type}'. "
            f"Choose from: {', '.join(sorted(VALID_CHART_TYPES))}"
        )

    # 1. Fetch measurements
    stmt = (
        select(Measurement)
        .where(Measurement.dataset_id == dataset_id)
        .order_by(Measurement.sequence_index)
    )
    result = await session.execute(stmt)
    measurements = list(result.scalars().all())
    if not measurements:
        raise ValueError(f"No measurements found for dataset {dataset_id}")

    # 2. Derive column overrides — request params take priority over DB roles.
    #    value_column: which column to use as Y (overrides Measurement.value)
    #    subgroup_column: which column to group by (overrides Measurement.subgroup)
    #    phase_column: which column for phase splitting
    value_column = request.value_column
    subgroup_column = request.subgroup_column
    phase_column = request.phase_column

    # Fall back to DB column roles only when request params are not provided
    if not value_column or not subgroup_column or not phase_column:
        col_stmt = (
            select(DatasetColumn.name, DatasetColumn.role)
            .where(DatasetColumn.dataset_id == dataset_id)
            .where(DatasetColumn.role.in_(["value", "subgroup", "phase"]))
        )
        col_result = await session.execute(col_stmt)
        for name, role in col_result.all():
            if role == "value" and not value_column:
                value_column = name
            elif role == "subgroup" and not subgroup_column:
                subgroup_column = name
            elif role == "phase" and not phase_column:
                phase_column = name

    # 3. Split by phase
    phase_groups = _split_by_phase(measurements, phase_column)

    # 4. Analyze each phase
    all_ucl: list[float] = []
    all_cl: list[float] = []
    all_lcl: list[float] = []
    all_violations: list[RuleViolationOut] = []
    all_chart_values: list[float] = []
    all_chart_labels: list[str] = []
    phases: list[PhaseResult] = []
    running_offset = 0

    first_sigma_out: SigmaOut | None = None
    first_zone_breakdown: ZoneBreakdown | None = None
    first_k_sigma: float = request.k_sigma
    first_capability: CapabilityOut | None = None

    for phase_id, phase_meas in phase_groups:
        (chart_values, chart_labels, ucl_arr, cl_arr, lcl_arr, k_sigma,
         sigma_out, zone_breakdown, violations, capability) = _analyze_one_phase(
            chart_type, phase_meas, request, value_column, subgroup_column,
        )

        n_phase = len(chart_values)

        # Offset violation indices to global positions
        offset_violations = []
        for v in violations:
            offset_violations.append(RuleViolationOut(
                test_id=v.test_id,
                point_indices=[i + running_offset for i in v.point_indices],
                description=v.description,
            ))

        phases.append(PhaseResult(
            phase_id=phase_id,
            start_index=running_offset,
            end_index=running_offset + n_phase,
            sigma=sigma_out,
            limits=LimitsOut(ucl=ucl_arr, cl=cl_arr, lcl=lcl_arr, k_sigma=k_sigma),
            zones=ZonesOut(
                zone_a_upper=zone_breakdown.zone_a_upper,
                zone_b_upper=zone_breakdown.zone_b_upper,
                cl=zone_breakdown.cl,
                zone_b_lower=zone_breakdown.zone_b_lower,
                zone_a_lower=zone_breakdown.zone_a_lower,
            ),
            capability=capability,
            violations=offset_violations,
            chart_values=chart_values.tolist(),
            chart_labels=chart_labels,
        ))

        all_ucl.extend(ucl_arr)
        all_cl.extend(cl_arr)
        all_lcl.extend(lcl_arr)
        all_violations.extend(offset_violations)
        all_chart_values.extend(chart_values.tolist())
        all_chart_labels.extend(chart_labels)

        if first_sigma_out is None:
            first_sigma_out = sigma_out
            first_zone_breakdown = zone_breakdown
            first_k_sigma = k_sigma
            first_capability = capability

        running_offset += n_phase

    # 5. Persist (top-level uses first phase for backward compat)
    sigma_json = json.dumps({
        "sigma_hat": first_sigma_out.sigma_hat,
        "method": first_sigma_out.method,
        "n_used": first_sigma_out.n_used,
    })
    limits_json = json.dumps({
        "ucl": all_ucl,
        "cl": all_cl,
        "lcl": all_lcl,
        "k_sigma": first_k_sigma,
    })
    zones_json = json.dumps({
        "zone_a_upper": first_zone_breakdown.zone_a_upper,
        "zone_b_upper": first_zone_breakdown.zone_b_upper,
        "cl": first_zone_breakdown.cl,
        "zone_b_lower": first_zone_breakdown.zone_b_lower,
        "zone_a_lower": first_zone_breakdown.zone_a_lower,
    })
    capability_json = json.dumps(first_capability.model_dump()) if first_capability else None

    phases_json = json.dumps([p.model_dump() for p in phases]) if len(phases) > 1 else None

    analysis = Analysis(
        dataset_id=dataset_id,
        sigma_method=first_sigma_out.method,
        sigma=sigma_json,
        limits=limits_json,
        zones=zones_json,
        capability=capability_json,
    )
    session.add(analysis)
    await session.commit()
    await session.refresh(analysis)

    # 6. Build response
    return AnalysisResult(
        id=analysis.id,
        dataset_id=dataset_id,
        sigma=first_sigma_out,
        limits=LimitsOut(ucl=all_ucl, cl=all_cl, lcl=all_lcl, k_sigma=first_k_sigma),
        zones=ZonesOut(
            zone_a_upper=first_zone_breakdown.zone_a_upper,
            zone_b_upper=first_zone_breakdown.zone_b_upper,
            cl=first_zone_breakdown.cl,
            zone_b_lower=first_zone_breakdown.zone_b_lower,
            zone_a_lower=first_zone_breakdown.zone_a_lower,
        ),
        capability=first_capability,
        violations=all_violations,
        phases=phases if len(phases) > 1 else [],
        chart_values=all_chart_values,
        chart_labels=all_chart_labels,
        created_at=analysis.created_at.isoformat() if hasattr(analysis.created_at, "isoformat") else str(analysis.created_at),
    )
