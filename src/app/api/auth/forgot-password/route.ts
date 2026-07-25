/**
 * POST /api/auth/forgot-password
 *
 * Accepts an email address, generates a secure reset token, stores it in the
 * database, and sends a reset email. The response is always 200 OK regardless
 * of whether the email exists (prevents email enumeration).
 *
 * Email delivery: uses RESEND_API_KEY env var if set; logs to console otherwise
 * (useful for development). Swap in any transactional email provider here.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/server/db";
import { randomToken } from "@/lib/server/crypto";

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

async function sendResetEmail(to: string, token: string, origin: string): Promise<void> {
  const resetUrl = `${origin}/reset-password?token=${token}`;

  // Production: Resend
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL ?? "noreply@crosstecch.io",
        to,
        subject: "Reset your CrossTecch password",
        html: `
          <p>You requested a password reset for your CrossTecch account.</p>
          <p><a href="${resetUrl}" style="color:#6366f1;font-weight:bold">Reset your password</a></p>
          <p>This link expires in 1 hour. If you didn't request this, ignore this email.</p>
          <p style="color:#9ca3af;font-size:12px">${resetUrl}</p>
        `,
      }),
    });
    return;
  }

  // Development fallback — log to console
  console.log(`[auth] Password reset link for ${to}: ${resetUrl}`);
}

export async function POST(req: NextRequest) {
  let email: string;
  try {
    const body = await req.json();
    email = (body.email ?? "").trim().toLowerCase();
  } catch {
    return NextResponse.json({ ok: true }); // don't leak info on bad JSON
  }

  if (!email) return NextResponse.json({ ok: true });

  const db = getDb();

  // Only generate a token if the email exists — but always return 200
  const user = db.prepare("SELECT id FROM users WHERE email = ?").get(email) as
    | { id: string } | undefined;

  if (user) {
    const token = randomToken();
    const expiresAt = Date.now() + RESET_TTL_MS;

    // Upsert a reset token (one active token per user at a time)
    db.prepare(`
      INSERT INTO password_resets (token, user_id, expires_at)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET token = excluded.token, expires_at = excluded.expires_at
    `).run(token, user.id, expiresAt);

    const origin = req.headers.get("origin") ?? `https://${req.headers.get("host")}`;
    try {
      await sendResetEmail(email, token, origin);
    } catch (e) {
      console.error("[auth] Failed to send reset email:", e);
    }
  }

  // Always return success to prevent email enumeration
  return NextResponse.json({ ok: true });
}
