/**
 * POST /api/admin/users/[id]/reset-password
 *
 * Generates a new temp password, updates the hash, invalidates all
 * existing sessions, returns the plaintext password ONCE for the admin
 * to copy and share manually. No email is sent.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/server/db";
import { getSessionUser } from "@/lib/server/auth";
import { hashPassword } from "@/lib/server/crypto";
import { writeAudit, clientIp } from "@/lib/server/audit";
import crypto from "crypto";

const ADMIN_EMAILS = (process.env.ADMIN_EMAIL ?? "techtraining@frugaltestingid.com")
  .split(",").map((e) => e.trim().toLowerCase());

function genTempPassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const seg = (n: number) =>
    Array.from({ length: n }, () => chars[crypto.randomInt(chars.length)]).join("");
  return `Temp-${seg(4)}-${seg(4)}`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = getSessionUser(req);
  if (!admin || !ADMIN_EMAILS.includes(admin.email.toLowerCase()))
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const db = getDb();

  const user = db.prepare("SELECT id, email FROM users WHERE id=?").get(id) as
    { id: string; email: string } | undefined;
  if (!user) return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });

  const tempPassword = genTempPassword();
  db.prepare("UPDATE users SET pass_hash=? WHERE id=?").run(hashPassword(tempPassword), id);

  // Invalidate all sessions so the user must log in again with the new password
  db.prepare("DELETE FROM sessions WHERE user_id=?").run(id);

  writeAudit({
    userId: admin.id,
    action: "admin.reset_password",
    resource: user.email,
    ip: clientIp(req),
  });

  return NextResponse.json({
    ok: true,
    tempPassword,   // shown ONCE — admin copies manually
    email: user.email,
  });
}
