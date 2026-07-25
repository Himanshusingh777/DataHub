import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { getAuthContext } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId, workspaceId } = getAuthContext(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  db.prepare(
    `UPDATE api_keys SET status = 'revoked' WHERE id = ? AND user_id = ? AND workspace_id = ?`
  ).run(params.id, userId, workspaceId);
  return NextResponse.json({ ok: true });
}
