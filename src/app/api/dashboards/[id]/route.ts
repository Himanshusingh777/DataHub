/**
 * GET    /api/dashboards/[id]  — fetch dashboard + all widgets
 * PUT    /api/dashboards/[id]  — update dashboard metadata / grid layout
 * DELETE /api/dashboards/[id]  — delete dashboard + all its widgets
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";

export const dynamic = "force-dynamic";

interface DashboardRow {
  id: string; workspace_id: string; user_id: string;
  name: string; description: string | null; layout_json: string;
  theme: string; share_token: string | null; is_published: number;
  created_at: number; updated_at: number;
}

interface WidgetRow {
  id: string; dashboard_id: string; workspace_id: string; model_id: string;
  name: string; chart_type: string; config_json: string; position_json: string;
  created_at: number; updated_at: number;
}

function parseDashboard(d: DashboardRow, widgets: WidgetRow[]) {
  return {
    ...d,
    layout:     (() => { try { return JSON.parse(d.layout_json);  } catch { return []; } })(),
    is_published: Boolean(d.is_published),
    widgets: widgets.map((w) => ({
      ...w,
      config:   (() => { try { return JSON.parse(w.config_json);   } catch { return {}; } })(),
      position: (() => { try { return JSON.parse(w.position_json); } catch { return {}; } })(),
    })),
  };
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, workspaceId } = await getAuthContext(req);
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getDb();

  const dashboard = await db.prepare(
    "SELECT * FROM dashboards WHERE id = ? AND workspace_id = ?"
  ).get(id, workspaceId) as DashboardRow | undefined;

  if (!dashboard) return NextResponse.json({ ok: false, error: "Dashboard not found" }, { status: 404 });

  const widgets = await db.prepare(
    "SELECT * FROM widgets WHERE dashboard_id = ? AND workspace_id = ? ORDER BY created_at ASC"
  ).all(id, workspaceId) as WidgetRow[];

  return NextResponse.json({ ok: true, dashboard: parseDashboard(dashboard, widgets) });
}

// ── PUT ───────────────────────────────────────────────────────────────────────

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, workspaceId } = await getAuthContext(req);
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getDb();

  const existing = await db.prepare(
    "SELECT id FROM dashboards WHERE id = ? AND workspace_id = ?"
  ).get(id, workspaceId);
  if (!existing) return NextResponse.json({ ok: false, error: "Dashboard not found" }, { status: 404 });

  let body: {
    name?: string; description?: string; theme?: string;
    layout?: unknown[]; is_published?: boolean;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 }); }

  const now = Date.now();
  await db.prepare(`
    UPDATE dashboards SET
      name         = COALESCE(?, name),
      description  = CASE WHEN ? IS NOT NULL THEN ? ELSE description END,
      theme        = COALESCE(?, theme),
      layout_json  = COALESCE(?, layout_json),
      is_published = COALESCE(?, is_published),
      updated_at   = ?
    WHERE id = ? AND workspace_id = ?
  `).run(
    body.name?.trim() ?? null,
    body.description !== undefined ? body.description : null,
    body.description !== undefined ? body.description : null,
    body.theme ?? null,
    body.layout !== undefined ? JSON.stringify(body.layout) : null,
    body.is_published !== undefined ? (body.is_published ? 1 : 0) : null,
    now,
    id, workspaceId
  );

  const updated   = await db.prepare("SELECT * FROM dashboards WHERE id = ?").get(id) as DashboardRow;
  const widgets   = await db.prepare(
    "SELECT * FROM widgets WHERE dashboard_id = ? AND workspace_id = ? ORDER BY created_at ASC"
  ).all(id, workspaceId) as WidgetRow[];

  return NextResponse.json({ ok: true, dashboard: parseDashboard(updated, widgets) });
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, workspaceId } = await getAuthContext(req);
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getDb();

  const existing = await db.prepare(
    "SELECT id FROM dashboards WHERE id = ? AND workspace_id = ?"
  ).get(id, workspaceId);
  if (!existing) return NextResponse.json({ ok: false, error: "Dashboard not found" }, { status: 404 });

  // Cascade delete widgets first
  await db.prepare("DELETE FROM widgets WHERE dashboard_id = ? AND workspace_id = ?").run(id, workspaceId);
  await db.prepare("DELETE FROM dashboards WHERE id = ? AND workspace_id = ?").run(id, workspaceId);

  return NextResponse.json({ ok: true });
}
