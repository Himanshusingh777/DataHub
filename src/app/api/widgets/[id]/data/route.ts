/**
 * POST /api/widgets/[id]/data
 *
 * Execute a widget's Semantic Model against BigQuery and return chart-ready data.
 *
 * The widget's model SQL is retrieved server-side (never sent to the client).
 * Optional body: { filters?, limit? } — applied on top of the model SQL.
 *
 * Returns:
 * {
 *   ok, rows, schema, chartType, config,
 *   modelName, rowCount, durationMs, bytesProcessed
 * }
 *
 * Row cap: 5,000 for chart rendering (models themselves run up to 10,000).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { BigQuery } from "@google-cloud/bigquery";
import { getAuthContext } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { resolveBqCreds } from "@/lib/server/bq-creds";

export const dynamic = "force-dynamic";

const WIDGET_ROW_CAP = 5_000;

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

interface Filter {
  field: string;
  op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "contains";
  value: unknown;
}

/** Build a safe WHERE clause fragment from filters.
 *  Only alphanumeric field names are accepted to prevent SQL injection. */
function buildFilterClause(filters: Filter[]): { clause: string; values: unknown[] } {
  const parts: string[] = [];
  const values: unknown[] = [];
  const safeField = (f: string) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(f);

  for (const f of filters) {
    if (!safeField(f.field)) continue;
    switch (f.op) {
      case "eq":       parts.push(`\`${f.field}\` = ?`);    values.push(f.value); break;
      case "neq":      parts.push(`\`${f.field}\` != ?`);   values.push(f.value); break;
      case "gt":       parts.push(`\`${f.field}\` > ?`);    values.push(f.value); break;
      case "gte":      parts.push(`\`${f.field}\` >= ?`);   values.push(f.value); break;
      case "lt":       parts.push(`\`${f.field}\` < ?`);    values.push(f.value); break;
      case "lte":      parts.push(`\`${f.field}\` <= ?`);   values.push(f.value); break;
      case "contains": parts.push(`LOWER(\`${f.field}\`) LIKE ?`); values.push(`%${String(f.value).toLowerCase()}%`); break;
      case "in":
        if (Array.isArray(f.value) && f.value.length > 0) {
          parts.push(`\`${f.field}\` IN (${f.value.map(() => "?").join(",")})`);
          values.push(...f.value);
        }
        break;
    }
  }
  return { clause: parts.length ? `WHERE ${parts.join(" AND ")}` : "", values };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, workspaceId } = await getAuthContext(req);
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getDb();

  // ── Load widget (workspace-scoped) ─────────────────────────────────────────
  const widget = await db.prepare(
    "SELECT * FROM widgets WHERE id = ? AND workspace_id = ?"
  ).get(id, workspaceId) as {
    id: string; model_id: string; chart_type: string;
    config_json: string; workspace_id: string;
  } | undefined;
  if (!widget) return NextResponse.json({ ok: false, error: "Widget not found" }, { status: 404 });

  // ── Load model (workspace-scoped) ──────────────────────────────────────────
  const model = await db.prepare(
    "SELECT id, name, sql_query, source_dataset FROM models WHERE id = ? AND workspace_id = ?"
  ).get(widget.model_id, workspaceId) as {
    id: string; name: string; sql_query: string; source_dataset: string | null;
  } | undefined;
  if (!model) return NextResponse.json({ ok: false, error: "Model not found for this widget" }, { status: 404 });

  // ── Parse optional request body ────────────────────────────────────────────
  let body: { filters?: Filter[]; limit?: number } = {};
  try { body = await req.json(); } catch { /* no body is fine */ }

  // ── Resolve BQ credentials ─────────────────────────────────────────────────
  const bqCreds = await resolveBqCreds(userId, workspaceId);
  if (!bqCreds) {
    return NextResponse.json(
      { ok: false, notConfigured: true, error: "BigQuery credentials not configured." },
      { status: 404 }
    );
  }

  // ── Build query: wrap model SQL as a CTE, apply widget filters + limit ─────
  const rowLimit = Math.min(body.limit ?? WIDGET_ROW_CAP, WIDGET_ROW_CAP);
  const { clause: filterClause, values: filterValues } = buildFilterClause(body.filters ?? []);

  // Wrap in CTE so widget-level filters compose cleanly on top of model SQL
  const baseSql  = model.sql_query.trim().replace(/;+\s*$/, "");
  const finalSql = filterClause
    ? `WITH _model AS (\n${baseSql}\n)\nSELECT * FROM _model\n${filterClause}\nLIMIT ${rowLimit}`
    : `WITH _model AS (\n${baseSql}\n)\nSELECT * FROM _model\nLIMIT ${rowLimit}`;

  const dataset = model.source_dataset ?? bqCreds.dataset;
  const started = Date.now();

  try {
    const bq = new BigQuery({
      projectId:   bqCreds.projectId,
      credentials: bqCreds.credentials,
    });

    // bq.query() resolves [rows, job] — the job carries .statistics.query.totalBytesProcessed
    const [rows, job] = await bq.query({
      query:              finalSql,
      params:             filterValues.length ? filterValues : undefined,
      maximumBytesBilled: "1000000000",
      defaultDataset:     { datasetId: dataset, projectId: bqCreds.projectId },
    });

    const durationMs     = Date.now() - started;
    const bytesProcessed = Number(job?.statistics?.query?.totalBytesProcessed ?? 0);
    const clean          = (rows as Record<string, unknown>[]).map(flattenBqRow);

    const schema = clean.length > 0
      ? Object.entries(clean[0]!).map(([name, val]) => ({
          name,
          type: typeof val === "number" ? "FLOAT64"
               : val instanceof Date   ? "TIMESTAMP"
               : "STRING",
        }))
      : [];

    // Parse widget config for the client
    let config: Record<string, unknown> = {};
    try { config = JSON.parse(widget.config_json); } catch { /* ignore */ }

    return NextResponse.json({
      ok: true,
      rows:          clean,
      schema,
      chartType:     widget.chart_type,
      config,
      modelName:     model.name,
      rowCount:      clean.length,
      durationMs,
      bytesProcessed,
      capped:        clean.length >= rowLimit,
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
