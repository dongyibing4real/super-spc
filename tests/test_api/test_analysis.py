"""Unit tests for the analysis service."""
from __future__ import annotations

import numpy as np
import pytest
import pytest_asyncio

from api.schemas import AnalysisRequest
from api.services.analysis import run_analysis
from tests.test_api.conftest import SEED_DATASET_ID


@pytest.mark.asyncio
async def test_moving_range_analysis(seeded_db):
    """Known-answer test: moving range sigma on 20 values."""
    request = AnalysisRequest(sigma_method="moving_range", k_sigma=3.0)
    result = await run_analysis(seeded_db, SEED_DATASET_ID, request)

    assert result.dataset_id == SEED_DATASET_ID
    assert result.sigma.method == "moving_range"
    assert result.sigma.sigma_hat > 0
    assert result.sigma.n_used == 19  # 20 values → 19 moving ranges

    # Control limits should bracket the data
    assert all(u > result.zones.cl for u in result.limits.ucl)
    assert all(l < result.zones.cl for l in result.limits.lcl)
    assert len(result.limits.ucl) == 20
    assert len(result.limits.cl) == 20
    assert len(result.limits.lcl) == 20


@pytest.mark.asyncio
async def test_levey_jennings_analysis(seeded_db):
    """Levey-Jennings uses sample stddev."""
    request = AnalysisRequest(sigma_method="levey_jennings", k_sigma=3.0)
    result = await run_analysis(seeded_db, SEED_DATASET_ID, request)

    assert result.sigma.method == "levey_jennings"
    assert result.sigma.n_used == 20

    # Verify sigma_hat matches numpy's std(ddof=1)
    values = [
        10.0, 10.2, 10.1, 10.3, 10.0,
        10.2, 10.4, 10.1, 10.3, 10.2,
        10.5, 10.3, 10.4, 10.2, 10.6,
        10.3, 10.5, 10.4, 10.7, 10.5,
    ]
    expected_sigma = float(np.std(values, ddof=1))
    assert abs(result.sigma.sigma_hat - expected_sigma) < 1e-10


@pytest.mark.asyncio
async def test_range_sigma_subgrouped(seeded_db):
    """Range method groups by subgroup column."""
    request = AnalysisRequest(sigma_method="range", k_sigma=3.0)
    result = await run_analysis(seeded_db, SEED_DATASET_ID, request)

    assert result.sigma.method == "range"
    # 4 subgroups (hours 1-4), each with n=5 → 4 ranges
    assert result.sigma.n_used == 4
    # For subgrouped data, limits length = number of subgroups
    assert len(result.limits.ucl) == 4


@pytest.mark.asyncio
async def test_capability_with_spec_limits(seeded_db):
    """Capability is computed when USL/LSL are provided."""
    request = AnalysisRequest(
        sigma_method="moving_range",
        k_sigma=3.0,
        usl=11.0,
        lsl=9.5,
    )
    result = await run_analysis(seeded_db, SEED_DATASET_ID, request)

    assert result.capability is not None
    assert result.capability.cp is not None
    assert result.capability.cpk is not None
    assert result.capability.pp is not None
    assert result.capability.ppk is not None
    # With USL=11, LSL=9.5 and mean ~10.3, values should be capable
    assert result.capability.cpk > 0


@pytest.mark.asyncio
async def test_capability_without_spec_limits(seeded_db):
    """No capability when USL/LSL are omitted."""
    request = AnalysisRequest(sigma_method="moving_range")
    result = await run_analysis(seeded_db, SEED_DATASET_ID, request)
    assert result.capability is None


@pytest.mark.asyncio
async def test_nonexistent_dataset(seeded_db):
    """Raises ValueError for missing dataset."""
    request = AnalysisRequest(sigma_method="moving_range")
    with pytest.raises(ValueError, match="No data rows found"):
        await run_analysis(seeded_db, "nonexistent", request)


@pytest.mark.asyncio
async def test_invalid_sigma_method(seeded_db):
    """Raises ValueError for unknown sigma method."""
    request = AnalysisRequest(sigma_method="bogus")
    with pytest.raises(ValueError, match="Unknown sigma method"):
        await run_analysis(seeded_db, SEED_DATASET_ID, request)


@pytest.mark.asyncio
async def test_analysis_is_persisted(seeded_db):
    """Analysis result is stored in the analyses table."""
    request = AnalysisRequest(sigma_method="moving_range")
    result = await run_analysis(seeded_db, SEED_DATASET_ID, request)

    from api.models import Analysis
    row = await seeded_db.get(Analysis, result.id)
    assert row is not None
    assert row.dataset_id == SEED_DATASET_ID
    assert row.sigma_method == "moving_range"
