# Algorithm Package Design — Control Charts

**Date:** 2026-03-26
**Status:** Draft
**Scope:** Full JMP Control Chart Builder parity — all Shewhart variable/attribute charts, rare event charts, CUSUM, EWMA, Short Run, Three Way, Levey-Jennings, Nelson tests 1-8, Westgard rules.

---

## Constraints & Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Modeling library | `attrs` (slots=True) | Lightweight, fast, no runtime validation overhead. Pydantic reserved for future API boundaries. |
| Computation | `numpy` only | No pandas, no higher-level stats packages. `scipy` allowed only for distributions (chi2, weibull, norm). |
| Phase/exclusion support | Pure computation — caller handles | Algo layer takes raw arrays, returns results. Callers split by phase and mask exclusions. |
| Architecture | Flat module-per-chart | No inheritance hierarchy. Shared behavior via composition from `common/` and `rules/`. |
| Testing | pytest + hypothesis | Known-answer tests, property-based invariants, attrs model validation. |
| Reference | JMP Quality and Process Methods (Harter 1960 constants, Goel & Wu 1971 ARL) | All formulas match JMP's documented statistical details. |

---

## Package Structure

```
algo/
  __init__.py              # Public re-exports
  py.typed                 # PEP 561 marker
  constants/
    __init__.py
    tables.py              # d2, d3, c4, c5 lookup for n=2..50 (Harter 1960)
    factors.py             # A2, A3, B3, B4, D3, D4 derived from tables
  common/
    __init__.py
    types.py               # ControlLimits, ZoneBreakdown, SigmaResult
    sigma.py               # All sigma estimators
    validators.py          # Input validation helpers
  rules/
    __init__.py
    nelson.py              # Nelson tests 1-8 (JMP numbering)
    westgard.py            # Westgard rules (1_2s, 1_3s, 2_2s, R_4s, 4_1s, 10_x)
    models.py              # RuleConfig, RuleViolation
    beyond_limits.py       # Test Beyond Limits (Test 15)
  xbar_r/
    __init__.py
    models.py
    compute.py
  xbar_s/
    __init__.py
    models.py
    compute.py
  imr/
    __init__.py
    models.py
    compute.py
  p_chart/
    __init__.py
    models.py
    compute.py
  np_chart/
    __init__.py
    models.py
    compute.py
  c_chart/
    __init__.py
    models.py
    compute.py
  u_chart/
    __init__.py
    models.py
    compute.py
  laney_p/
    __init__.py
    models.py
    compute.py
  laney_u/
    __init__.py
    models.py
    compute.py
  cusum/
    __init__.py
    models.py
    compute.py
    arl.py                 # ARL computation (Goel & Wu 1971)
  ewma/
    __init__.py
    models.py
    compute.py
  g_chart/
    __init__.py
    models.py
    compute.py
  t_chart/
    __init__.py
    models.py
    compute.py
  short_run/
    __init__.py
    models.py
    compute.py
  three_way/
    __init__.py
    models.py
    compute.py
  levey_jennings/
    __init__.py
    models.py
    compute.py
tests/
  conftest.py
  test_constants/
    test_tables.py
    test_factors.py
  test_common/
    test_sigma.py
    test_validators.py
  test_rules/
    test_nelson.py
    test_westgard.py
    test_evaluate.py
  test_xbar_r.py
  test_xbar_s.py
  test_imr.py
  test_p_chart.py
  test_np_chart.py
  test_c_chart.py
  test_u_chart.py
  test_laney_p.py
  test_laney_u.py
  test_cusum.py
  test_ewma.py
  test_g_chart.py
  test_t_chart.py
  test_short_run.py
  test_three_way.py
  test_levey_jennings.py
```

---

## Shared Foundation

### Core Types (`common/types.py`)

