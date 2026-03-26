"""
CUSUM Average Run Length (ARL) computation via Gauss-Legendre quadrature.

Uses the integral equation approach of Brook & Evans (1972) / Goel & Wu (1971)
with a 24-point Gauss-Legendre quadrature rule.

The ARL returned is for the two-sided CUSUM (upper and lower arms combined),
approximated as ARL_two_sided = 1 / (1/L_upper + 1/L_lower).  For a symmetric
in-control process (shift=0) this equals L_one_sided / 2.

References
----------
Brook, D., & Evans, D.A. (1972). An approach to the probability distribution
of CUSUM run length. Biometrika, 59(3), 539-549.

Goel, A.L., & Wu, S.M. (1971). Determination of ARL and a Contour Nomogram
for CUSUM Charts to Control Normal Mean. Technometrics, 13(2), 221-230.

Lucas, J.M., & Crosier, R.B. (1982). Fast Initial Response for CUSUM
Quality-Control Schemes. Technometrics, 24(3), 199-205.
"""
from __future__ import annotations

import numpy as np
from numpy.polynomial.legendre import leggauss
from scipy.stats import norm


def _arl_one_sided(
    h: float,
    k: float,
    shift: float,
    head_start: float = 0.0,
    n_points: int = 24,
) -> float:
    """Compute the one-sided upper CUSUM ARL from starting state `head_start`.

    Solves the Fredholm integral equation of the second kind:

        L(c) = 1 + Phi(k - c - delta) * L(0)
                 + integral_0^h phi(y - c + k - delta) L(y) dy

    using an (n_points + 1) x (n_points + 1) linear system where the
    extra row/column accounts for the probability of resetting to state 0.

    Parameters
    ----------
    h, k, shift, head_start, n_points:
        See :func:`compute_arl`.

    Returns
    -------
    float: ARL from the given head_start state.
    """
    delta = shift
    nodes_gl, weights_gl = leggauss(n_points)

    # Map GL nodes from [-1, 1] to (0, h)
    x = (h / 2.0) * (nodes_gl + 1.0)
    w = (h / 2.0) * weights_gl

    # Build (n+1) x (n+1) system.
    # Unknowns: [L(0), L(x_1), ..., L(x_n)]
    N = n_points + 1
    A = np.zeros((N, N))
    b_vec = np.ones(N)

    # Row 0: equation for L(0) = 1 + Phi(k-delta)*L(0) + sum_j phi(xj+k-delta)*wj*L(xj)
    # => L(0)*(1-Phi(k-delta)) - sum_j phi(xj+k-delta)*wj*L(xj) = 1
    A[0, 0] = 1.0 - norm.cdf(k - delta)
    A[0, 1:] = -norm.pdf(x + k - delta) * w

    # Rows 1..n: equation for L(x_i)
    # L(x_i) - Phi(k-x_i-delta)*L(0) - sum_j phi(xj-xi+k-delta)*wj*L(xj) = 1
    xj_arr = x[np.newaxis, :]  # (1, n)
    xi_arr = x[:, np.newaxis]  # (n, 1)
    K_interior = norm.pdf(xj_arr - xi_arr + k - delta) * w[np.newaxis, :]  # (n, n)
    reset_probs = norm.cdf(k - x - delta)  # P(reset | state x_i)

    A[1:, 0] = -reset_probs
    A[1:, 1:] = np.eye(n_points) - K_interior

    L_vec = np.linalg.solve(A, b_vec)

    # L_vec[0] = L(0), L_vec[1:] = L at GL nodes
    # Interpolate at head_start
    start = float(head_start)
    if start <= 0.0:
        return float(max(1.0, L_vec[0]))

    # Interpolate among quadrature nodes using linear interpolation
    # Augment with the boundary point (0, L(0))
    x_aug = np.concatenate([[0.0], x])
    L_aug = L_vec  # [L(0), L(x_1), ..., L(x_n)]
    start = min(start, h - 1e-10)
    arl_at_start = float(np.interp(start, x_aug, L_aug))
    return max(1.0, arl_at_start)


def compute_arl(
    h: float,
    k: float,
    shift: float,
    head_start: float = 0.0,
    n_points: int = 24,
) -> float:
    """Compute the two-sided CUSUM ARL using Gauss-Legendre quadrature.

    The two-sided ARL combines the upper and lower one-sided ARLs:

        ARL_two_sided = 1 / (1/L_upper + 1/L_lower)

    For a zero shift both arms are symmetric so ARL_two_sided = L_one_sided / 2.

    Parameters
    ----------
    h:
        Decision interval in sigma units (signal when C+ > h or C- < -h).
    k:
        Reference value (allowable slack), typically 0.5 for a 1-sigma shift.
    shift:
        Process mean shift in sigma units (0 = in-control).
    head_start:
        Fast Initial Response (FIR) starting value in [0, h).
        0 means no head-start.
    n_points:
        Number of Gauss-Legendre quadrature points (default 24).

    Returns
    -------
    float: The estimated two-sided ARL.
    """
    # Upper arm detects positive shifts; lower arm detects negative shifts.
    # For a shift of +delta, the upper arm has shift=delta and lower has shift=-delta.
    L_upper = _arl_one_sided(h, k, shift=shift, head_start=head_start, n_points=n_points)
    L_lower = _arl_one_sided(h, k, shift=-shift, head_start=head_start, n_points=n_points)
    # Combined two-sided ARL
    arl = 1.0 / (1.0 / L_upper + 1.0 / L_lower)
    return float(max(1.0, arl))


def compute_arl_table(
    h: float,
    k: float,
    head_start: float = 0.0,
    shifts: np.ndarray | None = None,
    n_points: int = 24,
) -> np.ndarray:
    """Compute a table of (shift, ARL) pairs for a range of mean shifts.

    Parameters
    ----------
    h:
        Decision interval in sigma units.
    k:
        Reference value (allowable slack).
    head_start:
        Fast Initial Response starting value.
    shifts:
        1-D array of shift values (in sigma units). Defaults to
        ``np.arange(0, 3.01, 0.25)`` giving 13 values from 0 to 3.
    n_points:
        Number of Gauss-Legendre quadrature points (default 24).

    Returns
    -------
    ndarray of shape (len(shifts), 2): columns are [shift, ARL].
    """
    if shifts is None:
        shifts = np.arange(0.0, 3.01, 0.25)

    shifts = np.asarray(shifts, dtype=float)
    arls = np.array(
        [
            compute_arl(h=h, k=k, shift=s, head_start=head_start, n_points=n_points)
            for s in shifts
        ]
    )
    return np.column_stack([shifts, arls])
