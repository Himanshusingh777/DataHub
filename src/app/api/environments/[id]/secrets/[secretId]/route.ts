import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; secretId: string }> }) {
  const { id, secretId } = await params;
  const { userId, workspaceId } = getAuthContext(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  // Verify environment + secret both belong to this workspace
  db.prepare(
    "DELETE FROM secrets WHERE id = ? AND env_id = ? AND workspace_id = ?"
  ).run(secretId, id, workspaceId);

  return NextResponse.json({ ok: true });
}
