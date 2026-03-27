"""Analysis service — orchestrates algo/ calls from API parameters."""
from __future__ import annotations

import json
from collections import defaultdict

import numpy as np
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from algo.common.enums import SigmaMethod
from algo.common.sigma import (
    sigma_from_levey_jennings,
    sigma_from_median_moving_range,
    sigma_from_moving_range,
    sigma_from_ranges,
    sigma_from_stddevs,
)
from algo.common.zones import compute_zones

from ..models import Analysis, Measurement
from ..schemas import (
    AnalysisRequest,
    AnalysisResult,
    CapabilityOut,
    LimitsOut,
    SigmaOut,
    ZonesOut,
)

SIGMA_DISPATCHERS = {
    "moving_range": SigmaMethod.MOVING_RANGE,
    "median_moving_range": SigmaMethod.MEDIAN_MOVING_RANGE,
    "levey_jennings": SigmaMethod.LEVEY_JENNINGS,
    "range": SigmaMethod.RANGE,
    "stddev": SigmaMethod.STDDEV,
}


def _group_by_subgroup(
    measurements: list[Measurement],
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Group measurements by subgroup and compute per-subgroup stats.

    Returns (subgroup_means, subgroup_ranges, subgroup_stddevs, subgroup_sizes).
    """
    groups: dict[str, list[float]] = defaultdict(list)
    for m in measurements:
        key = m.subgroup or "default"
        groups[key].append(m.value)

    means = []
    ranges = []
    stddevs = []
    sizes = []
    for values in groups.values():
        arr = np.array(values)
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


async def run_analysis(
    session: AsyncSession,
    dataset_id: str,
    request: AnalysisRequest,
) -> AnalysisResult:
    """Run the full analysis pipeline on a dataset.

    Queries measurements, estimates sigma via the requested method,
    computes control limits and zones, and optionally capability indices.
    Persists the result in the analyses table.
    """
    # 1. Fetch measurements
    stmt = (
        select(Measurement)
        .where(Measurement.dataset_id == dataset_id)
        .order_by(Measurement.sequence_index)
    )
    result = await session.execute(stmt)
    measurements = result.scalars().all()
    if not measurements:
        raise ValueError(f"No measurements found for dataset {dataset_id}")

    values = np.array([m.value for m in measurements], dtype=float)

    # 2. Estimate sigma
    method_key = request.sigma_method.lower()
    if method_key not in SIGMA_DISPATCHERS:
        raise ValueError(
            f"Unknown sigma method '{request.sigma_method}'. "
            f"Choose from: {', '.join(SIGMA_DISPATCHERS)}"
        )

    if method_key == "moving_range":
        sigma_result = sigma_from_moving_range(values)
    elif method_key == "median_moving_range":
        sigma_result = sigma_from_median_moving_range(values)
    elif method_key == "levey_jennings":
        sigma_result = sigma_from_levey_jennings(values)
    elif method_key in ("range", "stddev"):
        sub_means, sub_ranges, sub_stddevs, sub_sizes = _group_by_subgroup(measurements)
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
        values = sub_means

    # 3. Compute control limits
    cl_scalar = float(np.mean(values))
    n = len(values)
    ucl_arr = [cl_scalar + request.k_sigma * sigma_result.sigma_hat] * n
    cl_arr = [cl_scalar] * n
    lcl_arr = [cl_scalar - request.k_sigma * sigma_result.sigma_hat] * n

    # 4. Compute zones
    zone_breakdown = compute_zones(cl_scalar, sigma_result.sigma_hat)

    # 5. Capability (optional — requires spec limits)
    capability = None
    if request.usl is not None and request.lsl is not None:
        mean = cl_scalar
        sigma_hat = sigma_result.sigma_hat
        all_values = np.array([m.value for m in measurements], dtype=float)
        overall_std = float(np.std(all_values, ddof=1))

        if sigma_hat > 0 and overall_std > 0:
            cp = (request.usl - request.lsl) / (6 * sigma_hat)
            cpu = (request.usl - mean) / (3 * sigma_hat)
            cpl = (mean - request.lsl) / (3 * sigma_hat)
            cpk = min(cpu, cpl)
            pp = (request.usl - request.lsl) / (6 * overall_std)
            ppu = (request.usl - mean) / (3 * overall_std)
            ppl = (mean - request.lsl) / (3 * overall_std)
            ppk = min(ppu, ppl)
            capability = CapabilityOut(
                cp=round(cp, 4),
                cpk=round(cpk, 4),
                pp=round(pp, 4),
                ppk=round(ppk, 4),
            )

    # 6. Persist
    sigma_json = json.dumps({
        "sigma_hat": sigma_result.sigma_hat,
        "method": sigma_result.method.value,
        "n_used": sigma_result.n_used,
    })
    limits_json = json.dumps({"ucl": ucl_arr, "cl": cl_arr, "lcl": lcl_arr, "k_sigma": request.k_sigma})
    zones_json = json.dumps({
        "zone_a_upper": zone_breakdown.zone_a_upper,
        "zone_b_upper": zone_breakdown.zone_b_upper,
        "cl": zone_breakdown.cl,
        "zone_b_lower": zone_breakdown.zone_b_lower,
        "zone_a_lower": zone_breakdown.zone_a_lower,
    })
    capability_json = json.dumps(capability.model_dump()) if capability else None

    analysis = Analysis(
        dataset_id=dataset_id,
        sigma_method=sigma_result.method.value,
        sigma=sigma_json,
        limits=limits_json,
        zones=zones_json,
        capability=capability_json,
    )
    session.add(analysis)
    await session.commit()
    await session.refresh(analysis)

    # 7. Build response
    return AnalysisResult(
        id=analysis.id,
        dataset_id=dataset_id,
        sigma=SigmaOut(
            sigma_hat=sigma_result.sigma_hat,
            method=sigma_result.method.value,
            n_used=sigma_result.n_used,
        ),
        limits=LimitsOut(ucl=ucl_arr, cl=cl_arr, lcl=lcl_arr, k_sigma=request.k_sigma),
        zones=ZonesOut(
            zone_a_upper=zone_breakdown.zone_a_upper,
            zone_b_upper=zone_breakdown.zone_b_upper,
            cl=zone_breakdown.cl,
            zone_b_lower=zone_breakdown.zone_b_lower,
            zone_a_lower=zone_breakdown.zone_a_lower,
        ),
        capability=capability,
        created_at=analysis.created_at.isoformat() if hasattr(analysis.created_at, "isoformat") else str(analysis.created_at),
    )
