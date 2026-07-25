/**
 * Flows API — server registry that powers the scheduler.
 * POST: register/update a flow (called by the wizard after creation)
 * GET:  list flows with their server-side run history
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb, computeNextRun } from "@/lib/server/db";
import { getAuthContext } from "@/lib/server/auth";

export async function POST(req: NextRequest) {
  let body: {
    id?: string;
    name?: string;           // Step 2: flow display name
    sourceId?: string; sourceName?: string;
    destId?: string; destName?: string;
    scheduleValue?: string; warehouseTable?: string;
    dataset?: string;        // Step 3: BQ dataset (overrides workspace default)
    syncMode?: "full" | "incremental";
    keyColumns?: string[];
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }
  if (!body.id || !body.sourceId || !body.destId || !body.scheduleValue)
    return NextResponse.json({ ok: false, error: "id, sourceId, destId, scheduleValue required" }, { status: 400 });
  if (body.syncMode === "incremental" && !(body.keyColumns ?? []).length)
    return NextResponse.json({ ok: false, error: "keyColumns required when syncMode is 'incremental'" }, { status: 400 });

  try {
    const { userId, workspaceId } = getAuthContext(req);
    const db = getDb();

    const existing = db.prepare("SELECT sync_mode, key_columns FROM flows WHERE id = ?").get(body.id) as
      | { sync_mode: string; key_columns: string | null } | undefined;
    const effectiveSyncMode = body.syncMode ?? existing?.sync_mode ?? "full";
    const effectiveKeyColumns = body.keyColumns
      ? JSON.stringify(body.keyColumns)
      : existing?.key_columns ?? null;

    db.prepare(`
      INSERT INTO flows (id, user_id, workspace_id, name, source_id, source_name, dest_id, dest_name, schedule_value, warehouse_table, dataset, status, next_run_at, created_at, sync_mode, key_columns)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name           = COALESCE(excluded.name, flows.name),
        schedule_value = excluded.schedule_value,
        warehouse_table = COALESCE(excluded.warehouse_table, flows.warehouse_table),
        dataset        = COALESCE(excluded.dataset, flows.dataset),
        next_run_at    = excluded.next_run_at,
        sync_mode      = excluded.sync_mode,
        key_columns    = excluded.key_columns
    `).run(
      body.id, userId, workspaceId, body.name ?? null,
      body.sourceId, body.sourceName ?? null, body.destId, body.destName ?? null,
      body.scheduleValue, body.warehouseTable ?? null, body.dataset ?? null,
      computeNextRun(body.scheduleValue), Date.now(),
      effectiveSyncMode, effectiveKeyColumns
    );
    return NextResponse.json({ ok: true, id: body.id, nextRunAt: computeNextRun(body.scheduleValue) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e instanceof Error ? e.message : e) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { userId, workspaceId } = getAuthContext(req);
    const db = getDb();
    // Each user sees only their own flows. Admin can use impersonation to view others.
    const flows = db.prepare("SELECT * FROM flows WHERE user_id = ? ORDER BY created_at DESC").all(userId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const withRuns = (flows as any[]).map((f) => ({
      ...f,
      runs: db.prepare("SELECT id, status, rows, duration_ms, error, trigger_by, started_at FROM runs WHERE flow_id = ? ORDER BY started_at DESC LIMIT 20").all(f.id),
    }));
    return NextResponse.json({ ok: true, flows: withRuns });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e instanceof Error ? e.message : e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  try {
    const { userId, workspaceId } = getAuthContext(req);
    const db = getDb();
    db.prepare("DELETE FROM flows WHERE id = ? AND user_id = ? AND workspace_id = ?").run(id, userId, workspaceId);
    db.prepare("DELETE FROM runs WHERE flow_id = ?").run(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e instanceof Error ? e.message : e) }, { status: 500 });
  }
}
