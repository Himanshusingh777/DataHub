/**
 * Admin User Management — list & create
 *
 * GET  /api/admin/users           → all registered users with role/status
 * POST /api/admin/users           → create user, return temp password (plaintext, once only)
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/server/db";
import { getSessionUser } from "@/lib/server/auth";
import { hashPassword, genId } from "@/lib/server/crypto";
import { writeAudit, clientIp } from "@/lib/server/audit";
import crypto from "crypto";

const ADMIN_EMAILS = (process.env.ADMIN_EMAIL ?? "techtraining@frugaltestingid.com")
  .split(",").map((e) => e.trim().toLowerCase());

function isAdmin(req: NextRequest) {
  const u = getSessionUser(req);
  if (!u || !ADMIN_EMAILS.includes(u.email.toLowerCase())) return null;
  return u;
}

/** Generate a readable temp password: e.g. "Temp-aB3x-9kZm" */
function genTempPassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const seg = (n: number) =>
    Array.from({ length: n }, () => chars[crypto.randomInt(chars.length)]).join("");
  return `Temp-${seg(4)}-${seg(4)}`;
}

// ── GET /api/admin/users ──────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const admin = isAdmin(req);
  if (!admin) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const db = getDb();
  const users = db.prepare(
    "SELECT id, email, name, role, status, created_at FROM users ORDER BY created_at DESC"
  ).all() as { id: string; email: string; name: string | null; role: string; status: string; created_at: number }[];

  // Enrich each user with workspace + flow/connector counts
  const enriched = users.map((u) => {
    const flowCount      = (db.prepare("SELECT COUNT(*) AS n FROM flows WHERE user_id=?").get(u.id) as { n: number }).n;
    const connectorCount = (db.prepare("SELECT COUNT(*) AS n FROM credentials WHERE user_id=?").get(u.id) as { n: number }).n;
    const runCount       = (db.prepare(
      "SELECT COUNT(*) AS n FROM runs r JOIN flows f ON r.flow_id=f.id WHERE f.user_id=?"
    ).get(u.id) as { n: number }).n;
    const lastSession    = db.prepare(
      "SELECT expires_at FROM sessions WHERE user_id=? ORDER BY expires_at DESC LIMIT 1"
    ).get(u.id) as { expires_at: number } | undefined;

    // Workspace membership
    const membership = db.prepare(
      "SELECT workspace_id, role FROM workspace_members WHERE user_id=? LIMIT 1"
    ).get(u.id) as { workspace_id: string; role: string } | undefined;

    const workspace = membership
      ? db.prepare("SELECT id, name FROM workspaces WHERE id=?").get(membership.workspace_id) as
          { id: string; name: string } | undefined
      : undefined;

    return {
      ...u,
      flowCount,
      connectorCount,
      runCount,
      lastActiveAt: lastSession
        ? lastSession.expires_at - 30 * 24 * 60 * 60 * 1000
        : null,
      workspace: workspace ?? null,
      workspaceRole: membership?.role ?? u.role,
    };
  });

  return NextResponse.json({ ok: true, users: enriched });
}

// ── POST /api/admin/users ─────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const admin = isAdmin(req);
  if (!admin) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  let body: {
    email?: string; name?: string; role?: string;
    workspaceId?: string; workspaceName?: string;
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return NextResponse.json({ ok: false, error: "Valid email required" }, { status: 400 });

  const role = ["admin", "editor", "viewer"].includes(body.role ?? "")
    ? (body.role as string)
    : "viewer";

  const db = getDb();

  // Duplicate check
  if (db.prepare("SELECT id FROM users WHERE email=?").get(email))
    return NextResponse.json({ ok: false, error: "Email already registered" }, { status: 409 });

  // Generate temp password
  const tempPassword = genTempPassword();
  const passHash     = hashPassword(tempPassword);
  const userId       = genId("usr");

  db.prepare(
    "INSERT INTO users (id, email, name, pass_hash, role, status, created_at) VALUES (?,?,?,?,?,?,?)"
  ).run(userId, email, body.name?.trim() ?? null, passHash, role, "active", Date.now());

  // Workspace assignment
  let workspaceId: string | null = null;
  let workspaceName: string | null = null;

  if (body.workspaceId) {
    // Assign to existing workspace
    const ws = db.prepare("SELECT id, name FROM workspaces WHERE id=?").get(body.workspaceId) as
      { id: string; name: string } | undefined;
    if (ws) {
      workspaceId   = ws.id;
      workspaceName = ws.name;
    }
  }

  if (!workspaceId && body.workspaceName) {
    // Create new workspace for this user
    workspaceId   = genId("ws");
    workspaceName = body.workspaceName.trim();
    const slug    = workspaceName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    db.prepare(
      "INSERT INTO workspaces (id, owner_id, name, slug, plan, created_at) VALUES (?,?,?,?,?,?)"
    ).run(workspaceId, userId, workspaceName, slug, "free", Date.now());
  }

  if (workspaceId) {
    db.prepare(
      "INSERT OR IGNORE INTO workspace_members (id, workspace_id, user_id, role, invited_by, joined_at) VALUES (?,?,?,?,?,?)"
    ).run(genId("wm"), workspaceId, userId, role, admin.id, Date.now());
  }

  writeAudit({
    userId: admin.id,
    action: "admin.create_user",
    resource: userId,
    ip: clientIp(req),
  });

  return NextResponse.json({
    ok: true,
    user: { id: userId, email, name: body.name ?? null, role, status: "active" },
    tempPassword,   // shown ONCE — admin copies it manually
    workspace: workspaceId ? { id: workspaceId, name: workspaceName } : null,
  });
}
