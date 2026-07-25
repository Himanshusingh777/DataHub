/**
 * POST /api/sync/run — Universal ETL route.
 *
 * Dispatches to a connector adapter (registry) and runs the shared pipeline:
 *   Authenticate → Extract → Transform → Load to BigQuery → Verify
 *
 * Pull connectors (Instantly, future APIs): adapter.extract() fetches data.
 * Push connectors (CSV): pre-parsed rows arrive in the request body.
 *
 * Body: {
 *   sourceId: "instantly" | "csv" | ...,
 *   objectId?: string,
 *   sourceCreds?: { api_key?: string, ... },
 *   rows?: Record<string, unknown>[],   // push connectors
 *   table?: string,                     // push connectors
 *   projectId, dataset, serviceJson,    // BigQuery destination
 *   startDate?, endDate?
 * }
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAdapterAsync } from "@/lib/server/connectors";
import { loadToBigQuery, sanitizeName, type JobLog } from "@/lib/server/etl";
import { getAuthContext } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { decrypt, genId } from "@/lib/server/crypto";
import { writeAudit } from "@/lib/server/audit";
import { checkRateLimit, rateLimitKey, rateLimitResponse, requestIdentity, RATE_LIMITS } from "@/lib/server/rate-limit";
import { recordUsage } from "@/lib/server/billing";

export async function POST(req: NextRequest) {
  const { userId, workspaceId } = getAuthContext(req);

  // Manual sync triggers hit an external API and a BigQuery load job —
  // both cost money and can be abused to exhaust a connector's rate limit.
  const rl = checkRateLimit(rateLimitKey(requestIdentity(req, userId), "sync"), RATE_LIMITS.sync);
  if (!rl.allowed) {
    const r = rateLimitResponse(rl);
    return NextResponse.json(r.body, { status: r.status, headers: r.headers });
  }

  const logs: JobLog[] = [];
  const log = (level: JobLog["level"], message: string) =>
    logs.push({ ts: new Date().toISOString(), level, message });

  let body: {
    flowId?: string;
    sourceId?: string; objectId?: string;
    sourceCreds?: Record<string, string>;
    rows?: Record<string, unknown>[]; table?: string;
    startDate?: string; endDate?: string;
    // Legacy fields — ignored if vault creds are present (kept for CSV push connector)
    projectId?: string; dataset?: string; serviceJson?: string;
    instantlyKey?: string;
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body", logs }, { status: 400 });
  }

  const { flowId, startDate, endDate } = body;
  const db = getDb();
  const started = Date.now();

  // ── If a flowId is provided and the flow is a real server-side flow, delegate
  //    to runFlowSync() so run records + flow status are always written to DB.
  //    This is the path for manual "Sync now" on real flows.
  if (flowId) {
    const flow = db.prepare("SELECT * FROM flows WHERE id = ? AND user_id = ?").get(flowId, userId) as Record<string, unknown> | undefined;
    if (flow) {
      const { runFlowSync } = await import("@/lib/server/runner");
      const result = await runFlowSync(flow as any, "manual");
      // Read the freshly written run record back for the response
      const latestRun = db.prepare("SELECT * FROM runs WHERE flow_id = ? ORDER BY started_at DESC LIMIT 1").get(flowId) as Record<string, unknown> | undefined;
      return NextResponse.json({
        ok: result.ok,
        rowsInserted: result.rows,
        error: result.error,
        run: latestRun ?? null,
        logs,
      }, { status: result.ok ? 200 : 500 });
    }
  }

  // ── Standalone ETL path (CSV uploads, wizard preview, no registered flow) ───
  // Read BigQuery destination from vault; fall back to body for CSV push connector
  // (which provides explicit rows + table — no vault creds needed for source auth).
  let projectId: string;
  let dataset: string;
  let credentials: Record<string, string>;

  const vaultBqRow = db.prepare("SELECT data FROM credentials WHERE user_id = ? AND service = 'bigquery'")
    .get(userId) as { data: string } | undefined;

  if (vaultBqRow) {
    try {
      const vaultCreds = JSON.parse(decrypt(vaultBqRow.data)) as Record<string, string>;
      projectId = vaultCreds.project_id?.trim() ?? "";
      dataset   = vaultCreds.dataset?.trim() ?? "";
      credentials = JSON.parse(vaultCreds.service_json ?? "{}");
    } catch {
      return NextResponse.json({ ok: false, error: "Failed to decrypt BigQuery credentials from vault", logs }, { status: 500 });
    }
  } else if (body.projectId && body.dataset && body.serviceJson) {
    // Fallback: CSV wizard flow passes creds explicitly in body (pre-vault path)
    projectId = body.projectId.trim();
    dataset   = body.dataset.trim();
    try { credentials = JSON.parse(body.serviceJson); } catch {
      return NextResponse.json({ ok: false, error: "Service Account JSON invalid", logs }, { status: 400 });
    }
  } else {
    return NextResponse.json({ ok: false, error: "BigQuery credentials not configured — add them in Settings → Integrations.", logs }, { status: 400 });
  }

  if (!projectId || !dataset)
    return NextResponse.json({ ok: false, error: "BigQuery project ID and dataset are required", logs }, { status: 400 });

  const sourceId = body.sourceId ?? "instantly";

  // For pull connectors (Instantly), read source creds from vault
  let sourceCreds: Record<string, string> = body.sourceCreds ?? {};
  if (!Array.isArray(body.rows) && sourceId !== "csv") {
    const vaultSrcRow = db.prepare("SELECT data FROM credentials WHERE user_id = ? AND service = ?")
      .get(userId, sourceId) as { data: string } | undefined;
    if (vaultSrcRow) {
      try { sourceCreds = JSON.parse(decrypt(vaultSrcRow.data)); } catch { /* fall through to body creds */ }
    }
    // Legacy: body.instantlyKey still works as a last resort (wizard preview)
    if (!sourceCreds.api_key && body.instantlyKey) sourceCreds = { api_key: body.instantlyKey };
  }

  const adapter = await getAdapterAsync(sourceId);
  if (!adapter)
    return NextResponse.json({ ok: false, error: `No adapter registered for connector "${sourceId}"`, logs }, { status: 400 });

  try {
    log("info", `Sync job started. Source: ${adapter.name} → Destination: BigQuery.`);

    // ── AUTHENTICATE ─────────────────────────────────────────────────────────
    log("debug", `Validating ${adapter.name} credentials…`);
    const authError = await adapter.authenticate(sourceCreds);
    if (authError) {
      log("error", authError);
      return NextResponse.json({ ok: false, error: authError, logs }, { status: 401 });
    }

    // ── EXTRACT + TRANSFORM ──────────────────────────────────────────────────
    let rows: Record<string, unknown>[];
    let schema;
    let table: string;

    if (Array.isArray(body.rows) && body.rows.length) {
      // Push connector (CSV): rows already extracted + mapped client-side
      rows = body.rows;
      table = sanitizeName(body.table ?? adapter.objects[0]?.table ?? "upload");
      log("success", `Received ${rows.length} pre-parsed rows for table "${table}".`);
    } else {
      const objectId = body.objectId ?? adapter.objects[0]?.id ?? "";
      const result = await adapter.extract(objectId, sourceCreds, { startDate, endDate }, log);
      rows = result.rows;
      schema = result.schema;
      table = adapter.objects.find((o) => o.id === objectId)?.table ?? sanitizeName(objectId);
    }

    if (!rows.length) {
      log("warn", "Nothing to load — 0 rows extracted.");
      return NextResponse.json({ ok: true, rowsInserted: 0, table: `${dataset}.${table}`, logs });
    }

    // ── LOAD + VERIFY (shared for every connector) ──────────────────────────
    log("info", `Connecting to BigQuery project ${projectId}…`);
    const loadResult = await loadToBigQuery({ projectId, credentials, dataset, table, rows, schema, log });

    log("success", "Sync complete.");
    writeAudit({
      workspaceId, userId, action: "sync.manual_run", resource: `${sourceId}:${table}`,
      meta: { rowsInserted: loadResult.rowsInserted },
    });
    recordUsage({ workspaceId, metric: "rows_synced", quantity: loadResult.rowsInserted });

    // Write run record to DB (standalone path — no registered flowId)
    const runId = genId("run");
    try {
      db.prepare(`
        INSERT INTO runs (id, flow_id, workspace_id, status, rows, duration_ms, error, logs, trigger_by, started_at)
        VALUES (?, ?, ?, 'success', ?, ?, NULL, ?, 'manual', ?)
      `).run(runId, `standalone:${sourceId}:${table}`, workspaceId, loadResult.rowsInserted, Date.now() - started, JSON.stringify(logs), started);
    } catch { /* non-fatal: run record is best-effort for standalone syncs */ }

    return NextResponse.json({
      ok: true,
      rowsInserted: loadResult.rowsInserted,
      warehouseRowCount: loadResult.warehouseRowCount,
      table: `${dataset}.${table}`,
      tableCreated: loadResult.tableCreated,
      runId,
      logs,
    });
  } catch (err: unknown) {
    const anyErr = err as { name?: string; errors?: { errors?: { message?: string }[] }[]; message?: string };
    let msg = anyErr?.message ?? String(err);
    if (anyErr?.name === "PartialFailureError")
      msg = "Some rows failed: " + (anyErr.errors?.[0]?.errors?.[0]?.message ?? "schema mismatch");
    if (/billing|streaming/i.test(msg))
      msg = "BigQuery Sandbox does not allow streaming inserts — this build uses load jobs; if you still see this, check billing. Original: " + msg;
    log("error", msg);

    // Write failed run record (best-effort)
    try {
      db.prepare(`
        INSERT INTO runs (id, flow_id, workspace_id, status, rows, duration_ms, error, logs, trigger_by, started_at)
        VALUES (?, ?, ?, 'failed', 0, ?, ?, ?, 'manual', ?)
      `).run(genId("run"), `standalone:${sourceId ?? "unknown"}`, workspaceId, Date.now() - started, msg, JSON.stringify(logs), started);
    } catch { /* non-fatal */ }

    return NextResponse.json({ ok: false, error: msg, logs }, { status: 500 });
  }
}
