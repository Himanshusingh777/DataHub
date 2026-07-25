import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { userId, workspaceId } = getAuthContext(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const history = db.prepare(`
    SELECT id, sql, status, rows_returned AS rowsReturned,
           bytes_processed AS bytesProcessed, duration_ms AS durationMs, error,
           datetime(created_at / 1000, 'unixepoch') AS createdAt
    FROM query_history
    WHERE user_id = ? AND workspace_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `).all(userId, workspaceId);

  return NextResponse.json({ history });
}

export async function DELETE(req: NextRequest) {
  const { userId, workspaceId } = getAuthContext(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  db.prepare("DELETE FROM query_history WHERE user_id = ? AND workspace_id = ?").run(userId, workspaceId);
  return NextResponse.json({ ok: true });
}
