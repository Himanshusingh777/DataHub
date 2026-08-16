/**
 * Audit Log — append-only trail of sensitive actions.
 *
 * Every credential write, flow mutation, auth event, permission denial and
 * job failure should call writeAudit(). Failures to write an audit entry are
 * swallowed (logged to console, never thrown) — an audit log must never be
 * the reason a real user-facing action fails.
 *
 * Callers MUST await this now (it wasn't a concern under synchronous SQLite,
 * but on serverless a fire-and-forget unawaited write can be cut short when
 * the function returns before the write actually lands).
 */

import { getDb, DEFAULT_WORKSPACE_ID } from "./db";
import { genId } from "./crypto";

export interface AuditEntry {
  workspaceId?: string;
  userId?: string | null;
  action: string;        // dot-namespaced, e.g. "credential.write", "flow.deleted"
  resource?: string;      // the id/name of the thing acted on
  meta?: Record<string, unknown>;
  ip?: string | null;
}

export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    await getDb().prepare(`
      INSERT INTO audit_log (id, workspace_id, user_id, action, resource, meta, ip, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      genId("audit"),
      entry.workspaceId ?? DEFAULT_WORKSPACE_ID,
      entry.userId ?? null,
      entry.action,
      entry.resource ?? null,
      entry.meta ? JSON.stringify(entry.meta) : null,
      entry.ip ?? null,
      Date.now()
    );
  } catch (e) {
    console.warn("[audit] write failed (non-fatal):", e instanceof Error ? e.message : e);
  }
}

export interface AuditRow {
  id: string;
  workspace_id: string;
  user_id: string | null;
  action: string;
  resource: string | null;
  meta: string | null;
  ip: string | null;
  created_at: number;
}

export async function listAudit(args: {
  workspaceId?: string;
  action?: string;
  limit?: number;
} = {}): Promise<AuditRow[]> {
  const db = getDb();
  const workspaceId = args.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const limit = Math.min(args.limit ?? 100, 500);

  if (args.action) {
    return db
      .prepare("SELECT * FROM audit_log WHERE workspace_id = ? AND action = ? ORDER BY created_at DESC LIMIT ?")
      .all(workspaceId, args.action, limit) as Promise<AuditRow[]>;
  }
  return db
    .prepare("SELECT * FROM audit_log WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(workspaceId, limit) as Promise<AuditRow[]>;
}

/** Extract a best-effort client IP from a Next.js request, for audit entries. */
export function clientIp(req: { headers: { get(name: string): string | null } }): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip");
}
