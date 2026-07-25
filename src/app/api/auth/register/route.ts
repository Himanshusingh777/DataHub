import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/server/db";
import { hashPassword, genId } from "@/lib/server/crypto";
import { createSession, SESSION_COOKIE } from "@/lib/server/auth";
import { writeAudit, clientIp } from "@/lib/server/audit";
import { ensureUserWorkspace } from "@/lib/server/workspace";
import { checkRateLimit, rateLimitKey, rateLimitResponse, requestIdentity, RATE_LIMITS } from "@/lib/server/rate-limit";

export async function POST(req: NextRequest) {
  const rl = checkRateLimit(rateLimitKey(requestIdentity(req), "auth.register"), RATE_LIMITS.auth);
  if (!rl.allowed) {
    const r = rateLimitResponse(rl);
    return NextResponse.json(r.body, { status: r.status, headers: r.headers });
  }

  let body: { email?: string; password?: string; name?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return NextResponse.json({ ok: false, error: "Valid email required" }, { status: 400 });
  if (password.length < 6)
    return NextResponse.json({ ok: false, error: "Password must be at least 6 characters" }, { status: 400 });

  try {
    const db = getDb();
    const exists = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (exists) return NextResponse.json({ ok: false, error: "An account with this email already exists" }, { status: 409 });

    const id = genId("usr");
    db.prepare("INSERT INTO users (id, email, name, pass_hash, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, email, body.name?.trim() ?? null, hashPassword(password), Date.now());

    // Auto-provision a personal workspace so every user has strict data isolation
    // from the very first request (never falls back to the shared "default" workspace).
    const userName = (body.name?.trim() ?? email.split("@")[0]);
    ensureUserWorkspace(id, `${userName}'s Workspace`);

    writeAudit({ userId: id, action: "auth.register", resource: id, ip: clientIp(req) });
    const { token, expiresAt } = createSession(id);
    const res = NextResponse.json({ ok: true, user: { id, email, name: body.name ?? null } });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true, sameSite: "lax", path: "/",
      expires: new Date(expiresAt),
      secure: process.env.NODE_ENV === "production",
    });
    return res;
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e instanceof Error ? e.message : e) }, { status: 500 });
  }
}
