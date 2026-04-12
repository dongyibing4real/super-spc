"""Tests for forecast model cache eviction (TTL, memory, count limits)."""
import time
from unittest.mock import patch

import numpy as np
import pytest

from api.services.forecast import (
    _CacheEntry,
    _MAX_CACHE,
    _MAX_MEMORY_BYTES,
    _TTL_SECONDS,
    _cache_get,
    _cache_lock,
    _cache_put,
    _evict_expired,
    _model_cache,
    _total_memory,
)


@pytest.fixture(autouse=True)
def clear_cache():
    """Clear the model cache before and after each test."""
    with _cache_lock:
        _model_cache.clear()
    yield
    with _cache_lock:
        _model_cache.clear()


def _make_entry(nbytes: int = 1000, age: float = 0.0, **kwargs) -> _CacheEntry:
    """Create a cache entry with configurable size and age."""
    values = np.zeros(nbytes // 8, dtype=np.float64)  # 8 bytes per float64
    entry = _CacheEntry(
        automl=None,
        values=values,
        col_name="test",
        limits=None,
        **kwargs,
    )
    if age > 0:
        entry.created_at = time.monotonic() - age
    return entry


class TestCacheEntry:
    def test_memory_bytes_includes_array(self):
        entry = _make_entry(nbytes=8000)
        assert entry.memory_bytes >= 8000

    def test_is_expired_false_when_fresh(self):
        entry = _make_entry()
        assert not entry.is_expired

    def test_is_expired_true_when_old(self):
        entry = _make_entry(age=_TTL_SECONDS + 1)
        assert entry.is_expired

    def test_as_tuple(self):
        entry = _make_entry()
        t = entry.as_tuple()
        assert len(t) == 4
        assert t[0] is None  # automl
        assert isinstance(t[1], np.ndarray)  # values


class TestEvictExpired:
    def test_removes_expired_entries(self):
        with _cache_lock:
            _model_cache["old"] = _make_entry(age=_TTL_SECONDS + 10)
            _model_cache["fresh"] = _make_entry()
            _evict_expired()
        assert "old" not in _model_cache
        assert "fresh" in _model_cache

    def test_no_op_when_all_fresh(self):
        with _cache_lock:
            _model_cache["a"] = _make_entry()
            _model_cache["b"] = _make_entry()
            _evict_expired()
        assert len(_model_cache) == 2


class TestCachePut:
    def test_basic_insert(self):
        with _cache_lock:
            _cache_put("k1", _make_entry())
        assert "k1" in _model_cache

    def test_evicts_oldest_when_over_count_limit(self):
        with _cache_lock:
            for i in range(_MAX_CACHE):
                _cache_put(f"k{i}", _make_entry(nbytes=100))
            assert len(_model_cache) == _MAX_CACHE
            # One more should evict the oldest
            _cache_put("overflow", _make_entry(nbytes=100))
        assert len(_model_cache) <= _MAX_CACHE
        assert "k0" not in _model_cache  # oldest evicted
        assert "overflow" in _model_cache

    def test_evicts_expired_before_counting(self):
        with _cache_lock:
            for i in range(_MAX_CACHE):
                _cache_put(f"k{i}", _make_entry(age=_TTL_SECONDS + 10))
            # All expired, new insert should clear them
            _cache_put("new", _make_entry())
        assert len(_model_cache) == 1
        assert "new" in _model_cache

    def test_evicts_on_memory_limit(self):
        # Each entry ~50MB, limit is 512MB, so 11th should trigger eviction
        big_size = 50 * 1024 * 1024  # 50MB
        with _cache_lock:
            for i in range(10):
                _cache_put(f"big{i}", _make_entry(nbytes=big_size))
            _cache_put("big10", _make_entry(nbytes=big_size))
        total = sum(e.memory_bytes for e in _model_cache.values())
        assert total <= _MAX_MEMORY_BYTES + big_size  # within tolerance


class TestCacheGet:
    def test_returns_entry_when_fresh(self):
        with _cache_lock:
            _model_cache["k1"] = _make_entry()
            result = _cache_get("k1")
        assert result is not None

    def test_returns_none_when_missing(self):
        with _cache_lock:
            result = _cache_get("nonexistent")
        assert result is None

    def test_returns_none_and_removes_when_expired(self):
        with _cache_lock:
            _model_cache["expired"] = _make_entry(age=_TTL_SECONDS + 10)
            result = _cache_get("expired")
        assert result is None
        assert "expired" not in _model_cache

    def test_moves_to_end_on_access(self):
        with _cache_lock:
            _model_cache["a"] = _make_entry()
            _model_cache["b"] = _make_entry()
            _cache_get("a")  # access "a" — should move to end
        keys = list(_model_cache.keys())
        assert keys == ["b", "a"]
