/**
 * POST /api/query/ai-generate
 *
 * Natural language → SQL for Query Studio's "AI SQL Assistant" panel. See
 * lib/server/ai-sql.ts for how schema context is built (live from this
 * workspace's own BigQuery warehouse + Semantic Models) and how the
 * returned SQL is re-validated against that same context before ever
 * reaching the client.
 *
 * This route never executes the SQL it generates — it only returns it for
 * the user to review/edit in the editor. Running it goes through the
 * existing POST /api/query/run, unchanged, exactly like hand-written SQL.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/server/auth";
import { generateSqlFromPrompt } from "@/lib/server/ai-sql";
import { writeAudit, clientIp } from "@/lib/server/audit";
import { checkRateLimit, rateLimitResponse, rateLimitKey, requestIdentity, RATE_LIMITS } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_PROMPT_LENGTH = 2000;

export async function POST(req: NextRequest) {
  const { userId, workspaceId } = getAuthContext(req);
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const identity = requestIdentity(req, userId);
  const rl = checkRateLimit(rateLimitKey(identity, "ai-sql-generate"), RATE_LIMITS.aiSql);
  if (!rl.allowed) {
    const r = rateLimitResponse(rl);
    return NextResponse.json(r.body, { status: r.status, headers: r.headers });
  }

  let body: { prompt?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const prompt = (body.prompt ?? "").trim();
  if (!prompt) return NextResponse.json({ ok: false, error: "prompt is required" }, { status: 400 });
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return NextResponse.json({ ok: false, error: `Prompt is too long (max ${MAX_PROMPT_LENGTH} characters).` }, { status: 400 });
  }

  const result = await generateSqlFromPrompt({ workspaceId, userId, prompt });

  writeAudit({
    workspaceId,
    userId,
    action: result.ok ? "ai_sql.generated" : "ai_sql.failed",
    meta: result.ok ? { prompt, tablesUsed: result.tablesUsed } : { prompt, error: result.error, code: result.code },
    ip: clientIp(req),
  });

  if (!result.ok) {
    const status =
      result.code === "not_configured" ? 501 : result.code === "groq_error" || result.code === "warehouse_error" ? 502 : 422;
    return NextResponse.json({ ok: false, error: result.error, code: result.code }, { status });
  }

  return NextResponse.json({ ok: true, sql: result.sql, tablesUsed: result.tablesUsed });
}
