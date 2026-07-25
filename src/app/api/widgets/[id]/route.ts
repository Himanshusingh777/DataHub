/**
 * PUT    /api/widgets/[id]  — update widget config, chart type, or position
 * DELETE /api/widgets/[id]  — remove widget from dashboard
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, workspaceId } = getAuthContext(req);
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getDb();

  const existing = db.prepare(
    "SELECT id, dashboard_id FROM widgets WHERE id = ? AND workspace_id = ?"
  ).get(id, workspaceId) as { id: string; dashboard_id: string } | undefined;
  if (!existing) return NextResponse.json({ ok: false, error: "Widget not found" }, { status: 404 });

  let body: {
    name?: string; chart_type?: string;
    config?: Record<string, unknown>;
    position?: { x: number; y: number; w: number; h: number };
    model_id?: string;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 }); }

  // If model_id is being changed, verify it belongs to this workspace
  if (body.model_id) {
    const model = db.prepare(
      "SELECT id FROM models WHERE id = ? AND workspace_id = ?"
    ).get(body.model_id, workspaceId);
    if (!model) return NextResponse.json({ ok: false, error: "Model not found" }, { status: 404 });
  }

  const now = Date.now();
  db.prepare(`
    UPDATE widgets SET
      name          = COALESCE(?, name),
      chart_type    = COALESCE(?, chart_type),
      config_json   = COALESCE(?, config_json),
      position_json = COALESCE(?, position_json),
      model_id      = COALESCE(?, model_id),
      updated_at    = ?
    WHERE id = ? AND workspace_id = ?
  `).run(
    body.name?.trim() ?? null,
    body.chart_type ?? null,
    body.config   !== undefined ? JSON.stringify(body.config)   : null,
    body.position !== undefined ? JSON.stringify(body.position) : null,
    body.model_id ?? null,
    now,
    id, workspaceId
  );

  // Touch dashboard
  db.prepare("UPDATE dashboards SET updated_at = ? WHERE id = ?").run(now, existing.dashboard_id);

  const updated = db.prepare("SELECT * FROM widgets WHERE id = ?").get(id) as Record<string, unknown>;
  return NextResponse.json({ ok: true, widget: updated });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, workspaceId } = getAuthContext(req);
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getDb();

  const existing = db.prepare(
    "SELECT id, dashboard_id FROM widgets WHERE id = ? AND workspace_id = ?"
  ).get(id, workspaceId) as { id: string; dashboard_id: string } | undefined;
  if (!existing) return NextResponse.json({ ok: false, error: "Widget not found" }, { status: 404 });

  db.prepare("DELETE FROM widgets WHERE id = ? AND workspace_id = ?").run(id, workspaceId);
  db.prepare("UPDATE dashboards SET updated_at = ? WHERE id = ?").run(Date.now(), existing.dashboard_id);

  return NextResponse.json({ ok: true });
}