```python
import attrs
import numpy as np

@attrs.define(slots=True)
class ControlLimits:
    ucl: np.ndarray          # per-subgroup UCL (scalar broadcast for constant limits)
    cl: np.ndarray           # center line (scalar broadcast for constant CL)
    lcl: np.ndarray          # per-subgroup LCL
    k_sigma: float           # sigma multiplier used (default 3.0)

@attrs.define(slots=True)
class ZoneBreakdown:
    zone_a_upper: float      # CL + 2σ boundary
    zone_b_upper: float      # CL + 1σ boundary
    cl: float                # center line
    zone_b_lower: float      # CL - 1σ boundary
    zone_a_lower: float      # CL - 2σ boundary

@attrs.define(slots=True)
class SigmaResult:
    sigma_hat: float
    method: SigmaMethod      # StrEnum: RANGE, STDDEV, MOVING_RANGE, MEDIAN_MR, etc.
    n_used: int              # number of subgroups/points used in estimation
```

### Constants (`constants/tables.py`)

Hardcoded lookup tables for n=2..50 from Harter (1960), the same source JMP uses.

- `d2(n)` — expected value of range of n normal variates with unit σ
- `d3(n)` — std deviation of range of n normal variates with unit σ
- `c4(n)` — expected value of s for n normal variates with unit σ
- `c5(n)` — std error of s for n normal variates with unit σ

All functions clamp to n=50 for n>50, matching JMP behavior.

### Derived Factors (`constants/factors.py`)

Traditional control chart constants expressed in terms of d2/d3/c4/c5:

| Factor | Formula | Usage |
|--------|---------|-------|
| `A2(n)` | `3 / (d2(n) * √n)` | XBar-R: UCL = X̄ + A2*R̄ |
| `A3(n)` | `3 / (c4(n) * √n)` | XBar-S: UCL = X̄ + A3*S̄ |
| `D3(n)` | `max(1 - 3*d3(n)/d2(n), 0)` | R chart: LCL = D3*R̄ |
| `D4(n)` | `1 + 3*d3(n)/d2(n)` | R chart: UCL = D4*R̄ |
| `B3(n)` | `max(1 - 3*c5(n)/c4(n), 0)` | S chart: LCL = B3*S̄ |
| `B4(n)` | `1 + 3*c5(n)/c4(n)` | S chart: UCL = B4*S̄ |

Note: these hardcode k=3 (traditional tabled constants). Actual compute functions use `k_sigma` from config with raw d2/d3/c4/c5 values directly.

### Sigma Estimators (`common/sigma.py`)

| Function | Formula | Used by |
|----------|---------|---------|
| `sigma_from_ranges` | `σ̂ = mean(Ri/d2(ni))` | XBar-R, Three Way (within) |
| `sigma_from_stddevs` | `σ̂ = mean(si/c4(ni))` | XBar-S, Three Way (within) |
| `sigma_from_moving_range` | `σ̂ = MR̄/d2(span)` | IMR, CUSUM, Short Run |
| `sigma_from_median_moving_range` | `σ̂ = median(MR)/0.954` | IMR (alt), Presummarize |
| `sigma_levey_jennings` | `σ̂ = sample std dev (ddof=1)` | Levey-Jennings |
| `sigma_binomial` | `σi = √(p̄(1-p̄)/ni)` | P, NP charts |
| `sigma_poisson` | `σi = √(ū/ni)` | C, U charts |
| `sigma_laney_adjustment` | `z = MR̄/d2(2) of standardized residuals` | Laney P', Laney U' |

---

## Chart Modules

### Module Pattern

Every chart directory follows:

- **`models.py`** — attrs config (inputs/parameters) and result (outputs) classes
- **`compute.py`** — pure function(s), numpy arrays in, attrs result out
- **`__init__.py`** — re-exports public API

### Data Input Convention

- **Ragged subgroups** (varying sizes): flat 1D `values` array + 1D `subgroup_sizes` array. Compute functions split internally via `np.split`.
- **Equal subgroups**: 2D `(n_subgroups, subgroup_size)` array. `subgroup_sizes` inferred.
- All compute functions accept both forms.

### Shewhart Variable Charts

#### XBar-R (`xbar_r/`)

