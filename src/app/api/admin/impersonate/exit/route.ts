/**
 * POST /api/admin/impersonate/exit
 *
 * Restores the admin's original session cookie from the stashed ct_admin_session.
 * Also deletes the temporary client session that was created during impersonation.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { writeAudit, clientIp } from "@/lib/server/audit";

const ADMIN_SESSION_COOKIE = "ct_admin_session";

export async function POST(req: NextRequest) {
  const adminToken  = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const clientToken = req.cookies.get(SESSION_COOKIE)?.value;

  if (!adminToken)
    return NextResponse.json({ ok: false, error: "No impersonation session found" }, { status: 400 });

  const db = getDb();

  // Resolve admin identity from the stashed token
  const adminSession = db.prepare(
    "SELECT user_id, expires_at FROM sessions WHERE token=?"
  ).get(adminToken) as { user_id: string; expires_at: number } | undefined;

  if (!adminSession || adminSession.expires_at < Date.now())
    return NextResponse.json({ ok: false, error: "Admin session expired — please log in again" }, { status: 401 });

  // Delete the temporary client session
  if (clientToken) {
    db.prepare("DELETE FROM sessions WHERE token=?").run(clientToken);
  }

  writeAudit({
    userId: adminSession.user_id,
    action: "admin.impersonate_exit",
    ip: clientIp(req),
  });

  const res = NextResponse.json({ ok: true });

  // Restore admin session
  res.cookies.set(SESSION_COOKIE, adminToken, {
    httpOnly: true, sameSite: "lax", path: "/",
    expires: new Date(adminSession.expires_at),
    secure: process.env.NODE_ENV === "production",
  });

  // Clear the stash cookie
  res.cookies.delete(ADMIN_SESSION_COOKIE);

  return res;
}
