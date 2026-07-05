"""Shared AI request rate limiting backends."""

from collections import defaultdict, deque
from functools import lru_cache
import threading
import time
from typing import Protocol

from fastapi import HTTPException

from app.config import settings

_RATE_WINDOW_SECONDS = 60.0
_REDIS_KEY_PREFIX = "paperlens:ai-rate-limit"
_REDIS_EVAL_SCRIPT = """
local key = KEYS[1]
local seq_key = key .. ":seq"
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local ttl = math.ceil(window) + 1
local now_parts = redis.call("TIME")
local now = tonumber(now_parts[1]) + (tonumber(now_parts[2]) / 1000000)
local cutoff = now - window
redis.call("ZREMRANGEBYSCORE", key, "-inf", cutoff)
local count = redis.call("ZCARD", key)
if count >= limit then
  local oldest = redis.call("ZRANGE", key, 0, 0, "WITHSCORES")
  local oldest_score = now
  if oldest[2] then
    oldest_score = tonumber(oldest[2])
  end
  local retry_after = math.ceil(window - (now - oldest_score))
  if retry_after < 1 then
    retry_after = 1
  end
  redis.call("EXPIRE", key, ttl)
  redis.call("EXPIRE", seq_key, ttl)
  return {0, retry_after}
end
local seq = redis.call("INCR", seq_key)
redis.call("ZADD", key, now, string.format("%.6f:%d", now, seq))
redis.call("EXPIRE", key, ttl)
redis.call("EXPIRE", seq_key, ttl)
return {1, 0}
"""


class RateLimitStore(Protocol):
    def reset(self) -> None: ...

    def check_and_record(self, user_id: str, limit: int, window_seconds: float) -> tuple[bool, int]:
        ...


class MemoryAiRateLimitStore:
    """Process-local fallback used when Redis is not configured."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._request_log: dict[str, deque[float]] = defaultdict(deque)

    def reset(self) -> None:
        with self._lock:
            self._request_log.clear()

    def check_and_record(self, user_id: str, limit: int, window_seconds: float) -> tuple[bool, int]:
        now = time.monotonic()
        with self._lock:
            log = self._request_log[user_id]
            while log and now - log[0] >= window_seconds:
                log.popleft()
            if len(log) >= limit:
                retry_after = max(1, int(window_seconds - (now - log[0])) + 1)
                return False, retry_after
            log.append(now)
            return True, 0


class RedisAiRateLimitStore:
    """Redis-backed rate limiter shared across workers and instances."""

    def __init__(self, client) -> None:
        self._client = client

    @classmethod
    def from_url(cls, redis_url: str) -> "RedisAiRateLimitStore":
        try:
            import redis as redis_module
        except ImportError as exc:  # pragma: no cover - production dependency
            raise HTTPException(
                status_code=503,
                detail="AI rate limiter requires the redis package.",
            ) from exc

        try:
            client = redis_module.Redis.from_url(
                redis_url,
                decode_responses=True,
                socket_connect_timeout=2,
                socket_timeout=2,
                health_check_interval=30,
            )
            client.ping()
        except Exception as exc:  # pragma: no cover - connection/config failure
            raise HTTPException(status_code=503, detail="AI rate limiter is unavailable.") from exc
        return cls(client)

    def _key(self, user_id: str) -> str:
        return f"{_REDIS_KEY_PREFIX}:{user_id}"

    def reset(self) -> None:
        try:
            for key in self._client.scan_iter(match=f"{_REDIS_KEY_PREFIX}:*"):
                self._client.delete(key)
        except Exception as exc:  # pragma: no cover - network/config failure
            raise HTTPException(status_code=503, detail="AI rate limiter is unavailable.") from exc

    def check_and_record(self, user_id: str, limit: int, window_seconds: float) -> tuple[bool, int]:
        key = self._key(user_id)
        try:
            allowed, retry_after = self._client.eval(
                _REDIS_EVAL_SCRIPT,
                1,
                key,
                limit,
                window_seconds,
            )
        except Exception as exc:  # pragma: no cover - network/config failure
            raise HTTPException(status_code=503, detail="AI rate limiter is unavailable.") from exc
        return bool(int(allowed)), int(retry_after)


_memory_store = MemoryAiRateLimitStore()


@lru_cache(maxsize=4)
def _redis_store_for_url(redis_url: str) -> RedisAiRateLimitStore:
    return RedisAiRateLimitStore.from_url(redis_url)


def get_ai_rate_limit_store() -> RateLimitStore:
    redis_url = settings.redis_url.strip()
    if redis_url:
        return _redis_store_for_url(redis_url)
    return _memory_store


def reset_ai_rate_limits() -> None:
    """테스트 격리용. 현재 활성 저장소의 누적 상태를 비운다."""
    get_ai_rate_limit_store().reset()


def enforce_ai_rate_limit(user_id: str) -> None:
    limit = settings.ai_rate_limit_per_minute
    if limit <= 0:
        return
    allowed, retry_after = get_ai_rate_limit_store().check_and_record(
        user_id,
        limit,
        _RATE_WINDOW_SECONDS,
    )
    if allowed:
        return
    raise HTTPException(
        status_code=429,
        detail="AI 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        headers={"Retry-After": str(retry_after)},
    )
