/**
 * GET /api/debug/warehouse
 * Temporary debug endpoint — shows what's in the flows table for the current user
 * and what BigQuery tables are resolved. DELETE this file after debugging.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { resolveBqCreds } from "@/lib/server/bq-creds";
import { BigQuery } from "@google-cloud/bigquery";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { userId, workspaceId } = await getAuthContext(req);
  const db = getDb();

  // 1. All flows for this user (any workspace)
  const flows = await db.prepare(
    "SELECT id, user_id, workspace_id, source_id, dest_id, warehouse_table, status FROM flows WHERE user_id IN (?, 'local')"
  ).all(userId) as Record<string, unknown>[];

  // 2. Latest run for each flow
  const runs = await db.prepare(
    "SELECT flow_id, status, started_at, logs FROM runs ORDER BY started_at DESC LIMIT 20"
  ).all() as Record<string, unknown>[];

  // 3. Resolved BQ creds
  const creds = await resolveBqCreds(userId, workspaceId);

  // 4. List BQ datasets
  let bqDatasets: string[] = [];
  let bqTables: Record<string, string[]> = {};
  if (creds) {
    try {
      const bq = new BigQuery({ projectId: creds.projectId, credentials: creds.credentials });
      const [datasets] = await bq.getDatasets({ projectId: creds.projectId });
      bqDatasets = datasets.map((d) => d.id ?? "").filter(Boolean);
      for (const ds of bqDatasets.slice(0, 5)) {
        try {
          const [tables] = await bq.dataset(ds).getTables();
          bqTables[ds] = tables.map((t) => t.id ?? "").filter(Boolean);
        } catch { bqTables[ds] = ["ERROR"]; }
      }
    } catch (e) {
      bqDatasets = [`ERROR: ${e instanceof Error ? e.message : String(e)}`];
    }
  }

  return NextResponse.json({
    auth: { userId, workspaceId },
    creds: creds ? { projectId: creds.projectId, dataset: creds.dataset, location: creds.location } : null,
    flows,
    recentRuns: runs.map((r) => ({
      ...r,
      logs: r.logs ? JSON.parse(r.logs as string).slice(-3) : null,
    })),
    bqDatasets,
    bqTables,
  });
}