```python
@attrs.define(slots=True)
class XBarRConfig:
    k_sigma: float = 3.0
    sigma_method: str = "range"  # "range" or "stddev"

@attrs.define(slots=True)
class XBarRResult:
    subgroup_means: np.ndarray
    subgroup_ranges: np.ndarray
    xbar_limits: ControlLimits
    r_limits: ControlLimits
    sigma: SigmaResult
    zones: ZoneBreakdown
    grand_mean: float

def compute_xbar_r(
    data: np.ndarray,
    subgroup_sizes: np.ndarray,
    config: XBarRConfig = XBarRConfig(),
) -> XBarRResult
```

**Formulas (JMP):**
- `X̄w` = weighted average of subgroup means
- `σ̂ = mean(Ri/d2(ni))` for i in subgroups with ni ≥ 2
- XBar: `UCL = X̄w + K * σ̂ / √ni`, `LCL = X̄w - K * σ̂ / √ni`
- R: `UCL = d2(ni)*σ̂ + K*d3(ni)*σ̂`, `LCL = max(d2(ni)*σ̂ - K*d3(ni)*σ̂, 0)`

#### XBar-S (`xbar_s/`)

```python
@attrs.define(slots=True)
class XBarSConfig:
    k_sigma: float = 3.0

@attrs.define(slots=True)
class XBarSResult:
    subgroup_means: np.ndarray
    subgroup_stddevs: np.ndarray
    xbar_limits: ControlLimits
    s_limits: ControlLimits
    sigma: SigmaResult
    zones: ZoneBreakdown
    grand_mean: float

def compute_xbar_s(
    data: np.ndarray,
    subgroup_sizes: np.ndarray,
    config: XBarSConfig = XBarSConfig(),
) -> XBarSResult
```

**Formulas:**
- `σ̂ = mean(si/c4(ni))`
- XBar: `UCL = X̄w + K * σ̂ / √ni`, `LCL = X̄w - K * σ̂ / √ni`
- S: `UCL = c4(ni)*σ̂ + K*c5(ni)*σ̂`, `LCL = max(c4(ni)*σ̂ - K*c5(ni)*σ̂, 0)`

#### IMR — Individual & Moving Range (`imr/`)

```python
@attrs.define(slots=True)
class IMRConfig:
    k_sigma: float = 3.0
    sigma_method: str = "moving_range"  # "moving_range" or "median_moving_range"

@attrs.define(slots=True)
class IMRResult:
    individual_limits: ControlLimits
    mr_limits: ControlLimits
    moving_ranges: np.ndarray
    sigma: SigmaResult
    zones: ZoneBreakdown
    mean: float

def compute_imr(
    values: np.ndarray,
    config: IMRConfig = IMRConfig(),
) -> IMRResult
```

**Formulas:**
- `σ̂ = MR̄/d2(2)` where `MR̄ = mean(|xi - xi-1|)` (moving_range method)
- `σ̂ = median(MR)/0.954` (median_moving_range method)
- Individual: `UCL = X̄ + K*σ̂`, `LCL = X̄ - K*σ̂`
- MR: `UCL = d2(2)*σ̂ + K*d3(2)*σ̂`, `LCL = max(d2(2)*σ̂ - K*d3(2)*σ̂, 0)`

#### Levey-Jennings (`levey_jennings/`)

```python
@attrs.define(slots=True)
class LeveyJenningsConfig:
    k_sigma: float = 3.0

@attrs.define(slots=True)
class LeveyJenningsResult:
    limits: ControlLimits
    sigma: SigmaResult
    zones: ZoneBreakdown
    mean: float

def compute_levey_jennings(
    values: np.ndarray,
    config: LeveyJenningsConfig = LeveyJenningsConfig(),
) -> LeveyJenningsResult
```

**Formulas:**
- `σ̂ = √(Σ(yi - ȳ)² / (N-1))` — overall sample std dev
- `UCL = ȳ + K*σ̂`, `LCL = ȳ - K*σ̂`

### Shewhart Attribute Charts

#### P Chart (`p_chart/`)

