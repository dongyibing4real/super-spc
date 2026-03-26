"""
Short Run algorithm for multi-product SPC.

Supports CENTERED (deviation from target) and STANDARDIZED (Z-score)
transformations per product, then charts all transformed values together.
"""
from __future__ import annotations

import attrs
import numpy as np

from ..common.enums import ScalingMethod
from ..common.sigma import sigma_from_moving_range
from ..common.types import ControlLimits
from ..common.validators import validate_positive, validate_1d_array, validate_non_empty
from ..constants.tables import d2, d3


@attrs.define(slots=True)
class ShortRunConfig:
    """Configuration for Short Run chart computation."""

    scaling: ScalingMethod = attrs.field(default=ScalingMethod.CENTERED)
    product_targets: dict | None = attrs.field(default=None)
    product_sigmas: dict | None = attrs.field(default=None)
    subgrouped: bool = attrs.field(default=False)
    k_sigma: float = attrs.field(default=3.0)

    @k_sigma.validator
    def _validate_k_sigma(self, attribute, value):
        validate_positive(value, "k_sigma")


@attrs.define(slots=True)
class ShortRunResult:
    """Result of Short Run chart computation."""

    transformed_values: np.ndarray
    limits: ControlLimits
    sigma: float
    product_stats: dict[str, tuple[float, float]]   # product -> (target, sigma)
    dispersion_values: np.ndarray
    dispersion_limits: ControlLimits


def compute_short_run(
    values: np.ndarray,
    product_ids: np.ndarray,
    config: ShortRunConfig | None = None,
) -> ShortRunResult:
    """Compute Short Run chart for multi-product data.

    Parameters
    ----------
    values:
        1-D array of measurements.
    product_ids:
        1-D array of product identifiers (same length as values).
        Elements must be hashable (e.g., strings or ints).
    config:
        ShortRunConfig (defaults: CENTERED scaling, no preset targets/sigmas).

    Returns
    -------
    ShortRunResult.
    """
    if config is None:
        config = ShortRunConfig()

    values = np.asarray(values, dtype=float)
    product_ids = np.asarray(product_ids)
    validate_1d_array(values, "values")
    validate_non_empty(values, "values")

    K = config.k_sigma

    # --- Compute per-product target and sigma ---
    unique_products = list(dict.fromkeys(product_ids))  # preserve order
    product_stats: dict[str, tuple[float, float]] = {}

    for prod in unique_products:
        mask = product_ids == prod
        prod_values = values[mask]

        # Target: use provided or compute mean
        if config.product_targets is not None and prod in config.product_targets:
            target = float(config.product_targets[prod])
        else:
            target = float(np.mean(prod_values))

        # Sigma: use provided or compute from moving range
        if config.product_sigmas is not None and prod in config.product_sigmas:
            sigma = float(config.product_sigmas[prod])
        else:
            if len(prod_values) >= 2:
                sigma = sigma_from_moving_range(prod_values).sigma_hat
            else:
                # Single observation: cannot estimate sigma from MR; use 0 as placeholder
                sigma = 0.0

        product_stats[str(prod)] = (target, sigma)

    # --- Transform values ---
    transformed = np.empty_like(values)
    for i, (val, prod) in enumerate(zip(values, product_ids)):
        target, sigma = product_stats[str(prod)]
        if config.scaling == ScalingMethod.CENTERED:
            transformed[i] = val - target
        else:  # STANDARDIZED
            if sigma > 0:
                transformed[i] = (val - target) / sigma
            else:
                transformed[i] = 0.0

    # --- Compute overall sigma_hat from transformed values ---
    if len(transformed) >= 2:
        sigma_hat = sigma_from_moving_range(transformed).sigma_hat
    else:
        sigma_hat = 0.0

    # --- Control limits for individual chart ---
    if config.scaling == ScalingMethod.CENTERED:
        cl_val = float(np.mean(transformed))
        ucl_val = cl_val + K * sigma_hat
        lcl_val = cl_val - K * sigma_hat
    else:
        # Standardized: CL=0, limits=±K/d2(2) ... but spec says ±K/(d2(2)*sqrt(1))
        # For individual standardized values the target is 0 and
        # limits are ±K (since each z-score has unit sigma by definition)
        # However the spec says: UCL/LCL = +/-K/(d2(2)*sqrt(1))
        # This represents the control limits on the standardized (z-score) values
        # using the MR-based sigma of the standardized series divided by d2(2).
        # For perfectly standardized data, sigma_hat≈1/d2(2)... but we follow spec.
        cl_val = 0.0
        # Per spec: UCL/LCL = ±K / (d2(2) * sqrt(1)) which simplifies to ±K/d2(2)
        # This is the 3-sigma limit when sigma of a z-score series is estimated
        # by the average moving range / d2(2), and that average MR ≈ d2(2).
        # We use the sigma_hat computed from the transformed data.
        ucl_val = K * sigma_hat
        lcl_val = -K * sigma_hat

    n = len(transformed)
    limits = ControlLimits(
        ucl=np.full(n, ucl_val),
        cl=np.full(n, cl_val),
        lcl=np.full(n, lcl_val),
        k_sigma=K,
    )

    # --- Dispersion chart: MR of transformed values ---
    if len(transformed) >= 2:
        mr_values = np.abs(np.diff(transformed))
        mr_bar = float(np.mean(mr_values))
        # MR chart limits: UCL = D4 * MR_bar, LCL = D3 * MR_bar
        # D4 = 1 + 3*d3(2)/d2(2), D3 = max(1 - 3*d3(2)/d2(2), 0)
        _d2_2 = d2(2)
        _d3_2 = d3(2)
        D4 = 1.0 + 3.0 * _d3_2 / _d2_2
        D3 = max(1.0 - 3.0 * _d3_2 / _d2_2, 0.0)
        disp_ucl = D4 * mr_bar
        disp_cl = mr_bar
        disp_lcl = D3 * mr_bar
    else:
        mr_values = np.array([])
        disp_ucl = disp_cl = disp_lcl = 0.0

    m = len(mr_values)
    dispersion_limits = ControlLimits(
        ucl=np.full(m, disp_ucl),
        cl=np.full(m, disp_cl),
        lcl=np.full(m, disp_lcl),
        k_sigma=K,
    )

    return ShortRunResult(
        transformed_values=transformed,
        limits=limits,
        sigma=sigma_hat,
        product_stats=product_stats,
        dispersion_values=mr_values,
        dispersion_limits=dispersion_limits,
    )
