import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId, workspaceId } = getAuthContext(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { enabled?: boolean };
  const db = getDb();
  if (typeof body.enabled === "boolean") {
    db.prepare(
      "UPDATE automations SET enabled = ? WHERE id = ? AND user_id = ? AND workspace_id = ?"
    ).run(body.enabled ? 1 : 0, id, userId, workspaceId);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId, workspaceId } = getAuthContext(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  db.prepare(
    "DELETE FROM automations WHERE id = ? AND user_id = ? AND workspace_id = ?"
  ).run(id, userId, workspaceId);
  return NextResponse.json({ ok: true });
}
