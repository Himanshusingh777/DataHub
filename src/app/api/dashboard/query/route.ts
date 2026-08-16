/**
 * POST /api/dashboard/query — SQL Workspace.
 * Runs user-written SQL against their BigQuery dataset.
 *
 * Credentials are read from the server-side encrypted vault (shared admin setup).
 * Body: { sql }   (projectId/dataset/serviceJson are IGNORED — vault only)
 *
 * Safety:
 *   - SELECT / WITH only — all write/DDL statements rejected
 *   - auto LIMIT 200 when none provided
 *   - byte-billing cap
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { BigQuery } from "@google-cloud/bigquery";
import { getAuthContext } from "@/lib/server/auth";
import { resolveBqCreds } from "@/lib/server/bq-creds";

export const dynamic = "force-dynamic";

const FORBIDDEN = /\b(insert|update|delete|drop|create|alter|merge|truncate|grant|revoke|call|begin|commit|export)\b/i;

export async function POST(req: NextRequest) {
  const { userId, workspaceId } = await getAuthContext(req);
  // Workspace-scoped BQ credentials
  const bqCreds = await resolveBqCreds(userId, workspaceId);
  if (!bqCreds) {
    return NextResponse.json(
      { ok: false, notConfigured: true, error: "BigQuery credentials not configured — add them in Settings." },
      { status: 404 }
    );
  }

  let body: { sql?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  let sql = (body.sql ?? "").trim().replace(/;+\s*$/, "");
  if (!sql)
    return NextResponse.json({ ok: false, error: "sql required" }, { status: 400 });

  // ── Safety checks ──────────────────────────────────────────────────────────
  const stripped = sql.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").trim();
  if (!/^(select|with)\b/i.test(stripped))
    return NextResponse.json({ ok: false, error: "Only SELECT queries are allowed in the workspace." }, { status: 400 });
  if (FORBIDDEN.test(stripped))
    return NextResponse.json({ ok: false, error: "Write/DDL statements are not allowed — SELECT only." }, { status: 400 });
  if (stripped.includes(";"))
    return NextResponse.json({ ok: false, error: "One statement at a time, please." }, { status: 400 });
  if (!/\blimit\s+\d+/i.test(stripped)) sql = `${sql}\nLIMIT 200`;

  const { projectId, dataset, credentials } = bqCreds;

  try {
    const bq = new BigQuery({ projectId, credentials });
    const started = Date.now();
    const [rows] = await bq.query({
      query: sql,
      maximumBytesBilled: "1000000000", // 1 GB cap
      defaultDataset: { datasetId: dataset, projectId },
    });
    const ms = Date.now() - started;

    // Flatten BigQuery value objects (timestamps etc.)
    const clean = (rows as Record<string, unknown>[]).map((r) =>
      Object.fromEntries(
        Object.entries(r).map(([k, v]) => [
          k,
          v !== null && typeof v === "object" && "value" in (v as object) ? (v as { value: unknown }).value : v,
        ])
      )
    );

    return NextResponse.json({ ok: true, rows: clean, rowCount: clean.length, durationMs: ms });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
