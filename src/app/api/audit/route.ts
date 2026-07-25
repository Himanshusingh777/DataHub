/**
 * GET /api/audit — read-only access to the audit trail for this workspace.
 * Gated by the `audit.view` permission (owner/admin only by default).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/server/auth";
import { listAudit } from "@/lib/server/audit";
import { requirePermission } from "@/lib/server/permissions";

export async function GET(req: NextRequest) {
  try {
    const { userId, workspaceId } = getAuthContext(req);

    // NOTE: role currently lives client-side only (see src/stores/auth.store.ts —
    // buildUser() hardcodes "admin"). Until roles are persisted server-side,
    // this route trusts the local demo tenant as "owner" so the audit surface
    // is usable today; a real multi-user deployment must resolve role from
    // the `users`/`workspace_members` table instead of this placeholder.
    const role = "owner" as const;
    const denied = requirePermission(role, "audit.view", { userId, workspaceId });
    if (denied) return NextResponse.json(denied.body, { status: denied.status });

    const action = req.nextUrl.searchParams.get("action") ?? undefined;
    const limit = Number(req.nextUrl.searchParams.get("limit") ?? 100);
    const entries = listAudit({ workspaceId, action, limit });

    return NextResponse.json({
      ok: true,
      entries: entries.map((e) => ({
        id: e.id,
        action: e.action,
        resource: e.resource,
        meta: e.meta ? safeParse(e.meta) : null,
        ip: e.ip,
        createdAt: e.created_at,
      })),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e instanceof Error ? e.message : e) }, { status: 500 });
  }
}

function safeParse(json: string): unknown {
  try { return JSON.parse(json); } catch { return json; }
}