```python
@attrs.define(slots=True)
class PChartConfig:
    k_sigma: float = 3.0

@attrs.define(slots=True)
class PChartResult:
    proportions: np.ndarray
    limits: ControlLimits      # variable-width (per-subgroup UCL/LCL)
    p_bar: float
    sigma: SigmaResult

def compute_p_chart(
    defectives: np.ndarray,    # count of defective items per subgroup
    n_trials: np.ndarray,      # subgroup sample sizes
    config: PChartConfig = PChartConfig(),
) -> PChartResult
```

**Formulas:**
- `p̄ = ΣXi / Σni`
- `UCL_i = min(p̄ + K*√(p̄(1-p̄)/ni), 1)`
- `LCL_i = max(p̄ - K*√(p̄(1-p̄)/ni), 0)`

#### NP Chart (`np_chart/`)

```python
@attrs.define(slots=True)
class NPChartConfig:
    k_sigma: float = 3.0

@attrs.define(slots=True)
class NPChartResult:
    counts: np.ndarray
    limits: ControlLimits
    p_bar: float
    sigma: SigmaResult

def compute_np_chart(
    defectives: np.ndarray,
    n_trials: np.ndarray,
    config: NPChartConfig = NPChartConfig(),
) -> NPChartResult
```

**Formulas:**
- `p̄ = ΣXi / Σni`
- `UCL_i = min(ni*p̄ + K*√(ni*p̄*(1-p̄)), ni)`
- `LCL_i = max(ni*p̄ - K*√(ni*p̄*(1-p̄)), 0)`

#### C Chart (`c_chart/`)

```python
@attrs.define(slots=True)
class CChartConfig:
    k_sigma: float = 3.0

@attrs.define(slots=True)
class CChartResult:
    counts: np.ndarray
    limits: ControlLimits
    u_bar: float
    sigma: SigmaResult

def compute_c_chart(
    defects: np.ndarray,
    n_units: np.ndarray,
    config: CChartConfig = CChartConfig(),
) -> CChartResult
```

**Formulas:**
- `ū = Σci / Σni`
- `UCL_i = ni*ū + K*√(ni*ū)`
- `LCL_i = max(ni*ū - K*√(ni*ū), 0)`

#### U Chart (`u_chart/`)

```python
@attrs.define(slots=True)
class UChartConfig:
    k_sigma: float = 3.0

@attrs.define(slots=True)
class UChartResult:
    rates: np.ndarray          # defects per unit
    limits: ControlLimits      # variable-width
    u_bar: float
    sigma: SigmaResult

def compute_u_chart(
    defects: np.ndarray,
    n_units: np.ndarray,
    config: UChartConfig = UChartConfig(),
) -> UChartResult
```

**Formulas:**
- `ū = Σci / Σni`
- `UCL_i = ū + K*√(ū/ni)`
- `LCL_i = max(ū - K*√(ū/ni), 0)`

#### Laney P' (`laney_p/`)

```python
@attrs.define(slots=True)
class LaneyPConfig:
    k_sigma: float = 3.0

@attrs.define(slots=True)
class LaneyPResult:
    proportions: np.ndarray
    limits: ControlLimits
    p_bar: float
    sigma_z: float             # Laney adjustment factor
    sigma: SigmaResult

def compute_laney_p(
    defectives: np.ndarray,
    n_trials: np.ndarray,
    config: LaneyPConfig = LaneyPConfig(),
) -> LaneyPResult
```

**Formulas:**
- `p̄ = ΣXi / Σni`
- Standardized residuals: `zi = (pi - p̄) / √(p̄(1-p̄)/ni)`
- `σz = MR̄(z) / d2(2)` — moving range sigma of standardized residuals
- `UCL_i = min(p̄ + K * σz * √(p̄(1-p̄)/ni), 1)`
- `LCL_i = max(p̄ - K * σz * √(p̄(1-p̄)/ni), 0)`

When no overdispersion, σz ≈ 1.0 and Laney P' ≈ standard P chart.

#### Laney U' (`laney_u/`)

