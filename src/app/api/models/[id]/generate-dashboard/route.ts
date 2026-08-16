/**
 * POST /api/models/[id]/generate-dashboard
 *
 * Step 2 of "✨ Generate AI Dashboard": create a Dashboard from the widget
 * candidates the user picked in the preview/selection UI (see
 * /api/models/[id]/generate-dashboard/preview, which produces the full
 * candidate list — this route never generates candidates itself, it only
 * lays out and persists whichever subset the client sends back).
 *
 * Body: { candidates: WidgetCandidate[] } — each candidate is echoed back
 * verbatim from the preview response, so no re-analysis or BigQuery call
 * is needed here; this route is pure DB writes.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { writeAudit, clientIp } from "@/lib/server/audit";
import { checkRateLimit, RATE_LIMITS, rateLimitKey, rateLimitResponse, requestIdentity } from "@/lib/server/rate-limit";
import { layoutCandidates, type WidgetCandidate } from "@/lib/bi/ai-dashboard-generator";
import { CHART_TYPE_SET } from "@/lib/models-data";

export const dynamic = "force-dynamic";

const VALID_CATEGORIES = new Set(["kpi", "trend", "chart", "table"]);

function isValidCandidate(c: unknown): c is WidgetCandidate {
  if (!c || typeof c !== "object") return false;
  const cand = c as Record<string, unknown>;
  return (
    typeof cand.name === "string" && cand.name.trim().length > 0 &&
    typeof cand.chart_type === "string" && CHART_TYPE_SET.has(cand.chart_type) &&
    typeof cand.category === "string" && VALID_CATEGORIES.has(cand.category) &&
    typeof cand.config === "object" && cand.config !== null
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, workspaceId } = getAuthContext(req);
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const identity = requestIdentity(req, userId);
  const rl = checkRateLimit(rateLimitKey(identity, "ai-dashboard-generate"), RATE_LIMITS.warehouse);
  if (!rl.allowed) {
    const r = rateLimitResponse(rl);
    return NextResponse.json(r.body, { status: r.status, headers: r.headers });
  }

  const { id } = await params;
  const db = getDb();

  const model = db.prepare(
    "SELECT id, name FROM models WHERE id = ? AND workspace_id = ?"
  ).get(id, workspaceId) as { id: string; name: string } | undefined;
  if (!model) return NextResponse.json({ ok: false, error: "Model not found" }, { status: 404 });

  let body: { candidates?: unknown[] };
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 }); }

  const rawCandidates = Array.isArray(body.candidates) ? body.candidates : [];
  const candidates = rawCandidates.filter(isValidCandidate);
  if (candidates.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Select at least one chart to add to the dashboard." },
      { status: 400 }
    );
  }

  const widgetSpecs = layoutCandidates(candidates);

  const now          = Date.now();
  const dashboardId  = `dsh_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const dashboardName = `${model.name} — AI Dashboard`;

  const insertAll = db.transaction(() => {
    db.prepare(`
      INSERT INTO dashboards (id, workspace_id, user_id, name, description, theme, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      dashboardId, workspaceId, userId, dashboardName,
      `Auto-generated from "${model.name}" by the AI Dashboard Generator.`,
      "light", now, now
    );

    for (const spec of widgetSpecs) {
      const widgetId = `wgt_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
      db.prepare(`
        INSERT INTO widgets
          (id, dashboard_id, workspace_id, model_id, name, chart_type, config_json, position_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        widgetId, dashboardId, workspaceId, model.id,
        spec.name, spec.chart_type,
        JSON.stringify(spec.config),
        JSON.stringify(spec.position),
        now, now
      );
    }
  });
  insertAll();

  writeAudit({
    workspaceId, userId, action: "dashboard.ai_generated", resource: dashboardId,
    meta: { modelId: model.id, modelName: model.name, widgetCount: widgetSpecs.length },
    ip: clientIp(req),
  });

  return NextResponse.json({
    ok: true,
    dashboard:   { id: dashboardId, name: dashboardName },
    widgetCount: widgetSpecs.length,
  }, { status: 201 });
}
