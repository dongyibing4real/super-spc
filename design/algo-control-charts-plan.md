# Control Chart Algorithm Package — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a pure-computation Python package implementing all JMP control chart algorithms — 16 chart types, Nelson/Westgard rules, sigma estimators, and SPC constants.

**Architecture:** Flat module-per-chart with shared foundation (`constants/`, `common/`, `rules/`). Each chart module has `models.py` (attrs config/result), `compute.py` (numpy algorithm), `__init__.py` (re-exports). Pure functions — numpy arrays in, attrs results out.

**Tech Stack:** Python 3.11+, numpy, attrs, scipy (distributions only), pytest, hypothesis

**Spec:** `design/algo-control-charts-design.md`

---

## File Map

```
algo/
  __init__.py
  py.typed
  constants/
    __init__.py
    tables.py              # d2, d3, c4, c5 for n=2..50
    factors.py             # A2, A3, B3, B4, D3, D4
  common/
    __init__.py
    enums.py               # SigmaMethod, ScalingMethod, etc.
    types.py               # ControlLimits, ZoneBreakdown, SigmaResult
    validators.py          # attrs validator helpers
    sigma.py               # 8 sigma estimators
    zones.py               # compute_zones() shared helper
    attribute.py           # compute_p_bar, compute_u_bar, binomial/poisson limits
  rules/
    __init__.py
    models.py              # RuleConfig, RuleViolation
    nelson.py              # Nelson tests 1-8
    westgard.py            # Westgard rules
    beyond_limits.py       # Test 15
    evaluate.py            # Orchestrator
  xbar_r/
    __init__.py, models.py, compute.py
  xbar_s/
    __init__.py, models.py, compute.py
  imr/
    __init__.py, models.py, compute.py
  levey_jennings/
    __init__.py, models.py, compute.py
  p_chart/
    __init__.py, models.py, compute.py
  np_chart/
    __init__.py, models.py, compute.py
  c_chart/
    __init__.py, models.py, compute.py
  u_chart/
    __init__.py, models.py, compute.py
  laney_p/
    __init__.py, models.py, compute.py
  laney_u/
    __init__.py, models.py, compute.py
  cusum/
    __init__.py, models.py, compute.py, arl.py
  ewma/
    __init__.py, models.py, compute.py
  g_chart/
    __init__.py, models.py, compute.py
  t_chart/
    __init__.py, models.py, compute.py
  short_run/
    __init__.py, models.py, compute.py
  three_way/
    __init__.py, models.py, compute.py
tests/
  conftest.py
  test_constants/
    test_tables.py, test_factors.py
  test_common/
    test_sigma.py, test_validators.py, test_zones.py, test_attribute.py
  test_rules/
    test_nelson.py, test_westgard.py, test_evaluate.py
  test_xbar_r.py, test_xbar_s.py, test_imr.py, test_levey_jennings.py
  test_p_chart.py, test_np_chart.py, test_c_chart.py, test_u_chart.py
  test_laney_p.py, test_laney_u.py
  test_cusum.py, test_ewma.py
  test_g_chart.py, test_t_chart.py
  test_short_run.py, test_three_way.py
pyproject.toml
```

## Dependency Order

```
Task 1: Project scaffold + pyproject.toml
Task 2: Constants tables (d2, d3, c4, c5)
Task 3: Constants factors (A2, A3, B3, B4, D3, D4)
Task 4: Enums + core types (ControlLimits, ZoneBreakdown, SigmaResult)
Task 5: Validators
Task 6: Zones helper
Task 7: Sigma estimators (range, stddev, moving_range, median_mr, levey_jennings)
Task 8: Sigma estimators (binomial, poisson, laney_adjustment)
Task 9: Attribute helpers (p_bar, u_bar, binomial/poisson limits)
   │
   ├── Task 10: XBar-R chart
   ├── Task 11: XBar-S chart
   ├── Task 12: IMR chart
   ├── Task 13: Levey-Jennings chart
   ├── Task 14: P chart
   ├── Task 15: NP chart
   ├── Task 16: C chart
   ├── Task 17: U chart
   ├── Task 18: Laney P' chart
   ├── Task 19: Laney U' chart
   ├── Task 20: CUSUM chart
   ├── Task 21: CUSUM ARL
   ├── Task 22: EWMA chart
   ├── Task 23: G chart
   ├── Task 24: T chart
   ├── Task 25: Short Run chart
   ├── Task 26: Three Way chart
   │
Task 27: Nelson tests 1-4
Task 28: Nelson tests 5-8
Task 29: Westgard rules
Task 30: Beyond limits + evaluate orchestrator
Task 31: Top-level __init__.py re-exports
Task 32: Property-based hypothesis tests
```

Tasks 10-26 can be parallelized (independent chart modules).
Tasks 27-30 can be parallelized (independent rule modules).

---

### Task 1: Project Scaffold

**Files:**
- Create: `algo/pyproject.toml`
- Create: `algo/__init__.py`
- Create: `algo/py.typed`
- Create: `algo/constants/__init__.py`
- Create: `algo/common/__init__.py`
- Create: `algo/rules/__init__.py`
- Create: `tests/conftest.py`

- [ ] **Step 1: Create pyproject.toml**

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

- [ ] **Step 2: Create empty package files**

`algo/__init__.py`:
```python
"""Super SPC Algorithm Package — Control Chart Computations."""
```

`algo/py.typed`: empty file (PEP 561 marker)

`algo/constants/__init__.py`:
```python
from .tables import d2, d3, c4, c5
from .factors import A2, A3, B3, B4, D3, D4
```

`algo/common/__init__.py`:
```python
from .types import ControlLimits, ZoneBreakdown, SigmaResult
from .enums import SigmaMethod, ScalingMethod
```

`algo/rules/__init__.py`:
```python
from .models import RuleConfig, RuleViolation
from .evaluate import evaluate_rules
```

- [ ] **Step 3: Create tests/conftest.py**

```python
import numpy as np
import pytest


@pytest.fixture
def rng():
    """Reproducible random number generator."""
    return np.random.default_rng(42)


def assert_limits_valid(limits):
    """Assert UCL >= CL >= LCL element-wise."""
    ucl = np.atleast_1d(limits.ucl)
    cl = np.atleast_1d(limits.cl)
    lcl = np.atleast_1d(limits.lcl)
    assert np.all(ucl >= cl), f"UCL < CL: {ucl} < {cl}"
    assert np.all(cl >= lcl), f"CL < LCL: {cl} < {lcl}"
```

- [ ] **Step 4: Install in dev mode and verify**

Run: `cd algo && pip install -e ".[dev]" && pytest --co -q`
Expected: "no tests ran" (no test files yet), no import errors

- [ ] **Step 5: Commit**

```bash
git add algo/ tests/ pyproject.toml
git commit -m "feat: scaffold algo package with pyproject.toml and empty modules"
```

---

### Task 2: Constants Tables

**Files:**
- Create: `algo/constants/tables.py`
- Create: `tests/test_constants/test_tables.py`

- [ ] **Step 1: Write failing tests for d2, d3, c4, c5**

```python
import pytest
import numpy as np
from algo.constants.tables import d2, d3, c4, c5


# Harter (1960) published values
KNOWN_D2 = {
    2: 1.128, 3: 1.693, 4: 2.059, 5: 2.326, 6: 2.534,
    7: 2.704, 8: 2.847, 9: 2.970, 10: 3.078, 15: 3.472,
    20: 3.735, 25: 3.931,
}

KNOWN_D3 = {
    2: 0.8525, 3: 0.8884, 4: 0.8798, 5: 0.8641,
    6: 0.8480, 7: 0.8332, 8: 0.8198, 9: 0.8078, 10: 0.7971,
}

KNOWN_C4 = {
    2: 0.7979, 3: 0.8862, 4: 0.9213, 5: 0.9400,
    6: 0.9515, 7: 0.9594, 8: 0.9650, 9: 0.9693, 10: 0.9727,
    15: 0.9823, 20: 0.9869, 25: 0.9896,
}

KNOWN_C5 = {
    2: 0.6028, 3: 0.4633, 4: 0.3889, 5: 0.3412,
    6: 0.3076, 7: 0.2820, 8: 0.2622, 9: 0.2459, 10: 0.2321,
}


class TestD2:
    @pytest.mark.parametrize("n, expected", KNOWN_D2.items())
    def test_known_values(self, n, expected):
        assert abs(d2(n) - expected) < 0.001

    def test_clamp_above_50(self):
        assert d2(51) == d2(50)
        assert d2(100) == d2(50)

    def test_rejects_below_2(self):
        with pytest.raises(ValueError):
            d2(1)
        with pytest.raises(ValueError):
            d2(0)


class TestD3:
    @pytest.mark.parametrize("n, expected", KNOWN_D3.items())
    def test_known_values(self, n, expected):
        assert abs(d3(n) - expected) < 0.001

    def test_clamp_above_50(self):
        assert d3(51) == d3(50)

    def test_rejects_below_2(self):
        with pytest.raises(ValueError):
            d3(1)


class TestC4:
    @pytest.mark.parametrize("n, expected", KNOWN_C4.items())
    def test_known_values(self, n, expected):
        assert abs(c4(n) - expected) < 0.001

    def test_clamp_above_50(self):
        assert c4(51) == c4(50)

    def test_rejects_below_2(self):
        with pytest.raises(ValueError):
            c4(1)

    def test_c4_less_than_1(self):
        """c4(n) is always < 1 for finite n."""
        for n in range(2, 51):
            assert c4(n) < 1.0


class TestC5:
    @pytest.mark.parametrize("n, expected", KNOWN_C5.items())
    def test_known_values(self, n, expected):
        assert abs(c5(n) - expected) < 0.001

    def test_clamp_above_50(self):
        assert c5(51) == c5(50)

    def test_rejects_below_2(self):
        with pytest.raises(ValueError):
            c5(1)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_constants/test_tables.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'algo.constants.tables'`

- [ ] **Step 3: Implement tables.py**

```python
"""Control chart constants from Harter (1960).

d2(n): expected value of range of n independent normal variates with unit σ.
d3(n): std deviation of range of n independent normal variates with unit σ.
c4(n): expected value of s for n independent normal variates with unit σ.
c5(n): std error of s for n independent normal variates with unit σ.

For n > 50, JMP uses constants for n = 50. We match that behavior.
"""

_D2_TABLE: dict[int, float] = {
    2: 1.128, 3: 1.693, 4: 2.059, 5: 2.326, 6: 2.534,
    7: 2.704, 8: 2.847, 9: 2.970, 10: 3.078, 11: 3.173,
    12: 3.258, 13: 3.336, 14: 3.407, 15: 3.472, 16: 3.532,
    17: 3.588, 18: 3.640, 19: 3.689, 20: 3.735, 21: 3.778,
    22: 3.819, 23: 3.858, 24: 3.895, 25: 3.931, 26: 3.964,
    27: 3.997, 28: 4.027, 29: 4.057, 30: 4.086, 31: 4.113,
    32: 4.139, 33: 4.165, 34: 4.189, 35: 4.213, 36: 4.236,
    37: 4.259, 38: 4.280, 39: 4.301, 40: 4.322, 41: 4.341,
    42: 4.361, 43: 4.379, 44: 4.398, 45: 4.415, 46: 4.433,
    47: 4.450, 48: 4.466, 49: 4.482, 50: 4.498,
}

_D3_TABLE: dict[int, float] = {
    2: 0.8525, 3: 0.8884, 4: 0.8798, 5: 0.8641, 6: 0.8480,
    7: 0.8332, 8: 0.8198, 9: 0.8078, 10: 0.7971, 11: 0.7873,
    12: 0.7785, 13: 0.7704, 14: 0.7630, 15: 0.7562, 16: 0.7499,
    17: 0.7441, 18: 0.7386, 19: 0.7335, 20: 0.7287, 21: 0.7242,
    22: 0.7199, 23: 0.7159, 24: 0.7121, 25: 0.7084, 26: 0.7050,
    27: 0.7017, 28: 0.6986, 29: 0.6955, 30: 0.6927, 31: 0.6899,
    32: 0.6873, 33: 0.6847, 34: 0.6823, 35: 0.6799, 36: 0.6777,
    37: 0.6755, 38: 0.6734, 39: 0.6713, 40: 0.6694, 41: 0.6675,
    42: 0.6657, 43: 0.6639, 44: 0.6622, 45: 0.6605, 46: 0.6589,
    47: 0.6574, 48: 0.6559, 49: 0.6544, 50: 0.6530,
}

_C4_TABLE: dict[int, float] = {
    2: 0.7979, 3: 0.8862, 4: 0.9213, 5: 0.9400, 6: 0.9515,
    7: 0.9594, 8: 0.9650, 9: 0.9693, 10: 0.9727, 11: 0.9754,
    12: 0.9776, 13: 0.9794, 14: 0.9810, 15: 0.9823, 16: 0.9835,
    17: 0.9845, 18: 0.9854, 19: 0.9862, 20: 0.9869, 21: 0.9876,
    22: 0.9882, 23: 0.9887, 24: 0.9892, 25: 0.9896, 26: 0.9901,
    27: 0.9904, 28: 0.9908, 29: 0.9911, 30: 0.9914, 31: 0.9917,
    32: 0.9920, 33: 0.9922, 34: 0.9925, 35: 0.9927, 36: 0.9929,
    37: 0.9931, 38: 0.9933, 39: 0.9935, 40: 0.9936, 41: 0.9938,
    42: 0.9939, 43: 0.9941, 44: 0.9942, 45: 0.9943, 46: 0.9945,
    47: 0.9946, 48: 0.9947, 49: 0.9948, 50: 0.9949,
}

_C5_TABLE: dict[int, float] = {
    2: 0.6028, 3: 0.4633, 4: 0.3889, 5: 0.3412, 6: 0.3076,
    7: 0.2820, 8: 0.2622, 9: 0.2459, 10: 0.2321, 11: 0.2202,
    12: 0.2098, 13: 0.2006, 14: 0.1924, 15: 0.1849, 16: 0.1783,
    17: 0.1722, 18: 0.1667, 19: 0.1616, 20: 0.1569, 21: 0.1526,
    22: 0.1485, 23: 0.1448, 24: 0.1413, 25: 0.1380, 26: 0.1349,
    27: 0.1320, 28: 0.1292, 29: 0.1266, 30: 0.1242, 31: 0.1219,
    32: 0.1197, 33: 0.1176, 34: 0.1156, 35: 0.1137, 36: 0.1119,
    37: 0.1101, 38: 0.1085, 39: 0.1069, 40: 0.1054, 41: 0.1039,
    42: 0.1025, 43: 0.1012, 44: 0.0999, 45: 0.0987, 46: 0.0975,
    47: 0.0963, 48: 0.0952, 49: 0.0942, 50: 0.0932,
}


def _lookup(table: dict[int, float], n: int, name: str) -> float:
    if n < 2:
        raise ValueError(f"{name}(n) requires n >= 2, got n={n}")
    return table[min(n, 50)]


def d2(n: int) -> float:
    """Expected value of range of n normal variates with unit std dev."""
    return _lookup(_D2_TABLE, n, "d2")


def d3(n: int) -> float:
    """Std deviation of range of n normal variates with unit std dev."""
    return _lookup(_D3_TABLE, n, "d3")


def c4(n: int) -> float:
    """Expected value of s for n normal variates with unit std dev."""
    return _lookup(_C4_TABLE, n, "c4")


def c5(n: int) -> float:
    """Std error of s for n normal variates with unit std dev."""
    return _lookup(_C5_TABLE, n, "c5")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_constants/test_tables.py -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add algo/constants/tables.py tests/test_constants/
git commit -m "feat: add control chart constants tables (d2, d3, c4, c5) from Harter 1960"
```

---

### Task 3: Constants Factors

**Files:**
- Create: `algo/constants/factors.py`
- Create: `tests/test_constants/test_factors.py`

- [ ] **Step 1: Write failing tests**

```python
import pytest
import numpy as np
from algo.constants.factors import A2, A3, B3, B4, D3, D4


# Published standard factor tables (k=3 assumed)
KNOWN_A2 = {2: 1.880, 3: 1.023, 4: 0.729, 5: 0.577, 10: 0.308}
KNOWN_D3_FACTOR = {2: 0.0, 3: 0.0, 4: 0.0, 5: 0.0, 6: 0.0, 7: 0.076}
KNOWN_D4_FACTOR = {2: 3.267, 3: 2.575, 4: 2.282, 5: 2.114, 10: 1.777}
KNOWN_B3 = {2: 0.0, 3: 0.0, 4: 0.0, 5: 0.0, 6: 0.030}
KNOWN_B4 = {2: 3.267, 3: 2.568, 4: 2.266, 5: 2.089, 10: 1.716}
KNOWN_A3 = {2: 2.659, 3: 1.954, 4: 1.628, 5: 1.427, 10: 0.975}


class TestA2:
    @pytest.mark.parametrize("n, expected", KNOWN_A2.items())
    def test_known_values(self, n, expected):
        assert abs(A2(n) - expected) < 0.002


class TestD3Factor:
    @pytest.mark.parametrize("n, expected", KNOWN_D3_FACTOR.items())
    def test_known_values(self, n, expected):
        assert abs(D3(n) - expected) < 0.002

    def test_d3_non_negative(self):
        for n in range(2, 51):
            assert D3(n) >= 0.0


class TestD4Factor:
    @pytest.mark.parametrize("n, expected", KNOWN_D4_FACTOR.items())
    def test_known_values(self, n, expected):
        assert abs(D4(n) - expected) < 0.002

    def test_d4_greater_than_d3(self):
        for n in range(2, 51):
            assert D4(n) > D3(n)


class TestB3:
    @pytest.mark.parametrize("n, expected", KNOWN_B3.items())
    def test_known_values(self, n, expected):
        assert abs(B3(n) - expected) < 0.002

    def test_b3_non_negative(self):
        for n in range(2, 51):
            assert B3(n) >= 0.0


class TestB4:
    @pytest.mark.parametrize("n, expected", KNOWN_B4.items())
    def test_known_values(self, n, expected):
        assert abs(B4(n) - expected) < 0.002


class TestA3:
    @pytest.mark.parametrize("n, expected", KNOWN_A3.items())
    def test_known_values(self, n, expected):
        assert abs(A3(n) - expected) < 0.002
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_constants/test_factors.py -v`
Expected: FAIL

