/**
 * Rate limiting — Postgres-backed token bucket, keyed by identity + route.
 *
 * Was an in-process Map, which was correct for a single long-lived process
 * but silently stopped rate-limiting anything once the app runs as multiple
 * independent serverless invocations (each with its own empty Map) — a
 * horizontally-scaled deployment effectively had no rate limiting at all.
 * The `rate_limits` table (db/schema.sql) makes the bucket shared state
 * every invocation sees, at the cost of one DB round trip per check.
 */

import { getDb } from "./db";

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
 *
 * Single atomic UPSERT: refills based on elapsed time since the bucket's
 * last update, then consumes 1 token — all in one round trip so concurrent
 * requests for the same key can't race past each other. If the refilled
 * balance is under 1, the WHERE clause blocks the update and no row comes
 * back — that's the "not allowed" signal, no separate read needed.
 */
export async function checkRateLimit(key: string, config: RateLimitConfig = RATE_LIMITS.default): Promise<RateLimitResult> {
  const now = Date.now();
  const db = getDb();

  const row = await db.prepare(`
    INSERT INTO rate_limits (key, tokens, updated_at) VALUES (?, ? - 1, ?)
    ON CONFLICT (key) DO UPDATE SET
      tokens = LEAST(?, rate_limits.tokens + ((? - rate_limits.updated_at)::float / ?) * ?) - 1,
      updated_at = ?
    WHERE LEAST(?, rate_limits.tokens + ((? - rate_limits.updated_at)::float / ?) * ?) >= 1
    RETURNING tokens
  `).get(
    key, config.limit, now,
    config.limit, now, config.windowMs, config.limit,
    now,
    config.limit, now, config.windowMs, config.limit,
  ) as { tokens: number } | undefined;

  if (!row) {
    // Blocked — read the current (unconsumed) balance for a useful `remaining`/`resetAt`.
    const current = await db.prepare("SELECT tokens, updated_at FROM rate_limits WHERE key = ?").get(key) as
      | { tokens: number; updated_at: number } | undefined;
    const elapsed = current ? now - current.updated_at : 0;
    const tokens = current ? Math.min(config.limit, current.tokens + (elapsed / config.windowMs) * config.limit) : 0;
    return {
      allowed: false,
      remaining: Math.floor(tokens),
      resetAt: now + Math.ceil((config.limit - tokens) / config.limit) * config.windowMs,
    };
  }

  return {
    allowed: true,
    remaining: Math.floor(row.tokens),
    resetAt: now + Math.ceil((config.limit - row.tokens) / config.limit) * config.windowMs,
  };
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
 *   const rl = await checkRateLimit(...);
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
