/**
 * POST /api/bi/insights/[id]/dismiss
 *
 * Mark a Business IQ insight as dismissed for this workspace.
 * Dismissed insights are excluded from the default GET /api/bi/insights response.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, workspaceId } = await getAuthContext(req);
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getDb();

  const insight = await db.prepare(
    "SELECT id FROM bi_insights WHERE id = ? AND workspace_id = ?"
  ).get(id, workspaceId);

  if (!insight) return NextResponse.json({ ok: false, error: "Insight not found" }, { status: 404 });

  await db.prepare("UPDATE bi_insights SET dismissed = 1 WHERE id = ? AND workspace_id = ?")
    .run(id, workspaceId);

  return NextResponse.json({ ok: true });
}
