/**
 * GET /api/warehouse/status
 * Returns whether BigQuery is configured (shared credential, admin sets up once).
 * The client uses this to decide whether to show the warehouse intelligence UI.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/server/auth";
import { resolveBqCreds } from "@/lib/server/bq-creds";

export async function GET(req: NextRequest) {
  const { userId, workspaceId } = await getAuthContext(req);
  try {
    const bqCreds = await resolveBqCreds(userId, workspaceId);
    if (!bqCreds) return NextResponse.json({ configured: false });
    return NextResponse.json({
      configured: true,
      projectId: bqCreds.projectId,
      dataset: bqCreds.dataset,
      location: bqCreds.location,
    });
  } catch {
    return NextResponse.json({ configured: false });
  }
}
