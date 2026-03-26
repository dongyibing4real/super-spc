"""
Tests for algo/constants/factors.py.

Tests against published control chart factor tables.
"""
import pytest

from algo.constants.factors import A2, A3, B3, B4, D3, D4

# ---------------------------------------------------------------------------
# Known published values (tolerance 0.001 to match 3-decimal table precision)
# ---------------------------------------------------------------------------

A2_KNOWN = {2: 1.880, 3: 1.023, 4: 0.729, 5: 0.577, 10: 0.308}
D3_KNOWN = {2: 0.0, 3: 0.0, 4: 0.0, 5: 0.0, 6: 0.0, 7: 0.076}
D4_KNOWN = {2: 3.267, 3: 2.575, 4: 2.282, 5: 2.114, 10: 1.777}
B3_KNOWN = {2: 0.0, 3: 0.0, 4: 0.0, 5: 0.0, 6: 0.030}
B4_KNOWN = {2: 3.267, 3: 2.568, 4: 2.266, 5: 2.089, 10: 1.716}
A3_KNOWN = {2: 2.659, 3: 1.954, 4: 1.628, 5: 1.427, 10: 0.975}


@pytest.mark.parametrize("n,expected", list(A2_KNOWN.items()))
def test_A2_known_values(n, expected):
    assert A2(n) == pytest.approx(expected, abs=0.001)


@pytest.mark.parametrize("n,expected", list(D3_KNOWN.items()))
def test_D3_known_values(n, expected):
    assert D3(n) == pytest.approx(expected, abs=0.001)


@pytest.mark.parametrize("n,expected", list(D4_KNOWN.items()))
def test_D4_known_values(n, expected):
    assert D4(n) == pytest.approx(expected, abs=0.001)


@pytest.mark.parametrize("n,expected", list(B3_KNOWN.items()))
def test_B3_known_values(n, expected):
    assert B3(n) == pytest.approx(expected, abs=0.001)


@pytest.mark.parametrize("n,expected", list(B4_KNOWN.items()))
def test_B4_known_values(n, expected):
    assert B4(n) == pytest.approx(expected, abs=0.001)


@pytest.mark.parametrize("n,expected", list(A3_KNOWN.items()))
def test_A3_known_values(n, expected):
    assert A3(n) == pytest.approx(expected, abs=0.001)


# ---------------------------------------------------------------------------
# Property tests
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("n", range(2, 51))
def test_D3_non_negative(n):
    assert D3(n) >= 0.0


@pytest.mark.parametrize("n", range(2, 51))
def test_D4_greater_than_D3(n):
    assert D4(n) > D3(n)


@pytest.mark.parametrize("n", range(2, 51))
def test_B3_non_negative(n):
    assert B3(n) >= 0.0


@pytest.mark.parametrize("n", range(2, 51))
def test_D4_positive(n):
    assert D4(n) > 0.0


@pytest.mark.parametrize("n", range(2, 51))
def test_B4_positive(n):
    assert B4(n) > 0.0
