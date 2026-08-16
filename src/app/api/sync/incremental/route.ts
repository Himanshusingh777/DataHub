/**
 * POST /api/sync/incremental — incremental (MERGE/UPSERT) ETL route.
 * GET  /api/sync/incremental?flowId= — inspect a flow's current checkpoint.
 *
 * Sibling of /api/sync/run (full refresh, untouched). Same connector
 * dispatch and BigQuery destination contract; the difference is entirely in
 * the load step:
 *   - startDate is seeded from the stored watermark (extraction is scoped to
 *     new/changed records only, when a flowId + prior checkpoint exist)
 *   - loading goes through loadToBigQueryIncremental() — staging table +
 *     MERGE + automatic ALTER TABLE for new columns — instead of a plain
 *     WRITE_APPEND load job
 *   - on success, the watermark is advanced for next time
 *
 * Body: {
 *   sourceId, objectId?, sourceCreds?,
 *   projectId, dataset, serviceJson,
 *   keyColumns: string[],       // required — MERGE key(s)
 *   flowId?: string,            // optional — persists/reads sync_state checkpoint
 *   startDate?, endDate?        // optional manual override of the watermark
 * }
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAdapterAsync } from "@/lib/server/connectors";
import { loadToBigQueryIncremental, type JobLog } from "@/lib/server/etl";
import { getAuthContext } from "@/lib/server/auth";
import { writeAudit } from "@/lib/server/audit";
import { checkRateLimit, rateLimitKey, rateLimitResponse, requestIdentity, RATE_LIMITS } from "@/lib/server/rate-limit";
import { getCheckpoint, setCheckpoint, computeWatermark } from "@/lib/server/incremental";
import { recordUsage } from "@/lib/server/billing";

export async function GET(req: NextRequest) {
  const flowId = req.nextUrl.searchParams.get("flowId");
  if (!flowId) return NextResponse.json({ ok: false, error: "flowId is required" }, { status: 400 });
  const checkpoint = await getCheckpoint(flowId);
  return NextResponse.json({ ok: true, checkpoint });
}

export async function POST(req: NextRequest) {
  const { userId, workspaceId } = await getAuthContext(req);

  const rl = await checkRateLimit(rateLimitKey(requestIdentity(req, userId), "sync"), RATE_LIMITS.sync);
  if (!rl.allowed) {
    const r = rateLimitResponse(rl);
    return NextResponse.json(r.body, { status: r.status, headers: r.headers });
  }

  const logs: JobLog[] = [];
  const log = (level: JobLog["level"], message: string) =>
    logs.push({ ts: new Date().toISOString(), level, message });

  let body: {
    sourceId?: string; objectId?: string;
    sourceCreds?: Record<string, string>;
    projectId?: string; dataset?: string; serviceJson?: string;
    keyColumns?: string[];
    flowId?: string;
    startDate?: string; endDate?: string;
    table?: string;
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body", logs }, { status: 400 });
  }

  const sourceId = body.sourceId ?? "instantly";
  const sourceCreds = body.sourceCreds ?? {};
  const { projectId, dataset, serviceJson } = body;
  const keyColumns = (body.keyColumns ?? []).filter(Boolean);

  if (!keyColumns.length)
    return NextResponse.json({ ok: false, error: "keyColumns is required for incremental sync (at least one MERGE key)", logs }, { status: 400 });
  if (!projectId || !dataset || !serviceJson)
    return NextResponse.json({ ok: false, error: "BigQuery credentials missing — configure them in the flow's Destination step", logs }, { status: 400 });

  let credentials: Record<string, string>;
  try { credentials = JSON.parse(serviceJson); } catch {
    return NextResponse.json({ ok: false, error: "Service Account JSON invalid", logs }, { status: 400 });
  }

  const adapter = await getAdapterAsync(sourceId);
  if (!adapter)
    return NextResponse.json({ ok: false, error: `No adapter registered for connector "${sourceId}"`, logs }, { status: 400 });
  if (sourceId === "csv")
    return NextResponse.json({ ok: false, error: "CSV is push-based — incremental sync does not apply", logs }, { status: 400 });

  try {
    log("info", `Incremental sync started. Source: ${adapter.name} → Destination: BigQuery.`);

    const authError = await adapter.authenticate(sourceCreds);
    if (authError) {
      log("error", authError);
      return NextResponse.json({ ok: false, error: authError, logs }, { status: 401 });
    }

    // Prefer an explicit startDate override; otherwise fall back to the
    // flow's stored watermark, if one exists.
    const checkpoint = body.flowId ? await getCheckpoint(body.flowId) : null;
    const effectiveStartDate = body.startDate ?? checkpoint?.cursorValue ?? undefined;
    if (checkpoint?.cursorValue && !body.startDate) {
      log("info", `Using stored checkpoint: ${checkpoint.cursorField} >= ${checkpoint.cursorValue}`);
    }

    const objectId = body.objectId ?? adapter.objects[0]?.id ?? "";
    const result = await adapter.extract(objectId, sourceCreds, { startDate: effectiveStartDate, endDate: body.endDate }, log);
    const table = body.table ?? adapter.objects.find((o) => o.id === objectId)?.table ?? sourceId;

    if (!result.rows.length) {
      log("warn", "Nothing to merge — 0 rows extracted since last checkpoint.");
      return NextResponse.json({ ok: true, rowsStaged: 0, table: `${dataset}.${table}`, logs });
    }

    log("info", `Connecting to BigQuery project ${projectId}…`);
    const loadResult = await loadToBigQueryIncremental({
      projectId, credentials, dataset, table, rows: result.rows, keyColumns, schema: result.schema, log,
    });

    // Advance the watermark for next time, if this flow is tracked and we
    // found a date-like field to checkpoint on.
    let nextCheckpoint: { field: string; value: string } | null = null;
    if (body.flowId) {
      nextCheckpoint = computeWatermark(result.rows);
      if (nextCheckpoint) {
        await setCheckpoint({
          flowId: body.flowId, cursorField: nextCheckpoint.field, cursorValue: nextCheckpoint.value,
          rowsThisRun: loadResult.rowsStaged,
        });
        log("info", `Checkpoint advanced: ${nextCheckpoint.field} = ${nextCheckpoint.value}`);
      }
    }

    log("success", "Incremental sync complete.");
    await writeAudit({
      workspaceId, userId, action: "sync.incremental_run", resource: `${sourceId}:${table}`,
      meta: { rowsStaged: loadResult.rowsStaged, columnsAdded: loadResult.columnsAdded, keyColumns },
    });
    recordUsage({ workspaceId, metric: "rows_synced", quantity: loadResult.rowsStaged });

    return NextResponse.json({
      ok: true,
      rowsStaged: loadResult.rowsStaged,
      columnsAdded: loadResult.columnsAdded,
      warehouseRowCount: loadResult.warehouseRowCount,
      table: `${dataset}.${table}`,
      tableCreated: loadResult.tableCreated,
      checkpoint: nextCheckpoint,
      logs,
    });
  } catch (err: unknown) {
    const anyErr = err as { message?: string };
    const msg = anyErr?.message ?? String(err);
    log("error", msg);
    return NextResponse.json({ ok: false, error: msg, logs }, { status: 500 });
  }
}