- [ ] **Step 3: Implement factors.py**

```python
"""Derived control chart factors expressed in terms of d2/d3/c4/c5.

These hardcode k=3 (traditional tabled constants). Actual compute functions
use k_sigma from config with raw d2/d3/c4/c5 values directly.
"""

import math
from .tables import d2, d3, c4, c5


def A2(n: int) -> float:
    """XBar-R factor: UCL = X_bar + A2 * R_bar."""
    return 3.0 / (d2(n) * math.sqrt(n))


def A3(n: int) -> float:
    """XBar-S factor: UCL = X_bar + A3 * S_bar."""
    return 3.0 / (c4(n) * math.sqrt(n))


def D3(n: int) -> float:
    """R chart lower factor: LCL = D3 * R_bar."""
    return max(1.0 - 3.0 * d3(n) / d2(n), 0.0)


def D4(n: int) -> float:
    """R chart upper factor: UCL = D4 * R_bar."""
    return 1.0 + 3.0 * d3(n) / d2(n)


def B3(n: int) -> float:
    """S chart lower factor: LCL = B3 * S_bar."""
    return max(1.0 - 3.0 * c5(n) / c4(n), 0.0)


def B4(n: int) -> float:
    """S chart upper factor: UCL = B4 * S_bar."""
    return 1.0 + 3.0 * c5(n) / c4(n)
```

- [ ] **Step 4: Run tests**

Run: `pytest tests/test_constants/ -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add algo/constants/factors.py tests/test_constants/test_factors.py
git commit -m "feat: add derived control chart factors (A2, A3, B3, B4, D3, D4)"
```

---

### Task 4: Enums + Core Types

**Files:**
- Create: `algo/common/enums.py`
- Create: `algo/common/types.py`

- [ ] **Step 1: Implement enums.py**

```python
"""StrEnum definitions for configuration fields."""

from enum import StrEnum


class SigmaMethod(StrEnum):
    RANGE = "range"
    STDDEV = "stddev"
    MOVING_RANGE = "moving_range"
    MEDIAN_MOVING_RANGE = "median_moving_range"
    LEVEY_JENNINGS = "levey_jennings"
    BINOMIAL = "binomial"
    POISSON = "poisson"


class ScalingMethod(StrEnum):
    CENTERED = "centered"
    STANDARDIZED = "standardized"


class WithinMethod(StrEnum):
    RANGE = "range"
    STDDEV = "stddev"


class BetweenMethod(StrEnum):
    MOVING_RANGE = "mr"
    MEDIAN_MOVING_RANGE = "median_mr"
```

- [ ] **Step 2: Implement types.py**

```python
"""Core shared types for all control chart computations."""

import attrs
import numpy as np
from .enums import SigmaMethod


@attrs.define(slots=True)
class ControlLimits:
    """Control limits for a chart."""
    ucl: np.ndarray
    cl: np.ndarray
    lcl: np.ndarray
    k_sigma: float


@attrs.define(slots=True)
class ZoneBreakdown:
    """Zone boundaries for Nelson/Westgard rule evaluation.

    Each zone is 1σ wide from the center line outward:
      Zone C: CL ± 1σ
      Zone B: CL ± 1σ to CL ± 2σ
      Zone A: CL ± 2σ to CL ± 3σ
    """
    zone_a_upper: float  # CL + 2σ boundary
    zone_b_upper: float  # CL + 1σ boundary
    cl: float            # center line
    zone_b_lower: float  # CL - 1σ boundary
    zone_a_lower: float  # CL - 2σ boundary


@attrs.define(slots=True)
class SigmaResult:
    """Result of sigma estimation."""
    sigma_hat: float
    method: SigmaMethod
    n_used: int
```

- [ ] **Step 3: Verify imports work**

Run: `python -c "from algo.common import ControlLimits, ZoneBreakdown, SigmaResult, SigmaMethod; print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add algo/common/enums.py algo/common/types.py
git commit -m "feat: add StrEnum definitions and core types (ControlLimits, ZoneBreakdown, SigmaResult)"
```

---

### Task 5: Validators

**Files:**
- Create: `algo/common/validators.py`
- Create: `tests/test_common/test_validators.py`

- [ ] **Step 1: Write failing tests**

```python
import pytest
import numpy as np
from algo.common.validators import validate_positive, validate_range, validate_1d_array, validate_non_empty


class TestValidatePositive:
    def test_positive_passes(self):
        validate_positive(3.0, "k_sigma")

    def test_zero_fails(self):
        with pytest.raises(ValueError, match="k_sigma must be positive"):
            validate_positive(0.0, "k_sigma")

    def test_negative_fails(self):
        with pytest.raises(ValueError, match="k_sigma must be positive"):
            validate_positive(-1.0, "k_sigma")

    def test_nan_fails(self):
        with pytest.raises(ValueError, match="k_sigma must be finite"):
            validate_positive(float("nan"), "k_sigma")

    def test_inf_fails(self):
        with pytest.raises(ValueError, match="k_sigma must be finite"):
            validate_positive(float("inf"), "k_sigma")


class TestValidateRange:
    def test_in_range_passes(self):
        validate_range(0.5, 0.0, 1.0, "lambda_", low_exclusive=True)

    def test_below_range_fails(self):
        with pytest.raises(ValueError):
            validate_range(0.0, 0.0, 1.0, "lambda_", low_exclusive=True)


class TestValidate1dArray:
    def test_1d_passes(self):
        arr = validate_1d_array(np.array([1.0, 2.0, 3.0]), "values")
        assert arr.ndim == 1

    def test_2d_fails(self):
        with pytest.raises(ValueError, match="values must be 1D"):
            validate_1d_array(np.array([[1, 2], [3, 4]]), "values")

    def test_converts_list(self):
        arr = validate_1d_array([1.0, 2.0], "values")
        assert isinstance(arr, np.ndarray)


class TestValidateNonEmpty:
    def test_non_empty_passes(self):
        validate_non_empty(np.array([1.0]), "values")

    def test_empty_fails(self):
        with pytest.raises(ValueError, match="values must not be empty"):
            validate_non_empty(np.array([]), "values")
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_common/test_validators.py -v`
Expected: FAIL

- [ ] **Step 3: Implement validators.py**

```python
"""Input validation helpers for attrs validators and compute functions."""

import math
import numpy as np


def validate_positive(value: float, name: str) -> None:
    if not math.isfinite(value):
        raise ValueError(f"{name} must be finite, got {value}")
    if value <= 0:
        raise ValueError(f"{name} must be positive, got {value}")


def validate_non_negative(value: float, name: str) -> None:
    if not math.isfinite(value):
        raise ValueError(f"{name} must be finite, got {value}")
    if value < 0:
        raise ValueError(f"{name} must be non-negative, got {value}")


def validate_range(
    value: float,
    low: float,
    high: float,
    name: str,
    low_exclusive: bool = False,
    high_exclusive: bool = False,
) -> None:
    if not math.isfinite(value):
        raise ValueError(f"{name} must be finite, got {value}")
    if low_exclusive and value <= low:
        raise ValueError(f"{name} must be > {low}, got {value}")
    elif not low_exclusive and value < low:
        raise ValueError(f"{name} must be >= {low}, got {value}")
    if high_exclusive and value >= high:
        raise ValueError(f"{name} must be < {high}, got {value}")
    elif not high_exclusive and value > high:
        raise ValueError(f"{name} must be <= {high}, got {value}")


def validate_1d_array(arr, name: str) -> np.ndarray:
    arr = np.asarray(arr, dtype=np.float64)
    if arr.ndim != 1:
        raise ValueError(f"{name} must be 1D, got shape {arr.shape}")
    return arr


def validate_non_empty(arr: np.ndarray, name: str) -> None:
    if arr.size == 0:
        raise ValueError(f"{name} must not be empty")
```

- [ ] **Step 4: Run tests**

Run: `pytest tests/test_common/test_validators.py -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add algo/common/validators.py tests/test_common/test_validators.py
git commit -m "feat: add input validation helpers"
```

---

### Task 6: Zones Helper

**Files:**
- Create: `algo/common/zones.py`
- Create: `tests/test_common/test_zones.py`

- [ ] **Step 1: Write failing tests**

```python
import pytest
import numpy as np
from algo.common.zones import compute_zones


class TestComputeZones:
    def test_standard_zones(self):
        zones = compute_zones(cl=10.0, sigma_hat=1.0)
        assert zones.cl == 10.0
        assert zones.zone_b_upper == pytest.approx(11.0)  # CL + 1σ
        assert zones.zone_a_upper == pytest.approx(12.0)  # CL + 2σ
        assert zones.zone_b_lower == pytest.approx(9.0)   # CL - 1σ
        assert zones.zone_a_lower == pytest.approx(8.0)   # CL - 2σ

    def test_zero_sigma(self):
        """Zero sigma produces all zones collapsed to CL."""
        zones = compute_zones(cl=5.0, sigma_hat=0.0)
        assert zones.zone_a_upper == 5.0
        assert zones.zone_b_upper == 5.0
        assert zones.zone_b_lower == 5.0
        assert zones.zone_a_lower == 5.0

    def test_negative_cl(self):
        zones = compute_zones(cl=-3.0, sigma_hat=2.0)
        assert zones.zone_b_upper == pytest.approx(-1.0)
        assert zones.zone_a_lower == pytest.approx(-7.0)
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_common/test_zones.py -v`
Expected: FAIL

- [ ] **Step 3: Implement zones.py**

```python
"""Zone breakdown computation shared by all Shewhart charts."""

from .types import ZoneBreakdown


def compute_zones(cl: float, sigma_hat: float) -> ZoneBreakdown:
    """Compute zone boundaries from center line and sigma estimate.

    Zone C: CL ± 1σ (inner)
    Zone B: CL ± 1σ to CL ± 2σ (middle)
    Zone A: CL ± 2σ to CL ± 3σ (outer)
    """
    return ZoneBreakdown(
        zone_a_upper=cl + 2.0 * sigma_hat,
        zone_b_upper=cl + 1.0 * sigma_hat,
        cl=cl,
        zone_b_lower=cl - 1.0 * sigma_hat,
        zone_a_lower=cl - 2.0 * sigma_hat,
    )
```

- [ ] **Step 4: Run tests**

Run: `pytest tests/test_common/test_zones.py -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add algo/common/zones.py tests/test_common/test_zones.py
git commit -m "feat: add zone breakdown computation helper"
```

---

### Task 7: Sigma Estimators (Variable Charts)

**Files:**
- Create: `algo/common/sigma.py`
- Create: `tests/test_common/test_sigma.py`

- [ ] **Step 1: Write failing tests**

```python
import pytest
import numpy as np
from algo.common.sigma import (
    sigma_from_ranges,
    sigma_from_stddevs,
    sigma_from_moving_range,
    sigma_from_median_moving_range,
    sigma_levey_jennings,
)
from algo.common.enums import SigmaMethod


class TestSigmaFromRanges:
    def test_known_answer(self):
        """3 subgroups of size 5. d2(5) = 2.326."""
        ranges = np.array([2.0, 3.0, 2.5])
        sizes = np.array([5, 5, 5])
        result = sigma_from_ranges(ranges, sizes)
        # sigma_hat = mean(Ri/d2(ni)) = mean(2/2.326, 3/2.326, 2.5/2.326)
        expected = np.mean([2.0 / 2.326, 3.0 / 2.326, 2.5 / 2.326])
        assert result.sigma_hat == pytest.approx(expected, rel=1e-4)
        assert result.method == SigmaMethod.RANGE
        assert result.n_used == 3

    def test_variable_subgroup_sizes(self):
        ranges = np.array([1.5, 2.0])
        sizes = np.array([3, 5])
        result = sigma_from_ranges(ranges, sizes)
        # sigma_hat = mean(1.5/d2(3), 2.0/d2(5)) = mean(1.5/1.693, 2.0/2.326)
        expected = np.mean([1.5 / 1.693, 2.0 / 2.326])
        assert result.sigma_hat == pytest.approx(expected, rel=1e-3)

    def test_single_subgroup_size_1_excluded(self):
        """Subgroups with size < 2 produce no range; they are excluded."""
        ranges = np.array([0.0, 2.0])  # first has size 1
        sizes = np.array([1, 5])
        result = sigma_from_ranges(ranges, sizes)
        expected = 2.0 / 2.326
        assert result.sigma_hat == pytest.approx(expected, rel=1e-3)
        assert result.n_used == 1


class TestSigmaFromStddevs:
    def test_known_answer(self):
        stddevs = np.array([1.0, 1.5, 1.2])
        sizes = np.array([5, 5, 5])
        result = sigma_from_stddevs(stddevs, sizes)
        # sigma_hat = mean(si/c4(ni))
        expected = np.mean([1.0 / 0.9400, 1.5 / 0.9400, 1.2 / 0.9400])
        assert result.sigma_hat == pytest.approx(expected, rel=1e-3)
        assert result.method == SigmaMethod.STDDEV


class TestSigmaFromMovingRange:
    def test_known_answer(self):
        """values = [10, 12, 11, 13, 10]. MR = [2, 1, 2, 3]. MR_bar = 2.0."""
        values = np.array([10.0, 12.0, 11.0, 13.0, 10.0])
        result = sigma_from_moving_range(values)
        mr = np.abs(np.diff(values))  # [2, 1, 2, 3]
        mr_bar = np.mean(mr)  # 2.0
        expected = mr_bar / 1.128  # d2(2) = 1.128
        assert result.sigma_hat == pytest.approx(expected, rel=1e-3)
        assert result.method == SigmaMethod.MOVING_RANGE
        assert result.n_used == 5

    def test_constant_data(self):
        values = np.array([5.0, 5.0, 5.0, 5.0])
        result = sigma_from_moving_range(values)
        assert result.sigma_hat == 0.0

    def test_two_points(self):
        values = np.array([10.0, 12.0])
        result = sigma_from_moving_range(values)
        expected = 2.0 / 1.128
        assert result.sigma_hat == pytest.approx(expected, rel=1e-3)


class TestSigmaFromMedianMovingRange:
    def test_known_answer(self):
        values = np.array([10.0, 12.0, 11.0, 13.0, 10.0])
        result = sigma_from_median_moving_range(values)
        mr = np.abs(np.diff(values))  # [2, 1, 2, 3]
        mmr = np.median(mr)  # 2.0
        expected = mmr / 0.954
        assert result.sigma_hat == pytest.approx(expected, rel=1e-3)
        assert result.method == SigmaMethod.MEDIAN_MOVING_RANGE


class TestSigmaLeveyJennings:
    def test_known_answer(self):
        values = np.array([10.0, 12.0, 11.0, 13.0, 10.0])
        result = sigma_levey_jennings(values)
        expected = np.std(values, ddof=1)
        assert result.sigma_hat == pytest.approx(expected, rel=1e-10)
        assert result.method == SigmaMethod.LEVEY_JENNINGS
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_common/test_sigma.py -v`
Expected: FAIL

- [ ] **Step 3: Implement sigma.py**

```python
"""Sigma estimation methods for control charts."""

import numpy as np
from ..constants.tables import d2, c4
from .types import SigmaResult
from .enums import SigmaMethod
from .validators import validate_1d_array, validate_non_empty


def sigma_from_ranges(ranges: np.ndarray, subgroup_sizes: np.ndarray) -> SigmaResult:
    """σ̂ = mean(Ri/d2(ni)) for subgroups with ni >= 2."""
    ranges = validate_1d_array(ranges, "ranges")
    subgroup_sizes = validate_1d_array(subgroup_sizes, "subgroup_sizes").astype(int)
    mask = subgroup_sizes >= 2
    if not np.any(mask):
        return SigmaResult(sigma_hat=0.0, method=SigmaMethod.RANGE, n_used=0)
    d2_vals = np.array([d2(int(n)) for n in subgroup_sizes[mask]])
    sigma_hat = float(np.mean(ranges[mask] / d2_vals))
    return SigmaResult(sigma_hat=sigma_hat, method=SigmaMethod.RANGE, n_used=int(np.sum(mask)))


def sigma_from_stddevs(stddevs: np.ndarray, subgroup_sizes: np.ndarray) -> SigmaResult:
    """σ̂ = mean(si/c4(ni)) for subgroups with ni >= 2."""
    stddevs = validate_1d_array(stddevs, "stddevs")
    subgroup_sizes = validate_1d_array(subgroup_sizes, "subgroup_sizes").astype(int)
    mask = subgroup_sizes >= 2
    if not np.any(mask):
        return SigmaResult(sigma_hat=0.0, method=SigmaMethod.STDDEV, n_used=0)
    c4_vals = np.array([c4(int(n)) for n in subgroup_sizes[mask]])
    sigma_hat = float(np.mean(stddevs[mask] / c4_vals))
    return SigmaResult(sigma_hat=sigma_hat, method=SigmaMethod.STDDEV, n_used=int(np.sum(mask)))


def sigma_from_moving_range(values: np.ndarray, span: int = 2) -> SigmaResult:
    """σ̂ = MR_bar / d2(span) where MR_bar = mean(|xi - xi-1|)."""
    values = validate_1d_array(values, "values")
    validate_non_empty(values, "values")
    if len(values) < 2:
        return SigmaResult(sigma_hat=0.0, method=SigmaMethod.MOVING_RANGE, n_used=len(values))
    mr = np.abs(np.diff(values))
    mr_bar = float(np.mean(mr))
    sigma_hat = mr_bar / d2(span)
    return SigmaResult(
        sigma_hat=sigma_hat, method=SigmaMethod.MOVING_RANGE, n_used=len(values)
    )


def sigma_from_median_moving_range(values: np.ndarray, span: int = 2) -> SigmaResult:
    """σ̂ = median(MR) / 0.954."""
    values = validate_1d_array(values, "values")
    validate_non_empty(values, "values")
    if len(values) < 2:
        return SigmaResult(
            sigma_hat=0.0, method=SigmaMethod.MEDIAN_MOVING_RANGE, n_used=len(values)
        )
    mr = np.abs(np.diff(values))
    mmr = float(np.median(mr))
    sigma_hat = mmr / 0.954
    return SigmaResult(
        sigma_hat=sigma_hat, method=SigmaMethod.MEDIAN_MOVING_RANGE, n_used=len(values)
    )


def sigma_levey_jennings(values: np.ndarray) -> SigmaResult:
    """σ̂ = sample standard deviation (ddof=1)."""
    values = validate_1d_array(values, "values")
    validate_non_empty(values, "values")
    sigma_hat = float(np.std(values, ddof=1)) if len(values) > 1 else 0.0
    return SigmaResult(
        sigma_hat=sigma_hat, method=SigmaMethod.LEVEY_JENNINGS, n_used=len(values)
    )
```

