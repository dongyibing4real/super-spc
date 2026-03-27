"""
MEWMA (Multivariate Exponentially Weighted Moving Average) control chart computation.

Algorithm
---------
EWMA smoothing (start at target):
    Z_0 = mu
    Z_i = lambda * x_i + (1 - lambda) * Z_{i-1}

Covariance of Z_i:
    Exact:      Sigma_Z_i = (lambda / (2 - lambda)) * (1 - (1-lambda)^{2i}) * Sigma
    Asymptotic: Sigma_Z_i = (lambda / (2 - lambda)) * Sigma

T² statistic:
    T²_i = (Z_i - mu)^T @ Sigma_Z_i^{-1} @ (Z_i - mu)

UCL (asymptotic chi-square approximation):
    UCL = chi2.ppf(1 - alpha, p)

References
----------
Lowry, C.A., Woodall, W.H., Champ, C.W., Rigdon, S.E. (1992).
A Multivariate Exponentially Weighted Moving Average Control Chart.
Technometrics, 34(1), 46-53.
"""
from __future__ import annotations

import numpy as np
from scipy.stats import chi2

from .models import MEWMAConfig, MEWMAResult


def compute_mewma(
    data: np.ndarray,
    config: MEWMAConfig | None = None,
    known_mean: np.ndarray | None = None,
    known_cov: np.ndarray | None = None,
) -> MEWMAResult:
    """Compute a MEWMA multivariate control chart.

    Parameters
    ----------
    data:
        2-D array of shape (n_observations, p_variables).
    config:
        Chart configuration. If None, defaults are used.
    known_mean:
        Target mean vector. If None, estimated from data. Shape (p,).
    known_cov:
        Process covariance matrix. If None, estimated from data. Shape (p, p).

    Returns
    -------
    MEWMAResult
    """
    if config is None:
        config = MEWMAConfig()

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

    # --- Parameters ---
    mu = np.asarray(known_mean, dtype=float) if known_mean is not None else data.mean(axis=0)
    Sigma = (
        np.asarray(known_cov, dtype=float)
        if known_cov is not None
        else np.cov(data, rowvar=False)
    )

    lam = config.lambda_
    use_exact = config.use_exact_covariance

    # --- EWMA smoothing ---
    # Z_0 = mu; Z_i = lam * x_i + (1 - lam) * Z_{i-1}
    mewma_values = np.empty((n, p))
    Z_prev = mu.copy()
    for i in range(n):
        Z_i = lam * data[i] + (1.0 - lam) * Z_prev
        mewma_values[i] = Z_i
        Z_prev = Z_i

    # --- T² statistics ---
    # The asymptotic factor: lambda / (2 - lambda)
    asym_factor = lam / (2.0 - lam)

    if use_exact:
        # Sigma_Z_i = asym_factor * (1 - (1-lambda)^{2i}) * Sigma
        # For each i (1-indexed), compute the scalar modifier
        t2_values = np.empty(n)
        deviations = mewma_values - mu  # (n, p)
        for i in range(n):
            decay = 1.0 - (1.0 - lam) ** (2 * (i + 1))
            scale = asym_factor * decay
            if scale < 1e-15:
                # Very first step with lambda near 0: T² ≈ 0
                t2_values[i] = 0.0
                continue
            Sigma_Z_inv = np.linalg.inv(scale * Sigma)
            d = deviations[i]
            t2_values[i] = float(d @ Sigma_Z_inv @ d)
    else:
        # Asymptotic: Sigma_Z = asym_factor * Sigma (constant)
        Sigma_Z_inv = np.linalg.inv(asym_factor * Sigma)
        deviations = mewma_values - mu  # (n, p)
        # Vectorized: T²_i = d_i^T @ Sigma_Z_inv @ d_i
        t2_values = np.einsum("ij,jk,ik->i", deviations, Sigma_Z_inv, deviations)

    # --- UCL ---
    # Asymptotic chi-square approximation with p degrees of freedom
    ucl = float(chi2.ppf(1.0 - config.alpha, p))

    violations = t2_values > ucl

    return MEWMAResult(
        mewma_values=mewma_values,
        t2_values=t2_values,
        ucl=ucl,
        mean_vector=mu,
        covariance_matrix=Sigma,
        violations=violations,
        p=p,
        n=n,
    )
