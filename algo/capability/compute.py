"""
Process capability index computation.

Cp  = (USL - LSL) / (6 * sigma_within)
Cpk = min((USL - mean) / (3 * sigma_within), (mean - LSL) / (3 * sigma_within))
Pp  = (USL - LSL) / (6 * sigma_overall)
Ppk = min((USL - mean) / (3 * sigma_overall), (mean - LSL) / (3 * sigma_overall))
"""
from __future__ import annotations

import attrs
import numpy as np


@attrs.define(slots=True)
class CapabilityResult:
    """Process capability indices."""

    cp: float
    cpk: float
    pp: float
    ppk: float


def compute_capability(
    values: np.ndarray,
    sigma_within: float,
    usl: float,
    lsl: float,
) -> CapabilityResult | None:
    """Compute Cp, Cpk, Pp, Ppk from process data.

    Parameters
    ----------
    values : array of individual measurements (used for overall std and mean)
    sigma_within : within-subgroup sigma estimate (from control chart sigma method)
    usl : upper specification limit
    lsl : lower specification limit

    Returns None if computation is not possible (zero sigma, <2 values, USL <= LSL).
    """
    values = np.asarray(values, dtype=float)

    if len(values) < 2:
        return None
    if usl <= lsl:
        return None
    if sigma_within <= 0:
        return None

    mean = float(np.mean(values))
    sigma_overall = float(np.std(values, ddof=1))

    if sigma_overall <= 0:
        return None

    cp = (usl - lsl) / (6 * sigma_within)
    cpu = (usl - mean) / (3 * sigma_within)
    cpl = (mean - lsl) / (3 * sigma_within)
    cpk = min(cpu, cpl)

    pp = (usl - lsl) / (6 * sigma_overall)
    ppu = (usl - mean) / (3 * sigma_overall)
    ppl = (mean - lsl) / (3 * sigma_overall)
    ppk = min(ppu, ppl)

    return CapabilityResult(
        cp=round(cp, 4),
        cpk=round(cpk, 4),
        pp=round(pp, 4),
        ppk=round(ppk, 4),
    )
