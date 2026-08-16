import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { syncModelFromSavedQuery } from "@/lib/server/models-sync";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { userId, workspaceId } = getAuthContext(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const queries = db.prepare(`
    SELECT id, name, description, sql, tags,
           datetime(created_at / 1000, 'unixepoch') AS createdAt,
           datetime(updated_at / 1000, 'unixepoch') AS updatedAt
    FROM saved_queries
    WHERE user_id = ? AND workspace_id = ?
    ORDER BY updated_at DESC
    LIMIT 100
  `).all(userId, workspaceId);

  return NextResponse.json({ queries });
}

export async function POST(req: NextRequest) {
  const { userId, workspaceId } = getAuthContext(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { name?: string; description?: string; sql?: string; tags?: string[] };
  if (!body.name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (!body.sql?.trim())  return NextResponse.json({ error: "sql is required" },  { status: 400 });

  const db = getDb();
  const id = randomUUID();
  const now = Date.now();

  db.prepare(`
    INSERT INTO saved_queries (id, user_id, workspace_id, name, description, sql, tags, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, workspaceId, body.name.trim(), body.description ?? null, body.sql.trim(), JSON.stringify(body.tags ?? []), now, now);

  // Every saved query is also kept as a Semantic Model, so it's immediately
  // usable on dashboards without a separate "create model" step.
  syncModelFromSavedQuery({
    db, workspaceId, userId, savedQueryId: id,
    name: body.name.trim(), description: body.description ?? null, sql: body.sql.trim(),
  });

  const query = db.prepare("SELECT * FROM saved_queries WHERE id = ?").get(id);
  return NextResponse.json({ query });
}
