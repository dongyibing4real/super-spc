"""
Hotelling T² multivariate control chart computation.

Phase I (retrospective):
    UCL = (p*(n-1)*(n+1)) / (n*(n-p)) * F_{1-alpha}(p, n-p)

Phase II (monitoring):
    UCL = chi2.ppf(1-alpha, p)  [large n approximation]
    Or exact:  p*(n+1)*(n-1)/(n*(n-p)) * F_{1-alpha}(p, n-p)

References
----------
Tracy, N.D., Young, J.C., Mason, R.L. (1992). Multivariate Control Charts
for Individual Observations. Journal of Quality Technology, 24(2), 88-95.

Montgomery, D.C. (2020). Introduction to Statistical Quality Control, 8th ed.,
Sections 11.4–11.5.
"""
from __future__ import annotations

import numpy as np
from scipy.stats import f as f_dist

from .models import HotellingT2Config, HotellingT2Result


def compute_hotelling_t2(
    data: np.ndarray,
    config: HotellingT2Config | None = None,
    known_mean: np.ndarray | None = None,
    known_cov: np.ndarray | None = None,
) -> HotellingT2Result:
    """Compute a Hotelling T² multivariate control chart.

    Parameters
    ----------
    data:
        2-D array of shape (n_observations, p_variables). Each row is one
        multivariate observation.
    config:
        Chart configuration. If None, defaults are used.
    known_mean:
        If provided (Phase II), use this mean vector instead of estimating
        from data. Shape (p,).
    known_cov:
        If provided (Phase II), use this covariance matrix instead of
        estimating from data. Shape (p, p).

    Returns
    -------
    HotellingT2Result
    """
    if config is None:
        config = HotellingT2Config()

    data = np.asarray(data, dtype=float)

    if data.ndim != 2:
        raise ValueError(
            f"data must be a 2-D array (n_observations, p_variables), "
            f"got shape {data.shape}"
        )

    n, p = data.shape

    if n <= p:
        raise ValueError(
            f"number of observations (n={n}) must be greater than "
            f"number of variables (p={p})"
        )

    # --- Estimate or accept mean and covariance ---
    if known_mean is not None:
        mean_vector = np.asarray(known_mean, dtype=float)
    else:
        mean_vector = data.mean(axis=0)

    if known_cov is not None:
        S = np.asarray(known_cov, dtype=float)
    else:
        S = np.cov(data, rowvar=False)

    S_inv = np.linalg.inv(S)

    # --- T² statistics ---
    # T²_i = (x_i - mu)^T @ S_inv @ (x_i - mu)
    deviations = data - mean_vector  # (n, p)
    # Vectorized: T²_i = sum_j sum_k d_ij * S_inv_jk * d_ik
    # Equivalent: T²_i = rowwise (D @ S_inv) * D summed over columns
    t2_values = np.einsum("ij,jk,ik->i", deviations, S_inv, deviations)

    # --- Contributions (per-variable decomposition of T²) ---
    # contributions[i, j] = d_i[j] * (S_inv @ d_i)[j]
    # This gives an additive decomposition: sum_j contributions[i,j] = T²_i
    S_inv_d = deviations @ S_inv.T  # (n, p): each row is S_inv @ d_i
    contributions = deviations * S_inv_d  # (n, p), element-wise

    # --- UCL ---
    alpha = config.alpha
    phase = config.phase

    if phase == 1:
        # Phase I exact F-based UCL (Tracy et al. 1992)
        # UCL = p*(n-1)*(n+1) / (n*(n-p)) * F_{1-alpha}(p, n-p)
        f_crit = f_dist.ppf(1.0 - alpha, p, n - p)
        ucl = float(p * (n - 1) * (n + 1) / (n * (n - p)) * f_crit)
    else:
        # Phase II: chi-square approximation (large n limit)
        # UCL = chi2.ppf(1 - alpha, p)
        # This is the standard Phase II UCL when parameters are known or
        # estimated from a large reference sample.
        from scipy.stats import chi2
        ucl = float(chi2.ppf(1.0 - alpha, p))

    violations = t2_values > ucl

    return HotellingT2Result(
        t2_values=t2_values,
        ucl=ucl,
        mean_vector=mean_vector,
        covariance_matrix=S,
        violations=violations,
        p=p,
        n=n,
        contributions=contributions,
    )
