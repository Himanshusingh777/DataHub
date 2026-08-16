/**
 * POST /api/widgets
 *
 * Create a new widget inside a dashboard.
 * A widget MUST reference a saved, published Semantic Model.
 * Both the dashboard and the model must belong to the caller's workspace.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { CHART_TYPE_SET } from "@/lib/models-data";

export const dynamic = "force-dynamic";

// Was previously its own hand-maintained list using entirely different
// names ("column", "grouped_bar", "kpi", "box_plot", "choropleth"...) than
// what components/charts/chart-engine.tsx (the actual renderer) knows how
// to draw — every widget created with most of those values would have hit
// ChartEngine's "Unsupported chart type" fallback. CHART_TYPE_SET is the
// renderer's real vocabulary; validating against it here means what the
// API accepts and what the UI can render are the same 35 types, always.
const VALID_CHART_TYPES = CHART_TYPE_SET;

export async function POST(req: NextRequest) {
  const { userId, workspaceId } = await getAuthContext(req);
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  let body: {
    dashboard_id?: string;
    model_id?: string;
    name?: string;
    chart_type?: string;
    config?: Record<string, unknown>;
    position?: { x: number; y: number; w: number; h: number };
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 }); }

  const { dashboard_id, model_id, name, chart_type = "table", config = {}, position = { x: 0, y: 0, w: 6, h: 4 } } = body;

  if (!dashboard_id) return NextResponse.json({ ok: false, error: "dashboard_id is required" }, { status: 400 });
  if (!model_id)     return NextResponse.json({ ok: false, error: "model_id is required — widgets must be created from a Semantic Model" }, { status: 400 });
  if (!name?.trim()) return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });
  if (!VALID_CHART_TYPES.has(chart_type))
    return NextResponse.json({ ok: false, error: `Unknown chart_type: "${chart_type}"` }, { status: 400 });

  const db = getDb();

  // Verify dashboard belongs to this workspace
  const dashboard = await db.prepare(
    "SELECT id FROM dashboards WHERE id = ? AND workspace_id = ?"
  ).get(dashboard_id, workspaceId);
  if (!dashboard) return NextResponse.json({ ok: false, error: "Dashboard not found" }, { status: 404 });

  // Verify model belongs to this workspace
  const model = await db.prepare(
    "SELECT id, status FROM models WHERE id = ? AND workspace_id = ?"
  ).get(model_id, workspaceId) as { id: string; status: string } | undefined;
  if (!model) return NextResponse.json({ ok: false, error: "Model not found" }, { status: 404 });

  const id  = `wgt_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const now = Date.now();

  await db.prepare(`
    INSERT INTO widgets
      (id, dashboard_id, workspace_id, model_id, name, chart_type, config_json, position_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, dashboard_id, workspaceId, model_id,
    name.trim(), chart_type,
    JSON.stringify(config),
    JSON.stringify(position),
    now, now
  );

  // Touch the dashboard's updated_at
  await db.prepare("UPDATE dashboards SET updated_at = ? WHERE id = ?").run(now, dashboard_id);

  const created = await db.prepare("SELECT * FROM widgets WHERE id = ?").get(id) as Record<string, unknown>;
  return NextResponse.json({
    ok: true,
    widget: {
      ...created,
      config:   config,
      position: position,
    },
  }, { status: 201 });
}
