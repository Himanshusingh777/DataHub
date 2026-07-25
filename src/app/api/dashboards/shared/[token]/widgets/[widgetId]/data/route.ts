/**
 * POST /api/dashboards/shared/[token]/widgets/[widgetId]/data
 *
 * Public, unauthenticated counterpart to /api/widgets/[id]/data — runs a
 * shared dashboard's widget live against BigQuery for anonymous viewers.
 * Without this route, "sharing" a dashboard only ever showed empty chart
 * shells to anyone who wasn't signed in, which isn't a working share
 * feature.
 *
 * Security, matching /api/dashboards/shared/[token]/route.ts exactly:
 *   - Resolves strictly by share_token + is_published=1 — a dashboard that
 *     was never shared, or had its link revoked, is not reachable this way.
 *   - The widget must belong to that specific dashboard.
 *   - BigQuery credentials are resolved using the dashboard OWNER's
 *     workspace (there is no requesting user), never the caller's.
 *   - No model SQL, workspace_id, or user_id is ever returned to the client.
 *   - No caller-supplied filters — the model runs exactly as saved. The
 *     authenticated /api/widgets/[id]/data route allows filters; this one
 *     doesn't, since accepting arbitrary WHERE-clause input from anonymous
 *     internet traffic against a real BigQuery bill is a cost/abuse vector
 *     worth just not having.
 *   - Rate-limited per IP — this is the only unauthenticated route in the
 *     app that can trigger a real BigQuery query, so it's the one most
 *     worth protecting from being hit in a loop.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { BigQuery } from "@google-cloud/bigquery";
import { getDb } from "@/lib/server/db";
import { resolveBqCreds } from "@/lib/server/bq-creds";
import { checkRateLimit, rateLimitResponse, rateLimitKey, requestIdentity, RATE_LIMITS } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const SHARED_WIDGET_ROW_CAP = 5_000;

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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; widgetId: string }> }
) {
  const { token, widgetId } = await params;

  const identity = requestIdentity(req);
  const rl = checkRateLimit(rateLimitKey(identity, "shared-widget-data"), RATE_LIMITS.warehouse);
  if (!rl.allowed) {
    const r = rateLimitResponse(rl);
    return NextResponse.json(r.body, { status: r.status, headers: r.headers });
  }

  const db = getDb();

  const dashboard = db.prepare(
    "SELECT id, user_id, workspace_id FROM dashboards WHERE share_token = ? AND is_published = 1"
  ).get(token) as { id: string; user_id: string; workspace_id: string } | undefined;
  if (!dashboard) return NextResponse.json({ ok: false, error: "Dashboard not found or not published" }, { status: 404 });

  const widget = db.prepare(
    "SELECT id, chart_type, config_json, model_id FROM widgets WHERE id = ? AND dashboard_id = ?"
  ).get(widgetId, dashboard.id) as { id: string; chart_type: string; config_json: string; model_id: string } | undefined;
  if (!widget) return NextResponse.json({ ok: false, error: "Widget not found on this dashboard" }, { status: 404 });

  const model = db.prepare(
    "SELECT sql_query, source_dataset FROM models WHERE id = ? AND workspace_id = ?"
  ).get(widget.model_id, dashboard.workspace_id) as { sql_query: string; source_dataset: string | null } | undefined;
  if (!model) return NextResponse.json({ ok: false, error: "Model not found for this widget" }, { status: 404 });

  // Resolved against the dashboard owner's workspace — there is no
  // requesting user for a public link.
  const bqCreds = resolveBqCreds(dashboard.user_id, dashboard.workspace_id);
  if (!bqCreds) return NextResponse.json({ ok: false, error: "Warehouse not configured for this dashboard." }, { status: 404 });

  const baseSql = model.sql_query.trim().replace(/;+\s*$/, "");
  const finalSql = `WITH _model AS (\n${baseSql}\n)\nSELECT * FROM _model\nLIMIT ${SHARED_WIDGET_ROW_CAP}`;
  const dataset = model.source_dataset ?? bqCreds.dataset;
  const started = Date.now();

  try {
    const bq = new BigQuery({ projectId: bqCreds.projectId, credentials: bqCreds.credentials });
    const [rows] = await bq.query({
      query: finalSql,
      maximumBytesBilled: "1000000000",
      defaultDataset: { datasetId: dataset, projectId: bqCreds.projectId },
    });

    const durationMs = Date.now() - started;
    const clean = (rows as Record<string, unknown>[]).map(flattenBqRow);
    let config: Record<string, unknown> = {};
    try { config = JSON.parse(widget.config_json); } catch { /* ignore */ }

    return NextResponse.json({
      ok: true,
      rows: clean,
      chartType: widget.chart_type,
      config,
      rowCount: clean.length,
      durationMs,
      capped: clean.length >= SHARED_WIDGET_ROW_CAP,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
