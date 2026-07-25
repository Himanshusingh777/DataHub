/**
 * GET  /api/dashboards  — list workspace dashboards (with widget count)
 * POST /api/dashboards  — create a new dashboard
 *
 * Dashboards are strictly workspace-scoped. A user can only see dashboards
 * that belong to their own workspace.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { userId, workspaceId } = getAuthContext(req);
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = getDb();

  const dashboards = db.prepare(`
    SELECT
      d.*,
      COUNT(w.id) as widget_count
    FROM dashboards d
    LEFT JOIN widgets w ON w.dashboard_id = d.id
    WHERE d.workspace_id = ?
    GROUP BY d.id
    ORDER BY d.updated_at DESC
  `).all(workspaceId) as Array<Record<string, unknown>>;

  return NextResponse.json({ ok: true, dashboards });
}

export async function POST(req: NextRequest) {
  const { userId, workspaceId } = getAuthContext(req);
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  let body: { name?: string; description?: string; theme?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 }); }

  const { name, description, theme = "light" } = body;
  if (!name?.trim())
    return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });

  const id  = `dsh_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const now = Date.now();

  const db = getDb();
  db.prepare(`
    INSERT INTO dashboards (id, workspace_id, user_id, name, description, theme, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, workspaceId, userId, name.trim(), description ?? null, theme, now, now);

  const created = db.prepare("SELECT * FROM dashboards WHERE id = ?").get(id);
  return NextResponse.json({ ok: true, dashboard: created }, { status: 201 });
}
