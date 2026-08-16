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

async function guardAdmin(req: NextRequest) {
  const u = await getSessionUser(req);
  if (!u || !ADMIN_EMAILS.includes(u.email.toLowerCase())) return null;
  return u;
}

// ── PATCH — update role / status / name ──────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await guardAdmin(req);
  if (!admin) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const db = getDb();
  const user = await db.prepare("SELECT id, email, role, status FROM users WHERE id=?").get(id) as
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
    await db.prepare(`UPDATE users SET ${updates.join(",")} WHERE id=?`).run(...values);
  }

  // Update workspace_members role too if role changed
  if (body.role) {
    await db.prepare(
      "UPDATE workspace_members SET role=? WHERE user_id=?"
    ).run(body.role, id);
  }

  // Workspace re-assignment
  if (body.workspaceId) {
    const ws = await db.prepare("SELECT id FROM workspaces WHERE id=?").get(body.workspaceId);
    if (ws) {
      // workspace_members has UNIQUE(workspace_id, user_id) — matches SQLite's
      // INSERT OR REPLACE (full row replace, id included) for that pair.
      await db.prepare(
        `INSERT INTO workspace_members (id, workspace_id, user_id, role, invited_by, joined_at) VALUES (?,?,?,?,?,?)
         ON CONFLICT (workspace_id, user_id) DO UPDATE SET
           id = excluded.id, role = excluded.role, invited_by = excluded.invited_by, joined_at = excluded.joined_at`
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
    await db.prepare("DELETE FROM sessions WHERE user_id=?").run(id);
  }

  await writeAudit({
    userId: admin.id,
    action: `admin.update_user.${body.status ?? body.role ?? "edit"}`,
    resource: id,
    ip: clientIp(req),
  });

  const updated = await db.prepare("SELECT id, email, name, role, status FROM users WHERE id=?").get(id);
  return NextResponse.json({ ok: true, user: updated });
}

// ── DELETE — remove user + cascade ───────────────────────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await guardAdmin(req);
  if (!admin) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const db = getDb();

  const user = await db.prepare("SELECT id, email FROM users WHERE id=?").get(id) as
    { id: string; email: string } | undefined;
  if (!user) return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });

  // Prevent admin from deleting themselves
  if (user.email.toLowerCase() === admin.email.toLowerCase())
    return NextResponse.json({ ok: false, error: "Cannot delete your own account" }, { status: 400 });

  // Cascade delete — order matters for FK-style consistency
  await db.prepare("DELETE FROM sessions           WHERE user_id=?").run(id);
  await db.prepare("DELETE FROM credentials        WHERE user_id=?").run(id);
  await db.prepare("DELETE FROM workspace_members  WHERE user_id=?").run(id);
  await db.prepare("DELETE FROM api_keys           WHERE user_id=?").run(id);
  await db.prepare("DELETE FROM password_resets    WHERE user_id=?").run(id);

  // Runs are linked via flows — delete runs first, then flows
  const flows = await db.prepare("SELECT id FROM flows WHERE user_id=?").all(id) as { id: string }[];
  for (const f of flows) {
    await db.prepare("DELETE FROM runs      WHERE flow_id=?").run(f.id);
    await db.prepare("DELETE FROM sync_state WHERE flow_id=?").run(f.id);
  }
  await db.prepare("DELETE FROM flows WHERE user_id=?").run(id);

  // Finally delete the user
  await db.prepare("DELETE FROM users WHERE id=?").run(id);

  await writeAudit({
    userId: admin.id,
    action: "admin.delete_user",
    resource: user.email,
    ip: clientIp(req),
  });

  return NextResponse.json({ ok: true });
}
