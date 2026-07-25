/**
 * POST /api/auth/reset-password
 * Validates a reset token and sets a new password.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/server/db";
import { hashPassword } from "@/lib/server/crypto";

export async function POST(req: NextRequest) {
  let token: string, password: string;
  try {
    const body = await req.json();
    token = (body.token ?? "").trim();
    password = body.password ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!token || password.length < 8) {
    return NextResponse.json({ error: "Token and a password of at least 8 characters are required" }, { status: 400 });
  }

  const db = getDb();

  const reset = db.prepare(`
    SELECT r.token, r.user_id, r.expires_at
    FROM password_resets r
    WHERE r.token = ? AND r.expires_at > ?
  `).get(token, Date.now()) as { token: string; user_id: string; expires_at: number } | undefined;

  if (!reset) {
    return NextResponse.json({ error: "Invalid or expired reset token" }, { status: 400 });
  }

  const hashed = hashPassword(password);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashed, reset.user_id);
  db.prepare("DELETE FROM password_resets WHERE user_id = ?").run(reset.user_id);

  // Invalidate all existing sessions for security
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(reset.user_id);

  return NextResponse.json({ ok: true });
}
