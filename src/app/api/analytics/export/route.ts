/**
 * GET /api/analytics/export?days=30&format=csv
 * Exports run history as CSV.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { userId, workspaceId } = getAuthContext(req);
  const days = parseInt(req.nextUrl.searchParams.get("days") ?? "30", 10) || 30;
  const since = Date.now() - days * 86_400_000;

  const db = getDb();
  const runs = db.prepare(`
    SELECT
      r.id,
      f.source_id AS source,
      f.dest_id AS destination,
      r.status,
      r.rows,
      r.duration_ms,
      r.trigger_by,
      datetime(r.started_at / 1000, 'unixepoch') AS started_at,
      r.error
    FROM runs r
    JOIN flows f ON f.id = r.flow_id
    WHERE f.user_id = ? AND f.workspace_id = ? AND r.started_at >= ?
    ORDER BY r.started_at DESC
    LIMIT 10000
  `).all(userId, workspaceId, since) as Record<string, unknown>[];

  if (!runs.length) {
    return new NextResponse("id,source,destination,status,rows,duration_ms,trigger_by,started_at,error\n", {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="crosstecch-analytics.csv"`,
      },
    });
  }

  const headers = Object.keys(runs[0]!);
  const csv = [
    headers.join(","),
    ...runs.map(r => headers.map(h => {
      const v = r[h];
      if (v === null || v === undefined) return "";
      const s = String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(",")),
  ].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="crosstecch-analytics-${days}d.csv"`,
    },
  });
}
