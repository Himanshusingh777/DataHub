import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/server/auth-utils";
import { getDb } from "@/lib/server/db";
import { syncModelFromSavedQuery } from "@/lib/server/models-sync";

export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId, workspaceId } = await getAuthContext(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const row = await db.prepare("SELECT id FROM saved_queries WHERE id = ? AND user_id = ? AND workspace_id = ?").get(id, userId, workspaceId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.prepare("DELETE FROM saved_queries WHERE id = ? AND workspace_id = ?").run(id, workspaceId);
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId, workspaceId } = await getAuthContext(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { name?: string; description?: string; sql?: string };
  const db = getDb();
  const row = await db.prepare("SELECT id FROM saved_queries WHERE id = ? AND user_id = ? AND workspace_id = ?").get(id, userId, workspaceId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.prepare(`
    UPDATE saved_queries SET name=COALESCE(?,name), description=COALESCE(?,description),
    sql=COALESCE(?,sql), updated_at=? WHERE id=? AND workspace_id=?
  `).run(body.name ?? null, body.description ?? null, body.sql ?? null, Date.now(), id, workspaceId);

  const updated = await db.prepare("SELECT name, description, sql FROM saved_queries WHERE id = ?").get(id) as
    { name: string; description: string | null; sql: string };
  await syncModelFromSavedQuery({
    db, workspaceId, userId, savedQueryId: id,
    name: updated.name, description: updated.description, sql: updated.sql,
  });

  return NextResponse.json({ ok: true });
}
