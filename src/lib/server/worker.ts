/**
 * Job worker pool — parallel consumers of the queue in jobs.ts.
 *
 * Runs N concurrent poll loops inside the same Next.js server process (no
 * separate worker infrastructure to deploy). Each loop claims one job at a
 * time, dispatches it to the handler registered for that job's `type`, and
 * reports success/failure back to the queue. `sync_flow` handling is exactly
 * `runFlowSync` from runner.ts — unchanged — so parallelising the scheduler
 * required zero changes to the actual sync logic.
 */

import { claimNextJob, completeJob, failJob, reapStaleJobs, type JobRow, type JobType } from "./jobs";
import { getDb } from "./db";
import { runFlowSync, runFlowSyncIncremental, type FlowRow } from "./runner";
import { writeAudit } from "./audit";
import { decrypt } from "./crypto";
import { getWarehouseSnapshot } from "./warehouse-monitor";
import { rollupUsageEvents } from "./billing";
import { fireAutomations, fireScheduledAutomation } from "./automation";

const POLL_MS = 2_000;
const REAP_INTERVAL_MS = 5 * 60_000;

export type JobHandler = (payload: Record<string, unknown>, job: JobRow) => Promise<Record<string, unknown> | void>;

const HANDLERS: Partial<Record<JobType, JobHandler>> = {};

export function registerHandler(type: JobType, handler: JobHandler): void {
  HANDLERS[type] = handler;
}

// ── Default handler: sync_flow ────────────────────────────────────────────────
// Loads the flow row and runs the exact same server-side ETL the manual
// "Run now" button uses. This is the connector layer job engine: scheduling,
// retries and parallelism all live in this file; extraction/load logic stays
// in runner.ts and is never duplicated.
registerHandler("sync_flow", async (payload) => {
  const flowId = String(payload.flowId ?? "");
  const db = getDb();
  const flow = db.prepare("SELECT * FROM flows WHERE id = ?").get(flowId) as FlowRow | undefined;
  if (!flow) throw new Error(`Flow ${flowId} no longer exists`);

  const triggerBy = (payload.triggerBy as "manual" | "schedule") ?? "schedule";
  const automationCtx = { userId: flow.user_id, workspaceId: flow.workspace_id ?? "default", flowId: flow.id, flowName: flow.name ?? flow.source_id };

  // Automation hooks are best-effort: a failing webhook/email must never
  // break the actual sync, so each call is awaited but never allowed to
  // throw out of this handler (fireAutomations already catches per-rule).
  await fireAutomations("pre_sync", automationCtx);

  // Dispatch on the flow's own sync_mode (defaults to 'full' for every flow
  // created before this column existed — see db.ts migration). Only flows
  // explicitly switched to 'incremental' take the MERGE/watermark path.
  const result = flow.sync_mode === "incremental"
    ? await runFlowSyncIncremental(flow, triggerBy)
    : await runFlowSync(flow, triggerBy);

  if (!result.ok) {
    await fireAutomations("on_failure", { ...automationCtx, error: result.error ?? "Sync failed" });
    throw new Error(result.error ?? "Sync failed");
  }

  await fireAutomations("post_sync", automationCtx);
  return { rows: result.rows, mode: flow.sync_mode ?? "full" };
});

// ── Default handler: schema_check ─────────────────────────────────────────────
// Placeholder wiring point for automatic schema-drift detection between
// syncs — the actual comparison logic lives in the Universal Intelligence
// Engine's SemanticStore.diff(); this handler is where a background job would
// invoke it once a server-side warehouse schema cache exists per flow.
registerHandler("schema_check", async (payload) => {
  return { checked: true, flowId: payload.flowId ?? null };
});

// ── Default handler: rollup ────────────────────────────────────────────────────
// Background aggregation (performance layer): collapses old usage_events
// rows into one row per (workspace, metric, day) so the table stays bounded
// as syncs accumulate, without changing any monthly total checkLimit() reads
// (SUM is associative — see rollupUsageEvents in billing.ts).
registerHandler("rollup", async (payload) => {
  const db = getDb();
  const workspaceIds = payload.workspaceId
    ? [String(payload.workspaceId)]
    : (db.prepare("SELECT DISTINCT workspace_id FROM usage_events").all() as { workspace_id: string }[]).map((r) => r.workspace_id);

  const results = workspaceIds.map((id) => rollupUsageEvents({ workspaceId: id }));
  return {
    workspacesProcessed: results.length,
    groupsCollapsed: results.reduce((s, r) => s + r.groupsCollapsed, 0),
    rowsRemoved: results.reduce((s, r) => s + r.rowsRemoved, 0),
  };
});

