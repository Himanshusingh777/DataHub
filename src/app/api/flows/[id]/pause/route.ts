import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { writeAudit } from "@/lib/server/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId, workspaceId } = await getAuthContext(req);
  const db = getDb();

  const flow = await db.prepare("SELECT id, user_id, workspace_id, status FROM flows WHERE id = ?").get(id) as
    | { id: string; user_id: string; workspace_id: string; status: string } | undefined;

  if (!flow) return NextResponse.json({ error: "Flow not found" }, { status: 404 });
  if (flow.user_id !== userId || flow.workspace_id !== workspaceId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (flow.status === "paused") return NextResponse.json({ ok: true, status: "paused" });

  await db.prepare("UPDATE flows SET status = 'paused' WHERE id = ?").run(id);
  await writeAudit({ workspaceId: flow.workspace_id ?? "default", userId, action: "flow.paused", resource: id });

  return NextResponse.json({ ok: true, status: "paused" });
}