- [ ] **Step 4: Run tests**

Run: `pytest tests/test_common/test_sigma.py -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add algo/common/sigma.py tests/test_common/test_sigma.py
git commit -m "feat: add sigma estimators for variable charts (range, stddev, MR, median MR, LJ)"
```

---

### Task 8: Sigma Estimators (Attribute Charts)

**Files:**
- Modify: `algo/common/sigma.py`
- Modify: `tests/test_common/test_sigma.py`

- [ ] **Step 1: Add failing tests to test_sigma.py**

```python
from algo.common.sigma import sigma_binomial, sigma_poisson, sigma_laney_adjustment


class TestSigmaBinomial:
    def test_known_answer(self):
        p_bar = 0.1
        n_trials = np.array([100, 100, 100])
        result = sigma_binomial(p_bar, n_trials)
        # sigma_i = sqrt(p_bar * (1 - p_bar) / ni) = sqrt(0.1 * 0.9 / 100) = 0.03
        np.testing.assert_allclose(result, np.full(3, 0.03), atol=1e-6)

    def test_p_bar_zero(self):
        result = sigma_binomial(0.0, np.array([100]))
        assert result[0] == 0.0

    def test_p_bar_one(self):
        result = sigma_binomial(1.0, np.array([100]))
        assert result[0] == 0.0

    def test_variable_sizes(self):
        result = sigma_binomial(0.1, np.array([50, 100]))
        expected = np.sqrt(0.1 * 0.9 / np.array([50, 100]))
        np.testing.assert_allclose(result, expected, atol=1e-6)


class TestSigmaPoisson:
    def test_known_answer(self):
        u_bar = 4.0
        n_units = np.array([1, 1, 1])
        result = sigma_poisson(u_bar, n_units)
        expected = np.sqrt(4.0 / 1.0)  # 2.0
        np.testing.assert_allclose(result, np.full(3, expected), atol=1e-6)

    def test_u_bar_zero(self):
        result = sigma_poisson(0.0, np.array([1]))
        assert result[0] == 0.0


class TestSigmaLaneyAdjustment:
    def test_no_overdispersion(self):
        """Standard normal residuals should give z ≈ 1.0."""
        rng = np.random.default_rng(42)
        residuals = rng.standard_normal(100)
        z = sigma_laney_adjustment(residuals)
        assert abs(z - 1.0) < 0.3  # rough, but should be close to 1

    def test_high_overdispersion(self):
        """Residuals with large variance should give z > 1."""
        rng = np.random.default_rng(42)
        residuals = rng.normal(0, 3.0, 100)  # 3x normal spread
        z = sigma_laney_adjustment(residuals)
        assert z > 1.5
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_common/test_sigma.py::TestSigmaBinomial -v`
Expected: FAIL

- [ ] **Step 3: Add to sigma.py**

Append to `algo/common/sigma.py`:

```python
def sigma_binomial(p_bar: float, n_trials: np.ndarray) -> np.ndarray:
    """Per-subgroup σ = sqrt(p_bar * (1 - p_bar) / ni) for binomial charts."""
    n_trials = validate_1d_array(n_trials, "n_trials")
    return np.sqrt(p_bar * (1.0 - p_bar) / n_trials)


def sigma_poisson(u_bar: float, n_units: np.ndarray) -> np.ndarray:
    """Per-subgroup σ = sqrt(u_bar / ni) for Poisson charts."""
    n_units = validate_1d_array(n_units, "n_units")
    return np.sqrt(u_bar / n_units)


def sigma_laney_adjustment(standardized_residuals: np.ndarray) -> float:
    """Laney sigma adjustment factor z = MR_bar(residuals) / d2(2)."""
    standardized_residuals = validate_1d_array(standardized_residuals, "standardized_residuals")
    if len(standardized_residuals) < 2:
        return 1.0
    mr = np.abs(np.diff(standardized_residuals))
    mr_bar = float(np.mean(mr))
    return mr_bar / d2(2)
```

- [ ] **Step 4: Run tests**

Run: `pytest tests/test_common/test_sigma.py -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add algo/common/sigma.py tests/test_common/test_sigma.py
git commit -m "feat: add sigma estimators for attribute charts (binomial, poisson, laney)"
```

---

### Task 9: Attribute Helpers

**Files:**
- Create: `algo/common/attribute.py`
- Create: `tests/test_common/test_attribute.py`

- [ ] **Step 1: Write failing tests**

```python
import pytest
import numpy as np
from algo.common.attribute import compute_p_bar, compute_u_bar, compute_binomial_limits, compute_poisson_limits


class TestComputePBar:
    def test_known_answer(self):
        defectives = np.array([5, 10, 8])
        n_trials = np.array([100, 100, 100])
        p_bar = compute_p_bar(defectives, n_trials)
        assert p_bar == pytest.approx(23 / 300, rel=1e-6)

    def test_variable_sizes(self):
        defectives = np.array([5, 10])
        n_trials = np.array([50, 100])
        p_bar = compute_p_bar(defectives, n_trials)
        assert p_bar == pytest.approx(15 / 150, rel=1e-6)


class TestComputeUBar:
    def test_known_answer(self):
        defects = np.array([10, 15, 12])
        n_units = np.array([5, 5, 5])
        u_bar = compute_u_bar(defects, n_units)
        assert u_bar == pytest.approx(37 / 15, rel=1e-6)


class TestComputeBinomialLimits:
    def test_constant_subgroup(self):
        limits = compute_binomial_limits(p_bar=0.1, n_trials=np.array([100, 100]), k_sigma=3.0)
        expected_ucl = 0.1 + 3.0 * np.sqrt(0.1 * 0.9 / 100)
        expected_lcl = max(0.1 - 3.0 * np.sqrt(0.1 * 0.9 / 100), 0)
        np.testing.assert_allclose(limits.ucl, np.full(2, expected_ucl), atol=1e-6)
        np.testing.assert_allclose(limits.lcl, np.full(2, expected_lcl), atol=1e-6)

    def test_lcl_clamped_to_zero(self):
        limits = compute_binomial_limits(p_bar=0.01, n_trials=np.array([10]), k_sigma=3.0)
        assert np.all(limits.lcl >= 0)

    def test_ucl_clamped_to_one(self):
        limits = compute_binomial_limits(p_bar=0.95, n_trials=np.array([10]), k_sigma=3.0)
        assert np.all(limits.ucl <= 1.0)


class TestComputePoissonLimits:
    def test_constant_units(self):
        limits = compute_poisson_limits(u_bar=4.0, n_units=np.array([1, 1]), k_sigma=3.0)
        expected_ucl = 4.0 + 3.0 * np.sqrt(4.0 / 1.0)
        expected_lcl = max(4.0 - 3.0 * np.sqrt(4.0 / 1.0), 0)
        np.testing.assert_allclose(limits.ucl, np.full(2, expected_ucl), atol=1e-6)
        np.testing.assert_allclose(limits.lcl, np.full(2, expected_lcl), atol=1e-6)

    def test_lcl_clamped_to_zero(self):
        limits = compute_poisson_limits(u_bar=0.5, n_units=np.array([1]), k_sigma=3.0)
        assert np.all(limits.lcl >= 0)
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_common/test_attribute.py -v`
Expected: FAIL

- [ ] **Step 3: Implement attribute.py**

```python
"""Shared computation helpers for attribute control charts."""

import numpy as np
from .types import ControlLimits
from .validators import validate_1d_array


def compute_p_bar(defectives: np.ndarray, n_trials: np.ndarray) -> float:
    """Weighted proportion: p_bar = sum(Xi) / sum(ni)."""
    defectives = validate_1d_array(defectives, "defectives")
    n_trials = validate_1d_array(n_trials, "n_trials")
    return float(np.sum(defectives) / np.sum(n_trials))


def compute_u_bar(defects: np.ndarray, n_units: np.ndarray) -> float:
    """Weighted rate: u_bar = sum(ci) / sum(ni)."""
    defects = validate_1d_array(defects, "defects")
    n_units = validate_1d_array(n_units, "n_units")
    return float(np.sum(defects) / np.sum(n_units))


def compute_binomial_limits(
    p_bar: float,
    n_trials: np.ndarray,
    k_sigma: float,
) -> ControlLimits:
    """Binomial-based variable-width limits for P charts."""
    n_trials = validate_1d_array(n_trials, "n_trials")
    sigma = np.sqrt(p_bar * (1.0 - p_bar) / n_trials)
    ucl = np.minimum(p_bar + k_sigma * sigma, 1.0)
    lcl = np.maximum(p_bar - k_sigma * sigma, 0.0)
    cl = np.full_like(ucl, p_bar)
    return ControlLimits(ucl=ucl, cl=cl, lcl=lcl, k_sigma=k_sigma)


def compute_poisson_limits(
    u_bar: float,
    n_units: np.ndarray,
    k_sigma: float,
) -> ControlLimits:
    """Poisson-based variable-width limits for U charts."""
    n_units = validate_1d_array(n_units, "n_units")
    sigma = np.sqrt(u_bar / n_units)
    ucl = u_bar + k_sigma * sigma
    lcl = np.maximum(u_bar - k_sigma * sigma, 0.0)
    cl = np.full_like(ucl, u_bar)
    return ControlLimits(ucl=ucl, cl=cl, lcl=lcl, k_sigma=k_sigma)
```

- [ ] **Step 4: Run tests**

Run: `pytest tests/test_common/test_attribute.py -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add algo/common/attribute.py tests/test_common/test_attribute.py
git commit -m "feat: add shared attribute chart helpers (p_bar, u_bar, binomial/poisson limits)"
```

---

### Task 10: XBar-R Chart

**Files:**
- Create: `algo/xbar_r/__init__.py`, `algo/xbar_r/models.py`, `algo/xbar_r/compute.py`
- Create: `tests/test_xbar_r.py`

- [ ] **Step 1: Write failing tests**

```python
import pytest
import numpy as np
from algo.xbar_r import XBarRConfig, XBarRResult, compute_xbar_r
from tests.conftest import assert_limits_valid


class TestXBarR:
    def test_known_answer_equal_subgroups(self):
        """5 subgroups of size 4."""
        data = np.array([
            [72, 84, 79, 49],
            [56, 87, 33, 42],
            [55, 73, 22, 60],
            [44, 80, 54, 74],
            [97, 26, 48, 58],
        ], dtype=float)
        sizes = np.full(5, 4)
        result = compute_xbar_r(data, sizes)

        means = data.mean(axis=1)
        ranges = data.max(axis=1) - data.min(axis=1)
        grand_mean = float(np.mean(means))

        assert result.grand_mean == pytest.approx(grand_mean, rel=1e-6)
        np.testing.assert_allclose(result.subgroup_means, means, atol=1e-6)
        np.testing.assert_allclose(result.subgroup_ranges, ranges, atol=1e-6)
        assert_limits_valid(result.xbar_limits)
        assert_limits_valid(result.r_limits)

    def test_single_subgroup(self):
        data = np.array([[10.0, 12.0, 11.0]])
        sizes = np.array([3])
        result = compute_xbar_r(data, sizes)
        assert result.grand_mean == pytest.approx(11.0, rel=1e-6)

    def test_r_lcl_non_negative(self):
        rng = np.random.default_rng(42)
        data = rng.normal(50, 2, (20, 3))
        sizes = np.full(20, 3)
        result = compute_xbar_r(data, sizes)
        assert np.all(result.r_limits.lcl >= 0)

    def test_custom_k_sigma(self):
        data = np.array([[10.0, 12.0, 11.0]] * 5)
        sizes = np.full(5, 3)
        r1 = compute_xbar_r(data, sizes, XBarRConfig(k_sigma=2.0))
        r2 = compute_xbar_r(data, sizes, XBarRConfig(k_sigma=3.0))
        assert np.all(r2.xbar_limits.ucl >= r1.xbar_limits.ucl)
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_xbar_r.py -v`
Expected: FAIL

- [ ] **Step 3: Implement models.py**

```python
import attrs
import numpy as np
from algo.common.types import ControlLimits, ZoneBreakdown, SigmaResult
from algo.common.validators import validate_positive


def _validate_k_sigma(instance, attribute, value):
    validate_positive(value, "k_sigma")


@attrs.define(slots=True)
class XBarRConfig:
    k_sigma: float = attrs.field(default=3.0, validator=_validate_k_sigma)


@attrs.define(slots=True)
class XBarRResult:
    subgroup_means: np.ndarray
    subgroup_ranges: np.ndarray
    xbar_limits: ControlLimits
    r_limits: ControlLimits
    sigma: SigmaResult
    zones: ZoneBreakdown
    grand_mean: float
```

- [ ] **Step 4: Implement compute.py**

```python
import numpy as np
from .models import XBarRConfig, XBarRResult
from algo.common.types import ControlLimits
from algo.common.sigma import sigma_from_ranges
from algo.common.zones import compute_zones
from algo.constants.tables import d2, d3


def compute_xbar_r(
    data: np.ndarray,
    subgroup_sizes: np.ndarray,
    config: XBarRConfig = XBarRConfig(),
) -> XBarRResult:
    data = np.asarray(data, dtype=np.float64)
    subgroup_sizes = np.asarray(subgroup_sizes, dtype=int)
    k = config.k_sigma

    # Compute subgroup statistics
    if data.ndim == 2:
        n_subgroups, n_size = data.shape
        means = data.mean(axis=1)
        ranges = data.max(axis=1) - data.min(axis=1)
    else:
        # Ragged: split 1D array by subgroup_sizes
        splits = np.cumsum(subgroup_sizes[:-1])
        groups = np.split(data, splits)
        means = np.array([g.mean() for g in groups])
        ranges = np.array([g.max() - g.min() for g in groups])

    grand_mean = float(np.mean(means))

    # Sigma estimation
    sigma_result = sigma_from_ranges(ranges, subgroup_sizes)
    sigma_hat = sigma_result.sigma_hat

    # XBar limits (per-subgroup for variable sizes)
    sqrt_n = np.sqrt(subgroup_sizes.astype(float))
    xbar_ucl = grand_mean + k * sigma_hat / sqrt_n
    xbar_lcl = grand_mean - k * sigma_hat / sqrt_n
    xbar_cl = np.full_like(xbar_ucl, grand_mean)
    xbar_limits = ControlLimits(ucl=xbar_ucl, cl=xbar_cl, lcl=xbar_lcl, k_sigma=k)

    # R limits (per-subgroup for variable sizes)
    d2_vals = np.array([d2(int(n)) for n in subgroup_sizes])
    d3_vals = np.array([d3(int(n)) for n in subgroup_sizes])
    r_cl = d2_vals * sigma_hat
    r_ucl = d2_vals * sigma_hat + k * d3_vals * sigma_hat
    r_lcl = np.maximum(d2_vals * sigma_hat - k * d3_vals * sigma_hat, 0.0)
    r_limits = ControlLimits(ucl=r_ucl, cl=r_cl, lcl=r_lcl, k_sigma=k)

    zones = compute_zones(cl=grand_mean, sigma_hat=sigma_hat)

    return XBarRResult(
        subgroup_means=means,
        subgroup_ranges=ranges,
        xbar_limits=xbar_limits,
        r_limits=r_limits,
        sigma=sigma_result,
        zones=zones,
        grand_mean=grand_mean,
    )
```

- [ ] **Step 5: Implement __init__.py**

```python
from .models import XBarRConfig, XBarRResult
from .compute import compute_xbar_r
```

- [ ] **Step 6: Run tests**

Run: `pytest tests/test_xbar_r.py -v`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add algo/xbar_r/ tests/test_xbar_r.py
git commit -m "feat: add XBar-R chart computation"
```

---

### Task 11: XBar-S Chart

**Files:**
- Create: `algo/xbar_s/__init__.py`, `algo/xbar_s/models.py`, `algo/xbar_s/compute.py`
- Create: `tests/test_xbar_s.py`

- [ ] **Step 1: Write failing tests**

```python
import pytest
import numpy as np
from algo.xbar_s import XBarSConfig, XBarSResult, compute_xbar_s
from tests.conftest import assert_limits_valid


class TestXBarS:
    def test_known_answer(self):
        data = np.array([
            [72, 84, 79, 49, 60],
            [56, 87, 33, 42, 55],
            [55, 73, 22, 60, 48],
        ], dtype=float)
        sizes = np.full(3, 5)
        result = compute_xbar_s(data, sizes)

        means = data.mean(axis=1)
        stddevs = data.std(axis=1, ddof=1)
        grand_mean = float(np.mean(means))

        assert result.grand_mean == pytest.approx(grand_mean, rel=1e-6)
        np.testing.assert_allclose(result.subgroup_means, means, atol=1e-6)
        np.testing.assert_allclose(result.subgroup_stddevs, stddevs, atol=1e-6)
        assert_limits_valid(result.xbar_limits)
        assert_limits_valid(result.s_limits)

    def test_s_lcl_non_negative(self):
        rng = np.random.default_rng(42)
        data = rng.normal(50, 2, (20, 10))
        sizes = np.full(20, 10)
        result = compute_xbar_s(data, sizes)
        assert np.all(result.s_limits.lcl >= 0)
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_xbar_s.py -v`
Expected: FAIL

- [ ] **Step 3: Implement models.py**

```python
import attrs
import numpy as np
from algo.common.types import ControlLimits, ZoneBreakdown, SigmaResult
from algo.common.validators import validate_positive


def _validate_k_sigma(instance, attribute, value):
    validate_positive(value, "k_sigma")


