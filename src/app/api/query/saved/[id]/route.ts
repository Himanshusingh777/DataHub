import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/server/auth-utils";
import { getDb } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId, workspaceId } = getAuthContext(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const row = db.prepare("SELECT id FROM saved_queries WHERE id = ? AND user_id = ? AND workspace_id = ?").get(id, userId, workspaceId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  db.prepare("DELETE FROM saved_queries WHERE id = ? AND workspace_id = ?").run(id, workspaceId);
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId, workspaceId } = getAuthContext(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { name?: string; description?: string; sql?: string };
  const db = getDb();
  const row = db.prepare("SELECT id FROM saved_queries WHERE id = ? AND user_id = ? AND workspace_id = ?").get(id, userId, workspaceId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  db.prepare(`
    UPDATE saved_queries SET name=COALESCE(?,name), description=COALESCE(?,description),
    sql=COALESCE(?,sql), updated_at=? WHERE id=? AND workspace_id=?
  `).run(body.name ?? null, body.description ?? null, body.sql ?? null, Date.now(), id, workspaceId);

  return NextResponse.json({ ok: true });
}
