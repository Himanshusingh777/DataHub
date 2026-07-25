import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId, workspaceId } = getAuthContext(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { status?: string; events?: string[] };
  const db = getDb();
  const row = db.prepare(
    "SELECT id FROM webhooks WHERE id = ? AND user_id = ? AND workspace_id = ?"
  ).get(id, userId, workspaceId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.status) db.prepare("UPDATE webhooks SET status = ? WHERE id = ?").run(body.status, id);
  if (body.events) db.prepare("UPDATE webhooks SET events = ? WHERE id = ?").run(JSON.stringify(body.events), id);

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId, workspaceId } = getAuthContext(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  db.prepare(
    "DELETE FROM webhooks WHERE id = ? AND user_id = ? AND workspace_id = ?"
  ).run(id, userId, workspaceId);
  return NextResponse.json({ ok: true });
}
