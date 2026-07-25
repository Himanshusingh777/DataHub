/**
 * GET /api/analytics/summary?days=30
 *
 * Computes real analytics from the runs and flows tables. Returns summary
 * metrics that replace the Math.random() placeholder on the Analytics page.
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

  try {
    const db = getDb();

    // Total rows synced in window
    const rowsRow = db.prepare(`
      SELECT COALESCE(SUM(r.rows), 0) AS total
      FROM runs r
      JOIN flows f ON f.id = r.flow_id
      WHERE f.workspace_id = ? AND f.user_id = ? AND r.started_at >= ?
    `).get(workspaceId, userId, since) as { total: number };

    // Success / total counts
    const jobCounts = db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN r.status = 'success' THEN 1 ELSE 0 END) AS success,
        SUM(CASE WHEN r.status = 'failed'  THEN 1 ELSE 0 END) AS failed,
        AVG(r.duration_ms) AS avg_duration
      FROM runs r
      JOIN flows f ON f.id = r.flow_id
      WHERE f.workspace_id = ? AND f.user_id = ? AND r.started_at >= ?
    `).get(workspaceId, userId, since) as { total: number; success: number; failed: number; avg_duration: number };

    // Active flows
    const activeFlows = (db.prepare(`
      SELECT COUNT(*) AS n FROM flows WHERE workspace_id = ? AND user_id = ? AND status = 'active'
    `).get(workspaceId, userId) as { n: number }).n;

    const total = jobCounts.total || 0;
    const success = jobCounts.success || 0;
    const failed = jobCounts.failed || 0;
    const totalRows = rowsRow.total || 0;

    // Estimate GB from rows (rough heuristic: 500 bytes/row average)
    const dataGB = parseFloat(((totalRows * 500) / 1e9).toFixed(2));

    const isReal = total > 0;

    return NextResponse.json({
      totalRows,
      successRate: total > 0 ? parseFloat(((success / total) * 100).toFixed(1)) : 0,
      dataGB,
      avgLatencyMs: jobCounts.avg_duration ? Math.round(jobCounts.avg_duration) : 0,
      failedJobs: failed,
      activeFlows,
      totalJobs: total,
      isReal,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