// ── Default handler: warehouse_audit ──────────────────────────────────────────
// Background counterpart to the on-demand /api/warehouse/monitor route:
// snapshots storage, query cost, cluster health and load duration for a
// user's configured BigQuery destination, and writes the summary to the
// audit trail so degradation shows up even when nobody has the Warehouse
// page open. Skips cleanly (no-op success) when BigQuery isn't configured.
registerHandler("warehouse_audit", async (payload) => {
  const userId = String(payload.userId ?? "");
  if (!userId) return { skipped: true, reason: "no userId in payload" };

  const db = getDb();
  const row = db.prepare("SELECT data FROM credentials WHERE user_id = ? AND service = 'bigquery'").get(userId) as
    | { data: string } | undefined;
  if (!row) return { skipped: true, reason: "BigQuery not configured for this user" };

  let creds: Record<string, string>;
  try { creds = JSON.parse(decrypt(row.data)); } catch { return { skipped: true, reason: "credential decrypt failed" }; }
  if (!creds.project_id || !creds.dataset || !creds.service_json) return { skipped: true, reason: "incomplete BigQuery credentials" };

  const snapshot = await getWarehouseSnapshot({
    projectId: creds.project_id.trim(),
    dataset: creds.dataset.trim(),
    credentials: JSON.parse(creds.service_json),
    userId,
  });

  const staleCount = snapshot.clusterHealth.filter((t) => t.status === "stale").length;
  writeAudit({
    workspaceId: String(payload.workspaceId ?? "default"),
    userId,
    action: "warehouse.audit",
    resource: creds.dataset,
    meta: {
      totalGB: snapshot.storage.totalGB,
      tables: snapshot.storage.tables.length,
      staleTables: staleCount,
      estimatedQueryCostUsd7d: snapshot.queryCost.totalEstimatedUsd,
    },
  });

  return { totalGB: snapshot.storage.totalGB, staleTables: staleCount };
});

// ── Default handler: fire_automation ──────────────────────────────────────────
// Executes one schedule-triggered automation rule. Enqueued by scheduler.ts
// when an automation's next_run_at comes due — going through the job queue
// (rather than firing inline from the scheduler tick) gives schedule-based
// automations the same retry/dead-letter durability as flow syncs, e.g. a
// webhook endpoint that's briefly down gets retried with backoff instead of
// silently missing that firing.
registerHandler("fire_automation", async (payload) => {
  const automationId = String(payload.automationId ?? "");
  if (!automationId) throw new Error("fire_automation job missing automationId");
  await fireScheduledAutomation(automationId);
  return { automationId };
});

// ── Worker pool controller ────────────────────────────────────────────────────

interface WorkerState {
  running: boolean;
  loops: number;
}

const g = globalThis as unknown as { __ctWorkers?: WorkerState; __ctReaper?: NodeJS.Timeout };

async function pollLoop(workerId: string) {
  while (g.__ctWorkers?.running) {
    let job: JobRow | null = null;
    try {
      job = claimNextJob(workerId, Object.keys(HANDLERS) as JobType[]);
    } catch (e) {
      console.warn(`[worker:${workerId}] claim failed:`, e instanceof Error ? e.message : e);
    }

    if (!job) {
      await sleep(POLL_MS);
      continue;
    }

    const handler = HANDLERS[job.type];
    if (!handler) {
      failJob(job.id, `No handler registered for job type "${job.type}"`, workerId);
      continue;
    }

    try {
      let payload: Record<string, unknown> = {};
      try { payload = JSON.parse(job.payload); } catch { /* malformed payload — handler gets {} */ }
      const result = await handler(payload, job);
      completeJob(job.id, workerId, result ?? undefined);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const outcome = failJob(job.id, msg, workerId);
      writeAudit({
        workspaceId: job.workspace_id,
        action: "job.failed",
        resource: `${job.type}:${job.id}`,
        meta: { error: msg, willRetry: outcome.retried, attempt: job.attempts + 1 },
      });
      console.warn(`[worker:${workerId}] job ${job.id} (${job.type}) failed: ${msg}${outcome.retried ? " — retrying" : " — dead-lettered"}`);
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Start the worker pool. Idempotent and hot-reload safe (state lives on
 * globalThis, same pattern as the scheduler).
 */
export function startWorkers(concurrency = 3) {
  if (g.__ctWorkers?.running) return;
  g.__ctWorkers = { running: true, loops: concurrency };
  console.log(`[worker] starting ${concurrency} background worker${concurrency === 1 ? "" : "s"}`);

  for (let i = 0; i < concurrency; i++) {
    pollLoop(`w${i}`).catch((e) => console.warn("[worker] loop crashed:", e));
  }

  if (!g.__ctReaper) {
    g.__ctReaper = setInterval(() => {
      try {
        const n = reapStaleJobs();
        if (n) console.log(`[worker] reaped ${n} stale job(s) back onto the queue`);
      } catch { /* DB not ready yet */ }
    }, REAP_INTERVAL_MS);
  }
}

export function stopWorkers() {
  if (g.__ctWorkers) g.__ctWorkers.running = false;
}
