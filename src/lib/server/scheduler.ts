/**
 * Background Scheduler — runs inside the Next.js server process.
 *
 * Every 60s: find flows whose next_run_at is due and ENQUEUE a `sync_flow`
 * job for each (see jobs.ts + worker.ts). The scheduler itself no longer
 * executes syncs directly — it only decides WHAT is due. Execution,
 * concurrency and retries are the job engine's job, which means:
 *   - a due flow whose worker is still busy just waits in the queue instead
 *     of the scheduler blocking or double-running it
 *   - transient failures retry with backoff instead of silently dropping
 *   - the queue survives a server restart (it's a SQLite table)
 *
 * `dedupeKey: flow.id` on the enqueue call is the overlap guard that replaces
 * the old in-memory `__ctRunning` flag — it works per-flow instead of
 * globally, so N flows now run in parallel rather than one at a time.
 */

import { getDb } from "./db";
import type { FlowRow } from "./runner";
import { enqueueJob } from "./jobs";

const TICK_MS = 60_000;
const MAX_DUE_PER_TICK = 20; // cap so one tick can't flood the queue

// Survive hot-reload: keep the interval handle (and the rollup day marker) on globalThis
const g = globalThis as unknown as { __ctScheduler?: NodeJS.Timeout; __ctLastRollupDay?: string };

/**
 * Once per calendar day, enqueue a background `rollup` job (performance
 * layer — see billing.ts rollupUsageEvents / worker.ts registerHandler).
 * Piggybacks on the existing 60s tick rather than a second interval; the
 * day-string comparison keeps this to one enqueue per day regardless of how
 * often tick() runs.
 */
async function maybeEnqueueDailyRollup() {
  const today = new Date().toISOString().slice(0, 10);
  if (g.__ctLastRollupDay === today) return;
  g.__ctLastRollupDay = today;
  try {
    const jobId = await enqueueJob("rollup", {}, { dedupeKey: `rollup:${today}`, priority: -10 });
    console.log(`[scheduler] enqueued daily usage rollup as job ${jobId}`);
  } catch (e) {
    console.warn("[scheduler] rollup enqueue skipped:", e instanceof Error ? e.message : e);
  }
}

async function tick() {
  try {
    const db = getDb();
    const due = await db.prepare(`
      SELECT id, user_id, source_id, dest_id, schedule_value, warehouse_table, status, workspace_id
      FROM flows
      WHERE next_run_at IS NOT NULL AND next_run_at <= ? AND status != 'paused'
      LIMIT ?
    `).all(Date.now(), MAX_DUE_PER_TICK) as (FlowRow & { workspace_id?: string })[];

    for (const flow of due) {
      const jobId = await enqueueJob(
        "sync_flow",
        { flowId: flow.id, triggerBy: "schedule" },
        { workspaceId: flow.workspace_id, dedupeKey: flow.id, priority: 0 }
      );
      console.log(`[scheduler] enqueued sync for flow ${flow.id} (${flow.source_id} → ${flow.dest_id}) as job ${jobId}`);
    }

    await maybeEnqueueDailyRollup();
  } catch (e) {
    // DB driver missing or transient error — stay quiet but visible
    console.warn("[scheduler] tick skipped:", e instanceof Error ? e.message : e);
  }
}

export function startScheduler() {
  if (g.__ctScheduler) return;
  console.log("[scheduler] started — checking for due flows every 60s (enqueues jobs, does not run them inline)");
  g.__ctScheduler = setInterval(() => { tick().catch(() => {}); }, TICK_MS);
  // First check shortly after boot
  setTimeout(() => { tick().catch(() => {}); }, 5_000);
}