```python
@attrs.define(slots=True)
class LaneyUConfig:
    k_sigma: float = 3.0

@attrs.define(slots=True)
class LaneyUResult:
    rates: np.ndarray
    limits: ControlLimits
    u_bar: float
    sigma_z: float
    sigma: SigmaResult

def compute_laney_u(
    defects: np.ndarray,
    n_units: np.ndarray,
    config: LaneyUConfig = LaneyUConfig(),
) -> LaneyUResult
```

**Formulas:**
- `ū = Σci / Σni`
- Standardized residuals: `zi = (ui - ū) / √(ū/ni)`
- `σz = MR̄(z) / d2(2)`
- `UCL_i = ū + K * σz * √(ū/ni)`
- `LCL_i = max(ū - K * σz * √(ū/ni), 0)`

### Advanced Charts

#### CUSUM (`cusum/`)

```python
@attrs.define(slots=True)
class CUSUMConfig:
    target: float
    sigma: float
    h: float = 5.0            # decision interval (σ units)
    k: float = 0.5            # reference value (σ units)
    head_start: float = 0.0   # FIR initial value
    data_units: bool = False   # if True, h/k in data units

@attrs.define(slots=True)
class CUSUMResult:
    c_plus: np.ndarray         # upper cumulative sums
    c_minus: np.ndarray        # lower cumulative sums (negative)
    upper_limit: float
    lower_limit: float
    violations_upper: np.ndarray  # boolean mask
    violations_lower: np.ndarray
    shift_starts_upper: np.ndarray  # indices
    shift_starts_lower: np.ndarray

def compute_cusum(values: np.ndarray, config: CUSUMConfig) -> CUSUMResult
```

**Formulas (standardized units):**
- `Ci+ = max(0, (xi - T)/σ - k + Ci-1+)`, `C0+ = head_start`
- `Ci- = min(0, (xi - T)/σ + k + Ci-1-)`, `C0- = -head_start`
- Upper signal: `Ci+ > h`; Lower signal: `Ci- < -h`
- Shift start: first point after most recent zero crossing of C+/C-

**ARL computation (`cusum/arl.py`):**
- One-sided ARL via integral equation method (24 Gauss-Legendre quadrature points), per Goel & Wu (1971)
- Head Start ARL per Lucas & Crosier (1982) Appendix A.1
- Two-sided: `1/ARL = 1/ARL+ + 1/ARL-`

```python
def compute_arl(h: float, k: float, shift: float, head_start: float = 0.0) -> float
def compute_arl_table(h: float, k: float, head_start: float = 0.0,
                      shifts: np.ndarray | None = None) -> np.ndarray
```

#### EWMA (`ewma/`)

```python
@attrs.define(slots=True)
class EWMAConfig:
    target: float
    sigma: float
    lambda_: float = 0.2
    k_sigma: float = 3.0
    use_exact_limits: bool = True  # time-varying; False = asymptotic

@attrs.define(slots=True)
class EWMAResult:
    ewma: np.ndarray
    ucl: np.ndarray            # per-point (time-varying if exact)
    lcl: np.ndarray
    center: float
    violations: np.ndarray     # boolean mask
    forecast: float            # one-step-ahead: last EWMA value
    residuals: np.ndarray      # xi - EWMAi-1

def compute_ewma(
    values: np.ndarray,
    config: EWMAConfig,
    subgroup_sizes: np.ndarray | None = None,
) -> EWMAResult
```

**Formulas:**
- `EWMAi = λ*xi + (1-λ)*EWMAi-1`, `EWMA0 = target`
- Exact limits (equal subgroups): `UCL_i = T + K*σ/√n * √(λ/(2-λ) * (1-(1-λ)^{2i}))`
- Exact limits (unequal subgroups): `UCL_i = T + K*σ * √(Σ_{j=1}^{i} λ^{2(i-j)} / nj)`
- Asymptotic: `UCL = T + K*σ * √(λ / (n*(2-λ)))`

### Rare Event Charts

#### G Chart (`g_chart/`)

