/**
 * Multi-Workspace layer.
 *
 * Architecture: every customer gets their own connectors, warehouse
 * connection, API keys, flows and dashboards, scoped by `workspace_id`. This
 * module is the single place that resolves "which workspace is this request
 * for" and performs workspace CRUD — every other server module that needs
 * scoping (jobs, credentials, flows, audit log, usage) takes a workspaceId
 * parameter rather than reimplementing resolution.
 *
 * Backward compatibility: the app shipped single-tenant, with an implicit
 * "local" user and no workspace concept at all. Every table already defaults
 * workspace_id to DEFAULT_WORKSPACE_ID ("default"), so:
 *   - existing installs keep working with zero data migration
 *   - resolveWorkspaceId() falls back to the default workspace whenever no
 *     explicit workspace is selected (no header, no cookie, no query param)
 *
 * This makes workspaces "architecture ready" rather than a hard cutover: the
 * scoping plumbing exists everywhere it needs to, but a single-workspace
 * customer never has to think about it.
 */

import type { NextRequest } from "next/server";
import { getDb, DEFAULT_WORKSPACE_ID } from "./db";

export { DEFAULT_WORKSPACE_ID };
import { genId } from "./crypto";

export interface WorkspaceRow {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  plan: string;
  created_at: number;
}

const WORKSPACE_HEADER = "x-workspace-id";
const WORKSPACE_COOKIE = "ct_workspace";

/**
 * Resolve which workspace a request belongs to.
 * Priority: explicit header (API clients) > cookie (browser) > user's first
 * owned workspace > the implicit default workspace.
 */
export function resolveWorkspaceId(req: NextRequest, userId: string): string {
  const header = req.headers.get(WORKSPACE_HEADER);
  if (header) return header;

  const cookie = req.cookies.get(WORKSPACE_COOKIE)?.value;
  if (cookie) return cookie;

  try {
    const db = getDb();
    const row = db
      .prepare("SELECT id FROM workspaces WHERE owner_id = ? ORDER BY created_at ASC LIMIT 1")
      .get(userId) as { id: string } | undefined;
    if (row) return row.id;
  } catch {
    /* DB not ready — fall through to default */
  }

  return DEFAULT_WORKSPACE_ID;
}

