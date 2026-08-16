/**
 * Server-side flow runner — the heart of scheduled syncs.
 * Reads credentials from the encrypted vault, executes the universal ETL
 * (adapter extract → BigQuery load → verify), and persists the run in SQLite.
 * No browser required.
 */

import { getDb, computeNextRun, DEFAULT_WORKSPACE_ID } from "./db";
import { decrypt, genId } from "./crypto";
import { getAdapterAsync } from "./connectors";
import { loadToBigQuery, loadToBigQueryIncremental, type JobLog } from "./etl";
import { getCheckpoint, setCheckpoint, computeWatermark } from "./incremental";
import { recordUsage } from "./billing";
import { resolveBqCredsForFlow } from "./bq-creds";

export interface FlowRow {
  id: string; user_id: string; source_id: string; dest_id: string;
  schedule_value: string; warehouse_table: string | null; status: string;
  name?: string | null;          // flow display name (Step 2 of new wizard)
  dataset?: string | null;       // per-flow BQ dataset override (Step 3 of new wizard)
  sync_mode?: string | null;
  key_columns?: string | null;   // JSON string[]
  workspace_id?: string | null;
}

async function getSrcCreds(userId: string, service: string): Promise<Record<string, string> | null> {
  try {
    const row = await getDb().prepare("SELECT data FROM credentials WHERE user_id = ? AND service = ?").get(userId, service) as
      | { data: string } | undefined;
    if (!row) return null;
    return JSON.parse(decrypt(row.data));
  } catch {
    return null;
  }
}