```python
@attrs.define(slots=True)
class GChartConfig:
    k_sigma: float = 3.0

@attrs.define(slots=True)
class GChartResult:
    values: np.ndarray
    limits: ControlLimits
    mu: float
    k_param: float             # negative binomial dispersion

def compute_g_chart(counts_between: np.ndarray, config: GChartConfig) -> GChartResult
```

**Formulas (negative binomial, chi-square approximation — Hoffman 2003):**
- Estimate μ = mean(data) and k via method of moments: k = (variance/mean - 1) if variance > mean, else k = 0
- `v = 2 / (1 + k)` degrees of freedom
- Map k_sigma to α: `α = Φ(-k_sigma)` where Φ is normal CDF
- `UCL = (χ²(v, 1-α) * (1+k) - 1) / 2`
- `LCL = max(0, (χ²(v, α) * (1+k) - 1) / 2)`
- Uses `scipy.stats.chi2.ppf`

#### T Chart (`t_chart/`)

```python
@attrs.define(slots=True)
class TChartConfig:
    k_sigma: float = 3.0

@attrs.define(slots=True)
class TChartResult:
    values: np.ndarray
    limits: ControlLimits
    alpha: float               # Weibull shape
    beta: float                # Weibull scale

def compute_t_chart(times_between: np.ndarray, config: TChartConfig) -> TChartResult
```

**Formulas (Weibull):**
- Estimate α (shape) and β (scale) via `scipy.stats.weibull_min.fit`, excluding zeros
- `p1 = Φ(-K)`, `p2 = Φ(0) = 0.5`, `p3 = Φ(K)` where Φ is normal CDF
- `LCL = WeibullQuantile(p1, α, β)`
- `CL = WeibullQuantile(p2, α, β)`
- `UCL = WeibullQuantile(p3, α, β)`
- Uses `scipy.stats.weibull_min.ppf`

### Multi-Product & Composite Charts

#### Short Run (`short_run/`)

```python
@attrs.define(slots=True)
class ShortRunConfig:
    scaling: str = "centered"        # "centered" or "standardized"
    product_targets: dict[str, float] | None = None
    product_sigmas: dict[str, float] | None = None
    subgrouped: bool = False
    k_sigma: float = 3.0

@attrs.define(slots=True)
class ShortRunResult:
    transformed_values: np.ndarray
    limits: ControlLimits
    sigma: SigmaResult
    product_stats: dict[str, tuple[float, float]]  # {product: (target, sigma)}
    dispersion_values: np.ndarray
    dispersion_limits: ControlLimits

def compute_short_run(
    values: np.ndarray,
    part_labels: np.ndarray,
    config: ShortRunConfig,
    subgroup_sizes: np.ndarray | None = None,
) -> ShortRunResult
```

**Formulas (Wise and Fair 2006):**

Product statistics (auto-computed if not provided):
- Target: `Tj = X̄j` (mean of product j observations)
- Sigma (individual): `σ̂j = MR̄j / d2(2)`
- Sigma (subgrouped): `σ̂j = mean(Rji/d2(nji))`

Centered (Difference) charts:
- Transform: `yi' = yi - Tj`
- `CL = X̄c` (mean of centered values)
- `UCL = X̄c + K*σ̂`, `LCL = X̄c - K*σ̂`

Standardized (Z) charts:
- Transform: `zi = (yi - Tj) / σ̂j`
- `CL = 0`
- `UCL = K / (d2(n)*√n)`, `LCL = -K / (d2(n)*√n)` (individual)

#### Three Way (`three_way/`)

```python
@attrs.define(slots=True)
class ThreeWayConfig:
    within_method: str = "range"     # "range" or "stddev"
    between_method: str = "mr"       # "mr" or "median_mr"
    k_sigma: float = 3.0

@attrs.define(slots=True)
class ThreeWayResult:
    between_chart: ControlLimits
    within_chart: ControlLimits
    sigma_within: float
    sigma_between: float
    sigma_bw: float                  # combined √(σ²within + σ²between)
    subgroup_means: np.ndarray
    subgroup_dispersions: np.ndarray

def compute_three_way(
    data: np.ndarray,
    subgroup_sizes: np.ndarray,
    config: ThreeWayConfig,
) -> ThreeWayResult
```

