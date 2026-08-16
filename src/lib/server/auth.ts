/**
 * Server-side auth helpers — sessions in Postgres, httpOnly cookie.
 * Unauthenticated (demo) requests map to the "local" single-tenant user,
 * so the vault + scheduler work even before anyone registers.
 */

import type { NextRequest } from "next/server";
import { getDb, DEFAULT_WORKSPACE_ID } from "./db";
import { randomToken } from "./crypto";

export const SESSION_COOKIE = "ct_session";
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000; // 30 days

export const LOCAL_USER_ID = "local";

export interface SessionUser { id: string; email: string; name: string | null }

export async function createSession(userId: string): Promise<{ token: string; expiresAt: number }> {
  const db = getDb();
  const token = randomToken();
  const expiresAt = Date.now() + SESSION_TTL_MS;
  await db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(token, userId, expiresAt);
  return { token, expiresAt };
}

export async function destroySession(token: string): Promise<void> {
  await getDb().prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

/** Resolve the user for a request. Falls back to the "local" demo tenant. */
export async function getUserId(req: NextRequest): Promise<string> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return LOCAL_USER_ID;
  try {
    const db = getDb();
    const row = await db.prepare("SELECT user_id, expires_at FROM sessions WHERE token = ?").get(token) as
      | { user_id: string; expires_at: number } | undefined;
    if (!row || row.expires_at < Date.now()) return LOCAL_USER_ID;
    return row.user_id;
  } catch {
    return LOCAL_USER_ID;
  }
}

/**
 * One-stop auth context for API routes.
 * Returns {userId, workspaceId} with guaranteed per-user workspace isolation.
 * workspaceId is never "default" for authenticated users — it's always their
 * own workspace (lazily provisioned on first request after the account exists).
 */
export async function getAuthContext(req: NextRequest): Promise<{ userId: string; workspaceId: string }> {
  const userId = await getUserId(req);
  if (userId === LOCAL_USER_ID) return { userId, workspaceId: DEFAULT_WORKSPACE_ID };

  // Dynamic import to avoid a circular dependency (workspace.ts imports db.ts, auth.ts imports db.ts)
  const { getWorkspaceForRequest } = await import("./workspace");
  const workspaceId = await getWorkspaceForRequest(req, userId);
  return { userId, workspaceId };
}

export async function getSessionUser(req: NextRequest): Promise<SessionUser | null> {
  const userId = await getUserId(req);
  if (userId === LOCAL_USER_ID) return null;
  try {
    const row = await getDb().prepare("SELECT id, email, name FROM users WHERE id = ?").get(userId) as SessionUser | undefined;
    return row ?? null;
  } catch {
    return null;
  }
}