@attrs.define(slots=True)
class XBarSConfig:
    k_sigma: float = attrs.field(default=3.0, validator=_validate_k_sigma)


@attrs.define(slots=True)
class XBarSResult:
    subgroup_means: np.ndarray
    subgroup_stddevs: np.ndarray
    xbar_limits: ControlLimits
    s_limits: ControlLimits
    sigma: SigmaResult
    zones: ZoneBreakdown
    grand_mean: float
```

- [ ] **Step 4: Implement compute.py**

```python
import numpy as np
from .models import XBarSConfig, XBarSResult
from algo.common.types import ControlLimits
from algo.common.sigma import sigma_from_stddevs
from algo.common.zones import compute_zones
from algo.constants.tables import c4, c5


def compute_xbar_s(
    data: np.ndarray,
    subgroup_sizes: np.ndarray,
    config: XBarSConfig = XBarSConfig(),
) -> XBarSResult:
    data = np.asarray(data, dtype=np.float64)
    subgroup_sizes = np.asarray(subgroup_sizes, dtype=int)
    k = config.k_sigma

    if data.ndim == 2:
        means = data.mean(axis=1)
        stddevs = data.std(axis=1, ddof=1)
    else:
        splits = np.cumsum(subgroup_sizes[:-1])
        groups = np.split(data, splits)
        means = np.array([g.mean() for g in groups])
        stddevs = np.array([g.std(ddof=1) for g in groups])

    grand_mean = float(np.mean(means))

    sigma_result = sigma_from_stddevs(stddevs, subgroup_sizes)
    sigma_hat = sigma_result.sigma_hat

    sqrt_n = np.sqrt(subgroup_sizes.astype(float))
    xbar_ucl = grand_mean + k * sigma_hat / sqrt_n
    xbar_lcl = grand_mean - k * sigma_hat / sqrt_n
    xbar_cl = np.full_like(xbar_ucl, grand_mean)
    xbar_limits = ControlLimits(ucl=xbar_ucl, cl=xbar_cl, lcl=xbar_lcl, k_sigma=k)

    c4_vals = np.array([c4(int(n)) for n in subgroup_sizes])
    c5_vals = np.array([c5(int(n)) for n in subgroup_sizes])
    s_cl = c4_vals * sigma_hat
    s_ucl = c4_vals * sigma_hat + k * c5_vals * sigma_hat
    s_lcl = np.maximum(c4_vals * sigma_hat - k * c5_vals * sigma_hat, 0.0)
    s_limits = ControlLimits(ucl=s_ucl, cl=s_cl, lcl=s_lcl, k_sigma=k)

    zones = compute_zones(cl=grand_mean, sigma_hat=sigma_hat)

    return XBarSResult(
        subgroup_means=means,
        subgroup_stddevs=stddevs,
        xbar_limits=xbar_limits,
        s_limits=s_limits,
        sigma=sigma_result,
        zones=zones,
        grand_mean=grand_mean,
    )
```

- [ ] **Step 5: Implement __init__.py**

```python
from .models import XBarSConfig, XBarSResult
from .compute import compute_xbar_s
```

- [ ] **Step 6: Run tests**

Run: `pytest tests/test_xbar_s.py -v`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add algo/xbar_s/ tests/test_xbar_s.py
git commit -m "feat: add XBar-S chart computation"
```

---

### Task 12: IMR Chart

**Files:**
- Create: `algo/imr/__init__.py`, `algo/imr/models.py`, `algo/imr/compute.py`
- Create: `tests/test_imr.py`

- [ ] **Step 1: Write failing tests**

```python
import pytest
import numpy as np
from algo.imr import IMRConfig, IMRResult, compute_imr
from algo.common.enums import SigmaMethod
from tests.conftest import assert_limits_valid


class TestIMR:
    def test_known_answer(self):
        values = np.array([10.0, 12.0, 11.0, 13.0, 10.0, 11.5, 12.5, 10.5, 11.0, 13.5])
        result = compute_imr(values)

        mean = float(np.mean(values))
        mr = np.abs(np.diff(values))
        mr_bar = float(np.mean(mr))
        sigma_hat = mr_bar / 1.128

        assert result.mean == pytest.approx(mean, rel=1e-6)
        assert result.sigma.sigma_hat == pytest.approx(sigma_hat, rel=1e-3)
        np.testing.assert_allclose(result.moving_ranges, mr, atol=1e-6)
        assert_limits_valid(result.individual_limits)
        assert_limits_valid(result.mr_limits)

    def test_median_moving_range_method(self):
        values = np.array([10.0, 12.0, 11.0, 13.0, 10.0])
        result = compute_imr(values, IMRConfig(sigma_method=SigmaMethod.MEDIAN_MOVING_RANGE))
        assert result.sigma.method == SigmaMethod.MEDIAN_MOVING_RANGE

    def test_constant_data(self):
        values = np.full(10, 5.0)
        result = compute_imr(values)
        assert result.sigma.sigma_hat == 0.0
        # UCL == CL == LCL when sigma is 0
        np.testing.assert_allclose(result.individual_limits.ucl, result.individual_limits.cl)

    def test_two_points(self):
        values = np.array([10.0, 12.0])
        result = compute_imr(values)
        assert len(result.moving_ranges) == 1

    def test_mr_lcl_non_negative(self):
        rng = np.random.default_rng(42)
        values = rng.normal(50, 2, 30)
        result = compute_imr(values)
        assert np.all(result.mr_limits.lcl >= 0)
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_imr.py -v`
Expected: FAIL

- [ ] **Step 3: Implement models.py**

```python
import attrs
import numpy as np
from algo.common.types import ControlLimits, ZoneBreakdown, SigmaResult
from algo.common.enums import SigmaMethod
from algo.common.validators import validate_positive


def _validate_k_sigma(instance, attribute, value):
    validate_positive(value, "k_sigma")


def _validate_sigma_method(instance, attribute, value):
    allowed = {SigmaMethod.MOVING_RANGE, SigmaMethod.MEDIAN_MOVING_RANGE}
    if value not in allowed:
        raise ValueError(f"sigma_method must be one of {allowed}, got {value}")


@attrs.define(slots=True)
class IMRConfig:
    k_sigma: float = attrs.field(default=3.0, validator=_validate_k_sigma)
    sigma_method: SigmaMethod = attrs.field(
        default=SigmaMethod.MOVING_RANGE, validator=_validate_sigma_method
    )


@attrs.define(slots=True)
class IMRResult:
    individual_limits: ControlLimits
    mr_limits: ControlLimits
    moving_ranges: np.ndarray
    sigma: SigmaResult
    zones: ZoneBreakdown
    mean: float
```

- [ ] **Step 4: Implement compute.py**

```python
import numpy as np
from .models import IMRConfig, IMRResult
from algo.common.types import ControlLimits
from algo.common.enums import SigmaMethod
from algo.common.sigma import sigma_from_moving_range, sigma_from_median_moving_range
from algo.common.zones import compute_zones
from algo.common.validators import validate_1d_array, validate_non_empty
from algo.constants.tables import d2, d3


def compute_imr(
    values: np.ndarray,
    config: IMRConfig = IMRConfig(),
) -> IMRResult:
    values = validate_1d_array(values, "values")
    validate_non_empty(values, "values")
    k = config.k_sigma

    mean = float(np.mean(values))
    moving_ranges = np.abs(np.diff(values))

    if config.sigma_method == SigmaMethod.MEDIAN_MOVING_RANGE:
        sigma_result = sigma_from_median_moving_range(values)
    else:
        sigma_result = sigma_from_moving_range(values)
    sigma_hat = sigma_result.sigma_hat

    # Individual chart limits
    i_ucl = np.full(len(values), mean + k * sigma_hat)
    i_lcl = np.full(len(values), mean - k * sigma_hat)
    i_cl = np.full(len(values), mean)
    individual_limits = ControlLimits(ucl=i_ucl, cl=i_cl, lcl=i_lcl, k_sigma=k)

    # Moving Range chart limits
    span = 2
    d2_val = d2(span)
    d3_val = d3(span)
    mr_cl_val = d2_val * sigma_hat
    mr_ucl_val = d2_val * sigma_hat + k * d3_val * sigma_hat
    mr_lcl_val = max(d2_val * sigma_hat - k * d3_val * sigma_hat, 0.0)
    n_mr = len(moving_ranges)
    mr_limits = ControlLimits(
        ucl=np.full(n_mr, mr_ucl_val),
        cl=np.full(n_mr, mr_cl_val),
        lcl=np.full(n_mr, mr_lcl_val),
        k_sigma=k,
    )

    zones = compute_zones(cl=mean, sigma_hat=sigma_hat)

    return IMRResult(
        individual_limits=individual_limits,
        mr_limits=mr_limits,
        moving_ranges=moving_ranges,
        sigma=sigma_result,
        zones=zones,
        mean=mean,
    )
```

- [ ] **Step 5: Implement __init__.py**

```python
from .models import IMRConfig, IMRResult
from .compute import compute_imr
```

- [ ] **Step 6: Run tests**

Run: `pytest tests/test_imr.py -v`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add algo/imr/ tests/test_imr.py
git commit -m "feat: add IMR (Individual & Moving Range) chart computation"
```

---

### Tasks 13-19: Remaining Shewhart Charts

For brevity, the following tasks follow the identical pattern as Tasks 10-12. Each task creates `algo/<chart>/__init__.py`, `models.py`, `compute.py`, and `tests/test_<chart>.py`. Full code for each is provided.

---

### Task 13: Levey-Jennings Chart

**Files:** `algo/levey_jennings/{__init__,models,compute}.py`, `tests/test_levey_jennings.py`

The Levey-Jennings chart is the simplest Shewhart chart — uses overall std dev instead of within-subgroup sigma.

- [ ] **Step 1: Write failing tests**

```python
import pytest
import numpy as np
from algo.levey_jennings import LeveyJenningsConfig, LeveyJenningsResult, compute_levey_jennings
from tests.conftest import assert_limits_valid


class TestLeveyJennings:
    def test_known_answer(self):
        values = np.array([10.0, 12.0, 11.0, 13.0, 10.0])
        result = compute_levey_jennings(values)
        mean = float(np.mean(values))
        sigma = float(np.std(values, ddof=1))
        assert result.mean == pytest.approx(mean)
        assert result.sigma.sigma_hat == pytest.approx(sigma)
        assert_limits_valid(result.limits)

    def test_limits_at_3_sigma(self):
        values = np.array([10.0, 12.0, 11.0, 13.0, 10.0])
        result = compute_levey_jennings(values)
        mean = float(np.mean(values))
        sigma = float(np.std(values, ddof=1))
        np.testing.assert_allclose(result.limits.ucl, mean + 3 * sigma, atol=1e-6)
        np.testing.assert_allclose(result.limits.lcl, mean - 3 * sigma, atol=1e-6)
```

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Implement models.py**

```python
import attrs
import numpy as np
from algo.common.types import ControlLimits, ZoneBreakdown, SigmaResult
from algo.common.validators import validate_positive


def _validate_k_sigma(instance, attribute, value):
    validate_positive(value, "k_sigma")


@attrs.define(slots=True)
class LeveyJenningsConfig:
    k_sigma: float = attrs.field(default=3.0, validator=_validate_k_sigma)


@attrs.define(slots=True)
class LeveyJenningsResult:
    limits: ControlLimits
    sigma: SigmaResult
    zones: ZoneBreakdown
    mean: float
```

- [ ] **Step 4: Implement compute.py**

```python
import numpy as np
from .models import LeveyJenningsConfig, LeveyJenningsResult
from algo.common.types import ControlLimits
from algo.common.sigma import sigma_levey_jennings
from algo.common.zones import compute_zones
from algo.common.validators import validate_1d_array, validate_non_empty


def compute_levey_jennings(
    values: np.ndarray,
    config: LeveyJenningsConfig = LeveyJenningsConfig(),
) -> LeveyJenningsResult:
    values = validate_1d_array(values, "values")
    validate_non_empty(values, "values")
    k = config.k_sigma

    mean = float(np.mean(values))
    sigma_result = sigma_levey_jennings(values)
    sigma_hat = sigma_result.sigma_hat

    n = len(values)
    ucl = np.full(n, mean + k * sigma_hat)
    lcl = np.full(n, mean - k * sigma_hat)
    cl = np.full(n, mean)
    limits = ControlLimits(ucl=ucl, cl=cl, lcl=lcl, k_sigma=k)
    zones = compute_zones(cl=mean, sigma_hat=sigma_hat)

    return LeveyJenningsResult(limits=limits, sigma=sigma_result, zones=zones, mean=mean)
```

- [ ] **Step 5: Implement __init__.py, run tests, commit**

```python
from .models import LeveyJenningsConfig, LeveyJenningsResult
from .compute import compute_levey_jennings
```

Run: `pytest tests/test_levey_jennings.py -v`
Commit: `git commit -m "feat: add Levey-Jennings chart computation"`

---

### Task 14: P Chart

**Files:** `algo/p_chart/{__init__,models,compute}.py`, `tests/test_p_chart.py`

- [ ] **Step 1: Write failing tests**

```python
import pytest
import numpy as np
from algo.p_chart import PChartConfig, PChartResult, compute_p_chart
from tests.conftest import assert_limits_valid


class TestPChart:
    def test_known_answer(self):
        defectives = np.array([5, 8, 3, 7, 6])
        n_trials = np.array([100, 100, 100, 100, 100])
        result = compute_p_chart(defectives, n_trials)
        p_bar = 29 / 500
        assert result.p_bar == pytest.approx(p_bar, rel=1e-6)
        np.testing.assert_allclose(result.proportions, defectives / n_trials, atol=1e-6)
        assert_limits_valid(result.limits)

    def test_variable_width_limits(self):
        defectives = np.array([5, 8])
        n_trials = np.array([50, 200])
        result = compute_p_chart(defectives, n_trials)
        # Smaller subgroup → wider limits
        assert result.limits.ucl[0] > result.limits.ucl[1]

    def test_ucl_clamped_to_one(self):
        defectives = np.array([9])
        n_trials = np.array([10])
        result = compute_p_chart(defectives, n_trials)
        assert np.all(result.limits.ucl <= 1.0)

    def test_lcl_clamped_to_zero(self):
        defectives = np.array([1])
        n_trials = np.array([100])
        result = compute_p_chart(defectives, n_trials)
        assert np.all(result.limits.lcl >= 0.0)
```

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Implement models.py**

```python
import attrs
import numpy as np
from algo.common.types import ControlLimits, SigmaResult
from algo.common.validators import validate_positive


def _validate_k_sigma(instance, attribute, value):
    validate_positive(value, "k_sigma")


@attrs.define(slots=True)
class PChartConfig:
    k_sigma: float = attrs.field(default=3.0, validator=_validate_k_sigma)


@attrs.define(slots=True)
class PChartResult:
    proportions: np.ndarray
    limits: ControlLimits
    p_bar: float
    sigma: SigmaResult
```

- [ ] **Step 4: Implement compute.py**

```python
import numpy as np
from .models import PChartConfig, PChartResult
from algo.common.attribute import compute_p_bar, compute_binomial_limits
from algo.common.sigma import sigma_binomial
from algo.common.types import SigmaResult
from algo.common.enums import SigmaMethod
from algo.common.validators import validate_1d_array, validate_non_empty


def compute_p_chart(
    defectives: np.ndarray,
    n_trials: np.ndarray,
    config: PChartConfig = PChartConfig(),
) -> PChartResult:
    defectives = validate_1d_array(defectives, "defectives")
    n_trials = validate_1d_array(n_trials, "n_trials")
    validate_non_empty(defectives, "defectives")

    proportions = defectives / n_trials
    p_bar = compute_p_bar(defectives, n_trials)
    limits = compute_binomial_limits(p_bar, n_trials, config.k_sigma)

    sigma_vals = sigma_binomial(p_bar, n_trials)
    sigma_result = SigmaResult(
        sigma_hat=float(np.mean(sigma_vals)),
        method=SigmaMethod.BINOMIAL,
        n_used=len(defectives),
    )

    return PChartResult(proportions=proportions, limits=limits, p_bar=p_bar, sigma=sigma_result)
```

- [ ] **Step 5: Implement __init__.py, run tests, commit**

```python
from .models import PChartConfig, PChartResult
from .compute import compute_p_chart
```

Run: `pytest tests/test_p_chart.py -v`
Commit: `git commit -m "feat: add P chart computation"`

---

### Task 15-17: NP, C, U Charts

These follow the exact same pattern as the P chart. Each has its own directory with models.py, compute.py, __init__.py and test file. The key differences:

**NP Chart** (`algo/np_chart/`):
- Plots count (not proportion): `counts = defectives`
- `UCL_i = min(ni * p_bar + K * sqrt(ni * p_bar * (1 - p_bar)), ni)`
- `LCL_i = max(ni * p_bar - K * sqrt(ni * p_bar * (1 - p_bar)), 0)`

**C Chart** (`algo/c_chart/`):
- Plots defect counts: `counts = defects`
- `UCL_i = ni * u_bar + K * sqrt(ni * u_bar)`
- `LCL_i = max(ni * u_bar - K * sqrt(ni * u_bar), 0)`

**U Chart** (`algo/u_chart/`):
- Plots defect rate: `rates = defects / n_units`
- Uses `compute_poisson_limits()` from `common/attribute.py`

- [ ] **Step 1-7 per chart:** Write tests, implement models, compute, __init__, run tests, commit

Each commit: `feat: add NP chart computation`, `feat: add C chart computation`, `feat: add U chart computation`

---

### Task 18: Laney P' Chart

**Files:** `algo/laney_p/{__init__,models,compute}.py`, `tests/test_laney_p.py`

- [ ] **Step 1: Write failing tests**

```python
import pytest
import numpy as np
from algo.laney_p import LaneyPConfig, LaneyPResult, compute_laney_p
from algo.p_chart import compute_p_chart
from tests.conftest import assert_limits_valid


