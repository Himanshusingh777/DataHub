import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { encrypt, decrypt } from "@/lib/server/crypto";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId, workspaceId } = getAuthContext(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify this environment belongs to the requesting workspace
  const db = getDb();
  const env = db.prepare("SELECT id FROM environments WHERE id = ? AND workspace_id = ?").get(params.id, workspaceId);
  if (!env) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const secrets = db.prepare(`
    SELECT id, key_name AS keyName, env_id AS envId,
           datetime(created_at / 1000, 'unixepoch') AS createdAt
    FROM secrets
    WHERE env_id = ? AND workspace_id = ?
    ORDER BY key_name ASC
  `).all(params.id, workspaceId);

  return NextResponse.json({ secrets });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId, workspaceId } = getAuthContext(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify environment ownership
  const db = getDb();
  const env = db.prepare("SELECT id FROM environments WHERE id = ? AND workspace_id = ?").get(params.id, workspaceId);
  if (!env) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json() as { key?: string; value?: string };
  if (!body.key?.trim())   return NextResponse.json({ error: "key required" },   { status: 400 });
  if (!body.value?.trim()) return NextResponse.json({ error: "value required" }, { status: 400 });

  const id = randomUUID();
  const encrypted = encrypt(body.value);

  db.prepare(`
    INSERT OR REPLACE INTO secrets (id, workspace_id, env_id, key_name, encrypted, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, workspaceId, params.id, body.key.toUpperCase(), encrypted, userId, Date.now());

  const secret = db.prepare(`
    SELECT id, key_name AS keyName, env_id AS envId,
           datetime(created_at / 1000, 'unixepoch') AS createdAt
    FROM secrets WHERE id = ?
  `).get(id);

  return NextResponse.json({ secret });
}
