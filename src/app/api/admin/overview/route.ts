/**
 * Admin Overview API
 *
 * Returns a complete picture of every registered user on the platform:
 * their profile, flows, connectors, run stats, and session activity.
 *
 * Access: only the ADMIN_EMAIL (set in .env.local) can call this endpoint.
 * Falls back to techtraining@frugaltestingid.com if env var is not set.
 *
 * GET /api/admin/overview
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/server/db";
import { getSessionUser } from "@/lib/server/auth";

const ADMIN_EMAILS = (process.env.ADMIN_EMAIL ?? "techtraining@frugaltestingid.com")
  .split(",")
  .map((e) => e.trim().toLowerCase());

export async function GET(req: NextRequest) {
  // ── Auth check: must be a logged-in admin ─────────────────────────────
  const sessionUser = getSessionUser(req);
  if (!sessionUser) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!ADMIN_EMAILS.includes(sessionUser.email.toLowerCase())) {
    return NextResponse.json({ ok: false, error: "Forbidden — admin only" }, { status: 403 });
  }

  try {
    const db = getDb();

    // ── Platform-wide summary ──────────────────────────────────────────
    const totalUsers      = (db.prepare("SELECT COUNT(*) as n FROM users").get() as { n: number }).n;
    const totalFlows      = (db.prepare("SELECT COUNT(*) as n FROM flows").get() as { n: number }).n;
    const totalRuns       = (db.prepare("SELECT COUNT(*) as n FROM runs").get() as { n: number }).n;
    const totalRowsObj    = db.prepare("SELECT SUM(rows) as n FROM runs WHERE status='success'").get() as { n: number | null };
    const totalRows       = totalRowsObj.n ?? 0;
    const activeFlows     = (db.prepare("SELECT COUNT(*) as n FROM flows WHERE status='active'").get() as { n: number }).n;
    // Intelligence Platform counters
    const totalModels     = (db.prepare("SELECT COUNT(*) as n FROM models").get() as { n: number }).n;
    const publishedModels = (db.prepare("SELECT COUNT(*) as n FROM models WHERE status='published'").get() as { n: number }).n;
    const totalDashboards = (db.prepare("SELECT COUNT(*) as n FROM dashboards").get() as { n: number }).n;
    const totalWidgets    = (db.prepare("SELECT COUNT(*) as n FROM widgets").get() as { n: number }).n;
    const totalInsights   = (db.prepare("SELECT COUNT(*) as n FROM bi_insights WHERE dismissed=0").get() as { n: number }).n;

    // ── All users ────────────────────────────────────────────────────────
    const users = db.prepare(
      "SELECT id, email, name, created_at FROM users ORDER BY created_at DESC"
    ).all() as { id: string; email: string; name: string | null; created_at: number }[];

    // ── Per-user enrichment ───────────────────────────────────────────────
    const enriched = users.map((user) => {
      // Flows
      const flows = db.prepare(
        "SELECT id, source_id, source_name, dest_id, dest_name, schedule_value, status, next_run_at, created_at FROM flows WHERE user_id = ? ORDER BY created_at DESC"
      ).all(user.id) as {
        id: string; source_id: string; source_name: string | null;
        dest_id: string; dest_name: string | null; schedule_value: string;
        status: string; next_run_at: number | null; created_at: number;
      }[];

      // Connectors (credentials stored — masked, no secrets)
      const connectors = db.prepare(
        "SELECT service, updated_at FROM credentials WHERE user_id = ? ORDER BY updated_at DESC"
      ).all(user.id) as { service: string; updated_at: number }[];

      // Run stats aggregated
      const runStats = db.prepare(`
        SELECT
          COUNT(*)                                          AS total_runs,
          SUM(CASE WHEN r.status='success' THEN 1 ELSE 0 END) AS success_runs,
          SUM(CASE WHEN r.status='failed'  THEN 1 ELSE 0 END) AS failed_runs,
          SUM(CASE WHEN r.status='success' THEN r.rows ELSE 0 END) AS total_rows,
          MAX(r.started_at)                                 AS last_run_at
        FROM runs r
        JOIN flows f ON r.flow_id = f.id
        WHERE f.user_id = ?
      `).get(user.id) as {
        total_runs: number; success_runs: number; failed_runs: number;
        total_rows: number | null; last_run_at: number | null;
      };

      // Last active (most recent session)
      const lastSession = db.prepare(
        "SELECT expires_at FROM sessions WHERE user_id = ? ORDER BY expires_at DESC LIMIT 1"
      ).get(user.id) as { expires_at: number } | undefined;

      // API keys count
      const apiKeyCount = (db.prepare(
        "SELECT COUNT(*) as n FROM api_keys WHERE user_id = ? AND status='active'"
      ).get(user.id) as { n: number }).n;

      // Intelligence platform counts (per-user workspace)
      const workspace = db.prepare(
        "SELECT id FROM workspaces WHERE owner_id = ? LIMIT 1"
      ).get(user.id) as { id: string } | undefined;
      const wsId = workspace?.id ?? "default";
      const modelCount     = (db.prepare("SELECT COUNT(*) as n FROM models WHERE workspace_id = ?").get(wsId) as { n: number }).n;
      const dashboardCount = (db.prepare("SELECT COUNT(*) as n FROM dashboards WHERE workspace_id = ?").get(wsId) as { n: number }).n;
      const widgetCount    = (db.prepare("SELECT COUNT(*) as n FROM widgets WHERE workspace_id = ?").get(wsId) as { n: number }).n;

      // Recent runs (last 5 across all flows)
      const recentRuns = db.prepare(`
        SELECT r.id, r.status, r.rows, r.duration_ms, r.error, r.started_at,
               f.source_name, f.dest_name
        FROM runs r
        JOIN flows f ON r.flow_id = f.id
        WHERE f.user_id = ?
        ORDER BY r.started_at DESC
        LIMIT 5
      `).all(user.id) as {
        id: string; status: string; rows: number | null; duration_ms: number | null;
        error: string | null; started_at: number;
        source_name: string | null; dest_name: string | null;
      }[];

      // Audit log (last 10 actions)
      const auditLog = db.prepare(
        "SELECT action, resource, ip, created_at FROM audit_log WHERE user_id = ? ORDER BY created_at DESC LIMIT 10"
      ).all(user.id) as { action: string; resource: string | null; ip: string | null; created_at: number }[];

      const successRate = runStats.total_runs > 0
        ? Math.round((runStats.success_runs / runStats.total_runs) * 100)
        : null;

      return {
        id:             user.id,
        email:          user.email,
        name:           user.name,
        joinedAt:       user.created_at,
        lastActiveAt:   lastSession?.expires_at
          ? lastSession.expires_at - 30 * 24 * 60 * 60 * 1000  // approx last login
          : null,
        flowCount:      flows.length,
        activeFlowCount:flows.filter(f => f.status === "active").length,
        connectorCount: connectors.length,
        apiKeyCount,
        modelCount,
        dashboardCount,
        widgetCount,
        runStats: {
          total:       runStats.total_runs ?? 0,
          succeeded:   runStats.success_runs ?? 0,
          failed:      runStats.failed_runs ?? 0,
          totalRows:   runStats.total_rows ?? 0,
          successRate,
          lastRunAt:   runStats.last_run_at,
        },
        flows:       flows,
        connectors:  connectors,
        recentRuns:  recentRuns,
        auditLog:    auditLog,
      };
    });

    // ── Onboarding funnel ─────────────────────────────────────────────────
    // Count users at each stage
    const withFlow      = enriched.filter(u => u.flowCount > 0).length;
    const withConnector = enriched.filter(u => u.connectorCount > 0).length;
    const withRun       = enriched.filter(u => u.runStats.total > 0).length;
    const withSuccess   = enriched.filter(u => u.runStats.succeeded > 0).length;

    // Recent signups (last 7 days)
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentSignups = enriched.filter(u => u.joinedAt >= sevenDaysAgo).length;

    return NextResponse.json({
      ok: true,
      generatedAt: Date.now(),
      summary: {
        totalUsers,
        totalFlows,
        activeFlows,
        totalRuns,
        totalRows,
        totalModels,
        publishedModels,
        totalDashboards,
        totalWidgets,
        totalInsights,
        recentSignups,
        onboarding: {
          registered:   totalUsers,
          createdFlow:  withFlow,
          addedConnector: withConnector,
          ranFirstSync: withRun,
          succeededSync: withSuccess,
        },
      },
      users: enriched,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
