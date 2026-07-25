/**
 * Performance layer — in-process TTL cache + memoization.
 *
 * This is intentionally a plain in-memory Map, not Redis: CrossTecch runs as
 * a single Next.js server process (see instrumentation.ts — one scheduler,
 * one worker pool, all in-process), so a module-level cache already survives
 * across requests within that process exactly like a shared cache would,
 * with zero new infrastructure. If this app is ever horizontally scaled
 * across multiple instances, `TTLCache` is the single seam to swap for a
 * real distributed cache — every caller goes through `get`/`set`/`getOrCompute`,
 * never the underlying Map.
 */

interface Entry<T> { value: T; expiresAt: number }

export class TTLCache<T = unknown> {
  private store = new Map<string, Entry<T>>();
  private readonly defaultTtlMs: number;
  private readonly maxEntries: number;

  constructor(opts: { defaultTtlMs?: number; maxEntries?: number } = {}) {
    this.defaultTtlMs = opts.defaultTtlMs ?? 60_000;
    this.maxEntries = opts.maxEntries ?? 5_000;
  }

  get(key: string): T | undefined {
    const e = this.store.get(key);
    if (!e) return undefined;
    if (e.expiresAt < Date.now()) { this.store.delete(key); return undefined; }
    return e.value;
  }

  set(key: string, value: T, ttlMs?: number): void {
    if (this.store.size >= this.maxEntries) this.evictOldest();
    this.store.set(key, { value, expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs) });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  /** Fetch-or-compute: the workhorse for caching expensive warehouse calls. */
  async getOrCompute(key: string, compute: () => Promise<T>, ttlMs?: number): Promise<T> {
    const hit = this.get(key);
    if (hit !== undefined) return hit;
    const value = await compute();
    this.set(key, value, ttlMs);
    return value;
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestAt = Infinity;
    for (const [k, e] of this.store) {
      if (e.expiresAt < oldestAt) { oldestAt = e.expiresAt; oldestKey = k; }
    }
    if (oldestKey) this.store.delete(oldestKey);
  }
}

/**
 * Memoize a synchronous pure function by a derived key. Useful for hot,
 * repeatedly-called classifiers (e.g. column semantic classification) where
 * the input space is small and stable within a request.
 */
export function memoize<Args extends unknown[], R>(
  fn: (...args: Args) => R,
  keyFn: (...args: Args) => string,
  ttlMs = 5 * 60_000
): (...args: Args) => R {
  const cache = new TTLCache<R>({ defaultTtlMs: ttlMs, maxEntries: 10_000 });
  return (...args: Args): R => {
    const key = keyFn(...args);
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const value = fn(...args);
    cache.set(key, value);
    return value;
  };
}

// ── Shared caches (module-level singletons, hot-reload safe) ─────────────
const g = globalThis as unknown as { __ctCaches?: Record<string, TTLCache> };
if (!g.__ctCaches) g.__ctCaches = {};

/** Get (or lazily create) a named shared cache — avoids each caller managing its own instance. */
export function namedCache<T = unknown>(name: string, opts?: { defaultTtlMs?: number; maxEntries?: number }): TTLCache<T> {
  if (!g.__ctCaches![name]) g.__ctCaches![name] = new TTLCache(opts);
  return g.__ctCaches![name] as TTLCache<T>;
}
