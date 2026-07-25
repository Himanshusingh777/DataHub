/**
 * POST /api/dashboards/[id]/share
 *
 * Generate (or revoke) a public share token for a dashboard.
 * Body: { action: "generate" | "revoke" }
 *
 * Share tokens are UUIDs — not sequential, not guessable.
 * Anyone with the token can view the dashboard (read-only, live data).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, workspaceId } = getAuthContext(req);
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getDb();

  const dashboard = db.prepare(
    "SELECT id, share_token FROM dashboards WHERE id = ? AND workspace_id = ?"
  ).get(id, workspaceId) as { id: string; share_token: string | null } | undefined;

  if (!dashboard) return NextResponse.json({ ok: false, error: "Dashboard not found" }, { status: 404 });

  let body: { action?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 }); }

  const action = body.action ?? "generate";

  if (action === "revoke") {
    db.prepare("UPDATE dashboards SET share_token = NULL, is_published = 0, updated_at = ? WHERE id = ?")
      .run(Date.now(), id);
    return NextResponse.json({ ok: true, shareToken: null });
  }

  // Generate fresh token
  const token = crypto.randomUUID();
  db.prepare("UPDATE dashboards SET share_token = ?, is_published = 1, updated_at = ? WHERE id = ?")
    .run(token, Date.now(), id);

  return NextResponse.json({ ok: true, shareToken: token });
}
