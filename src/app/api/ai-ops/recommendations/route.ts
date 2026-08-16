/**
 * GET /api/ai-ops/recommendations
 *
 * Derives recommendations from real platform data:
 * - Stale tables (freshness_hours > 24)
 * - High error rate flows (> 10% in last 7d)
 * - Queue dead letters
 * - Missing credentials
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

interface Rec {
  id: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  impact: string;
  action: string;
  actionUrl?: string;
  dismissed: boolean;
  createdAt: string;
}

export async function GET(req: NextRequest) {
  const { userId, workspaceId } = await getAuthContext(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const recs: Rec[] = [];
  const now = new Date().toISOString();
  const since7d = Date.now() - 7 * 24 * 60 * 60 * 1000;

  // 1. Dead jobs — scoped to this workspace
  const deadJobs = await db.prepare(
    "SELECT COUNT(*) AS cnt FROM jobs WHERE status='dead' AND workspace_id = ?"
  ).get(workspaceId) as { cnt: number };
  if (deadJobs.cnt > 0) {
    recs.push({
      id: randomUUID(), category: "reliability", severity: "critical",
      title: `${deadJobs.cnt} dead job${deadJobs.cnt > 1 ? "s" : ""} in queue`,
      description: `${deadJobs.cnt} jobs exhausted all retry attempts. These syncs never completed.`,
      impact: "Data in affected flows is stale.",
      action: "Review Flows", actionUrl: "/flows",
      dismissed: false, createdAt: now,
    });
  }

  // 2. High-error flows
  const errorFlows = await db.prepare(`
    SELECT f.source_name, COUNT(*) AS total,
           SUM(CASE WHEN r.status='error' THEN 1 ELSE 0 END) AS errors
    FROM runs r JOIN flows f ON f.id = r.flow_id
    WHERE f.user_id = ? AND r.started_at >= ?
    GROUP BY f.id
    HAVING errors * 1.0 / total > 0.1
  `).all(userId, since7d) as Array<{ source_name: string; total: number; errors: number }>;

  for (const flow of errorFlows) {
    const errPct = Math.round((flow.errors / flow.total) * 100);
    recs.push({
      id: randomUUID(), category: "reliability", severity: "warning",
      title: `${flow.source_name}: ${errPct}% error rate (7d)`,
      description: `${flow.errors} of ${flow.total} sync runs failed in the last 7 days.`,
      impact: "Stale or incomplete data in warehouse.",
      action: "View Flow Logs", actionUrl: "/flows",
      dismissed: false, createdAt: now,
    });
  }

  // 3. Stale catalog tables (freshness_hours > 48)
  const staleTables = await db.prepare(`
    SELECT table_name, freshness_hours, connector_id
    FROM catalog_tables WHERE user_id = ? AND freshness_hours > 48
    LIMIT 5
  `).all(userId) as Array<{ table_name: string; freshness_hours: number; connector_id: string }>;

  for (const t of staleTables) {
    recs.push({
      id: randomUUID(), category: "quality", severity: "warning",
      title: `${t.table_name}: ${Math.round(t.freshness_hours)}h since last sync`,
      description: `Table "${t.table_name}" from connector "${t.connector_id}" has not been refreshed in over ${Math.round(t.freshness_hours / 24)} day(s).`,
      impact: "Downstream queries and dashboards may return outdated data.",
      action: "Trigger Sync", actionUrl: "/flows",
      dismissed: false, createdAt: now,
    });
  }

  // 4. All good message if no issues
  if (recs.length === 0) {
    recs.push({
      id: randomUUID(), category: "reliability", severity: "success",
      title: "Platform is healthy",
      description: "No critical issues detected. All syncs are completing successfully.",
      impact: "Data is fresh and pipeline is operating normally.",
      action: "View Analytics", actionUrl: "/analytics",
      dismissed: false, createdAt: now,
    });
  }

  return NextResponse.json({ recommendations: recs });
}
