/**
 * Background Job Engine — durable queue backing the scheduler and any future
 * async work (rollups, schema checks, exports).
 *
 * Design: Postgres as the queue table. `claimNextJob` claims in a single
 * atomic statement using `FOR UPDATE SKIP LOCKED` inside a CTE, so concurrent
 * callers (multiple Vercel Cron invocations, or multiple workers in a
 * long-lived process) never double-claim a row — no separate transaction
 * wrapper needed, the CTE + UPDATE is one round trip.
 *
 * Retry policy: exponential backoff (30s * 2^attempts, capped at 30 min).
 * After `max_attempts` the job moves to `dead` (dead-letter) rather than
 * retrying forever — visible in the Activity/monitoring surface so a human
 * can intervene.
 */

import { getDb, DEFAULT_WORKSPACE_ID } from "./db";
import { genId } from "./crypto";

export type JobStatus = "queued" | "running" | "success" | "failed" | "dead";

export type JobType = "sync_flow" | "schema_check" | "rollup" | "warehouse_audit";

export interface JobRow {
  id: string;
  workspace_id: string;
  type: JobType;
  /** JSONB column — the pg driver returns this already-parsed, not a JSON string. */
  payload: Record<string, unknown>;
  status: JobStatus;
  priority: number;
  attempts: number;
  max_attempts: number;
  run_after: number;
  locked_by: string | null;
  locked_at: number | null;
  last_error: string | null;
  /** JSONB column — already-parsed, not a JSON string. */
  result: Record<string, unknown> | null;
  created_at: number;
  updated_at: number;
}

export interface EnqueueOptions {
  workspaceId?: string;
  priority?: number;
  runAfter?: number; // epoch ms; defaults to now (claimable immediately)
  maxAttempts?: number;
  /**
   * When set, an already-queued/running job with the same dedupeKey is
   * returned instead of creating a duplicate. Used so the scheduler tick
   * can't enqueue the same flow twice if a run is still in flight.
   */
  dedupeKey?: string;
}

const MAX_BACKOFF_MS = 30 * 60_000;

function backoffMs(attempts: number): number {
  return Math.min(30_000 * 2 ** attempts, MAX_BACKOFF_MS);
}

/** Add (or reuse) a job. Returns the job id. */
export async function enqueueJob(type: JobType, payload: Record<string, unknown>, opts: EnqueueOptions = {}): Promise<string> {
  const db = getDb();
  const workspaceId = opts.workspaceId ?? DEFAULT_WORKSPACE_ID;

  if (opts.dedupeKey) {
    const existing = await db
      .prepare(
        `SELECT id FROM jobs WHERE workspace_id = ? AND type = ? AND status IN ('queued','running')
         AND payload->>'dedupeKey' = ? LIMIT 1`
      )
      .get(workspaceId, type, opts.dedupeKey) as { id: string } | undefined;
    if (existing) return existing.id;
  }

  const id = genId("job");
  const now = Date.now();
  await db.prepare(`
    INSERT INTO jobs (id, workspace_id, type, payload, status, priority, attempts, max_attempts, run_after, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'queued', ?, 0, ?, ?, ?, ?)
  `).run(
    id, workspaceId, type,
    JSON.stringify(opts.dedupeKey ? { ...payload, dedupeKey: opts.dedupeKey } : payload),
    opts.priority ?? 0, opts.maxAttempts ?? 5, opts.runAfter ?? now, now, now
  );
  return id;
}

/**
 * Atomically claim the next runnable job for this worker. Returns null when
 * the queue is empty. `FOR UPDATE SKIP LOCKED` inside the CTE means a
 * concurrently-running claim just skips a row someone else already has
 * locked, rather than blocking on it — two callers racing always resolve to
 * two different rows (or one gets null), never the same row twice.
 */
export async function claimNextJob(workerId: string, types?: JobType[]): Promise<JobRow | null> {
  const db = getDb();
  const now = Date.now();
  const typeFilter = types?.length ? `AND type IN (${types.map(() => "?").join(",")})` : "";

  const row = await db.prepare(`
    WITH claimed AS (
      SELECT id FROM jobs
      WHERE status = 'queued' AND run_after <= ? ${typeFilter}
      ORDER BY priority DESC, created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE jobs SET status = 'running', locked_by = ?, locked_at = ?, updated_at = ?
    WHERE id IN (SELECT id FROM claimed)
    RETURNING *
  `).get(now, ...(types ?? []), workerId, now, now) as JobRow | undefined;

  return row ?? null;
}

