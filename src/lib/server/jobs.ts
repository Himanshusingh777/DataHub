/**
 * Background Job Engine — durable queue backing the scheduler and any future
 * async work (rollups, schema checks, exports).
 *
 * Design: SQLite as the queue table (already the app's datastore — no new
 * infrastructure to run), claimed with an immediate transaction so concurrent
 * workers in the same process (or across a PM2/cluster deployment sharing the
 * same DB file) never double-claim a row. Swap-in point for a hosted queue
 * (SQS, Cloud Tasks, BullMQ+Redis) later is exactly this file — every caller
 * only sees `enqueueJob` / `claimNextJob` / `completeJob` / `failJob`.
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
  payload: string;
  status: JobStatus;
  priority: number;
  attempts: number;
  max_attempts: number;
  run_after: number;
  locked_by: string | null;
  locked_at: number | null;
  last_error: string | null;
  result: string | null;
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
   * returned instead of creating a duplicate. Used so the scheduler's 60s
   * tick can't enqueue the same flow twice if a run is still in flight.
   */
  dedupeKey?: string;
}

const MAX_BACKOFF_MS = 30 * 60_000;

function backoffMs(attempts: number): number {
  return Math.min(30_000 * 2 ** attempts, MAX_BACKOFF_MS);
}

/** Add (or reuse) a job. Returns the job id. */
export function enqueueJob(type: JobType, payload: Record<string, unknown>, opts: EnqueueOptions = {}): string {
  const db = getDb();
  const workspaceId = opts.workspaceId ?? DEFAULT_WORKSPACE_ID;

  if (opts.dedupeKey) {
    const existing = db
      .prepare(
        `SELECT id FROM jobs WHERE workspace_id = ? AND type = ? AND status IN ('queued','running')
         AND json_extract(payload, '$.dedupeKey') = ? LIMIT 1`
      )
      .get(workspaceId, type, opts.dedupeKey) as { id: string } | undefined;
    if (existing) return existing.id;
  }

  const id = genId("job");
  const now = Date.now();
  db.prepare(`
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
 * the queue is empty. Uses an IMMEDIATE transaction so two workers racing to
 * claim the same row always resolve to exactly one winner.
 */
export function claimNextJob(workerId: string, types?: JobType[]): JobRow | null {
  const db = getDb();
  const now = Date.now();

  const claimTxn = db.transaction(() => {
    const typeFilter = types?.length ? `AND type IN (${types.map(() => "?").join(",")})` : "";
    const candidate = db
      .prepare(
        `SELECT id FROM jobs
         WHERE status = 'queued' AND run_after <= ? ${typeFilter}
         ORDER BY priority DESC, created_at ASC
         LIMIT 1`
      )
      .get(now, ...(types ?? [])) as { id: string } | undefined;
    if (!candidate) return null;

    db.prepare(
      `UPDATE jobs SET status = 'running', locked_by = ?, locked_at = ?, updated_at = ? WHERE id = ? AND status = 'queued'`
    ).run(workerId, now, now, candidate.id);

    return db.prepare("SELECT * FROM jobs WHERE id = ?").get(candidate.id) as JobRow;
  });

  // Force an IMMEDIATE (write-locking) transaction rather than the default
  // deferred one, so the SELECT+UPDATE pair is race-free when multiple
  // workers poll concurrently — one wins the write lock, the rest simply see
  // no queued row left and try again next poll.
  db.pragma("busy_timeout = 5000");
  return claimTxn.immediate();
}

export function completeJob(id: string, result?: Record<string, unknown>): void {
  getDb()
    .prepare(`UPDATE jobs SET status = 'success', result = ?, locked_by = NULL, updated_at = ? WHERE id = ?`)
    .run(result ? JSON.stringify(result) : null, Date.now(), id);
}

/** Fail a job. Re-queues with backoff unless attempts are exhausted, in which case it's dead-lettered. */
export function failJob(id: string, error: string): { retried: boolean; nextAttempt?: number } {
  const db = getDb();
  const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as JobRow | undefined;
  if (!job) return { retried: false };

  const attempts = job.attempts + 1;
  const now = Date.now();

  if (attempts >= job.max_attempts) {
    db.prepare(`UPDATE jobs SET status = 'dead', attempts = ?, last_error = ?, locked_by = NULL, updated_at = ? WHERE id = ?`)
      .run(attempts, error, now, id);
    return { retried: false };
  }

  const nextAttempt = now + backoffMs(attempts);
  db.prepare(`
    UPDATE jobs SET status = 'queued', attempts = ?, last_error = ?, run_after = ?, locked_by = NULL, updated_at = ? WHERE id = ?
  `).run(attempts, error, nextAttempt, now, id);
  return { retried: true, nextAttempt };
}

/** Release jobs stuck in 'running' past a stale threshold — a crashed worker's orphans. */
export function reapStaleJobs(staleMs = 10 * 60_000): number {
  const db = getDb();
  const cutoff = Date.now() - staleMs;
  const stale = db.prepare("SELECT id FROM jobs WHERE status = 'running' AND locked_at < ?").all(cutoff) as { id: string }[];
  for (const { id } of stale) failJob(id, "Worker timed out or crashed while processing this job.");
  return stale.length;
}

// ── Introspection (for the monitoring UI) ────────────────────────────────────

export function listJobs(args: { workspaceId?: string; status?: JobStatus; limit?: number } = {}): JobRow[] {
  const db = getDb();
  const workspaceId = args.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const limit = Math.min(args.limit ?? 50, 200);
  if (args.status) {
    return db
      .prepare("SELECT * FROM jobs WHERE workspace_id = ? AND status = ? ORDER BY created_at DESC LIMIT ?")
      .all(workspaceId, args.status, limit) as JobRow[];
  }
  return db
    .prepare("SELECT * FROM jobs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(workspaceId, limit) as JobRow[];
}

export function queueStats(workspaceId = DEFAULT_WORKSPACE_ID): Record<JobStatus, number> {
  const db = getDb();
  const rows = db
    .prepare("SELECT status, COUNT(*) AS n FROM jobs WHERE workspace_id = ? GROUP BY status")
    .all(workspaceId) as { status: JobStatus; n: number }[];
  const out: Record<JobStatus, number> = { queued: 0, running: 0, success: 0, failed: 0, dead: 0 };
  for (const r of rows) out[r.status] = r.n;
  return out;
}

/** Manually requeue a dead-lettered job — used by the "Retry" button in the UI. */
export function requeueJob(id: string): boolean {
  const db = getDb();
  const res = db
    .prepare("UPDATE jobs SET status = 'queued', attempts = 0, run_after = ?, last_error = NULL, updated_at = ? WHERE id = ? AND status = 'dead'")
    .run(Date.now(), Date.now(), id);
  return res.changes > 0;
}
