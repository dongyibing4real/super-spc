"""
Zone boundary computation for Western Electric rule detection.

Zone A = 2-sigma region, Zone B = 1-sigma region from the center line.
"""
from .types import ZoneBreakdown


def compute_zones(cl: float, sigma_hat: float) -> ZoneBreakdown:
    """Compute zone boundaries for a control chart.

    Parameters
    ----------
    cl:
        Center line value.
    sigma_hat:
        Within-subgroup sigma estimate (may be 0 for degenerate charts).

    Returns
    -------
    ZoneBreakdown with:
        zone_a_upper = cl + 2 * sigma_hat
        zone_b_upper = cl + 1 * sigma_hat
        cl           = cl
        zone_b_lower = cl - 1 * sigma_hat
        zone_a_lower = cl - 2 * sigma_hat
    """
    return ZoneBreakdown(
        zone_a_upper=cl + 2.0 * sigma_hat,
        zone_b_upper=cl + 1.0 * sigma_hat,
        cl=cl,
        zone_b_lower=cl - 1.0 * sigma_hat,
        zone_a_lower=cl - 2.0 * sigma_hat,
    )
