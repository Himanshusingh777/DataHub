/**
 * POST /api/models/preview
 *
 * Execute a SQL query against BigQuery WITHOUT saving it as a model.
 * Used in the Model Builder to let users iterate on SQL before saving.
 *
 * Body: { sql_query, source_dataset? }
 * Returns: { ok, rows, schema, rowCount, durationMs }
 * Row cap: 200 (preview only)
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { BigQuery } from "@google-cloud/bigquery";
import { getAuthContext } from "@/lib/server/auth";
import { resolveBqCreds } from "@/lib/server/bq-creds";

export const dynamic = "force-dynamic";

const FORBIDDEN = /\b(insert|update|delete|drop|create|alter|merge|truncate|grant|revoke|call|begin|commit|export)\b/i;
const PREVIEW_ROW_CAP = 200;

function flattenBqRow(r: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(r).map(([k, v]) => [
      k,
      v !== null && typeof v === "object" && "value" in (v as object)
        ? (v as { value: unknown }).value
        : v,
    ])
  );
}

export async function POST(req: NextRequest) {
  const { userId, workspaceId } = await getAuthContext(req);
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  let body: { sql_query?: string; source_dataset?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 }); }

  const { sql_query, source_dataset } = body;
  if (!sql_query?.trim())
    return NextResponse.json({ ok: false, error: "sql_query is required" }, { status: 400 });

  // ── SQL safety ─────────────────────────────────────────────────────────────
  const stripped = sql_query.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").trim();
  if (!/^(select|with)\b/i.test(stripped))
    return NextResponse.json({ ok: false, error: "Only SELECT / WITH queries are allowed." }, { status: 400 });
  if (FORBIDDEN.test(stripped))
    return NextResponse.json({ ok: false, error: "Write / DDL statements are not allowed." }, { status: 400 });

  // ── Resolve BQ credentials ─────────────────────────────────────────────────
  const bqCreds = await resolveBqCreds(userId, workspaceId);
  if (!bqCreds) {
    return NextResponse.json(
      { ok: false, notConfigured: true, error: "BigQuery credentials not configured." },
      { status: 404 }
    );
  }

  let sql = stripped.replace(/;+\s*$/, "");
  if (!/\blimit\s+\d+/i.test(sql)) sql = `${sql}\nLIMIT ${PREVIEW_ROW_CAP}`;

  const dataset = source_dataset ?? bqCreds.dataset;
  const started = Date.now();

  try {
    const bq = new BigQuery({
      projectId:   bqCreds.projectId,
      credentials: bqCreds.credentials,
    });

    const [rows] = await bq.query({
      query: sql,
      maximumBytesBilled: "500000000", // 500 MB cap for previews
      defaultDataset: { datasetId: dataset, projectId: bqCreds.projectId },
    });

    const durationMs = Date.now() - started;
    const clean      = (rows as Record<string, unknown>[]).map(flattenBqRow);

    const schema = clean.length > 0
      ? Object.entries(clean[0]!).map(([name, val]) => ({
          name,
          type: typeof val === "number" ? "FLOAT64"
               : val instanceof Date   ? "TIMESTAMP"
               : "STRING",
        }))
      : [];

    return NextResponse.json({
      ok: true,
      rows: clean,
      schema,
      rowCount:  clean.length,
      durationMs,
      capped:    clean.length >= PREVIEW_ROW_CAP,
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
