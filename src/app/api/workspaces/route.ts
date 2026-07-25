/**
 * Workspace CRUD — architecture-ready multi-tenancy.
 * GET: list the caller's workspaces. POST: create. DELETE: remove (?id=).
 * The demo "local" user gets a real, persisted workspace list like any
 * other account — nothing here is mocked.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getUserId } from "@/lib/server/auth";
import { createWorkspace, listWorkspaces, deleteWorkspace } from "@/lib/server/workspace";
import { writeAudit } from "@/lib/server/audit";

export async function GET(req: NextRequest) {
  try {
    const userId = getUserId(req);
    return NextResponse.json({ ok: true, workspaces: listWorkspaces(userId) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e instanceof Error ? e.message : e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: { name?: string; plan?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }
  if (!body.name?.trim()) {
    return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });
  }
  try {
    const userId = getUserId(req);
    const ws = createWorkspace(userId, body.name.trim(), body.plan ?? "free");
    writeAudit({ workspaceId: ws.id, userId, action: "workspace.created", resource: ws.id, meta: { name: ws.name } });
    return NextResponse.json({ ok: true, workspace: ws });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e instanceof Error ? e.message : e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  try {
    const userId = getUserId(req);
    const ok = deleteWorkspace(id, userId);
    if (ok) writeAudit({ workspaceId: id, userId, action: "workspace.deleted", resource: id });
    return NextResponse.json({ ok, error: ok ? undefined : "Workspace not found or cannot be deleted" });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e instanceof Error ? e.message : e) }, { status: 500 });
  }
}