class TestLaneyP:
    def test_no_overdispersion_matches_standard(self):
        """When no overdispersion, Laney P' ≈ standard P chart."""
        rng = np.random.default_rng(42)
        n_trials = np.full(30, 100)
        defectives = rng.binomial(100, 0.1, 30)
        laney_result = compute_laney_p(defectives, n_trials)
        std_result = compute_p_chart(defectives, n_trials)
        # sigma_z should be close to 1.0
        assert abs(laney_result.sigma_z - 1.0) < 0.5
        assert laney_result.p_bar == pytest.approx(std_result.p_bar)

    def test_overdispersion_widens_limits(self):
        """With overdispersion, Laney limits are wider than standard."""
        rng = np.random.default_rng(42)
        n_trials = np.full(30, 1000)
        # Create overdispersed data by varying p across subgroups
        p_varying = rng.uniform(0.05, 0.15, 30)
        defectives = np.array([rng.binomial(1000, p) for p in p_varying])
        laney_result = compute_laney_p(defectives, n_trials)
        std_result = compute_p_chart(defectives, n_trials)
        assert laney_result.sigma_z > 1.0
        # Laney UCL should be wider
        assert np.mean(laney_result.limits.ucl) > np.mean(std_result.limits.ucl)

    def test_limits_valid(self):
        defectives = np.array([5, 8, 3, 7, 6])
        n_trials = np.array([100, 100, 100, 100, 100])
        result = compute_laney_p(defectives, n_trials)
        assert_limits_valid(result.limits)
        assert np.all(result.limits.ucl <= 1.0)
        assert np.all(result.limits.lcl >= 0.0)
```

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Implement models.py**

```python
import attrs
import numpy as np
from algo.common.types import ControlLimits, SigmaResult
from algo.common.validators import validate_positive


def _validate_k_sigma(instance, attribute, value):
    validate_positive(value, "k_sigma")


@attrs.define(slots=True)
class LaneyPConfig:
    k_sigma: float = attrs.field(default=3.0, validator=_validate_k_sigma)


@attrs.define(slots=True)
class LaneyPResult:
    proportions: np.ndarray
    limits: ControlLimits
    p_bar: float
    sigma_z: float
    sigma: SigmaResult
```

- [ ] **Step 4: Implement compute.py**

```python
import numpy as np
from .models import LaneyPConfig, LaneyPResult
from algo.common.types import ControlLimits, SigmaResult
from algo.common.attribute import compute_p_bar
from algo.common.sigma import sigma_laney_adjustment
from algo.common.enums import SigmaMethod
from algo.common.validators import validate_1d_array, validate_non_empty


def compute_laney_p(
    defectives: np.ndarray,
    n_trials: np.ndarray,
    config: LaneyPConfig = LaneyPConfig(),
) -> LaneyPResult:
    defectives = validate_1d_array(defectives, "defectives")
    n_trials = validate_1d_array(n_trials, "n_trials")
    validate_non_empty(defectives, "defectives")
    k = config.k_sigma

    proportions = defectives / n_trials
    p_bar = compute_p_bar(defectives, n_trials)

    # Standardized residuals
    binomial_sigma = np.sqrt(p_bar * (1.0 - p_bar) / n_trials)
    # Guard against zero sigma (p_bar = 0 or 1)
    safe_sigma = np.where(binomial_sigma > 0, binomial_sigma, 1.0)
    residuals = (proportions - p_bar) / safe_sigma

    # Laney adjustment
    sigma_z = sigma_laney_adjustment(residuals)

    # Adjusted limits
    adjusted_sigma = sigma_z * binomial_sigma
    ucl = np.minimum(p_bar + k * adjusted_sigma, 1.0)
    lcl = np.maximum(p_bar - k * adjusted_sigma, 0.0)
    cl = np.full_like(ucl, p_bar)
    limits = ControlLimits(ucl=ucl, cl=cl, lcl=lcl, k_sigma=k)

    sigma_result = SigmaResult(
        sigma_hat=float(np.mean(adjusted_sigma)),
        method=SigmaMethod.BINOMIAL,
        n_used=len(defectives),
    )

    return LaneyPResult(
        proportions=proportions, limits=limits, p_bar=p_bar,
        sigma_z=sigma_z, sigma=sigma_result,
    )
```

- [ ] **Step 5: Implement __init__.py, run tests, commit**

```python
from .models import LaneyPConfig, LaneyPResult
from .compute import compute_laney_p
```

Run: `pytest tests/test_laney_p.py -v`
Commit: `git commit -m "feat: add Laney P' chart computation with overdispersion adjustment"`

---

### Task 19: Laney U' Chart

Identical pattern to Laney P' but using Poisson sigma instead of binomial. Key differences:
- `u_bar = sum(defects) / sum(n_units)`
- `poisson_sigma = sqrt(u_bar / ni)`
- Residuals: `(ui - u_bar) / poisson_sigma`
- UCL not clamped to 1 (it's a rate, not a proportion)

- [ ] **Step 1-5:** Write tests, implement, run, commit

Commit: `git commit -m "feat: add Laney U' chart computation"`

---

### Task 20: CUSUM Chart

**Files:** `algo/cusum/{__init__,models,compute}.py`, `tests/test_cusum.py`

- [ ] **Step 1: Write failing tests**

```python
import pytest
import numpy as np
from algo.cusum import CUSUMConfig, CUSUMResult, compute_cusum


class TestCUSUM:
    def test_in_control(self):
        """No shift — C+ and C- stay near 0."""
        rng = np.random.default_rng(42)
        values = rng.normal(0, 1, 50)
        config = CUSUMConfig(target=0.0, sigma=1.0)
        result = compute_cusum(values, config)
        assert np.all(result.c_plus >= 0)
        assert np.all(result.c_minus <= 0)
        # Most C+ values should be small
        assert np.mean(result.c_plus) < 2.0

    def test_positive_shift_detected(self):
        """1σ shift after point 20 — should trigger upper violation."""
        values = np.concatenate([np.zeros(20), np.ones(30)])
        config = CUSUMConfig(target=0.0, sigma=1.0, h=5.0, k=0.5)
        result = compute_cusum(values, config)
        assert np.any(result.violations_upper)
        assert not np.any(result.violations_lower)

    def test_negative_shift_detected(self):
        values = np.concatenate([np.zeros(20), -np.ones(30)])
        config = CUSUMConfig(target=0.0, sigma=1.0, h=5.0, k=0.5)
        result = compute_cusum(values, config)
        assert np.any(result.violations_lower)

    def test_c_plus_non_negative(self):
        """C+ is always >= 0 by construction."""
        rng = np.random.default_rng(42)
        values = rng.normal(0, 1, 100)
        config = CUSUMConfig(target=0.0, sigma=1.0)
        result = compute_cusum(values, config)
        assert np.all(result.c_plus >= 0)

    def test_c_minus_non_positive(self):
        """C- is always <= 0 by construction."""
        rng = np.random.default_rng(42)
        values = rng.normal(0, 1, 100)
        config = CUSUMConfig(target=0.0, sigma=1.0)
        result = compute_cusum(values, config)
        assert np.all(result.c_minus <= 0)

    def test_head_start(self):
        """Head start should make detection faster."""
        values = np.concatenate([np.zeros(5), np.ones(30)])
        c_no_fir = CUSUMConfig(target=0.0, sigma=1.0, head_start=0.0)
        c_fir = CUSUMConfig(target=0.0, sigma=1.0, head_start=2.0)
        r_no = compute_cusum(values, c_no_fir)
        r_fir = compute_cusum(values, c_fir)
        # FIR should detect sooner (first violation at earlier index)
        if np.any(r_no.violations_upper) and np.any(r_fir.violations_upper):
            first_no = np.argmax(r_no.violations_upper)
            first_fir = np.argmax(r_fir.violations_upper)
            assert first_fir <= first_no

    def test_shift_starts(self):
        values = np.concatenate([np.zeros(20), 1.5 * np.ones(30)])
        config = CUSUMConfig(target=0.0, sigma=1.0, h=5.0, k=0.5)
        result = compute_cusum(values, config)
        if len(result.shift_starts_upper) > 0:
            assert result.shift_starts_upper[0] >= 20
```

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Implement models.py**

```python
import attrs
import numpy as np
from algo.common.validators import validate_positive


def _validate_positive(instance, attribute, value):
    validate_positive(value, attribute.name)


def _validate_non_negative(instance, attribute, value):
    from algo.common.validators import validate_non_negative
    validate_non_negative(value, attribute.name)


@attrs.define(slots=True)
class CUSUMConfig:
    target: float = 0.0
    sigma: float = attrs.field(default=1.0, validator=_validate_positive)
    h: float = attrs.field(default=5.0, validator=_validate_positive)
    k: float = attrs.field(default=0.5, validator=_validate_positive)
    head_start: float = attrs.field(default=0.0, validator=_validate_non_negative)
    data_units: bool = False


@attrs.define(slots=True)
class CUSUMResult:
    c_plus: np.ndarray
    c_minus: np.ndarray
    upper_limit: float
    lower_limit: float
    violations_upper: np.ndarray
    violations_lower: np.ndarray
    shift_starts_upper: np.ndarray
    shift_starts_lower: np.ndarray
```

- [ ] **Step 4: Implement compute.py**

```python
import numpy as np
from .models import CUSUMConfig, CUSUMResult
from algo.common.validators import validate_1d_array, validate_non_empty


def _find_shift_starts(c_values: np.ndarray, limit: float, positive: bool) -> np.ndarray:
    """Find shift start indices: first point after most recent zero of C+/C-."""
    starts = []
    last_zero = -1
    for i, val in enumerate(c_values):
        if (positive and val == 0.0) or (not positive and val == 0.0):
            last_zero = i
        exceeds = (val > limit) if positive else (val < limit)
        if exceeds and last_zero + 1 not in starts:
            starts.append(last_zero + 1)
    return np.array(starts, dtype=int)


def compute_cusum(
    values: np.ndarray,
    config: CUSUMConfig,
) -> CUSUMResult:
    values = validate_1d_array(values, "values")
    validate_non_empty(values, "values")
    n = len(values)

    t = config.target
    sigma = config.sigma
    h = config.h
    k_ref = config.k

    if config.data_units:
        h_std = h / sigma
        k_std = k_ref / sigma
    else:
        h_std = h
        k_std = k_ref

    c_plus = np.zeros(n)
    c_minus = np.zeros(n)
    c_plus[0] = max(0.0, (values[0] - t) / sigma - k_std + config.head_start)
    c_minus[0] = min(0.0, (values[0] - t) / sigma + k_std - config.head_start)

    for i in range(1, n):
        z = (values[i] - t) / sigma
        c_plus[i] = max(0.0, z - k_std + c_plus[i - 1])
        c_minus[i] = min(0.0, z + k_std + c_minus[i - 1])

    violations_upper = c_plus > h_std
    violations_lower = c_minus < -h_std

    shift_starts_upper = _find_shift_starts(c_plus, h_std, positive=True)
    shift_starts_lower = _find_shift_starts(c_minus, -h_std, positive=False)

    return CUSUMResult(
        c_plus=c_plus,
        c_minus=c_minus,
        upper_limit=h_std,
        lower_limit=-h_std,
        violations_upper=violations_upper,
        violations_lower=violations_lower,
        shift_starts_upper=shift_starts_upper,
        shift_starts_lower=shift_starts_lower,
    )
```

- [ ] **Step 5: Implement __init__.py, run tests, commit**

```python
from .models import CUSUMConfig, CUSUMResult
from .compute import compute_cusum
```

Run: `pytest tests/test_cusum.py -v`
Commit: `git commit -m "feat: add CUSUM chart computation"`

---

### Task 21: CUSUM ARL

**Files:** `algo/cusum/arl.py`, `tests/test_cusum.py` (add ARL tests)

- [ ] **Step 1: Add failing ARL tests**

```python
from algo.cusum.arl import compute_arl, compute_arl_table


class TestCUSUMARL:
    def test_in_control_arl(self):
        """ARL at shift=0 with h=5, k=0.5 should be ~465."""
        arl = compute_arl(h=5.0, k=0.5, shift=0.0)
        assert 400 < arl < 550

    def test_arl_decreases_with_shift(self):
        arl_0 = compute_arl(h=5.0, k=0.5, shift=0.0)
        arl_1 = compute_arl(h=5.0, k=0.5, shift=1.0)
        arl_2 = compute_arl(h=5.0, k=0.5, shift=2.0)
        assert arl_0 > arl_1 > arl_2

    def test_head_start_reduces_arl(self):
        arl_no = compute_arl(h=5.0, k=0.5, shift=1.0, head_start=0.0)
        arl_fir = compute_arl(h=5.0, k=0.5, shift=1.0, head_start=2.0)
        assert arl_fir < arl_no

    def test_arl_table_shape(self):
        table = compute_arl_table(h=5.0, k=0.5)
        assert table.shape[1] == 2  # (shift, ARL) pairs
        assert table.shape[0] == 13  # 0 to 3 in 0.25 steps
```

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Implement arl.py**

```python
"""CUSUM Average Run Length computation via Goel & Wu (1971) integral equation method."""

import numpy as np
from numpy.polynomial.legendre import leggauss


def compute_arl(
    h: float,
    k: float,
    shift: float,
    head_start: float = 0.0,
) -> float:
    """One-sided ARL using 24-point Gauss-Legendre quadrature.

    Per Goel & Wu (1971). For head_start > 0, per Lucas & Crosier (1982).
    """
    n_points = 24
    nodes, weights = leggauss(n_points)

    # Map from [-1, 1] to [0, h]
    x = 0.5 * h * (nodes + 1.0)
    w = 0.5 * h * weights

    # Kernel: probability of transitioning from state x_j to x_i
    # For CUSUM: new_state = max(0, x + z - k) where z ~ N(shift, 1)
    from scipy.stats import norm

    # Build kernel matrix K[i,j] = prob of going from x_j to neighborhood of x_i
    K = np.zeros((n_points, n_points))
    for i in range(n_points):
        for j in range(n_points):
            # z needed to go from x_j to x_i: x_i = x_j + z - k => z = x_i - x_j + k
            z_needed = x[i] - x[j] + k
            K[i, j] = norm.pdf(z_needed - shift)

    # Fredholm integral equation: L(x) = 1 + integral K(x,y) L(y) dy
    # Discretized: L = 1 + K @ diag(w) @ L
    # (I - K @ diag(w)) @ L = 1
    A = np.eye(n_points) - K @ np.diag(w)
    b = np.ones(n_points)
    L = np.linalg.solve(A, b)

    if head_start > 0.0:
        # Interpolate ARL at the head_start position
        start_clamped = min(head_start, h)
        return float(np.interp(start_clamped, x, L))
    else:
        # ARL starting from 0: interpolate at x=0
        return float(np.interp(0.0, x, L))


def compute_arl_table(
    h: float,
    k: float,
    head_start: float = 0.0,
    shifts: np.ndarray | None = None,
) -> np.ndarray:
    """ARL table for shifts from 0 to 3σ in 0.25 increments (default)."""
    if shifts is None:
        shifts = np.arange(0.0, 3.25, 0.25)
    arls = np.array([compute_arl(h, k, s, head_start) for s in shifts])
    return np.column_stack([shifts, arls])
```

- [ ] **Step 4: Update cusum/__init__.py**

```python
from .models import CUSUMConfig, CUSUMResult
from .compute import compute_cusum
from .arl import compute_arl, compute_arl_table
```

- [ ] **Step 5: Run tests, commit**

Run: `pytest tests/test_cusum.py -v`
Commit: `git commit -m "feat: add CUSUM ARL computation (Goel & Wu 1971)"`

---

### Task 22: EWMA Chart

**Files:** `algo/ewma/{__init__,models,compute}.py`, `tests/test_ewma.py`

- [ ] **Step 1: Write failing tests**

```python
import pytest
import numpy as np
from algo.ewma import EWMAConfig, EWMAResult, compute_ewma


class TestEWMA:
    def test_lambda_one_equals_raw(self):
        """λ=1 means EWMA_i = x_i (no smoothing)."""
        values = np.array([10.0, 12.0, 11.0, 13.0, 10.0])
        config = EWMAConfig(target=11.0, sigma=1.0, lambda_=1.0)
        result = compute_ewma(values, config)
        np.testing.assert_allclose(result.ewma, values, atol=1e-10)

    def test_smoothing(self):
        """EWMA with λ=0.2 should be smoother than raw data."""
        rng = np.random.default_rng(42)
        values = rng.normal(0, 1, 50)
        config = EWMAConfig(target=0.0, sigma=1.0, lambda_=0.2)
        result = compute_ewma(values, config)
        # EWMA variance should be less than raw variance
        assert np.var(result.ewma) < np.var(values)

    def test_exact_limits_narrow_at_start(self):
        """Exact limits start narrow and widen."""
        values = np.zeros(20)
        config = EWMAConfig(target=0.0, sigma=1.0, lambda_=0.2, use_exact_limits=True)
        result = compute_ewma(values, config)
        # First UCL should be narrower than last
        assert result.ucl[0] < result.ucl[-1]

    def test_asymptotic_limits_constant(self):
        values = np.zeros(20)
        config = EWMAConfig(target=0.0, sigma=1.0, lambda_=0.2, use_exact_limits=False)
        result = compute_ewma(values, config)
        np.testing.assert_allclose(result.ucl, result.ucl[0], atol=1e-10)

    def test_forecast(self):
        values = np.array([10.0, 12.0, 11.0])
        config = EWMAConfig(target=11.0, sigma=1.0, lambda_=0.2)
        result = compute_ewma(values, config)
        assert result.forecast == pytest.approx(result.ewma[-1])

    def test_violations_detected(self):
        """Sustained shift should be detected."""
        values = np.concatenate([np.zeros(10), 2.0 * np.ones(20)])
        config = EWMAConfig(target=0.0, sigma=1.0, lambda_=0.2, k_sigma=3.0)
        result = compute_ewma(values, config)
        assert np.any(result.violations)
```

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Implement models.py**

```python
import attrs
import numpy as np
from algo.common.validators import validate_positive, validate_range


def _validate_k_sigma(instance, attribute, value):
    validate_positive(value, "k_sigma")


def _validate_sigma(instance, attribute, value):
    validate_positive(value, "sigma")


def _validate_lambda(instance, attribute, value):
    validate_range(value, 0.0, 1.0, "lambda_", low_exclusive=True)