**Formulas:**
- Within σ (range): `σ̂w = mean(Ri/d2(ni))`
- Within σ (stddev): `σ̂w = mean(si/c4(ni))`
- Between σ: `σ̂b = √((MR̄/d2(2))² - σ̂w²/H)` where H = harmonic mean of ni
- If σ̂b² < 0, set σ̂b = 0
- Combined: `σ̂bw = √(σ̂w² + σ̂b²)`

---

## Rules Engine

### Nelson Tests (`rules/nelson.py`)

Each test is a pure function: `(values, zones/limits/cl) → boolean mask`.

| JMP Test | Classic Nelson | Pattern | Default |
|----------|---------------|---------|---------|
| 1 | 1 | 1 point beyond ±3σ | ON |
| 2 | 5 | 9 consecutive same side of CL | ON |
| 3 | 6 | 6 consecutive increasing or decreasing | ON |
| 4 | 8 | 14 consecutive alternating up and down | ON |
| 5 | 2 | 2 of 3 in Zone A (same side) | ON |
| 6 | 3 | 4 of 5 in Zone B or beyond (same side) | OFF |
| 7 | 4 | 15 consecutive in Zone C (stratification) | OFF |
| 8 | 7 | 8 consecutive outside Zone C (overcontrol) | OFF |

Tests 1-4 apply to all Shewhart charts. Tests 5-8 apply only to variable charts.

### Westgard Rules (`rules/westgard.py`)

| Rule | Pattern |
|------|---------|
| 1_2s | 1 point beyond ±2σ |
| 1_3s | 1 point beyond ±3σ |
| 2_2s | 2 consecutive beyond ±2σ, same side |
| R_4s | consecutive points spanning >4σ |
| 4_1s | 4 consecutive beyond ±1σ, same side |
| 10_x | 10 consecutive same side of CL |

### Test Beyond Limits (`rules/beyond_limits.py`)

Test 15: any point beyond control limits (UCL/LCL). Separate from Nelson Test 1 because it uses actual control limits, not zone boundaries.

### Orchestrator (`rules/models.py`)

```python
@attrs.define(slots=True)
class RuleConfig:
    nelson_tests: tuple[int, ...] = (1, 2, 3, 4, 5)
    westgard_rules: tuple[str, ...] = ()
    custom_params: dict[int, dict] = attrs.Factory(dict)

@attrs.define(slots=True)
class RuleViolation:
    test_id: int | str
    point_indices: np.ndarray
    description: str

def evaluate_rules(
    values: np.ndarray,
    limits: ControlLimits,
    zones: ZoneBreakdown,
    config: RuleConfig = RuleConfig(),
) -> list[RuleViolation]
```

---

## Testing Strategy

### Three Layers

**Layer 1: Known-answer tests (pytest)**

Hand-computed or JMP-verified reference values for every chart type.

- At least one test with manually verified limits per chart
- One edge case (single subgroup, all-identical, etc.)
- One variable-subgroup-size test where applicable
- Constants verified against Harter (1960) published tables for n=2..25

**Layer 2: Property-based tests (hypothesis)**

Statistical invariants that must hold for any valid input:

- UCL ≥ CL ≥ LCL (all charts)
- LCL ≥ 0 (attribute charts, range/MR charts)
- UCL ≤ 1 (P charts), UCL ≤ ni (NP charts)
- Wider k → wider limits (monotonicity)
- Constant data → limits collapse to CL (degenerate handling)
- Laney ≈ standard when no overdispersion (σz ≈ 1.0)
- CUSUM: C+ ≥ 0, C- ≤ 0 always
- EWMA with λ=1.0 ≈ raw data (Shewhart equivalent)
- Nelson tests: synthetic trigger patterns fire; non-trigger patterns don't

**Layer 3: Attrs model validation (hypothesis)**

