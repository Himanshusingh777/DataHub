"""
Port of src/lib/server/rate-limit.ts — in-process token bucket, keyed by
identity + route. Same in-memory design as the Node app (matches the locked
"no new infra" decision for this migration phase).
"""

import math
import time
from dataclasses import dataclass

_buckets: dict[str, dict[str, float]] = {}


@dataclass
class RateLimitConfig:
    limit: int
    window_ms: int


RATE_LIMITS = {
    "auth": RateLimitConfig(10, 60_000),
    "credentials": RateLimitConfig(20, 60_000),
    "sync": RateLimitConfig(10, 60_000),
    "warehouse": RateLimitConfig(30, 60_000),
    "ai_sql": RateLimitConfig(15, 60_000),
    "default": RateLimitConfig(120, 60_000),
}


@dataclass
class RateLimitResult:
    allowed: bool
    remaining: int
    reset_at: float


def check_rate_limit(key: str, config: RateLimitConfig = RATE_LIMITS["default"]) -> RateLimitResult:
    now = time.time() * 1000
    bucket = _buckets.get(key, {"tokens": config.limit, "updated_at": now})

    elapsed = now - bucket["updated_at"]
    refill = (elapsed / config.window_ms) * config.limit
    tokens = min(config.limit, bucket["tokens"] + refill)

    allowed = tokens >= 1
    next_tokens = tokens - 1 if allowed else tokens

    _buckets[key] = {"tokens": next_tokens, "updated_at": now}

    if len(_buckets) > 50_000:
        _prune_buckets()

    return RateLimitResult(
        allowed=allowed,
        remaining=math.floor(next_tokens),
        reset_at=now + math.ceil((config.limit - next_tokens) / config.limit) * config.window_ms,
    )


def _prune_buckets() -> None:
    cutoff = time.time() * 1000 - 10 * 60_000
    for key in [k for k, b in _buckets.items() if b["updated_at"] < cutoff]:
        del _buckets[key]


def rate_limit_key(identity: str, route: str) -> str:
    return f"{route}:{identity}"
