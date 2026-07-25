/**
 * GET /api/dashboards/shared/[token]
 *
 * Public endpoint — no authentication required.
 * Returns a published dashboard and its widgets for the share link view.
 * Widgets reference models but NO model SQL is returned (security).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token) return NextResponse.json({ ok: false, error: "Token required" }, { status: 400 });

  const db = getDb();

  const dashboard = db.prepare(
    "SELECT id, name, description, theme, is_published, created_at, updated_at FROM dashboards WHERE share_token = ? AND is_published = 1"
  ).get(token) as { id: string; name: string; description: string | null; theme: string; is_published: number; created_at: number; updated_at: number } | undefined;

  if (!dashboard) return NextResponse.json({ ok: false, error: "Dashboard not found or not published" }, { status: 404 });

  // Return widgets — workspace_id is not leaked
  const widgets = db.prepare(`
    SELECT w.id, w.name, w.chart_type, w.config_json, w.position_json,
           m.name as model_name
    FROM widgets w
    JOIN models m ON m.id = w.model_id
    WHERE w.dashboard_id = ?
    ORDER BY w.created_at ASC
  `).all(dashboard.id) as Array<{
    id: string; name: string; chart_type: string;
    config_json: string; position_json: string; model_name: string;
  }>;

  return NextResponse.json({
    ok: true,
    dashboard: {
      ...dashboard,
      is_published: Boolean(dashboard.is_published),
    },
    widgets: widgets.map((w) => ({
      ...w,
      config:   (() => { try { return JSON.parse(w.config_json);   } catch { return {}; } })(),
      position: (() => { try { return JSON.parse(w.position_json); } catch { return {}; } })(),
    })),
  });
}