/**
 * Mark a job successful. Guarded by `status='running' AND locked_by=?` so a
 * worker whose job was reclaimed out from under it by `reapStaleJobs` (e.g.
 * a slow-but-alive sync past the stale threshold) can never clobber the
 * state of whoever claimed the job next — the update simply affects 0 rows
 * and is silently ignored, which is correct: the outcome was already
 * decided by the reclaim.
 */
export async function completeJob(id: string, workerId: string, result?: Record<string, unknown>): Promise<void> {
  await getDb()
    .prepare(
      `UPDATE jobs SET status = 'success', result = ?, locked_by = NULL, updated_at = ?
       WHERE id = ? AND status = 'running' AND locked_by = ?`
    )
    .run(result ? JSON.stringify(result) : null, Date.now(), id, workerId);
}

/**
 * Fail a job. Re-queues with backoff unless attempts are exhausted, in which
 * case it's dead-lettered. When `workerId` is supplied, only the current
 * lock holder may transition the job (same race guard as `completeJob`);
 * omit it only for the reaper's own forced-fail of an already-reclaimed row.
 */
export async function failJob(id: string, error: string, workerId?: string): Promise<{ retried: boolean; nextAttempt?: number }> {
  const db = getDb();
  const lockFilter = workerId ? "AND locked_by = ?" : "";
  const lockArgs = workerId ? [workerId] : [];

  const job = await db.prepare(`SELECT * FROM jobs WHERE id = ? ${lockFilter}`).get(id, ...lockArgs) as JobRow | undefined;
  if (!job) return { retried: false };

  const attempts = job.attempts + 1;
  const now = Date.now();

  if (attempts >= job.max_attempts) {
    await db.prepare(`UPDATE jobs SET status = 'dead', attempts = ?, last_error = ?, locked_by = NULL, updated_at = ? WHERE id = ? ${lockFilter}`)
      .run(attempts, error, now, id, ...lockArgs);
    return { retried: false };
  }

  const nextAttempt = now + backoffMs(attempts);
  await db.prepare(`
    UPDATE jobs SET status = 'queued', attempts = ?, last_error = ?, run_after = ?, locked_by = NULL, updated_at = ? WHERE id = ? ${lockFilter}
  `).run(attempts, error, nextAttempt, now, id, ...lockArgs);
  return { retried: true, nextAttempt };
}

/** Release jobs stuck in 'running' past a stale threshold — a crashed worker's orphans. */
export async function reapStaleJobs(staleMs = 10 * 60_000): Promise<number> {
  const db = getDb();
  const cutoff = Date.now() - staleMs;
  const stale = await db.prepare("SELECT id, locked_by FROM jobs WHERE status = 'running' AND locked_at < ?").all(cutoff) as
    { id: string; locked_by: string | null }[];
  for (const { id, locked_by } of stale) await failJob(id, "Worker timed out or crashed while processing this job.", locked_by ?? undefined);
  return stale.length;
}

// ── Introspection (for the monitoring UI) ────────────────────────────────────

export async function listJobs(args: { workspaceId?: string; status?: JobStatus; limit?: number } = {}): Promise<JobRow[]> {
  const db = getDb();
  const workspaceId = args.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const limit = Math.min(args.limit ?? 50, 200);
  if (args.status) {
    return db
      .prepare("SELECT * FROM jobs WHERE workspace_id = ? AND status = ? ORDER BY created_at DESC LIMIT ?")
      .all(workspaceId, args.status, limit) as Promise<JobRow[]>;
  }
  return db
    .prepare("SELECT * FROM jobs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(workspaceId, limit) as Promise<JobRow[]>;
}

export async function queueStats(workspaceId = DEFAULT_WORKSPACE_ID): Promise<Record<JobStatus, number>> {
  const db = getDb();
  const rows = await db
    .prepare("SELECT status, COUNT(*) AS n FROM jobs WHERE workspace_id = ? GROUP BY status")
    .all(workspaceId) as { status: JobStatus; n: number }[];
  const out: Record<JobStatus, number> = { queued: 0, running: 0, success: 0, failed: 0, dead: 0 };
  for (const r of rows) out[r.status] = r.n;
  return out;
}

/** Manually requeue a dead-lettered job — used by the "Retry" button in the UI. */
export async function requeueJob(id: string): Promise<boolean> {
  const db = getDb();
  const res = await db
    .prepare("UPDATE jobs SET status = 'queued', attempts = 0, run_after = ?, last_error = NULL, updated_at = ? WHERE id = ? AND status = 'dead'")
    .run(Date.now(), Date.now(), id);
  return res.changes > 0;
}
