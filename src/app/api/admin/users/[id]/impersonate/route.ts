/**
 * POST /api/admin/users/[id]/impersonate
 *
 * Lets the admin "become" a client temporarily.
 * - Saves the admin's original session token in a separate cookie (ct_admin_session)
 * - Sets ct_session to the client's session
 * - A banner in the UI shows "Working as [client]" with an Exit button
 *
 * DELETE /api/admin/users/[id]/impersonate  (or POST /api/admin/impersonate/exit)
 * - Restores the admin's original session
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/server/db";
import { getSessionUser, SESSION_COOKIE, createSession } from "@/lib/server/auth";
import { writeAudit, clientIp } from "@/lib/server/audit";

export const ADMIN_SESSION_COOKIE = "ct_admin_session"; // stores original admin token during impersonation

const ADMIN_EMAILS = (process.env.ADMIN_EMAIL ?? "singhhimanshu3306@gmail.com")
  .split(",").map((e) => e.trim().toLowerCase());

// ── POST — start impersonation ────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = getSessionUser(req);
  if (!admin || !ADMIN_EMAILS.includes(admin.email.toLowerCase()))
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const { id } = params;
  const db = getDb();

  const target = db.prepare("SELECT id, email, name, status FROM users WHERE id=?").get(id) as
    { id: string; email: string; name: string | null; status: string } | undefined;

  if (!target)
    return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });

  if (target.status === "suspended")
    return NextResponse.json({ ok: false, error: "Cannot impersonate a suspended user" }, { status: 400 });

  if (target.id === admin.id)
    return NextResponse.json({ ok: false, error: "Cannot impersonate yourself" }, { status: 400 });

  // Create a fresh short-lived session for the target user (4 hours)
  const { token: clientToken, expiresAt } = createSession(target.id);

  // The admin's CURRENT session token (to restore later)
  const adminToken = req.cookies.get(SESSION_COOKIE)?.value ?? "";

  writeAudit({
    userId: admin.id,
    action: "admin.impersonate_start",
    resource: target.email,
    ip: clientIp(req),
  });

  const res = NextResponse.json({
    ok: true,
    impersonating: { id: target.id, email: target.email, name: target.name },
  });

  // Switch main session to client
  res.cookies.set(SESSION_COOKIE, clientToken, {
    httpOnly: true, sameSite: "lax", path: "/",
    expires: new Date(expiresAt),
    secure: process.env.NODE_ENV === "production",
  });

  // Stash admin token so we can restore it on exit (httpOnly — secure)
  res.cookies.set(ADMIN_SESSION_COOKIE, adminToken, {
    httpOnly: true, sameSite: "lax", path: "/",
    maxAge: 4 * 60 * 60,
    secure: process.env.NODE_ENV === "production",
  });

  // Non-httpOnly display cookie — just email/name for the banner UI, no secret
  res.cookies.set(
    "ct_impersonating",
    encodeURIComponent(JSON.stringify({ email: target.email, name: target.name })),
    { sameSite: "lax", path: "/", maxAge: 4 * 60 * 60, httpOnly: false }
  );

  return res;
}
