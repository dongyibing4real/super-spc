"""
Three Way chart algorithm.

Separates within-subgroup, between-subgroup, and total (bw = between+within)
sources of variation. Produces control limits for:
  - Between chart: subgroup means charted against sigma_bw
  - Within chart: subgroup ranges or stddevs charted against sigma_within
"""
from __future__ import annotations

import attrs
import numpy as np

from ..common.enums import WithinMethod, BetweenMethod
from ..common.sigma import sigma_from_moving_range, sigma_from_ranges, sigma_from_stddevs
from ..common.types import ControlLimits
from ..common.validators import validate_positive, validate_1d_array, validate_non_empty
from ..constants.tables import c4, d2, d3


@attrs.define(slots=True)
class ThreeWayConfig:
    """Configuration for Three Way chart computation."""

    within_method: WithinMethod = attrs.field(default=WithinMethod.RANGE)
    between_method: BetweenMethod = attrs.field(default=BetweenMethod.MOVING_RANGE)
    k_sigma: float = attrs.field(default=3.0)

    @k_sigma.validator
    def _validate_k_sigma(self, attribute, value):
        validate_positive(value, "k_sigma")


@attrs.define(slots=True)
class ThreeWayResult:
    """Result of Three Way chart computation."""

    between_chart: ControlLimits     # limits for subgroup means
    within_chart: ControlLimits      # limits for subgroup ranges or stddevs
    sigma_within: float
    sigma_between: float
    sigma_bw: float                  # sqrt(sigma_w^2 + sigma_b^2)
    subgroup_means: np.ndarray
    subgroup_dispersions: np.ndarray  # ranges or stddevs


def compute_three_way(
    subgroups: list[np.ndarray],
    config: ThreeWayConfig | None = None,
) -> ThreeWayResult:
    """Compute Three Way chart for subgrouped data.

    Parameters
    ----------
    subgroups:
        List of 1-D arrays, each representing one subgroup.
        Subgroups may have unequal sizes (>= 1 each, >= 2 for range/stddev).
    config:
        ThreeWayConfig (defaults: within=RANGE, between=MOVING_RANGE, k=3).

    Returns
    -------
    ThreeWayResult.
    """
    if config is None:
        config = ThreeWayConfig()

    if len(subgroups) == 0:
        raise ValueError("subgroups must not be empty")

    K = config.k_sigma

    # Convert each subgroup to float array
    subgroups = [np.asarray(sg, dtype=float) for sg in subgroups]
    for i, sg in enumerate(subgroups):
        if sg.ndim != 1 or sg.size == 0:
            raise ValueError(f"subgroup {i} must be a non-empty 1-D array")

    sizes = np.array([len(sg) for sg in subgroups])
    means = np.array([float(np.mean(sg)) for sg in subgroups])

    # --- Within sigma ---
    if config.within_method == WithinMethod.RANGE:
        ranges = np.array([
            float(np.max(sg) - np.min(sg)) if len(sg) >= 2 else 0.0
            for sg in subgroups
        ])
        dispersions = ranges
        # Use subgroups with size >= 2 for estimation
        valid_mask = sizes >= 2
        if np.any(valid_mask):
            sigma_within = sigma_from_ranges(
                ranges[valid_mask], sizes[valid_mask]
            ).sigma_hat
        else:
            sigma_within = 0.0
    else:  # STDDEV
        stddevs = np.array([
            float(np.std(sg, ddof=1)) if len(sg) >= 2 else 0.0
            for sg in subgroups
        ])
        dispersions = stddevs
        valid_mask = sizes >= 2
        if np.any(valid_mask):
            sigma_within = sigma_from_stddevs(
                stddevs[valid_mask], sizes[valid_mask]
            ).sigma_hat
        else:
            sigma_within = 0.0

    # --- Harmonic mean of subgroup sizes ---
    H = float(len(sizes) / np.sum(1.0 / sizes.astype(float)))

    # --- Between sigma ---
    # sigma_b^2 = (MR_bar / d2(2))^2 - sigma_w^2 / H, clamped to 0
    sigma_b_sq_raw = (sigma_from_moving_range(means).sigma_hat) ** 2 - (sigma_within ** 2) / H
    sigma_between = float(np.sqrt(max(sigma_b_sq_raw, 0.0)))

    # --- Combined sigma ---
    sigma_bw = float(np.sqrt(sigma_within ** 2 + sigma_between ** 2))

    # --- Between chart limits (on subgroup means) ---
    grand_mean = float(np.mean(means))
    # Sigma of mean = sigma_bw / sqrt(ni). For variable subgroup sizes use harmonic mean.
    # Per spec: "Between chart limits on means using sigma_bw"
    # Standard: CL = grand_mean, UCL = grand_mean + K*sigma_bw/sqrt(H)
    sigma_mean = sigma_bw / np.sqrt(H)
    between_ucl = grand_mean + K * sigma_mean
    between_cl = grand_mean
    between_lcl = grand_mean - K * sigma_mean

    m = len(means)
    between_chart = ControlLimits(
        ucl=np.full(m, between_ucl),
        cl=np.full(m, between_cl),
        lcl=np.full(m, between_lcl),
        k_sigma=K,
    )

    # --- Within chart limits (on ranges or stddevs) ---
    if config.within_method == WithinMethod.RANGE:
        # Range chart: UCL = D4 * sigma_w * d2(n_bar), LCL = D3 * sigma_w * d2(n_bar)
        # Use harmonic mean subgroup size for simplicity when sizes vary
        n_bar = int(round(H))
        n_bar = max(n_bar, 2)
        _d2 = d2(n_bar)
        _d3 = d3(n_bar)
        r_bar = sigma_within * _d2
        D4 = 1.0 + 3.0 * _d3 / _d2
        D3 = max(1.0 - 3.0 * _d3 / _d2, 0.0)
        within_ucl = D4 * r_bar
        within_cl = r_bar
        within_lcl = D3 * r_bar
    else:  # STDDEV
        n_bar = int(round(H))
        n_bar = max(n_bar, 2)
        _c4 = c4(n_bar)
        s_bar = sigma_within * _c4
        # S chart: UCL = s_bar + 3*sigma_within*sqrt(1-c4^2)
        #        = s_bar + 3*c5*sigma_within  ... using c5
        # Standard Shewhart: B4*s_bar, B3*s_bar
        # B4 = 1 + 3*sqrt(1-c4^2)/c4, B3 = max(1 - 3*sqrt(1-c4^2)/c4, 0)
        # We compute directly:
        sigma_s = sigma_within * np.sqrt(1.0 - _c4 ** 2)
        within_ucl = s_bar + K * sigma_s
        within_cl = s_bar
        within_lcl = max(s_bar - K * sigma_s, 0.0)

    within_chart = ControlLimits(
        ucl=np.full(m, within_ucl),
        cl=np.full(m, within_cl),
        lcl=np.full(m, within_lcl),
        k_sigma=K,
    )

    return ThreeWayResult(
        between_chart=between_chart,
        within_chart=within_chart,
        sigma_within=sigma_within,
        sigma_between=sigma_between,
        sigma_bw=sigma_bw,
        subgroup_means=means,
        subgroup_dispersions=dispersions,
    )