@attrs.define(slots=True)
class EWMAConfig:
    target: float = 0.0
    sigma: float = attrs.field(default=1.0, validator=_validate_sigma)
    lambda_: float = attrs.field(default=0.2, validator=_validate_lambda)
    k_sigma: float = attrs.field(default=3.0, validator=_validate_k_sigma)
    use_exact_limits: bool = True


@attrs.define(slots=True)
class EWMAResult:
    ewma: np.ndarray
    ucl: np.ndarray
    lcl: np.ndarray
    center: float
    violations: np.ndarray
    forecast: float
    residuals: np.ndarray
```

- [ ] **Step 4: Implement compute.py**

```python
import numpy as np
from .models import EWMAConfig, EWMAResult
from algo.common.validators import validate_1d_array, validate_non_empty


def compute_ewma(
    values: np.ndarray,
    config: EWMAConfig,
    subgroup_sizes: np.ndarray | None = None,
) -> EWMAResult:
    values = validate_1d_array(values, "values")
    validate_non_empty(values, "values")
    n = len(values)
    lam = config.lambda_
    k = config.k_sigma
    sigma = config.sigma
    target = config.target

    # EWMA calculation
    ewma = np.zeros(n)
    ewma[0] = lam * values[0] + (1.0 - lam) * target
    for i in range(1, n):
        ewma[i] = lam * values[i] + (1.0 - lam) * ewma[i - 1]

    # Residuals: x_i - EWMA_{i-1}
    residuals = np.zeros(n)
    residuals[0] = values[0] - target
    residuals[1:] = values[1:] - ewma[:-1]

    # Control limits
    if subgroup_sizes is not None:
        subgroup_sizes = np.asarray(subgroup_sizes, dtype=float)
    else:
        subgroup_sizes = np.ones(n)

    if config.use_exact_limits:
        # Recursive O(n) variance computation
        variance = np.zeros(n)
        variance[0] = 1.0 / subgroup_sizes[0]
        lam_sq = lam * lam
        for i in range(1, n):
            variance[i] = lam_sq * variance[i - 1] + 1.0 / subgroup_sizes[i]
        limit_term = k * sigma * np.sqrt(variance)
    else:
        # Asymptotic constant limits
        n_avg = np.mean(subgroup_sizes)
        limit_val = k * sigma * np.sqrt(lam / (n_avg * (2.0 - lam)))
        limit_term = np.full(n, limit_val)

    ucl = target + limit_term
    lcl = target - limit_term
    violations = (ewma > ucl) | (ewma < lcl)
    forecast = float(ewma[-1])

    return EWMAResult(
        ewma=ewma, ucl=ucl, lcl=lcl, center=target,
        violations=violations, forecast=forecast, residuals=residuals,
    )
```

- [ ] **Step 5: Implement __init__.py, run tests, commit**

```python
from .models import EWMAConfig, EWMAResult
from .compute import compute_ewma
```

Run: `pytest tests/test_ewma.py -v`
Commit: `git commit -m "feat: add EWMA chart computation with exact and asymptotic limits"`

---

### Task 23: G Chart

**Files:** `algo/g_chart/{__init__,models,compute}.py`, `tests/test_g_chart.py`

- [ ] **Step 1: Write failing tests**

```python
import pytest
import numpy as np
from algo.g_chart import GChartConfig, GChartResult, compute_g_chart
from tests.conftest import assert_limits_valid


class TestGChart:
    def test_known_poisson_like(self):
        """When variance ≈ mean, k ≈ 0 (Poisson-like)."""
        rng = np.random.default_rng(42)
        counts = rng.poisson(10, 30)
        result = compute_g_chart(counts.astype(float))
        assert result.k_param == pytest.approx(0.0, abs=0.5)
        assert_limits_valid(result.limits)

    def test_overdispersed(self):
        """When variance > mean, k > 0."""
        rng = np.random.default_rng(42)
        counts = rng.negative_binomial(5, 0.3, 30)
        result = compute_g_chart(counts.astype(float))
        assert result.k_param > 0
        assert_limits_valid(result.limits)

    def test_lcl_non_negative(self):
        counts = np.array([5, 10, 3, 8, 12, 7, 15, 2, 9, 6], dtype=float)
        result = compute_g_chart(counts)
        assert np.all(result.limits.lcl >= 0)
```

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Implement models.py**

```python
import attrs
import numpy as np
from algo.common.types import ControlLimits
from algo.common.validators import validate_positive


def _validate_k_sigma(instance, attribute, value):
    validate_positive(value, "k_sigma")


@attrs.define(slots=True)
class GChartConfig:
    k_sigma: float = attrs.field(default=3.0, validator=_validate_k_sigma)


@attrs.define(slots=True)
class GChartResult:
    values: np.ndarray
    limits: ControlLimits
    mu: float
    k_param: float
```

- [ ] **Step 4: Implement compute.py**

```python
import numpy as np
from scipy.stats import chi2, norm
from .models import GChartConfig, GChartResult
from algo.common.types import ControlLimits
from algo.common.validators import validate_1d_array, validate_non_empty


def compute_g_chart(
    counts_between: np.ndarray,
    config: GChartConfig = GChartConfig(),
) -> GChartResult:
    counts_between = validate_1d_array(counts_between, "counts_between")
    validate_non_empty(counts_between, "counts_between")

    mu = float(np.mean(counts_between))
    var = float(np.var(counts_between, ddof=1)) if len(counts_between) > 1 else mu

    # Method of moments: k = (variance/mean - 1) if variance > mean, else 0
    k_param = max((var / mu - 1.0) if mu > 0 else 0.0, 0.0)

    # Chi-square approximation (Hoffman 2003)
    v = 2.0 / (1.0 + k_param) if k_param >= 0 else 2.0
    alpha = float(norm.cdf(-config.k_sigma))

    ucl_val = (chi2.ppf(1.0 - alpha, v) * (1.0 + k_param) - 1.0) / 2.0
    lcl_val = max((chi2.ppf(alpha, v) * (1.0 + k_param) - 1.0) / 2.0, 0.0)
    cl_val = mu

    n = len(counts_between)
    limits = ControlLimits(
        ucl=np.full(n, ucl_val),
        cl=np.full(n, cl_val),
        lcl=np.full(n, lcl_val),
        k_sigma=config.k_sigma,
    )

    return GChartResult(values=counts_between, limits=limits, mu=mu, k_param=k_param)
```

- [ ] **Step 5: Implement __init__.py, run tests, commit**

Run: `pytest tests/test_g_chart.py -v`
Commit: `git commit -m "feat: add G chart computation (negative binomial, chi-square approx)"`

---

### Task 24: T Chart

**Files:** `algo/t_chart/{__init__,models,compute}.py`, `tests/test_t_chart.py`

- [ ] **Step 1: Write failing tests**

```python
import pytest
import numpy as np
from algo.t_chart import TChartConfig, TChartResult, compute_t_chart
from tests.conftest import assert_limits_valid


class TestTChart:
    def test_known_weibull_data(self):
        rng = np.random.default_rng(42)
        from scipy.stats import weibull_min
        data = weibull_min.rvs(2.0, scale=10.0, size=30, random_state=rng)
        result = compute_t_chart(data)
        assert result.alpha > 0
        assert result.beta > 0
        assert_limits_valid(result.limits)

    def test_zeros_excluded_from_fit(self):
        data = np.array([0, 0, 5, 10, 3, 8, 12, 7, 15, 2], dtype=float)
        result = compute_t_chart(data)
        assert result.alpha > 0

    def test_lcl_non_negative(self):
        data = np.array([5.0, 10.0, 3.0, 8.0, 12.0])
        result = compute_t_chart(data)
        assert np.all(result.limits.lcl >= 0)
```

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Implement models.py and compute.py**

`models.py`:
```python
import attrs
import numpy as np
from algo.common.types import ControlLimits
from algo.common.validators import validate_positive


def _validate_k_sigma(instance, attribute, value):
    validate_positive(value, "k_sigma")


@attrs.define(slots=True)
class TChartConfig:
    k_sigma: float = attrs.field(default=3.0, validator=_validate_k_sigma)


@attrs.define(slots=True)
class TChartResult:
    values: np.ndarray
    limits: ControlLimits
    alpha: float
    beta: float
```

`compute.py`:
```python
import numpy as np
from scipy.stats import weibull_min, norm
from .models import TChartConfig, TChartResult
from algo.common.types import ControlLimits
from algo.common.validators import validate_1d_array, validate_non_empty


def compute_t_chart(
    times_between: np.ndarray,
    config: TChartConfig = TChartConfig(),
) -> TChartResult:
    times_between = validate_1d_array(times_between, "times_between")
    validate_non_empty(times_between, "times_between")

    # Exclude zeros from Weibull fit
    nonzero = times_between[times_between > 0]
    if len(nonzero) < 2:
        raise ValueError("T chart requires at least 2 non-zero values for Weibull fit")

    shape, loc, scale = weibull_min.fit(nonzero, floc=0)
    alpha = shape
    beta = scale

    k = config.k_sigma
    p1 = float(norm.cdf(-k))
    p2 = 0.5
    p3 = float(norm.cdf(k))

    lcl_val = max(float(weibull_min.ppf(p1, alpha, scale=beta)), 0.0)
    cl_val = float(weibull_min.ppf(p2, alpha, scale=beta))
    ucl_val = float(weibull_min.ppf(p3, alpha, scale=beta))

    n = len(times_between)
    limits = ControlLimits(
        ucl=np.full(n, ucl_val),
        cl=np.full(n, cl_val),
        lcl=np.full(n, lcl_val),
        k_sigma=k,
    )

    return TChartResult(values=times_between, limits=limits, alpha=alpha, beta=beta)
```

- [ ] **Step 4: Implement __init__.py, run tests, commit**

Run: `pytest tests/test_t_chart.py -v`
Commit: `git commit -m "feat: add T chart computation (Weibull distribution)"`

---

### Task 25: Short Run Chart

**Files:** `algo/short_run/{__init__,models,compute}.py`, `tests/test_short_run.py`

- [ ] **Step 1: Write failing tests**

```python
import pytest
import numpy as np
from algo.short_run import ShortRunConfig, ShortRunResult, compute_short_run
from algo.common.enums import ScalingMethod
from tests.conftest import assert_limits_valid


class TestShortRun:
    def test_centered(self):
        """Centered values = yi - target_j."""
        values = np.array([10, 12, 11, 20, 22, 21], dtype=float)
        labels = np.array(["A", "A", "A", "B", "B", "B"])
        config = ShortRunConfig(scaling=ScalingMethod.CENTERED)
        result = compute_short_run(values, labels, config)
        # Product A target = 11, Product B target = 21
        expected = np.array([-1, 1, 0, -1, 1, 0], dtype=float)
        np.testing.assert_allclose(result.transformed_values, expected, atol=1e-6)
        assert_limits_valid(result.limits)

    def test_standardized(self):
        """Standardized values = (yi - target_j) / sigma_j."""
        values = np.array([10, 12, 11, 13, 20, 22, 21, 23], dtype=float)
        labels = np.array(["A", "A", "A", "A", "B", "B", "B", "B"])
        config = ShortRunConfig(scaling=ScalingMethod.STANDARDIZED)
        result = compute_short_run(values, labels, config)
        assert result.limits.cl[0] == pytest.approx(0.0, abs=1e-6)

    def test_custom_targets(self):
        values = np.array([10, 12, 20, 22], dtype=float)
        labels = np.array(["A", "A", "B", "B"])
        config = ShortRunConfig(
            scaling=ScalingMethod.CENTERED,
            product_targets={"A": 10.0, "B": 20.0},
        )
        result = compute_short_run(values, labels, config)
        expected = np.array([0, 2, 0, 2], dtype=float)
        np.testing.assert_allclose(result.transformed_values, expected, atol=1e-6)

    def test_product_stats_auto_computed(self):
        values = np.array([10, 12, 11, 20, 22, 21], dtype=float)
        labels = np.array(["A", "A", "A", "B", "B", "B"])
        config = ShortRunConfig(scaling=ScalingMethod.CENTERED)
        result = compute_short_run(values, labels, config)
        assert "A" in result.product_stats
        assert "B" in result.product_stats
        assert result.product_stats["A"][0] == pytest.approx(11.0)
        assert result.product_stats["B"][0] == pytest.approx(21.0)
```

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Implement models.py**

```python
import attrs
import numpy as np
from algo.common.types import ControlLimits, SigmaResult
from algo.common.enums import ScalingMethod
from algo.common.validators import validate_positive


def _validate_k_sigma(instance, attribute, value):
    validate_positive(value, "k_sigma")


@attrs.define(slots=True)
class ShortRunConfig:
    scaling: ScalingMethod = ScalingMethod.CENTERED
    product_targets: dict[str, float] | None = None
    product_sigmas: dict[str, float] | None = None
    subgrouped: bool = False
    k_sigma: float = attrs.field(default=3.0, validator=_validate_k_sigma)


@attrs.define(slots=True)
class ShortRunResult:
    transformed_values: np.ndarray
    limits: ControlLimits
    sigma: SigmaResult
    product_stats: dict[str, tuple[float, float]]
    dispersion_values: np.ndarray
    dispersion_limits: ControlLimits
```

- [ ] **Step 4: Implement compute.py**

```python
import numpy as np
from .models import ShortRunConfig, ShortRunResult
from algo.common.types import ControlLimits, SigmaResult
from algo.common.enums import SigmaMethod, ScalingMethod
from algo.common.sigma import sigma_from_moving_range
from algo.common.zones import compute_zones
from algo.common.validators import validate_1d_array, validate_non_empty
from algo.constants.tables import d2, d3


def compute_short_run(
    values: np.ndarray,
    part_labels: np.ndarray,
    config: ShortRunConfig,
    subgroup_sizes: np.ndarray | None = None,
) -> ShortRunResult:
    values = validate_1d_array(values, "values")
    validate_non_empty(values, "values")
    part_labels = np.asarray(part_labels)
    k = config.k_sigma

    unique_parts = np.unique(part_labels)
    product_stats: dict[str, tuple[float, float]] = {}

    # Compute per-product target and sigma
    for part in unique_parts:
        part_str = str(part)
        mask = part_labels == part
        part_values = values[mask]

        if config.product_targets and part_str in config.product_targets:
            target = config.product_targets[part_str]
        else:
            target = float(np.mean(part_values))

        if config.product_sigmas and part_str in config.product_sigmas:
            sigma = config.product_sigmas[part_str]
        else:
            if len(part_values) >= 2:
                sigma = sigma_from_moving_range(part_values).sigma_hat
            else:
                sigma = 0.0

        product_stats[part_str] = (target, sigma)

    # Transform values
    transformed = np.zeros_like(values)
    for part in unique_parts:
        part_str = str(part)
        mask = part_labels == part
        target, sigma = product_stats[part_str]
        if config.scaling == ScalingMethod.CENTERED:
            transformed[mask] = values[mask] - target
        else:  # STANDARDIZED
            if sigma > 0:
                transformed[mask] = (values[mask] - target) / sigma
            else:
                transformed[mask] = 0.0

    # Limits for transformed values
    sigma_result = sigma_from_moving_range(transformed)
    sigma_hat = sigma_result.sigma_hat

    if config.scaling == ScalingMethod.CENTERED:
        cl_val = float(np.mean(transformed))
        n = len(transformed)
        ucl = np.full(n, cl_val + k * sigma_hat)
        lcl = np.full(n, cl_val - k * sigma_hat)
        cl = np.full(n, cl_val)
    else:
        cl_val = 0.0
        span = 2
        n = len(transformed)
        ucl = np.full(n, k / (d2(span) * np.sqrt(1)))
        lcl = np.full(n, -k / (d2(span) * np.sqrt(1)))
        cl = np.full(n, 0.0)

    limits = ControlLimits(ucl=ucl, cl=cl, lcl=lcl, k_sigma=k)

    # Dispersion chart (MR of transformed)
    mr = np.abs(np.diff(transformed))
    span = 2
    d2_val = d2(span)
    d3_val = d3(span)
    mr_cl = d2_val * sigma_hat
    mr_ucl = d2_val * sigma_hat + k * d3_val * sigma_hat
    mr_lcl = max(d2_val * sigma_hat - k * d3_val * sigma_hat, 0.0)
    disp_limits = ControlLimits(
        ucl=np.full(len(mr), mr_ucl),
        cl=np.full(len(mr), mr_cl),
        lcl=np.full(len(mr), mr_lcl),
        k_sigma=k,
    )

    return ShortRunResult(
        transformed_values=transformed,
        limits=limits,
        sigma=sigma_result,
        product_stats=product_stats,
        dispersion_values=mr,
        dispersion_limits=disp_limits,
    )
```

- [ ] **Step 5: Implement __init__.py, run tests, commit**

Run: `pytest tests/test_short_run.py -v`
Commit: `git commit -m "feat: add Short Run chart computation (centered + standardized)"`

---

### Task 26: Three Way Chart

**Files:** `algo/three_way/{__init__,models,compute}.py`, `tests/test_three_way.py`

- [ ] **Step 1: Write failing tests**

```python
import pytest
import numpy as np
from algo.three_way import ThreeWayConfig, ThreeWayResult, compute_three_way
from algo.common.enums import WithinMethod, BetweenMethod
from tests.conftest import assert_limits_valid


class TestThreeWay:
    def test_known_answer(self):
        rng = np.random.default_rng(42)
        data = rng.normal(50, 2, (20, 5))
        sizes = np.full(20, 5)
        result = compute_three_way(data, sizes)
        assert result.sigma_within > 0
        assert result.sigma_bw >= result.sigma_within
        assert_limits_valid(result.between_chart)
        assert_limits_valid(result.within_chart)

    def test_negative_between_clamped(self):
        """When within variance dominates, between sigma = 0."""
        # All subgroups have same mean but high within-variance
        data = np.array([
            [50, 50, 50],
            [50, 50, 50],
            [50, 50, 50],
        ], dtype=float)
        sizes = np.full(3, 3)
        result = compute_three_way(data, sizes)
        assert result.sigma_between == 0.0

    def test_stddev_within_method(self):
        rng = np.random.default_rng(42)
        data = rng.normal(50, 2, (10, 5))
        sizes = np.full(10, 5)
        config = ThreeWayConfig(within_method=WithinMethod.STDDEV)
        result = compute_three_way(data, sizes, config)
        assert result.sigma_within > 0
