import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/server/db";
import { verifyPassword } from "@/lib/server/crypto";
import { createSession, SESSION_COOKIE } from "@/lib/server/auth";
import { writeAudit, clientIp } from "@/lib/server/audit";
import { ensureUserWorkspace } from "@/lib/server/workspace";
import { checkRateLimit, rateLimitKey, rateLimitResponse, requestIdentity, RATE_LIMITS } from "@/lib/server/rate-limit";

export async function POST(req: NextRequest) {
  // Rate-limited by IP (not by the attempted email) so an attacker can't
  // dodge the limit by trying many accounts, and a genuine user typing their
  // own password wrong a few times doesn't get anyone else locked out.
  const rl = checkRateLimit(rateLimitKey(requestIdentity(req), "auth.login"), RATE_LIMITS.auth);
  if (!rl.allowed) {
    const r = rateLimitResponse(rl);
    return NextResponse.json(r.body, { status: r.status, headers: r.headers });
  }

  let body: { email?: string; password?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }
  const email = (body.email ?? "").trim().toLowerCase();

  try {
    const db = getDb();
    const user = db.prepare("SELECT id, email, name, pass_hash FROM users WHERE email = ?").get(email) as
      | { id: string; email: string; name: string | null; pass_hash: string } | undefined;
    if (!user || !verifyPassword(body.password ?? "", user.pass_hash)) {
      writeAudit({ action: "auth.login_failed", resource: email || "(empty)", ip: clientIp(req) });
      return NextResponse.json({ ok: false, error: "Invalid email or password" }, { status: 401 });
    }

    // Ensure every user has a personal workspace — idempotent, fast-paths if already exists.
    // This handles accounts created before workspace provisioning was added.
    ensureUserWorkspace(user.id, user.name ?? user.email.split("@")[0]);

    writeAudit({ userId: user.id, action: "auth.login", resource: user.id, ip: clientIp(req) });
    const { token, expiresAt } = createSession(user.id);
    const res = NextResponse.json({ ok: true, user: { id: user.id, email: user.email, name: user.name } });
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
