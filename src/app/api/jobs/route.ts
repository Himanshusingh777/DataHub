/**
 * GET  /api/jobs        — list recent jobs + queue stats for this workspace
 * POST /api/jobs/retry  — requeue a dead-lettered job (see body.id)
 *
 * Read surface for the Background Job Engine (lib/server/jobs.ts). The queue
 * itself is written to only by enqueueJob()/claimNextJob() server-side; this
 * route never writes new jobs, so it's safe to expose broadly.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/server/auth";
import { listJobs, queueStats, requeueJob, type JobStatus } from "@/lib/server/jobs";

export async function GET(req: NextRequest) {
  try {
    const { userId, workspaceId } = getAuthContext(req);
    const status = req.nextUrl.searchParams.get("status") as JobStatus | null;
    const limit = Number(req.nextUrl.searchParams.get("limit") ?? 50);

    const jobs = listJobs({ workspaceId, status: status ?? undefined, limit });
    const stats = queueStats(workspaceId);

    return NextResponse.json({
      ok: true,
      jobs: jobs.map((j) => ({
        id: j.id,
        type: j.type,
        status: j.status,
        priority: j.priority,
        attempts: j.attempts,
        maxAttempts: j.max_attempts,
        lastError: j.last_error,
        payload: safeParse(j.payload),
        result: j.result ? safeParse(j.result) : null,
        createdAt: j.created_at,
        updatedAt: j.updated_at,
        runAfter: j.run_after,
      })),
      stats,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e instanceof Error ? e.message : e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: { action?: string; id?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }
  if (body.action !== "retry" || !body.id) {
    return NextResponse.json({ ok: false, error: 'Only { action: "retry", id } is supported' }, { status: 400 });
  }
  try {
    const ok = requeueJob(body.id);
    return NextResponse.json({ ok, error: ok ? undefined : "Job not found or not in a dead-lettered state" });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e instanceof Error ? e.message : e) }, { status: 500 });
  }
}

function safeParse(json: string): unknown {
  try { return JSON.parse(json); } catch { return json; }
}