- Config rejects NaN, Inf, negative k_sigma
- Config rejects invalid enum values (sigma_method, scaling, etc.)
- Result objects round-trip through attrs asdict/from-dict

### Rules Testing

Each Nelson/Westgard test gets:
- A synthetic signal designed to trigger it
- A synthetic signal designed to NOT trigger it (off-by-one)
- Edge cases: empty array, single point, exactly N points

---

## Project Setup

### pyproject.toml

```toml
[project]
name = "super-spc-algo"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "numpy>=1.24",
    "attrs>=23.1",
    "scipy>=1.11",
]

[project.optional-dependencies]
dev = [
    "pytest>=7.4",
    "hypothesis>=6.82",
    "pytest-cov>=4.1",
]

[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = "-v --tb=short"

[tool.ruff]
line-length = 100
```

---

## Chart Type Summary

| Chart | Directory | Input | Sigma Method | Distribution |
|-------|-----------|-------|-------------|--------------|
| XBar-R | `xbar_r/` | 2D + subgroup_sizes | Range | Normal |
| XBar-S | `xbar_s/` | 2D + subgroup_sizes | Std Dev | Normal |
| IMR | `imr/` | 1D | Moving Range / Median MR | Normal |
| Levey-Jennings | `levey_jennings/` | 1D or 2D | Overall Std Dev | Normal |
| P | `p_chart/` | defectives + n_trials | Binomial | Binomial |
| NP | `np_chart/` | defectives + n_trials | Binomial | Binomial |
| C | `c_chart/` | defects + n_units | Poisson | Poisson |
| U | `u_chart/` | defects + n_units | Poisson | Poisson |
| Laney P' | `laney_p/` | defectives + n_trials | Binomial + MR adj | Binomial |
| Laney U' | `laney_u/` | defects + n_units | Poisson + MR adj | Poisson |
| CUSUM | `cusum/` | 1D | User-provided | Normal |
| EWMA | `ewma/` | 1D | User-provided | Normal |
| G | `g_chart/` | counts_between | Negative Binomial | Neg. Binomial |
| T | `t_chart/` | times_between | Weibull | Weibull |
| Short Run | `short_run/` | 1D/2D + part_labels | Per-product MR/Range | Normal |
| Three Way | `three_way/` | 2D + subgroup_sizes | Within + Between | Normal |

---

## Eng Review Decisions (2026-03-26)

| # | Decision | Choice |
|---|----------|--------|
| 1 | `ControlLimits.cl` type | `np.ndarray` (was `float`) — future-proofs for per-subgroup CL |
| 2 | `evaluate_rules` location | New `rules/evaluate.py` — separates orchestration from data models |
| 3 | String config fields | `StrEnum` (`SigmaMethod`, `ScalingMethod`, etc.) — compile-time safety + runtime validation |
| 4 | Attribute chart DRY | New `common/attribute.py` — shared `compute_p_bar()`, `compute_u_bar()`, `compute_binomial_limits()`, `compute_poisson_limits()` |
| 5 | XBar/Zone DRY | New `common/zones.py` — shared `compute_zones()` + shared XBar limit helper |
| 6 | Config validation | Full `attrs` validators on all Config classes — k_sigma > 0, 0 < lambda_ <= 1, etc. |
| 7 | Reference test data | Hand-compute from JMP formulas with small datasets, cross-check against JMP's documented examples |
| 8 | EWMA exact limits | Recursive O(n) update: `variance_i = λ² * variance_{i-1} + 1/ni` |

### Updated Package Structure (post-review)

New files added by review:
- `common/attribute.py` — shared attribute chart computation helpers
- `common/zones.py` — shared zone breakdown computation
- `rules/evaluate.py` — rules orchestrator (moved from `rules/models.py`)
- `common/enums.py` — StrEnum definitions (SigmaMethod, ScalingMethod, WithinMethod, BetweenMethod)

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 8 issues, 2 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |

**UNRESOLVED:** 0
**VERDICT:** ENG CLEARED — ready to implement
