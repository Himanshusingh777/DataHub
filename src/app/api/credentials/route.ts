/**
 * Credential Vault API.
 * POST { service, data } → encrypts (AES-256-GCM) and stores server-side.
 * GET → list of services with masked previews (never returns secrets).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/server/db";
import { encrypt } from "@/lib/server/crypto";
import { getAuthContext } from "@/lib/server/auth";
import { writeAudit, clientIp } from "@/lib/server/audit";
import { checkRateLimit, rateLimitKey, rateLimitResponse, requestIdentity, RATE_LIMITS } from "@/lib/server/rate-limit";

export async function POST(req: NextRequest) {
  const { userId, workspaceId } = await getAuthContext(req);

  // Credential writes are the single most sensitive action in this app —
  // rate-limited independently of every other route.
  const rl = await checkRateLimit(rateLimitKey(requestIdentity(req, userId), "credentials"), RATE_LIMITS.credentials);
  if (!rl.allowed) {
    const r = rateLimitResponse(rl);
    return NextResponse.json(r.body, { status: r.status, headers: r.headers });
  }

  let body: { service?: string; data?: Record<string, string> };
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }
  const service = (body.service ?? "").trim();
  if (!service || !body.data || typeof body.data !== "object")
    return NextResponse.json({ ok: false, error: "service and data required" }, { status: 400 });

  try {
    // Trim all string values at write time — prevents whitespace typos from
    // reaching BigQuery identifiers (dataset IDs, project IDs, etc.)
    const trimmedData = Object.fromEntries(
      Object.entries(body.data).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v])
    );
    await getDb().prepare(`
      INSERT INTO credentials (user_id, service, data, updated_at, workspace_id) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, service) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
    `).run(userId, service, encrypt(JSON.stringify(trimmedData)), Date.now(), workspaceId);

    // Never log credential VALUES — only that a write happened, to what
    // service, and by whom. The audit trail must not become a second vault.
    await writeAudit({
      workspaceId, userId, action: "credential.write", resource: service,
      ip: clientIp(req), meta: { fields: Object.keys(body.data) },
    });

    return NextResponse.json({ ok: true, service });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e instanceof Error ? e.message : e) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { userId, workspaceId } = await getAuthContext(req);
    const rows = await getDb()
      .prepare("SELECT service, updated_at FROM credentials WHERE user_id = ? AND workspace_id = ?")
      .all(userId, workspaceId) as { service: string; updated_at: number }[];
    return NextResponse.json({ ok: true, credentials: rows });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e instanceof Error ? e.message : e) }, { status: 500 });
  }
}
