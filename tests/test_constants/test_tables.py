"""
Tests for algo/constants/tables.py.

Tests:
- Known values for d2, d3, c4, c5 at various n
- Clamp behavior for n > 50
- ValueError raised for n < 2
"""
import pytest

from algo.constants.tables import c4, c5, d2, d3

# ---------------------------------------------------------------------------
# Known-value parametrized tests
# ---------------------------------------------------------------------------

D2_KNOWN = {
    2: 1.128, 3: 1.693, 4: 2.059, 5: 2.326, 10: 3.078, 25: 3.931, 50: 4.498
}
D3_KNOWN = {
    2: 0.8525, 3: 0.8884, 4: 0.8798, 5: 0.8641, 10: 0.7971, 25: 0.7084, 50: 0.6530
}
C4_KNOWN = {
    2: 0.7979, 3: 0.8862, 4: 0.9213, 5: 0.9400, 10: 0.9727, 25: 0.9896, 50: 0.9949
}
C5_KNOWN = {
    2: 0.6028, 3: 0.4633, 4: 0.3889, 5: 0.3412, 10: 0.2321, 25: 0.1380, 50: 0.0932
}


@pytest.mark.parametrize("n,expected", list(D2_KNOWN.items()))
def test_d2_known_values(n, expected):
    assert d2(n) == pytest.approx(expected, abs=1e-4)


@pytest.mark.parametrize("n,expected", list(D3_KNOWN.items()))
def test_d3_known_values(n, expected):
    assert d3(n) == pytest.approx(expected, abs=1e-4)


@pytest.mark.parametrize("n,expected", list(C4_KNOWN.items()))
def test_c4_known_values(n, expected):
    assert c4(n) == pytest.approx(expected, abs=1e-4)


@pytest.mark.parametrize("n,expected", list(C5_KNOWN.items()))
def test_c5_known_values(n, expected):
    assert c5(n) == pytest.approx(expected, abs=1e-4)


# ---------------------------------------------------------------------------
# Clamp behavior: n > 50 returns the n=50 value
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("func,expected_at_50", [
    (d2, 4.498),
    (d3, 0.6530),
    (c4, 0.9949),
    (c5, 0.0932),
])
def test_clamp_above_50(func, expected_at_50):
    assert func(51) == pytest.approx(expected_at_50, abs=1e-4)
    assert func(100) == pytest.approx(expected_at_50, abs=1e-4)
    assert func(1000) == pytest.approx(expected_at_50, abs=1e-4)


# ---------------------------------------------------------------------------
# ValueError for n < 2
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("func", [d2, d3, c4, c5])
@pytest.mark.parametrize("n", [1, 0, -1, -100])
def test_raises_for_n_less_than_2(func, n):
    with pytest.raises(ValueError, match="n must be >= 2"):
        func(n)