```

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Implement models.py**

```python
import attrs
import numpy as np
from algo.common.types import ControlLimits
from algo.common.enums import WithinMethod, BetweenMethod
from algo.common.validators import validate_positive


def _validate_k_sigma(instance, attribute, value):
    validate_positive(value, "k_sigma")


@attrs.define(slots=True)
class ThreeWayConfig:
    within_method: WithinMethod = WithinMethod.RANGE
    between_method: BetweenMethod = BetweenMethod.MOVING_RANGE
    k_sigma: float = attrs.field(default=3.0, validator=_validate_k_sigma)


@attrs.define(slots=True)
class ThreeWayResult:
    between_chart: ControlLimits
    within_chart: ControlLimits
    sigma_within: float
    sigma_between: float
    sigma_bw: float
    subgroup_means: np.ndarray
    subgroup_dispersions: np.ndarray
```

- [ ] **Step 4: Implement compute.py**

```python
import numpy as np
import math
from .models import ThreeWayConfig, ThreeWayResult
from algo.common.types import ControlLimits
from algo.common.enums import WithinMethod, BetweenMethod
from algo.common.sigma import sigma_from_ranges, sigma_from_stddevs
from algo.common.validators import validate_non_empty
from algo.constants.tables import d2, d3, c4, c5


def compute_three_way(
    data: np.ndarray,
    subgroup_sizes: np.ndarray,
    config: ThreeWayConfig = ThreeWayConfig(),
) -> ThreeWayResult:
    data = np.asarray(data, dtype=np.float64)
    subgroup_sizes = np.asarray(subgroup_sizes, dtype=int)
    k = config.k_sigma

    if data.ndim == 2:
        means = data.mean(axis=1)
        ranges = data.max(axis=1) - data.min(axis=1)
        stddevs = data.std(axis=1, ddof=1)
    else:
        splits = np.cumsum(subgroup_sizes[:-1])
        groups = np.split(data, splits)
        means = np.array([g.mean() for g in groups])
        ranges = np.array([g.max() - g.min() for g in groups])
        stddevs = np.array([g.std(ddof=1) for g in groups])

    # Within sigma
    if config.within_method == WithinMethod.RANGE:
        within_result = sigma_from_ranges(ranges, subgroup_sizes)
        dispersions = ranges
    else:
        within_result = sigma_from_stddevs(stddevs, subgroup_sizes)
        dispersions = stddevs
    sigma_w = within_result.sigma_hat

    # Between sigma
    n = len(means)
    mr = np.abs(np.diff(means))
    if config.between_method == BetweenMethod.MOVING_RANGE:
        mr_bar = float(np.mean(mr)) if len(mr) > 0 else 0.0
    else:
        mr_bar = float(np.median(mr)) if len(mr) > 0 else 0.0

    h = float(n / np.sum(1.0 / subgroup_sizes.astype(float)))  # harmonic mean
    between_sq = (mr_bar / d2(2)) ** 2 - sigma_w ** 2 / h
    sigma_b = math.sqrt(between_sq) if between_sq > 0 else 0.0
    sigma_bw = math.sqrt(sigma_w ** 2 + sigma_b ** 2)

    # Between chart limits (on subgroup means)
    grand_mean = float(np.mean(means))
    b_ucl = np.full(n, grand_mean + k * sigma_bw / np.sqrt(h))
    b_lcl = np.full(n, grand_mean - k * sigma_bw / np.sqrt(h))
    b_cl = np.full(n, grand_mean)
    between_chart = ControlLimits(ucl=b_ucl, cl=b_cl, lcl=b_lcl, k_sigma=k)

    # Within chart limits (on dispersions)
    if config.within_method == WithinMethod.RANGE:
        d2_vals = np.array([d2(int(s)) for s in subgroup_sizes])
        d3_vals = np.array([d3(int(s)) for s in subgroup_sizes])
        w_cl = d2_vals * sigma_w
        w_ucl = d2_vals * sigma_w + k * d3_vals * sigma_w
        w_lcl = np.maximum(d2_vals * sigma_w - k * d3_vals * sigma_w, 0.0)
    else:
        c4_vals = np.array([c4(int(s)) for s in subgroup_sizes])
        c5_vals = np.array([c5(int(s)) for s in subgroup_sizes])
        w_cl = c4_vals * sigma_w
        w_ucl = c4_vals * sigma_w + k * c5_vals * sigma_w
        w_lcl = np.maximum(c4_vals * sigma_w - k * c5_vals * sigma_w, 0.0)
    within_chart = ControlLimits(ucl=w_ucl, cl=w_cl, lcl=w_lcl, k_sigma=k)

    return ThreeWayResult(
        between_chart=between_chart,
        within_chart=within_chart,
        sigma_within=sigma_w,
        sigma_between=sigma_b,
        sigma_bw=sigma_bw,
        subgroup_means=means,
        subgroup_dispersions=dispersions,
    )
```

- [ ] **Step 5: Implement __init__.py, run tests, commit**

Run: `pytest tests/test_three_way.py -v`
Commit: `git commit -m "feat: add Three Way chart computation (within + between sigma)"`

---

### Task 27: Nelson Tests 1-4

**Files:** `algo/rules/nelson.py`, `algo/rules/models.py`, `tests/test_rules/test_nelson.py`

- [ ] **Step 1: Write failing tests**

```python
import pytest
import numpy as np
from algo.rules.nelson import (
    test_beyond_limits,
    test_same_side,
    test_trending,
    test_alternating,
)
from algo.common.types import ZoneBreakdown


@pytest.fixture
def zones():
    return ZoneBreakdown(
        zone_a_upper=12.0, zone_b_upper=11.0, cl=10.0,
        zone_b_lower=9.0, zone_a_lower=8.0,
    )


class TestBeyondLimits:
    def test_above_ucl(self):
        values = np.array([10, 10, 14, 10, 10], dtype=float)
        ucl = np.full(5, 13.0)
        lcl = np.full(5, 7.0)
        mask = test_beyond_limits(values, ucl, lcl)
        assert mask[2] == True
        assert np.sum(mask) == 1

    def test_below_lcl(self):
        values = np.array([10, 10, 6, 10, 10], dtype=float)
        ucl = np.full(5, 13.0)
        lcl = np.full(5, 7.0)
        mask = test_beyond_limits(values, ucl, lcl)
        assert mask[2] == True

    def test_at_limit_no_trigger(self):
        values = np.array([13.0])
        ucl = np.full(1, 13.0)
        lcl = np.full(1, 7.0)
        mask = test_beyond_limits(values, ucl, lcl)
        assert mask[0] == False


class TestSameSide:
    def test_nine_above_triggers(self):
        values = np.array([11, 11, 11, 11, 11, 11, 11, 11, 11, 9], dtype=float)
        mask = test_same_side(values, cl=10.0)
        assert mask[8] == True

    def test_eight_above_no_trigger(self):
        values = np.array([11, 11, 11, 11, 11, 11, 11, 11, 9], dtype=float)
        mask = test_same_side(values, cl=10.0)
        assert not np.any(mask)

    def test_on_center_no_count(self):
        """Points on CL do not count as either side."""
        values = np.array([11, 11, 11, 11, 10, 11, 11, 11, 11, 11], dtype=float)
        mask = test_same_side(values, cl=10.0)
        # The point at CL breaks the run, so no 9 consecutive
        assert not np.any(mask)


class TestTrending:
    def test_six_increasing(self):
        values = np.array([1, 2, 3, 4, 5, 6, 3], dtype=float)
        mask = test_trending(values)
        assert mask[5] == True

    def test_five_increasing_no_trigger(self):
        values = np.array([1, 2, 3, 4, 5, 3], dtype=float)
        mask = test_trending(values)
        assert not np.any(mask)

    def test_six_decreasing(self):
        values = np.array([6, 5, 4, 3, 2, 1, 5], dtype=float)
        mask = test_trending(values)
        assert mask[5] == True

    def test_equal_breaks_trend(self):
        values = np.array([1, 2, 3, 3, 4, 5, 6], dtype=float)
        mask = test_trending(values)
        assert not np.any(mask)


class TestAlternating:
    def test_fourteen_alternating(self):
        values = np.array([1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 5], dtype=float)
        mask = test_alternating(values)
        assert mask[13] == True

    def test_thirteen_no_trigger(self):
        values = np.array([1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 5], dtype=float)
        mask = test_alternating(values)
        assert not np.any(mask)
```

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Implement models.py**

```python
import attrs
import numpy as np


@attrs.define(slots=True)
class RuleConfig:
    nelson_tests: tuple[int, ...] = (1, 2, 3, 4, 5)
    westgard_rules: tuple[str, ...] = ()
    custom_params: dict = attrs.Factory(dict)


@attrs.define(slots=True)
class RuleViolation:
    test_id: int | str
    point_indices: np.ndarray
    description: str
```

- [ ] **Step 4: Implement nelson.py (tests 1-4)**

```python
"""Nelson tests 1-4 (JMP numbering). Tests 5-8 added in Task 28."""

import numpy as np


def test_beyond_limits(
    values: np.ndarray, ucl: np.ndarray, lcl: np.ndarray
) -> np.ndarray:
    """Test 1: One point beyond ±3σ (beyond, not at)."""
    return (values > ucl) | (values < lcl)


def test_same_side(values: np.ndarray, cl: float, n: int = 9) -> np.ndarray:
    """Test 2: n consecutive points on same side of CL (default n=9).

    Points exactly on CL do not count as either side.
    """
    mask = np.zeros(len(values), dtype=bool)
    above_count = 0
    below_count = 0
    for i, v in enumerate(values):
        if v > cl:
            above_count += 1
            below_count = 0
        elif v < cl:
            below_count += 1
            above_count = 0
        else:  # on CL
            above_count = 0
            below_count = 0
        if above_count >= n or below_count >= n:
            mask[i] = True
    return mask


def test_trending(values: np.ndarray, n: int = 6) -> np.ndarray:
    """Test 3: n consecutive points steadily increasing or decreasing (default n=6).

    Equal values break the trend.
    """
    mask = np.zeros(len(values), dtype=bool)
    inc = 1
    dec = 1
    for i in range(1, len(values)):
        if values[i] > values[i - 1]:
            inc += 1
            dec = 1
        elif values[i] < values[i - 1]:
            dec += 1
            inc = 1
        else:
            inc = 1
            dec = 1
        if inc >= n or dec >= n:
            mask[i] = True
    return mask


def test_alternating(values: np.ndarray, n: int = 14) -> np.ndarray:
    """Test 4: n consecutive points alternating up and down (default n=14)."""
    mask = np.zeros(len(values), dtype=bool)
    count = 1
    for i in range(2, len(values)):
        prev_dir = values[i - 1] - values[i - 2]
        curr_dir = values[i] - values[i - 1]
        if (prev_dir > 0 and curr_dir < 0) or (prev_dir < 0 and curr_dir > 0):
            count += 1
        else:
            count = 1
        if count >= n:
            mask[i] = True
    return mask
```

- [ ] **Step 5: Run tests, commit**

Run: `pytest tests/test_rules/test_nelson.py -v`
Commit: `git commit -m "feat: add Nelson tests 1-4 (beyond limits, same side, trending, alternating)"`

---

### Task 28: Nelson Tests 5-8

**Files:** Modify `algo/rules/nelson.py`, add tests to `tests/test_rules/test_nelson.py`

- [ ] **Step 1: Add failing tests**

```python
class TestZoneA:
    def test_two_of_three_same_side(self, zones):
        """2 of 3 consecutive in Zone A (same side) triggers."""
        # Zone A upper is > 12.0
        values = np.array([10, 12.5, 10, 12.5, 10], dtype=float)
        mask = test_zone_a(values, zones)
        assert mask[3] == True

    def test_two_of_three_opposite_sides_no_trigger(self, zones):
        values = np.array([10, 12.5, 7.5, 10, 10], dtype=float)
        mask = test_zone_a(values, zones)
        assert not np.any(mask)


class TestZoneB:
    def test_four_of_five_same_side(self, zones):
        """4 of 5 consecutive in Zone B or beyond (same side)."""
        # Zone B upper boundary is 11.0, so values > 11 are in B or A
        values = np.array([11.5, 11.5, 10, 11.5, 11.5, 10], dtype=float)
        mask = test_zone_b(values, zones)
        assert mask[4] == True

    def test_three_of_five_no_trigger(self, zones):
        values = np.array([11.5, 11.5, 10, 11.5, 10], dtype=float)
        mask = test_zone_b(values, zones)
        assert not np.any(mask)


class TestInZoneC:
    def test_fifteen_in_zone_c(self, zones):
        """15 consecutive in Zone C (both sides) = stratification."""
        values = np.full(16, 10.5)  # all in Zone C (10 ± 1)
        mask = test_in_zone_c(values, zones)
        assert mask[14] == True

    def test_fourteen_no_trigger(self, zones):
        values = np.full(14, 10.5)
        mask = test_in_zone_c(values, zones)
        assert not np.any(mask)


class TestOutsideZoneC:
    def test_eight_outside_zone_c(self, zones):
        """8 consecutive outside Zone C (both sides) = overcontrol."""
        # Outside Zone C means beyond ±1σ = beyond 9 or 11
        values = np.array([12, 8, 12, 8, 12, 8, 12, 8, 10], dtype=float)
        mask = test_outside_zone_c(values, zones)
        assert mask[7] == True

    def test_seven_no_trigger(self, zones):
        values = np.array([12, 8, 12, 8, 12, 8, 12, 10], dtype=float)
        mask = test_outside_zone_c(values, zones)
        assert not np.any(mask)
```

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Add to nelson.py**

```python
from algo.common.types import ZoneBreakdown


def test_zone_a(values: np.ndarray, zones: ZoneBreakdown, n: int = 2, window: int = 3) -> np.ndarray:
    """Test 5: n of window consecutive in Zone A or beyond, same side (default 2 of 3)."""
    mask = np.zeros(len(values), dtype=bool)
    for i in range(window - 1, len(values)):
        win = values[i - window + 1: i + 1]
        upper = np.sum(win > zones.zone_a_upper)
        lower = np.sum(win < zones.zone_a_lower)
        if upper >= n and win[window - 1] > zones.zone_a_upper:
            mask[i] = True
        elif lower >= n and win[window - 1] < zones.zone_a_lower:
            mask[i] = True
    return mask


def test_zone_b(values: np.ndarray, zones: ZoneBreakdown, n: int = 4, window: int = 5) -> np.ndarray:
    """Test 6: n of window consecutive in Zone B or beyond, same side (default 4 of 5)."""
    mask = np.zeros(len(values), dtype=bool)
    for i in range(window - 1, len(values)):
        win = values[i - window + 1: i + 1]
        upper = np.sum(win > zones.zone_b_upper)
        lower = np.sum(win < zones.zone_b_lower)
        if upper >= n and win[window - 1] > zones.zone_b_upper:
            mask[i] = True
        elif lower >= n and win[window - 1] < zones.zone_b_lower:
            mask[i] = True
    return mask


def test_in_zone_c(values: np.ndarray, zones: ZoneBreakdown, n: int = 15) -> np.ndarray:
    """Test 7: n consecutive in Zone C (both sides) — stratification (default n=15)."""
    mask = np.zeros(len(values), dtype=bool)
    count = 0
    for i, v in enumerate(values):
        if zones.zone_b_lower <= v <= zones.zone_b_upper:
            count += 1
        else:
            count = 0
        if count >= n:
            mask[i] = True
    return mask


def test_outside_zone_c(values: np.ndarray, zones: ZoneBreakdown, n: int = 8) -> np.ndarray:
    """Test 8: n consecutive outside Zone C (both sides) — overcontrol (default n=8)."""
    mask = np.zeros(len(values), dtype=bool)
    count = 0
    for i, v in enumerate(values):
        if v > zones.zone_b_upper or v < zones.zone_b_lower:
            count += 1
        else:
            count = 0
        if count >= n:
            mask[i] = True
    return mask
```

- [ ] **Step 4: Run tests, commit**

Run: `pytest tests/test_rules/test_nelson.py -v`
Commit: `git commit -m "feat: add Nelson tests 5-8 (zone A, zone B, stratification, overcontrol)"`

---

### Task 29: Westgard Rules

**Files:** `algo/rules/westgard.py`, `tests/test_rules/test_westgard.py`

- [ ] **Step 1: Write failing tests**

```python
import pytest
import numpy as np
from algo.rules.westgard import test_1_2s, test_1_3s, test_2_2s, test_r_4s, test_4_1s, test_10_x
from algo.common.types import ZoneBreakdown


@pytest.fixture
def zones():
    return ZoneBreakdown(
        zone_a_upper=12.0, zone_b_upper=11.0, cl=10.0,
        zone_b_lower=9.0, zone_a_lower=8.0,
    )


class TestWestgard1_2s:
    def test_triggers(self, zones):
        values = np.array([10, 10, 12.5, 10], dtype=float)
        mask = test_1_2s(values, zones)
        assert mask[2] == True


class TestWestgard1_3s:
    def test_triggers(self, zones):
        values = np.array([10, 10, 13.5, 10], dtype=float)
        # Beyond 3σ = beyond 13.0
        ucl = 13.0
        mask = test_1_3s(values, zones)
        assert mask[2] == True


class TestWestgard2_2s:
    def test_triggers(self, zones):
        values = np.array([10, 12.5, 12.5, 10], dtype=float)
        mask = test_2_2s(values, zones)
        assert mask[2] == True

    def test_opposite_sides_no_trigger(self, zones):
        values = np.array([10, 12.5, 7.5, 10], dtype=float)
        mask = test_2_2s(values, zones)
        assert not np.any(mask)


class TestWestgardR4s:
    def test_triggers(self, zones):
        values = np.array([10, 12.5, 7.5, 10], dtype=float)
        mask = test_r_4s(values, zones)
        # 12.5 - 7.5 = 5.0 > 4σ (sigma=1, so 4σ=4)
        assert mask[2] == True


class TestWestgard4_1s:
    def test_triggers(self, zones):
        values = np.array([11.5, 11.5, 11.5, 11.5, 10], dtype=float)
        mask = test_4_1s(values, zones)
        assert mask[3] == True


