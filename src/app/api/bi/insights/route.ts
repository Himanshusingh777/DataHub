/**
 * GET  /api/bi/insights  — list undismissed BI insights for the workspace
 * POST /api/bi/insights  — trigger Business IQ analysis on a Semantic Model
 *
 * Business IQ analyzes Semantic Model execution results (not raw tables) to
 * surface trends, anomalies, recommendations, and forecasts.
 *
 * Workspace isolation: all rows filtered by workspace_id.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { BigQuery } from "@google-cloud/bigquery";
import { getAuthContext } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { resolveBqCreds } from "@/lib/server/bq-creds";

export const dynamic = "force-dynamic";

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

// ── GET — list insights ───────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { userId, workspaceId } = await getAuthContext(req);
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const url     = new URL(req.url);
  const modelId = url.searchParams.get("model_id");
  const type    = url.searchParams.get("type");
  const includeExpired = url.searchParams.get("include_expired") === "1";

  const db = getDb();
  let sql    = "SELECT bi.*, m.name as model_name FROM bi_insights bi LEFT JOIN models m ON m.id = bi.model_id WHERE bi.workspace_id = ? AND bi.dismissed = 0";
  const args: unknown[] = [workspaceId];

  if (modelId)  { sql += " AND bi.model_id = ?"; args.push(modelId); }
  if (type)     { sql += " AND bi.type = ?";     args.push(type); }
  if (!includeExpired) {
    sql += " AND (bi.expires_at IS NULL OR bi.expires_at > ?)";
    args.push(Date.now());
  }
  sql += " ORDER BY bi.created_at DESC LIMIT 100";

  const insights = await db.prepare(sql).all(...args) as Array<Record<string, unknown>>;
  const total    = (await db.prepare("SELECT COUNT(*) as n FROM bi_insights WHERE workspace_id = ? AND dismissed = 0").get(workspaceId) as { n: number }).n;

  return NextResponse.json({ ok: true, insights, total });
}

// ── POST — trigger analysis on a model ───────────────────────────────────────

export async function POST(req: NextRequest) {
  const { userId, workspaceId } = await getAuthContext(req);
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  let body: { model_id?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 }); }

  const { model_id } = body;
  if (!model_id)
    return NextResponse.json({ ok: false, error: "model_id is required" }, { status: 400 });

  const db = getDb();

  // Verify model belongs to workspace
  const model = await db.prepare(
    "SELECT id, name, sql_query, source_dataset FROM models WHERE id = ? AND workspace_id = ?"
  ).get(model_id, workspaceId) as {
    id: string; name: string; sql_query: string; source_dataset: string | null;
  } | undefined;

  if (!model) return NextResponse.json({ ok: false, error: "Model not found" }, { status: 404 });

  // Resolve BQ credentials
  const bqCreds = await resolveBqCreds(userId, workspaceId);
  if (!bqCreds) {
    return NextResponse.json(
      { ok: false, notConfigured: true, error: "BigQuery credentials not configured." },
      { status: 404 }
    );
  }

  try {
    const bq = new BigQuery({
      projectId:   bqCreds.projectId,
      credentials: bqCreds.credentials,
    });

    const dataset = model.source_dataset ?? bqCreds.dataset;

    // Execute model to get data for analysis
    const baseSql = model.sql_query.trim().replace(/;+\s*$/, "");
    const [rows]  = await bq.query({
      query:              `${baseSql}\nLIMIT 1000`,
      maximumBytesBilled: "500000000",
      defaultDataset:     { datasetId: dataset, projectId: bqCreds.projectId },
    });

    const clean = (rows as Record<string, unknown>[]).map(flattenBqRow);
    if (clean.length === 0) {
      return NextResponse.json({ ok: true, insights: [], message: "No data returned by model — no insights generated." });
    }

    // ── Statistical analysis ────────────────────────────────────────────────
    const generated: Array<{
      id: string; type: string; title: string;
      description: string; severity: string; data_json: string;
    }> = [];

    const cols = Object.keys(clean[0]!);
    const numericCols = cols.filter((c) => typeof clean[0]![c] === "number");
    const now         = Date.now();
    const expires     = now + 86_400_000 * 7; // 7-day TTL

    // ── Insight 1: Row count / data freshness ─────────────────────────────
    generated.push({
      id:          `ins_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
      type:        "kpi",
      title:       `${model.name}: ${clean.length.toLocaleString()} rows analyzed`,
      description: `Business IQ analyzed ${clean.length} rows from the "${model.name}" model.`,
      severity:    "info",
      data_json:   JSON.stringify({ rowCount: clean.length, analyzedAt: new Date().toISOString() }),
    });

    // ── Insight 2: Per-numeric-column stats (trend / anomaly) ─────────────
    for (const col of numericCols.slice(0, 5)) { // cap at 5 columns
      const vals   = clean.map((r) => Number(r[col] ?? 0)).filter((v) => !isNaN(v));
      if (vals.length < 2) continue;

      const sum    = vals.reduce((a, b) => a + b, 0);
      const mean   = sum / vals.length;
      const sorted = [...vals].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
      const min    = sorted[0] ?? 0;
      const max    = sorted[sorted.length - 1] ?? 0;

      // Variance + stddev for anomaly detection
      const variance = vals.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / vals.length;
      const stddev   = Math.sqrt(variance);

      // Detect outliers (values > 2 stddev from mean)
      const outliers = vals.filter((v) => Math.abs(v - mean) > 2 * stddev);

      // Simple trend: compare first vs last quintile
      const q1Avg = vals.slice(0, Math.floor(vals.length / 5)).reduce((a, b) => a + b, 0) / Math.max(1, Math.floor(vals.length / 5));
      const q5Avg = vals.slice(-Math.floor(vals.length / 5)).reduce((a, b) => a + b, 0) / Math.max(1, Math.floor(vals.length / 5));
      const trendPct = q1Avg !== 0 ? ((q5Avg - q1Avg) / Math.abs(q1Avg)) * 100 : 0;

      if (outliers.length > 0) {
        generated.push({
          id:          `ins_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
          type:        "anomaly",
          title:       `Anomaly detected in "${col}"`,
          description: `${outliers.length} value(s) are more than 2 standard deviations from the mean (${mean.toFixed(2)}). This may indicate data quality issues or significant events.`,
          severity:    outliers.length > vals.length * 0.1 ? "critical" : "warning",
          data_json:   JSON.stringify({ column: col, mean, stddev, outlierCount: outliers.length, min, max }),
        });
      }

      if (Math.abs(trendPct) > 10) {
        generated.push({
          id:          `ins_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
          type:        "trend",
          title:       `${trendPct > 0 ? "Upward" : "Downward"} trend in "${col}" (${trendPct.toFixed(1)}%)`,
          description: `"${col}" shows a ${Math.abs(trendPct).toFixed(1)}% ${trendPct > 0 ? "increase" : "decrease"} across the dataset. Mean: ${mean.toFixed(2)}, Median: ${median.toFixed(2)}.`,
          severity:    trendPct > 0 ? "success" : "warning",
          data_json:   JSON.stringify({ column: col, trendPct, mean, median, min, max, stddev }),
        });
      }
    }

    // ── Insight 3: Recommendation if no numeric columns found ─────────────
    if (numericCols.length === 0) {
      generated.push({
        id:          `ins_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
        type:        "recommendation",
        title:       `Add numeric columns to "${model.name}" for deeper analysis`,
        description: `Business IQ works best with models that include numeric metrics (revenue, count, duration, etc.). Consider adding SUM, COUNT, or AVG aggregations to your SQL.`,
        severity:    "info",
        data_json:   JSON.stringify({ columns: cols }),
      });
    }

    // ── Persist insights ──────────────────────────────────────────────────
    await db.transaction(async (tx) => {
      const insertStmt = tx.prepare(`
        INSERT INTO bi_insights
          (id, workspace_id, model_id, type, title, description, data_json, severity, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const ins of generated) {
        await insertStmt.run(ins.id, workspaceId, model_id, ins.type, ins.title, ins.description, ins.data_json, ins.severity, now, expires);
      }
    });

    return NextResponse.json({
      ok:       true,
      insights: generated,
      count:    generated.length,
    }, { status: 201 });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
