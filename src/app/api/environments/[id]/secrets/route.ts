import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { encrypt } from "@/lib/server/crypto";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: envId } = await params;
  const { userId, workspaceId } = await getAuthContext(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify this environment belongs to the requesting workspace
  const db = getDb();
  const env = await db.prepare("SELECT id FROM environments WHERE id = ? AND workspace_id = ?").get(envId, workspaceId);
  if (!env) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const secrets = await db.prepare(`
    SELECT id, key_name AS "keyName", env_id AS "envId",
           to_timestamp(created_at / 1000.0) AS "createdAt"
    FROM secrets
    WHERE env_id = ? AND workspace_id = ?
    ORDER BY key_name ASC
  `).all(envId, workspaceId);

  return NextResponse.json({ secrets });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: envId } = await params;
  const { userId, workspaceId } = await getAuthContext(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify environment ownership
  const db = getDb();
  const env = await db.prepare("SELECT id FROM environments WHERE id = ? AND workspace_id = ?").get(envId, workspaceId);
  if (!env) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json() as { key?: string; value?: string };
  if (!body.key?.trim())   return NextResponse.json({ error: "key required" },   { status: 400 });
  if (!body.value?.trim()) return NextResponse.json({ error: "value required" }, { status: 400 });

  const id = randomUUID();
  const encrypted = encrypt(body.value);

  // secrets has UNIQUE(workspace_id, env_id, key_name) — matches SQLite's
  // INSERT OR REPLACE (full row replace, id included) for that triple.
  await db.prepare(`
    INSERT INTO secrets (id, workspace_id, env_id, key_name, encrypted, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (workspace_id, env_id, key_name) DO UPDATE SET
      id = excluded.id, encrypted = excluded.encrypted, created_by = excluded.created_by, created_at = excluded.created_at
  `).run(id, workspaceId, envId, body.key.toUpperCase(), encrypted, userId, Date.now());

  const secret = await db.prepare(`
    SELECT id, key_name AS "keyName", env_id AS "envId",
           to_timestamp(created_at / 1000.0) AS "createdAt"
    FROM secrets WHERE id = ?
  `).get(id);

  return NextResponse.json({ secret });
}
