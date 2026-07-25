import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getDb } from "@/lib/server/db";
import { getAuthContext } from "@/lib/server/auth";
import { hashApiKey } from "@/lib/server/crypto";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { userId, workspaceId } = getAuthContext(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const keys = db.prepare(
    `SELECT id, name, prefix, scopes, status, created_at, last_used_at
     FROM api_keys
     WHERE user_id = ? AND workspace_id = ? AND status = 'active'
     ORDER BY created_at DESC`
  ).all(userId, workspaceId) as Array<{
    id: string; name: string; prefix: string; scopes: string;
    status: string; created_at: string; last_used_at: string | null;
  }>;

  return NextResponse.json({
    keys: keys.map(k => ({
      ...k,
      scopes: JSON.parse(k.scopes ?? '["read"]'),
      createdAt: k.created_at,
      lastUsedAt: k.last_used_at,
    })),
  });
}

export async function POST(req: NextRequest) {
  const { userId, workspaceId } = getAuthContext(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { name?: string; scopes?: string[] };
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const rawKey = `ct_live_${randomBytes(24).toString("hex")}`;
  const prefix = rawKey.slice(0, 16);
  const id = randomBytes(8).toString("hex");
  const scopes = body.scopes ?? ["read"];
  const now = new Date().toISOString();

  const keyHash = hashApiKey(rawKey);

  const db = getDb();
  db.prepare(
    `INSERT INTO api_keys (id, user_id, workspace_id, name, prefix, key_hash, scopes, status, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(id, userId, workspaceId, name, prefix, keyHash, JSON.stringify(scopes), "active", now);

  return NextResponse.json({
    key: { id, name, prefix, scopes, status: "active", createdAt: now, lastUsedAt: null },
    plaintext: rawKey,
  });
}
