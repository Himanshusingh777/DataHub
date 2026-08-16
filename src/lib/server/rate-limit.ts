/**
 * Rate limiting — in-process token bucket, keyed by identity + route.
 *
 * In-memory is the correct default for a single-process deployment (this
 * app's current shape — SQLite on local disk, no shared cache). The swap
 * point for a multi-instance deployment is `Bucket` storage: replace the Map
 * below with Redis (INCR + EXPIRE, or a Lua token-bucket script) without
 * changing any call site — every route calls the same `checkRateLimit()`.
 */

const buckets = new Map<string, { tokens: number; updatedAt: number }>();

export interface RateLimitConfig {
  /** Max requests allowed per window. */
  limit: number;
  /** Window size in ms. */
  windowMs: number;
}

export const RATE_LIMITS = {
  // Sensitive/expensive routes get tighter limits than read-only ones.
  auth: { limit: 10, windowMs: 60_000 } as RateLimitConfig,        // login/register attempts
  credentials: { limit: 20, windowMs: 60_000 } as RateLimitConfig, // vault writes
  sync: { limit: 10, windowMs: 60_000 } as RateLimitConfig,        // manual sync triggers
  warehouse: { limit: 30, windowMs: 60_000 } as RateLimitConfig,   // BigQuery-backed reads (cost-sensitive)
  aiSql: { limit: 15, windowMs: 60_000 } as RateLimitConfig,       // AI SQL Assistant generations (external LLM call)
  default: { limit: 120, windowMs: 60_000 } as RateLimitConfig,
} as const;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Token-bucket check. Refills continuously (limit tokens per windowMs), so
 * bursts are smoothed rather than resetting hard at a window boundary.
 */
export function checkRateLimit(key: string, config: RateLimitConfig = RATE_LIMITS.default): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { tokens: config.limit, updatedAt: now };

  const elapsed = now - bucket.updatedAt;
  const refill = (elapsed / config.windowMs) * config.limit;
  const tokens = Math.min(config.limit, bucket.tokens + refill);

  const allowed = tokens >= 1;
  const nextTokens = allowed ? tokens - 1 : tokens;

  buckets.set(key, { tokens: nextTokens, updatedAt: now });

  // Prevent unbounded growth of the map across many distinct keys/IPs.
  if (buckets.size > 50_000) pruneBuckets();

  return {
    allowed,
    remaining: Math.floor(nextTokens),
    resetAt: now + Math.ceil((config.limit - nextTokens) / config.limit) * config.windowMs,
  };
}

function pruneBuckets(): void {
  const cutoff = Date.now() - 10 * 60_000;
  for (const [key, bucket] of buckets) {
    if (bucket.updatedAt < cutoff) buckets.delete(key);
  }
}

/** Build a bucket key from an identity (user id or IP) and a route name. */
export function rateLimitKey(identity: string, route: string): string {
  return `${route}:${identity}`;
}

/** Best-effort client identity for anonymous requests (rate limiting, audit). */
export function requestIdentity(req: { headers: { get(name: string): string | null } }, userId?: string): string {
  if (userId && userId !== "local") return userId;
  const fwd = req.headers.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0].trim() : "unknown";
}

/**
 * Standard 429 JSON body + headers for a rejected request. Callers do:
 *   const rl = checkRateLimit(...);
 *   if (!rl.allowed) return NextResponse.json(...rateLimitResponse(rl));
 */
export function rateLimitResponse(result: RateLimitResult) {
  return {
    body: { ok: false as const, error: "Rate limit exceeded — please slow down." },
    status: 429 as const,
    headers: {
      "X-RateLimit-Remaining": String(result.remaining),
      "X-RateLimit-Reset": String(result.resetAt),
    },
  };
}
