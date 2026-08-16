/**
 * GET /api/dashboard/stats
 * Returns real ETL metrics from SQLite.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { resolveBqCreds } from "@/lib/server/bq-creds";
import { BigQuery } from "@google-cloud/bigquery";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { userId, workspaceId } = await getAuthContext(req);
    const db = getDb();

    // Flows
    const flows = await db.prepare("SELECT COUNT(*) as n FROM flows WHERE user_id = ?").get(userId) as { n: number };
    const activeFlows = await db.prepare("SELECT COUNT(*) as n FROM flows WHERE user_id = ? AND status = 'active'").get(userId) as { n: number };

    // Recent runs (last 20)
    const recentRuns = await db.prepare(`
      SELECT r.id, f.name as "flowName", r.status, r.rows as "rowsProcessed",
             r.duration_ms as "durationMs", r.started_at as "startedAt", r.error
      FROM runs r
      JOIN flows f ON f.id = r.flow_id
      WHERE f.user_id = ?
      ORDER BY r.started_at DESC
      LIMIT 20
    `).all(userId) as any[];

    // Failed jobs (last 24h)
    const since = Date.now() - 86_400_000;
    const failedJobs = await db.prepare(
      "SELECT COUNT(*) as n FROM runs r JOIN flows f ON f.id = r.flow_id WHERE f.user_id = ? AND r.status = 'failed' AND r.started_at > ?"
    ).get(userId, since) as { n: number };

    // Total rows synced
    const totalRows = await db.prepare(
      "SELECT SUM(r.rows) as total FROM runs r JOIN flows f ON f.id = r.flow_id WHERE f.user_id = ? AND r.status = 'success'"
    ).get(userId) as { total: number | null };

    // Last sync time — computed from started_at + duration_ms (no finished_at column)
    const lastRun = await db.prepare(
      "SELECT MAX(r.started_at + COALESCE(r.duration_ms, 0)) as t FROM runs r JOIN flows f ON f.id = r.flow_id WHERE f.user_id = ? AND r.status = 'success'"
    ).get(userId) as { t: number | null };

    const lastSyncAt = lastRun?.t ? new Date(lastRun.t).toLocaleString() : null;

    // Warehouse table count (best-effort, don't fail dashboard if BQ is down)
    let warehouseTables = 0;
    try {
      const creds = await resolveBqCreds(userId, workspaceId);
      if (creds) {
        const bq = new BigQuery({ projectId: creds.projectId, credentials: creds.credentials });
        const [datasets] = await bq.getDatasets({ projectId: creds.projectId });
        for (const ds of datasets) {
          if (ds.id?.startsWith("_")) continue;
          try {
            const [tables] = await ds.getTables();
            warehouseTables += tables.length;
          } catch { /* skip inaccessible dataset */ }
        }
      }
    } catch { /* BQ not configured or unreachable */ }

    return NextResponse.json({
      totalFlows: flows.n,
      activeFlows: activeFlows.n,
      failedJobs: failedJobs.n,
      warehouseTables,
      totalRowsSynced: totalRows.total ?? 0,
      lastSyncAt,
      recentRuns,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 500 });
  }
}