export async function runFlowSync(flow: FlowRow, triggerBy: "manual" | "schedule"): Promise<{ ok: boolean; rows: number; error?: string }> {
  const db = getDb();
  const logs: JobLog[] = [];
  const log = (level: JobLog["level"], message: string) =>
    logs.push({ ts: new Date().toISOString(), level, message });
  const started = Date.now();

  const finish = async (status: "success" | "failed", rows: number | null, error?: string) => {
    await db.prepare(`
      INSERT INTO runs (id, flow_id, status, rows, duration_ms, error, logs, trigger_by, started_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(genId("run"), flow.id, status, rows, Date.now() - started, error ?? null, JSON.stringify(logs), triggerBy, started);
    // Advance the schedule regardless of outcome
    await db.prepare("UPDATE flows SET next_run_at = ?, status = ? WHERE id = ?")
      .run(computeNextRun(flow.schedule_value), status === "failed" ? "error" : "active", flow.id);
  };

  try {
    log("info", `Scheduled sync started (${triggerBy}). Source: ${flow.source_id} → ${flow.dest_id}.`);

    // Destination creds (BigQuery) — workspace-scoped with flow dataset override
    const bq = await resolveBqCredsForFlow(flow.user_id, flow.workspace_id ?? DEFAULT_WORKSPACE_ID, flow.dataset);
    if (!bq) {
      const err = "BigQuery credentials missing from vault";
      log("error", err); await finish("failed", null, err);
      return { ok: false, rows: 0, error: err };
    }

    // Source adapter
    const adapter = await getAdapterAsync(flow.source_id);
    if (!adapter) {
      const err = `No adapter for connector "${flow.source_id}" — scheduled sync skipped`;
      log("error", err); await finish("failed", null, err);
      return { ok: false, rows: 0, error: err };
    }
    if (flow.source_id === "csv") {
      // CSV flows are push-based — no data to pull on schedule.
      // Mark the run as skipped (success with 0 rows) and advance next_run_at
      // so the scheduler doesn't hammer it endlessly.
      log("info", "CSV flow — no scheduled re-sync needed. Awaiting manual re-upload.");
      await finish("success", 0);
      return { ok: true, rows: 0 };
    }

    // Source creds
    const srcCreds = (await getSrcCreds(flow.user_id, flow.source_id)) ?? {};
    const authError = await adapter.authenticate(srcCreds);
    if (authError) {
      log("error", authError); await finish("failed", null, authError);
      return { ok: false, rows: 0, error: authError };
    }

    // Extract + load every object the adapter exposes into its own BQ table.
    // Each object maps to `<sourceId>_<objectId>` (e.g. instantly_campaigns,
    // instantly_leads). For single-object adapters the first object's table
    // name falls back to flow.warehouse_table so existing flows are unaffected.
    const objects = adapter.objects.length ? adapter.objects : [{ id: flow.source_id, table: flow.warehouse_table ?? flow.source_id }];
    let totalRows = 0;
    const credentials = bq.credentials;

    for (const obj of objects) {
      const objectId = obj.id;
      log("info", `Extracting object: ${objectId}…`);
      let result;
      try {
        result = await adapter.extract(objectId, srcCreds, {}, log);
      } catch (extractErr) {
        log("warn", `Skipping ${objectId}: ${extractErr instanceof Error ? extractErr.message : String(extractErr)}`);
        continue;
      }
      if (!result.rows.length) {
        log("warn", `0 rows from ${objectId}, skipping.`);
        continue;
      }
      // Use flow.warehouse_table for single-object flows (backward compat);
      // for multi-object adapters each object gets its own prefixed table.
      const table = objects.length === 1
        ? (flow.warehouse_table ?? obj.table ?? `${flow.source_id}_${objectId}`)
        : (obj.table ?? `${flow.source_id}_${objectId}`);

      const loadRes = await loadToBigQuery({
        projectId: bq.projectId, credentials, dataset: bq.dataset,
        table, rows: result.rows, schema: result.schema, log,
        location: bq.location,
      });
      log("success", `Loaded ${loadRes.rowsInserted} rows → ${table}`);
      totalRows += loadRes.rowsInserted;
      recordUsage({ workspaceId: flow.workspace_id ?? DEFAULT_WORKSPACE_ID, metric: "rows_synced", quantity: loadRes.rowsInserted });

      // Keep warehouse_table in sync so Intelligence/Warehouse pages can find this table.
      // Safe to run every time — only updates if the column was NULL or changed.
      if (!flow.warehouse_table || flow.warehouse_table !== table) {
        try {
          await getDb().prepare("UPDATE flows SET warehouse_table = ? WHERE id = ?").run(table, flow.id);
          flow.warehouse_table = table; // update in-memory too for multi-object loops
        } catch { /* non-fatal */ }
      }
    }

    if (totalRows === 0) {
      log("warn", "All objects returned 0 rows."); await finish("success", 0);
      return { ok: true, rows: 0 };
    }

    log("success", `Sync complete — ${totalRows.toLocaleString()} total rows across ${objects.length} object(s).`);
    await finish("success", totalRows);
    return { ok: true, rows: totalRows };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log("error", msg);
    await finish("failed", null, msg);
    return { ok: false, rows: 0, error: msg };
  }
}

/**
 * Incremental sibling of runFlowSync(). Only invoked when a flow explicitly
 * opts in (flows.sync_mode = 'incremental'); the job worker decides which of
 * the two to call (see worker.ts) based on that flag. runFlowSync() above is
 * completely untouched and remains the default for every existing flow.
 *
 * Same auth/extract contract as the full-refresh path — the adapter interface
 * doesn't change. The only difference: `startDate` is seeded from the stored
 * watermark (so extraction is scoped to new/changed records) and the load
 * step goes through loadToBigQueryIncremental() (staging table + MERGE +
 * automatic schema evolution) instead of loadToBigQuery() (WRITE_APPEND).
 */
export async function runFlowSyncIncremental(
  flow: FlowRow,
  triggerBy: "manual" | "schedule"
): Promise<{ ok: boolean; rows: number; error?: string }> {
  const db = getDb();
  const logs: JobLog[] = [];
  const log = (level: JobLog["level"], message: string) =>
    logs.push({ ts: new Date().toISOString(), level, message });
  const started = Date.now();

  const finish = async (status: "success" | "failed", rows: number | null, error?: string) => {
    await db.prepare(`
      INSERT INTO runs (id, flow_id, status, rows, duration_ms, error, logs, trigger_by, started_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(genId("run"), flow.id, status, rows, Date.now() - started, error ?? null, JSON.stringify(logs), triggerBy, started);
    await db.prepare("UPDATE flows SET next_run_at = ?, status = ? WHERE id = ?")
      .run(computeNextRun(flow.schedule_value), status === "failed" ? "error" : "active", flow.id);
  };

  try {
    log("info", `Incremental sync started (${triggerBy}). Source: ${flow.source_id} → ${flow.dest_id}.`);

    let keyColumns: string[] = [];
    try { keyColumns = flow.key_columns ? JSON.parse(flow.key_columns) : []; } catch { keyColumns = []; }
    if (!keyColumns.length) {
      const err = "Incremental sync requires at least one key column configured on the flow (flows.key_columns)";
      log("error", err); await finish("failed", null, err);
      return { ok: false, rows: 0, error: err };
    }

    const bq = await resolveBqCredsForFlow(flow.user_id, flow.workspace_id ?? DEFAULT_WORKSPACE_ID, flow.dataset);
    if (!bq) {
      const err = "BigQuery credentials missing from vault";
      log("error", err); await finish("failed", null, err);
      return { ok: false, rows: 0, error: err };
    }

    const adapter = await getAdapterAsync(flow.source_id);
    if (!adapter) {
      const err = `No adapter for connector "${flow.source_id}" — incremental sync skipped`;
      log("error", err); await finish("failed", null, err);
      return { ok: false, rows: 0, error: err };
    }
    if (flow.source_id === "csv") {
      log("info", "CSV flow — incremental sync skipped. Awaiting manual re-upload.");
      await finish("success", 0);
      return { ok: true, rows: 0 };
    }

    const srcCreds = (await getSrcCreds(flow.user_id, flow.source_id)) ?? {};
    const authError = await adapter.authenticate(srcCreds);
    if (authError) {
      log("error", authError); await finish("failed", null, authError);
      return { ok: false, rows: 0, error: authError };
    }

    // Seed extraction from the stored watermark — first run has none, which
    // is equivalent to a full initial load (MERGE inserts everything as new).
    const checkpoint = await getCheckpoint(flow.id);
    if (checkpoint?.cursorValue) {
      log("info", `Resuming from checkpoint: ${checkpoint.cursorField} >= ${checkpoint.cursorValue}`);
    } else {
      log("info", "No prior checkpoint — this run seeds the watermark from a full extract.");
    }

    const objectId = adapter.objects[0]?.id ?? "";
    const result = await adapter.extract(objectId, srcCreds, { startDate: checkpoint?.cursorValue ?? undefined }, log);
    if (!result.rows.length) {
      log("warn", "0 new/changed rows since last checkpoint.");
      await finish("success", 0);
      return { ok: true, rows: 0 };
    }

    const table = flow.warehouse_table ?? adapter.objects[0]?.table ?? flow.source_id;
    const loadRes = await loadToBigQueryIncremental({
      projectId: bq.projectId, credentials: bq.credentials, dataset: bq.dataset,
      table, rows: result.rows, keyColumns, schema: result.schema, log,
      location: bq.location,
    });

    // Keep warehouse_table in sync after a successful load
    if (!flow.warehouse_table || flow.warehouse_table !== table) {
      try { await getDb().prepare("UPDATE flows SET warehouse_table = ? WHERE id = ?").run(table, flow.id); } catch { /* non-fatal */ }
    }

    const nextWatermark = computeWatermark(result.rows);
    if (nextWatermark) {
      await setCheckpoint({ flowId: flow.id, cursorField: nextWatermark.field, cursorValue: nextWatermark.value, rowsThisRun: loadRes.rowsStaged });
      log("info", `Checkpoint advanced: ${nextWatermark.field} = ${nextWatermark.value}`);
    } else {
      log("warn", "No date-like field found to advance the watermark — next run will re-scan this range.");
    }

    log("success", "Incremental sync complete.");
    await finish("success", loadRes.rowsStaged);
    recordUsage({ workspaceId: flow.workspace_id ?? DEFAULT_WORKSPACE_ID, metric: "rows_synced", quantity: loadRes.rowsStaged });
    return { ok: true, rows: loadRes.rowsStaged };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log("error", msg);
    await finish("failed", null, msg);
    return { ok: false, rows: 0, error: msg };
  }
}