class TestWestgard10x:
    def test_triggers(self, zones):
        values = np.array([11] * 10 + [9], dtype=float)
        mask = test_10_x(values, zones.cl)
        assert mask[9] == True
```

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Implement westgard.py**

```python
"""Westgard rules for laboratory quality control."""

import numpy as np
from algo.common.types import ZoneBreakdown


def test_1_2s(values: np.ndarray, zones: ZoneBreakdown) -> np.ndarray:
    """Rule 1 2S: One point beyond ±2σ."""
    return (values > zones.zone_a_upper) | (values < zones.zone_a_lower)


def test_1_3s(values: np.ndarray, zones: ZoneBreakdown) -> np.ndarray:
    """Rule 1 3S: One point beyond ±3σ."""
    ucl = zones.cl + 3.0 * (zones.zone_b_upper - zones.cl)
    lcl = zones.cl - 3.0 * (zones.cl - zones.zone_b_lower)
    return (values > ucl) | (values < lcl)


def test_2_2s(values: np.ndarray, zones: ZoneBreakdown) -> np.ndarray:
    """Rule 2 2S: Two consecutive beyond ±2σ, same side."""
    mask = np.zeros(len(values), dtype=bool)
    for i in range(1, len(values)):
        both_above = values[i] > zones.zone_a_upper and values[i - 1] > zones.zone_a_upper
        both_below = values[i] < zones.zone_a_lower and values[i - 1] < zones.zone_a_lower
        if both_above or both_below:
            mask[i] = True
    return mask


def test_r_4s(values: np.ndarray, zones: ZoneBreakdown) -> np.ndarray:
    """Rule R 4S: Consecutive points spanning >4σ."""
    sigma = zones.zone_b_upper - zones.cl  # 1σ
    mask = np.zeros(len(values), dtype=bool)
    for i in range(1, len(values)):
        if abs(values[i] - values[i - 1]) > 4.0 * sigma:
            mask[i] = True
    return mask


def test_4_1s(values: np.ndarray, zones: ZoneBreakdown) -> np.ndarray:
    """Rule 4 1S: Four consecutive beyond ±1σ, same side."""
    mask = np.zeros(len(values), dtype=bool)
    above_count = 0
    below_count = 0
    for i, v in enumerate(values):
        if v > zones.zone_b_upper:
            above_count += 1
            below_count = 0
        elif v < zones.zone_b_lower:
            below_count += 1
            above_count = 0
        else:
            above_count = 0
            below_count = 0
        if above_count >= 4 or below_count >= 4:
            mask[i] = True
    return mask


def test_10_x(values: np.ndarray, cl: float) -> np.ndarray:
    """Rule 10 X: Ten consecutive on same side of mean."""
    mask = np.zeros(len(values), dtype=bool)
    above_count = 0
    below_count = 0
    for i, v in enumerate(values):
        if v > cl:
            above_count += 1
            below_count = 0
        elif v < cl:
            below_count += 1
            above_count = 0
        else:
            above_count = 0
            below_count = 0
        if above_count >= 10 or below_count >= 10:
            mask[i] = True
    return mask
```

- [ ] **Step 4: Run tests, commit**

Run: `pytest tests/test_rules/test_westgard.py -v`
Commit: `git commit -m "feat: add Westgard rules (1_2s, 1_3s, 2_2s, R_4s, 4_1s, 10_x)"`

---

### Task 30: Beyond Limits + Evaluate Orchestrator

**Files:** `algo/rules/beyond_limits.py`, `algo/rules/evaluate.py`, `tests/test_rules/test_evaluate.py`

- [ ] **Step 1: Write failing tests**

```python
import pytest
import numpy as np
from algo.rules.evaluate import evaluate_rules
from algo.rules.models import RuleConfig
from algo.common.types import ControlLimits, ZoneBreakdown


class TestEvaluateRules:
    def test_default_config(self):
        values = np.array([10, 10, 14, 10, 10], dtype=float)
        limits = ControlLimits(
            ucl=np.full(5, 13.0), cl=np.full(5, 10.0),
            lcl=np.full(5, 7.0), k_sigma=3.0,
        )
        zones = ZoneBreakdown(
            zone_a_upper=12.0, zone_b_upper=11.0, cl=10.0,
            zone_b_lower=9.0, zone_a_lower=8.0,
        )
        violations = evaluate_rules(values, limits, zones)
        assert len(violations) > 0
        # Test 1 should fire
        test1_viol = [v for v in violations if v.test_id == 1]
        assert len(test1_viol) == 1
        assert 2 in test1_viol[0].point_indices

    def test_empty_config(self):
        values = np.array([10, 10, 14, 10, 10], dtype=float)
        limits = ControlLimits(
            ucl=np.full(5, 13.0), cl=np.full(5, 10.0),
            lcl=np.full(5, 7.0), k_sigma=3.0,
        )
        zones = ZoneBreakdown(
            zone_a_upper=12.0, zone_b_upper=11.0, cl=10.0,
            zone_b_lower=9.0, zone_a_lower=8.0,
        )
        config = RuleConfig(nelson_tests=(), westgard_rules=())
        violations = evaluate_rules(values, limits, zones, config)
        assert len(violations) == 0

    def test_multiple_rules_fire(self):
        # 9 points above CL + one beyond UCL
        values = np.array([11, 11, 11, 11, 11, 11, 11, 11, 14, 10], dtype=float)
        limits = ControlLimits(
            ucl=np.full(10, 13.0), cl=np.full(10, 10.0),
            lcl=np.full(10, 7.0), k_sigma=3.0,
        )
        zones = ZoneBreakdown(
            zone_a_upper=12.0, zone_b_upper=11.0, cl=10.0,
            zone_b_lower=9.0, zone_a_lower=8.0,
        )
        violations = evaluate_rules(values, limits, zones)
        test_ids = {v.test_id for v in violations}
        assert 1 in test_ids  # beyond limits
        assert 2 in test_ids  # 9 same side
```

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Implement beyond_limits.py**

```python
"""Test Beyond Limits (Test 15): any point beyond control limits."""

import numpy as np


def test_beyond_control_limits(
    values: np.ndarray, ucl: np.ndarray, lcl: np.ndarray
) -> np.ndarray:
    """Any point beyond UCL or below LCL."""
    return (values > ucl) | (values < lcl)
```

- [ ] **Step 4: Implement evaluate.py**

```python
"""Rules orchestrator — runs configured tests and collects violations."""

import numpy as np
from .models import RuleConfig, RuleViolation
from .nelson import (
    test_beyond_limits, test_same_side, test_trending, test_alternating,
    test_zone_a, test_zone_b, test_in_zone_c, test_outside_zone_c,
)
from .westgard import test_1_2s, test_1_3s, test_2_2s, test_r_4s, test_4_1s, test_10_x
from algo.common.types import ControlLimits, ZoneBreakdown


_NELSON_FUNCS = {
    1: ("1 point beyond ±3σ", lambda v, l, z: test_beyond_limits(v, l.ucl, l.lcl)),
    2: ("9 consecutive same side", lambda v, l, z: test_same_side(v, z.cl)),
    3: ("6 consecutive trending", lambda v, l, z: test_trending(v)),
    4: ("14 consecutive alternating", lambda v, l, z: test_alternating(v)),
    5: ("2 of 3 in Zone A", lambda v, l, z: test_zone_a(v, z)),
    6: ("4 of 5 in Zone B+", lambda v, l, z: test_zone_b(v, z)),
    7: ("15 in Zone C", lambda v, l, z: test_in_zone_c(v, z)),
    8: ("8 outside Zone C", lambda v, l, z: test_outside_zone_c(v, z)),
}

_WESTGARD_FUNCS = {
    "1_2s": ("1 point beyond ±2σ", lambda v, l, z: test_1_2s(v, z)),
    "1_3s": ("1 point beyond ±3σ", lambda v, l, z: test_1_3s(v, z)),
    "2_2s": ("2 consecutive beyond ±2σ", lambda v, l, z: test_2_2s(v, z)),
    "R_4s": ("Range > 4σ", lambda v, l, z: test_r_4s(v, z)),
    "4_1s": ("4 consecutive beyond ±1σ", lambda v, l, z: test_4_1s(v, z)),
    "10_x": ("10 consecutive same side", lambda v, l, z: test_10_x(v, z.cl)),
}


def evaluate_rules(
    values: np.ndarray,
    limits: ControlLimits,
    zones: ZoneBreakdown,
    config: RuleConfig = RuleConfig(),
) -> list[RuleViolation]:
    violations: list[RuleViolation] = []

    for test_id in config.nelson_tests:
        if test_id not in _NELSON_FUNCS:
            continue
        desc, func = _NELSON_FUNCS[test_id]
        mask = func(values, limits, zones)
        indices = np.where(mask)[0]
        if len(indices) > 0:
            violations.append(RuleViolation(
                test_id=test_id, point_indices=indices, description=desc,
            ))

    for rule_name in config.westgard_rules:
        if rule_name not in _WESTGARD_FUNCS:
            continue
        desc, func = _WESTGARD_FUNCS[rule_name]
        mask = func(values, limits, zones)
        indices = np.where(mask)[0]
        if len(indices) > 0:
            violations.append(RuleViolation(
                test_id=rule_name, point_indices=indices, description=desc,
            ))

    return violations
```

- [ ] **Step 5: Run tests, commit**

Run: `pytest tests/test_rules/ -v`
Commit: `git commit -m "feat: add beyond_limits test and evaluate orchestrator"`

---

### Task 31: Top-Level Re-Exports

**Files:** Modify `algo/__init__.py`

- [ ] **Step 1: Update algo/__init__.py**

```python
"""Super SPC Algorithm Package — Control Chart Computations."""

# Core types
from .common.types import ControlLimits, ZoneBreakdown, SigmaResult
from .common.enums import SigmaMethod, ScalingMethod, WithinMethod, BetweenMethod

# Constants
from .constants.tables import d2, d3, c4, c5
from .constants.factors import A2, A3, B3, B4, D3, D4

# Rules
from .rules.models import RuleConfig, RuleViolation
from .rules.evaluate import evaluate_rules

# Shewhart Variable Charts
from .xbar_r import XBarRConfig, XBarRResult, compute_xbar_r
from .xbar_s import XBarSConfig, XBarSResult, compute_xbar_s
from .imr import IMRConfig, IMRResult, compute_imr
from .levey_jennings import LeveyJenningsConfig, LeveyJenningsResult, compute_levey_jennings

# Shewhart Attribute Charts
from .p_chart import PChartConfig, PChartResult, compute_p_chart
from .np_chart import NPChartConfig, NPChartResult, compute_np_chart
from .c_chart import CChartConfig, CChartResult, compute_c_chart
from .u_chart import UChartConfig, UChartResult, compute_u_chart
from .laney_p import LaneyPConfig, LaneyPResult, compute_laney_p
from .laney_u import LaneyUConfig, LaneyUResult, compute_laney_u

# Advanced Charts
from .cusum import CUSUMConfig, CUSUMResult, compute_cusum, compute_arl, compute_arl_table
from .ewma import EWMAConfig, EWMAResult, compute_ewma

# Rare Event Charts
from .g_chart import GChartConfig, GChartResult, compute_g_chart
from .t_chart import TChartConfig, TChartResult, compute_t_chart

# Multi-Product & Composite Charts
from .short_run import ShortRunConfig, ShortRunResult, compute_short_run
from .three_way import ThreeWayConfig, ThreeWayResult, compute_three_way
```

- [ ] **Step 2: Verify all imports**

Run: `python -c "import algo; print(dir(algo))" | head -20`
Expected: all exported names visible

- [ ] **Step 3: Commit**

```bash
git add algo/__init__.py
git commit -m "feat: add top-level re-exports for all chart types"
```

---

### Task 32: Property-Based Hypothesis Tests

**Files:** Create `tests/test_properties.py`

- [ ] **Step 1: Write property-based tests**

```python
"""Property-based tests using hypothesis — statistical invariants for all chart types."""

import numpy as np
import pytest
from hypothesis import given, strategies as st, settings, assume
from hypothesis.extra.numpy import arrays

from algo.xbar_r import compute_xbar_r, XBarRConfig
from algo.xbar_s import compute_xbar_s, XBarSConfig
from algo.imr import compute_imr, IMRConfig
from algo.p_chart import compute_p_chart, PChartConfig
from algo.u_chart import compute_u_chart, UChartConfig
from algo.cusum import compute_cusum, CUSUMConfig
from algo.ewma import compute_ewma, EWMAConfig
from algo.common.enums import SigmaMethod


# Strategies
reasonable_floats = st.floats(min_value=-1000, max_value=1000, allow_nan=False, allow_infinity=False)
positive_floats = st.floats(min_value=0.1, max_value=100, allow_nan=False, allow_infinity=False)
k_sigma_values = st.floats(min_value=1.0, max_value=5.0, allow_nan=False, allow_infinity=False)


class TestIMRProperties:
    @given(
        data=arrays(np.float64, shape=st.integers(3, 50),
                    elements=st.floats(1, 100, allow_nan=False, allow_infinity=False)),
    )
    @settings(max_examples=50)
    def test_ucl_geq_cl_geq_lcl(self, data):
        result = compute_imr(data)
        assert np.all(result.individual_limits.ucl >= result.individual_limits.cl)
        assert np.all(result.individual_limits.cl >= result.individual_limits.lcl)

    @given(
        data=arrays(np.float64, shape=st.integers(3, 50),
                    elements=st.floats(1, 100, allow_nan=False, allow_infinity=False)),
    )
    @settings(max_examples=50)
    def test_mr_lcl_non_negative(self, data):
        result = compute_imr(data)
        assert np.all(result.mr_limits.lcl >= 0)

    @given(
        data=arrays(np.float64, shape=st.integers(3, 30),
                    elements=st.floats(1, 100, allow_nan=False, allow_infinity=False)),
        k=k_sigma_values,
    )
    @settings(max_examples=30)
    def test_wider_k_wider_limits(self, data, k):
        r1 = compute_imr(data, IMRConfig(k_sigma=k))
        r2 = compute_imr(data, IMRConfig(k_sigma=k + 0.5))
        assert np.all(r2.individual_limits.ucl >= r1.individual_limits.ucl - 1e-10)

    @given(
        data=arrays(np.float64, shape=st.integers(3, 30),
                    elements=st.floats(1, 100, allow_nan=False, allow_infinity=False)),
    )
    @settings(max_examples=50)
    def test_cl_is_mean(self, data):
        result = compute_imr(data)
        np.testing.assert_allclose(result.individual_limits.cl, np.mean(data), rtol=1e-10)


class TestPChartProperties:
    @given(
        n=st.integers(5, 30),
        p=st.floats(0.01, 0.99),
    )
    @settings(max_examples=30)
    def test_ucl_leq_one(self, n, p):
        rng = np.random.default_rng(42)
        n_trials = np.full(n, 100)
        defectives = rng.binomial(100, p, n)
        result = compute_p_chart(defectives, n_trials)
        assert np.all(result.limits.ucl <= 1.0)

    @given(
        n=st.integers(5, 30),
        p=st.floats(0.01, 0.99),
    )
    @settings(max_examples=30)
    def test_lcl_geq_zero(self, n, p):
        rng = np.random.default_rng(42)
        n_trials = np.full(n, 100)
        defectives = rng.binomial(100, p, n)
        result = compute_p_chart(defectives, n_trials)
        assert np.all(result.limits.lcl >= 0.0)


class TestCUSUMProperties:
    @given(
        data=arrays(np.float64, shape=st.integers(5, 50),
                    elements=st.floats(-10, 10, allow_nan=False, allow_infinity=False)),
    )
    @settings(max_examples=30)
    def test_c_plus_non_negative(self, data):
        config = CUSUMConfig(target=0.0, sigma=1.0)
        result = compute_cusum(data, config)
        assert np.all(result.c_plus >= 0)

    @given(
        data=arrays(np.float64, shape=st.integers(5, 50),
                    elements=st.floats(-10, 10, allow_nan=False, allow_infinity=False)),
    )
    @settings(max_examples=30)
    def test_c_minus_non_positive(self, data):
        config = CUSUMConfig(target=0.0, sigma=1.0)
        result = compute_cusum(data, config)
        assert np.all(result.c_minus <= 0)


class TestEWMAProperties:
    @given(
        data=arrays(np.float64, shape=st.integers(5, 30),
                    elements=st.floats(1, 100, allow_nan=False, allow_infinity=False)),
    )
    @settings(max_examples=30)
    def test_lambda_one_identity(self, data):
        config = EWMAConfig(target=float(np.mean(data)), sigma=1.0, lambda_=1.0)
        result = compute_ewma(data, config)
        np.testing.assert_allclose(result.ewma, data, atol=1e-10)


class TestConfigValidation:
    def test_imr_rejects_negative_k(self):
        with pytest.raises(ValueError):
            IMRConfig(k_sigma=-1.0)

    def test_imr_rejects_nan_k(self):
        with pytest.raises(ValueError):
            IMRConfig(k_sigma=float("nan"))

    def test_imr_rejects_inf_k(self):
        with pytest.raises(ValueError):
            IMRConfig(k_sigma=float("inf"))

    def test_imr_rejects_invalid_method(self):
        with pytest.raises(ValueError):
            IMRConfig(sigma_method="invalid")

    def test_ewma_rejects_zero_lambda(self):
        with pytest.raises(ValueError):
            EWMAConfig(target=0, sigma=1.0, lambda_=0.0)

    def test_ewma_rejects_lambda_above_one(self):
        with pytest.raises(ValueError):
            EWMAConfig(target=0, sigma=1.0, lambda_=1.5)
```

- [ ] **Step 2: Run all tests**

Run: `pytest tests/ -v --tb=short`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add tests/test_properties.py
git commit -m "feat: add property-based hypothesis tests for all chart types"
```

- [ ] **Step 4: Run full test suite with coverage**

Run: `pytest tests/ --cov=algo --cov-report=term-missing -v`
Expected: High coverage across all modules

- [ ] **Step 5: Final commit**

```bash
git commit -m "chore: verify full test suite passes"
```
