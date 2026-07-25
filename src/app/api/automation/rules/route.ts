import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { userId, workspaceId } = getAuthContext(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const rules = db.prepare(`
    SELECT id, name, trigger_type AS triggerType, action_type AS actionType, enabled,
           datetime(created_at / 1000, 'unixepoch') AS createdAt
    FROM automations WHERE user_id = ? AND workspace_id = ? ORDER BY created_at DESC
  `).all(userId, workspaceId);

  return NextResponse.json({ rules });
}

export async function POST(req: NextRequest) {
  const { userId, workspaceId } = getAuthContext(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { name?: string; triggerType?: string; actionType?: string };
  if (!body.name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });

  const db = getDb();
  const id = randomUUID();
  db.prepare(`
    INSERT INTO automations (id, user_id, workspace_id, name, trigger_type, action_type, enabled, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?)
  `).run(id, userId, workspaceId, body.name.trim(), body.triggerType ?? "on_failure", body.actionType ?? "retry", Date.now());

  const rule = db.prepare(`
    SELECT id, name, trigger_type AS triggerType, action_type AS actionType, enabled,
           datetime(created_at / 1000, 'unixepoch') AS createdAt
    FROM automations WHERE id = ?
  `).get(id);

  return NextResponse.json({ rule });
}