export function createWorkspace(ownerId: string, name: string, plan = "free"): WorkspaceRow {
  const db = getDb();
  const id = genId("ws");
  const slug = slugify(name);
  const created_at = Date.now();
  db.prepare(`
    INSERT INTO workspaces (id, owner_id, name, slug, plan, created_at) VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, ownerId, name, slug, plan, created_at);
  return { id, owner_id: ownerId, name, slug, plan, created_at };
}

export function listWorkspaces(ownerId: string): WorkspaceRow[] {
  return getDb()
    .prepare("SELECT * FROM workspaces WHERE owner_id = ? ORDER BY created_at ASC")
    .all(ownerId) as WorkspaceRow[];
}

export function getWorkspace(id: string): WorkspaceRow | null {
  const row = getDb().prepare("SELECT * FROM workspaces WHERE id = ?").get(id) as WorkspaceRow | undefined;
  return row ?? null;
}

export function renameWorkspace(id: string, ownerId: string, name: string): boolean {
  const res = getDb()
    .prepare("UPDATE workspaces SET name = ? WHERE id = ? AND owner_id = ?")
    .run(name, id, ownerId);
  return res.changes > 0;
}

/**
 * Ensures a user has their own workspace. Creates one if absent, then migrates
 * all existing rows from the implicit "default" workspace to the real one.
 * Safe to call on every login — the SELECT fast-paths out if the workspace exists.
 */
export function ensureUserWorkspace(userId: string, name?: string): string {
  const db = getDb();

  // Find the user's workspace: first as owner, then as member (admin-created users)
  const ownedWs = db
    .prepare("SELECT id FROM workspaces WHERE owner_id = ? ORDER BY created_at ASC LIMIT 1")
    .get(userId) as { id: string } | undefined;

  const memberWs = ownedWs
    ? undefined
    : db.prepare("SELECT workspace_id AS id FROM workspace_members WHERE user_id = ? ORDER BY joined_at ASC LIMIT 1")
        .get(userId) as { id: string } | undefined;

  const existing = ownedWs ?? memberWs;

  const wid = existing
    ? existing.id
    : createWorkspace(userId, name ?? "My Workspace").id;

  // Always migrate any rows still stuck on 'default' → the user's real workspace.
  // This is idempotent (WHERE workspace_id = 'default') so safe to run on every login.
  // Critical: users whose workspace already existed before this migration ran would
  // never have had their data migrated on the fast path — always run it.
  const TABLES_WITH_USER_ID: string[] = [
    "flows", "credentials", "webhooks", "saved_queries",
    "query_history", "catalog_tables", "automations",
  ];
  for (const t of TABLES_WITH_USER_ID) {
    try {
      db.prepare(
        `UPDATE ${t} SET workspace_id = ? WHERE user_id = ? AND workspace_id = 'default'`
      ).run(wid, userId);
    } catch { /* column may not exist on older schemas — ignore */ }
  }

  try {
    db.prepare(
      "UPDATE api_keys SET workspace_id = ? WHERE user_id = ? AND (workspace_id = 'default' OR workspace_id IS NULL)"
    ).run(wid, userId);
  } catch { /* ignore */ }

  try {
    db.prepare(
      "UPDATE audit_log SET workspace_id = ? WHERE user_id = ? AND workspace_id = 'default'"
    ).run(wid, userId);
  } catch { /* ignore */ }

  // Recover warehouse_table for flows that still have NULL — parse the run
  // logs that runner.ts already writes: "Loaded N rows → tablename".
  // This is a self-healing migration: runs once after the first sync, makes
  // Intelligence/Warehouse pages show data without requiring another sync.
  try {
    const nullFlows = db.prepare(
      "SELECT id FROM flows WHERE user_id = ? AND warehouse_table IS NULL"
    ).all(userId) as { id: string }[];

    for (const { id: flowId } of nullFlows) {
      const latestRun = db.prepare(
        "SELECT logs FROM runs WHERE flow_id = ? AND status = 'success' ORDER BY started_at DESC LIMIT 1"
      ).get(flowId) as { logs: string } | undefined;
      if (!latestRun?.logs) continue;
      try {
        const logs: { message?: string }[] = JSON.parse(latestRun.logs);
        for (const entry of logs) {
          const m = entry.message?.match(/Loaded \d+ rows → (\S+)/);
          if (m?.[1]) {
            db.prepare("UPDATE flows SET warehouse_table = ? WHERE id = ?").run(m[1], flowId);
            break;
          }
        }
      } catch { /* malformed logs — skip */ }
    }
  } catch { /* non-fatal */ }

  return wid;
}

/**
 * Returns the workspace_id for the current request.
 * For authenticated users, always returns their personal workspace (never "default").
 * Falls back to DEFAULT_WORKSPACE_ID only for the anonymous demo user.
 */
export function getWorkspaceForRequest(req: NextRequest, userId: string): string {
  if (userId === DEFAULT_WORKSPACE_ID || userId === "local") return DEFAULT_WORKSPACE_ID;

  // Explicit override (API clients / admin cross-workspace access)
  const header = req.headers.get(WORKSPACE_HEADER);
  if (header) return header;

  const cookie = req.cookies.get(WORKSPACE_COOKIE)?.value;
  if (cookie) return cookie;

  // Find or lazily provision the user's own workspace
  return ensureUserWorkspace(userId);
}

export function deleteWorkspace(id: string, ownerId: string): boolean {
  if (id === DEFAULT_WORKSPACE_ID) return false; // the implicit workspace can't be deleted
  const db = getDb();
  const res = db.prepare("DELETE FROM workspaces WHERE id = ? AND owner_id = ?").run(id, ownerId);
  if (res.changes > 0) {
    // Orphaned scoped rows fall back to the default workspace rather than
    // vanishing — deleting a workspace never deletes a customer's data.
    for (const table of ["flows", "credentials", "jobs", "audit_log", "usage_events", "api_keys"]) {
      db.prepare(`UPDATE ${table} SET workspace_id = ? WHERE workspace_id = ?`).run(DEFAULT_WORKSPACE_ID, id);
    }
  }
  return res.changes > 0;
}

function slugify(name: string): string {
  const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "workspace";
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

export { WORKSPACE_COOKIE, WORKSPACE_HEADER };
