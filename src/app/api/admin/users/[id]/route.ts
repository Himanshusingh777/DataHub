/**
 * Admin — per-user actions
 *
 * PATCH  /api/admin/users/[id]   → update role / status (activate | suspend)
 * DELETE /api/admin/users/[id]   → delete user + all their data
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/server/db";
import { getSessionUser } from "@/lib/server/auth";
import { writeAudit, clientIp } from "@/lib/server/audit";

const ADMIN_EMAILS = (process.env.ADMIN_EMAIL ?? "techtraining@frugaltestingid.com")
  .split(",").map((e) => e.trim().toLowerCase());

function guardAdmin(req: NextRequest) {
  const u = getSessionUser(req);
  if (!u || !ADMIN_EMAILS.includes(u.email.toLowerCase())) return null;
  return u;
}

// ── PATCH — update role / status / name ──────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = guardAdmin(req);
  if (!admin) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const { id } = params;
  const db = getDb();
  const user = db.prepare("SELECT id, email, role, status FROM users WHERE id=?").get(id) as
    { id: string; email: string; role: string; status: string } | undefined;
  if (!user) return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });

  let body: { role?: string; status?: string; name?: string; workspaceId?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  // Build update fields
  const updates: string[] = [];
  const values: (string | number)[] = [];

  if (body.role && ["admin", "editor", "viewer"].includes(body.role)) {
    updates.push("role=?");
    values.push(body.role);
  }
  if (body.status && ["active", "suspended"].includes(body.status)) {
    updates.push("status=?");
    values.push(body.status);
  }
  if (typeof body.name === "string") {
    updates.push("name=?");
    values.push(body.name.trim());
  }

  if (updates.length === 0 && !body.workspaceId)
    return NextResponse.json({ ok: false, error: "Nothing to update" }, { status: 400 });

  if (updates.length > 0) {
    values.push(id);
    db.prepare(`UPDATE users SET ${updates.join(",")} WHERE id=?`).run(values);
  }

  // Update workspace_members role too if role changed
  if (body.role) {
    db.prepare(
      "UPDATE workspace_members SET role=? WHERE user_id=?"
    ).run(body.role, id);
  }

  // Workspace re-assignment
  if (body.workspaceId) {
    const ws = db.prepare("SELECT id FROM workspaces WHERE id=?").get(body.workspaceId);
    if (ws) {
      db.prepare(
        "INSERT OR REPLACE INTO workspace_members (id, workspace_id, user_id, role, invited_by, joined_at) VALUES (?,?,?,?,?,?)"
      ).run(
        `wm-${id}-${body.workspaceId}`,
        body.workspaceId, id,
        body.role ?? user.role,
        admin.id,
        Date.now()
      );
    }
  }

  // If suspended → invalidate all active sessions immediately
  if (body.status === "suspended") {
    db.prepare("DELETE FROM sessions WHERE user_id=?").run(id);
  }

  writeAudit({
    userId: admin.id,
    action: `admin.update_user.${body.status ?? body.role ?? "edit"}`,
    resource: id,
    ip: clientIp(req),
  });

  const updated = db.prepare("SELECT id, email, name, role, status FROM users WHERE id=?").get(id);
  return NextResponse.json({ ok: true, user: updated });
}

// ── DELETE — remove user + cascade ───────────────────────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = guardAdmin(req);
  if (!admin) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const { id } = params;
  const db = getDb();

  const user = db.prepare("SELECT id, email FROM users WHERE id=?").get(id) as
    { id: string; email: string } | undefined;
  if (!user) return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });

  // Prevent admin from deleting themselves
  if (user.email.toLowerCase() === admin.email.toLowerCase())
    return NextResponse.json({ ok: false, error: "Cannot delete your own account" }, { status: 400 });

  // Cascade delete — order matters for FK-style consistency
  db.prepare("DELETE FROM sessions           WHERE user_id=?").run(id);
  db.prepare("DELETE FROM credentials        WHERE user_id=?").run(id);
  db.prepare("DELETE FROM workspace_members  WHERE user_id=?").run(id);
  db.prepare("DELETE FROM api_keys           WHERE user_id=?").run(id);
  db.prepare("DELETE FROM password_resets    WHERE user_id=?").run(id);

  // Runs are linked via flows — delete runs first, then flows
  const flows = db.prepare("SELECT id FROM flows WHERE user_id=?").all(id) as { id: string }[];
  for (const f of flows) {
    db.prepare("DELETE FROM runs      WHERE flow_id=?").run(f.id);
    db.prepare("DELETE FROM sync_state WHERE flow_id=?").run(f.id);
  }
  db.prepare("DELETE FROM flows WHERE user_id=?").run(id);

  // Finally delete the user
  db.prepare("DELETE FROM users WHERE id=?").run(id);

  writeAudit({
    userId: admin.id,
    action: "admin.delete_user",
    resource: user.email,
    ip: clientIp(req),
  });

  return NextResponse.json({ ok: true });
}
