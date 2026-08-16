/**
 * GET /api/health
 *
 * Health check endpoint for load balancers, uptime monitors, and enterprise
 * SLA dashboards. Returns 200 when the service is healthy, 503 when degraded.
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, { ok: boolean; message?: string; latencyMs?: number }> = {};

  // Database check
  const dbStart = Date.now();
  try {
    const { getDb } = await import("@/lib/server/db");
    const db = getDb();
    await db.prepare("SELECT 1").get();
    checks.database = { ok: true, latencyMs: Date.now() - dbStart };
  } catch (e) {
    checks.database = { ok: false, message: String(e), latencyMs: Date.now() - dbStart };
  }

  const allOk = Object.values(checks).every((c) => c.ok);
  const status = allOk ? 200 : 503;

  return NextResponse.json(
    {
      ok: allOk,
      status: allOk ? "healthy" : "degraded",
      version: process.env.NEXT_PUBLIC_APP_VERSION ?? "1.0.0",
      timestamp: new Date().toISOString(),
      checks,
    },
    { status }
  );
}
