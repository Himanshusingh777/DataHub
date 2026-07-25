/**
 * GET  /api/warehouse/monitor  — reads BigQuery creds from server-side vault
 * POST /api/warehouse/monitor  — accepts explicit creds (legacy / wizard flow)
 *
 * The GET path is the preferred V1 path: credentials are stored in the encrypted
 * server-side vault (POST /api/credentials) and never touch the client.
 * The POST path is kept for backwards compatibility with the flow wizard which
 * supplies credentials at creation time before they are persisted to the vault.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/server/auth";
import { resolveWorkspaceId } from "@/lib/server/workspace";
import { getWarehouseSnapshot } from "@/lib/server/warehouse-monitor";
import { resolveBqCreds } from "@/lib/server/bq-creds";
import { checkRateLimit, rateLimitKey, rateLimitResponse, requestIdentity, RATE_LIMITS } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

/** GET — read credentials from vault server-side (preferred path) */
export async function GET(req: NextRequest) {
  const { userId, workspaceId } = getAuthContext(req);

  const rl = checkRateLimit(rateLimitKey(requestIdentity(req, userId), "warehouse"), RATE_LIMITS.warehouse);
  if (!rl.allowed) {
    const r = rateLimitResponse(rl);
    return NextResponse.json(r.body, { status: r.status, headers: r.headers });
  }

  // Shared BQ credentials — admin sets up once, all users benefit
  try {
    const bqCreds = resolveBqCreds(userId, workspaceId);
    if (!bqCreds) {
      return NextResponse.json(
        { ok: false, notConfigured: true, error: "BigQuery credentials not configured — add them in Settings or during flow creation." },
        { status: 404 }
      );
    }

    // If the caller just wants to know if the warehouse is configured (e.g. isWarehouseConfigured()),
    // a "configuredOnly" param skips the expensive BigQuery API call.
    if (req.nextUrl.searchParams.get("configuredOnly") === "1") {
      return NextResponse.json({ ok: true, projectId: bqCreds.projectId, dataset: bqCreds.dataset, configured: true });
    }

    const snapshot = await getWarehouseSnapshot({ projectId: bqCreds.projectId, dataset: bqCreds.dataset, credentials: bqCreds.credentials, userId, workspaceId, location: bqCreds.location });
    return NextResponse.json({ ok: true, projectId: bqCreds.projectId, dataset: bqCreds.dataset, ...snapshot });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const notFound = /Not found: (Table|Dataset)/i.test(msg);
    return NextResponse.json(
      { ok: false, notFound, error: notFound ? "Dataset not found — run a sync first." : msg },
      { status: notFound ? 404 : 500 }
    );
  }
}

/** POST — explicit credentials (flow wizard / legacy path) */
export async function POST(req: NextRequest) {
  const { userId, workspaceId } = getAuthContext(req);
  resolveWorkspaceId(req, userId); // establishes tenant context for future per-workspace BQ creds

  const rl = checkRateLimit(rateLimitKey(requestIdentity(req, userId), "warehouse"), RATE_LIMITS.warehouse);
  if (!rl.allowed) {
    const r = rateLimitResponse(rl);
    return NextResponse.json(r.body, { status: r.status, headers: r.headers });
  }

  let body: { projectId?: string; dataset?: string; serviceJson?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  const { projectId, dataset, serviceJson } = body;
  if (!projectId || !dataset || !serviceJson)
    return NextResponse.json({ ok: false, error: "projectId, dataset and serviceJson are required" }, { status: 400 });

  let credentials: Record<string, string>;
  try { credentials = JSON.parse(serviceJson); } catch {
    return NextResponse.json({ ok: false, error: "Invalid service account JSON" }, { status: 400 });
  }

  try {
    const snapshot = await getWarehouseSnapshot({ projectId, dataset, credentials, userId, workspaceId });
    return NextResponse.json({ ok: true, ...snapshot });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const notFound = /Not found: (Table|Dataset)/i.test(msg);
    return NextResponse.json(
      { ok: false, notFound, error: notFound ? "Dataset not found — run a sync first." : msg },
      { status: notFound ? 404 : 500 }
    );
  }
}
