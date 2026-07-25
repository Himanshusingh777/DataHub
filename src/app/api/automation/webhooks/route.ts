import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { encrypt } from "@/lib/server/crypto";
import { randomUUID, randomBytes } from "crypto";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { userId, workspaceId } = getAuthContext(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const webhooks = db.prepare(`
    SELECT id, name, url, events, status,
           datetime(last_fired_at / 1000, 'unixepoch') AS lastFiredAt,
           last_status AS lastStatus,
           datetime(created_at / 1000, 'unixepoch') AS createdAt
    FROM webhooks
    WHERE user_id = ? AND workspace_id = ?
    ORDER BY created_at DESC
  `).all(userId, workspaceId);

  return NextResponse.json({
    webhooks: (webhooks as Array<Record<string, unknown>>).map(w => ({
      ...w,
      events: JSON.parse(w.events as string),
    })),
  });
}

export async function POST(req: NextRequest) {
  const { userId, workspaceId } = getAuthContext(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { name?: string; url?: string; events?: string[] };
  if (!body.name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (!body.url?.trim())  return NextResponse.json({ error: "url required" },  { status: 400 });

  const db = getDb();
  const id = randomUUID();
  const secret = randomBytes(32).toString("hex");
  const encryptedSecret = encrypt(secret);

  db.prepare(`
    INSERT INTO webhooks (id, user_id, workspace_id, name, url, events, secret, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)
  `).run(id, userId, workspaceId, body.name.trim(), body.url.trim(), JSON.stringify(body.events ?? []), encryptedSecret, Date.now());

  const webhook = db.prepare("SELECT id, name, url, events, status, created_at FROM webhooks WHERE id = ?").get(id) as Record<string, unknown>;
  return NextResponse.json({
    webhook: { ...webhook, events: JSON.parse(webhook.events as string), lastFiredAt: null, lastStatus: null },
  });
}
