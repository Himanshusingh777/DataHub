/**
 * POST /api/models/[id]/run
 *
 * Execute a saved Semantic Model's SQL against the workspace BigQuery dataset.
 * Records the run in model_runs and updates schema_json on success.
 *
 * Returns: { ok, rows, schema, rowCount, durationMs, bytesProcessed }
 * Row cap: 10,000 (models are for analysis, not full table dumps)
 * Billing cap: 1 GB per execution
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { BigQuery } from "@google-cloud/bigquery";
import { getAuthContext } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { resolveBqCreds } from "@/lib/server/bq-creds";

export const dynamic = "force-dynamic";

const ROW_CAP = 10_000;

interface ModelRow {
  id: string; workspace_id: string; user_id: string;
  sql_query: string; source_dataset: string | null;
}

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
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, workspaceId } = await getAuthContext(req);
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getDb();

  // ── Load model (workspace-scoped) ─────────────────────────────────────────
  const model = await db.prepare(
    "SELECT id, workspace_id, user_id, sql_query, source_dataset FROM models WHERE id = ? AND workspace_id = ?"
  ).get(id, workspaceId) as ModelRow | undefined;

  if (!model) return NextResponse.json({ ok: false, error: "Model not found" }, { status: 404 });

  // ── Resolve BQ credentials (workspace → user → shared admin) ─────────────
  const bqCreds = await resolveBqCreds(userId, workspaceId);
  if (!bqCreds) {
    return NextResponse.json(
      { ok: false, notConfigured: true, error: "BigQuery credentials not configured — add them in Settings." },
      { status: 404 }
    );
  }

  // ── Apply row cap ─────────────────────────────────────────────────────────
  let sql = model.sql_query.trim().replace(/;+\s*$/, "");
  if (!/\blimit\s+\d+/i.test(sql)) sql = `${sql}\nLIMIT ${ROW_CAP}`;

  const dataset = model.source_dataset ?? bqCreds.dataset;
  const runId   = `run_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const started = Date.now();

  try {
    const bq = new BigQuery({
      projectId: bqCreds.projectId,
      credentials: bqCreds.credentials,
    });

    // bq.query() resolves [rows, job] — the job carries .statistics.query.totalBytesProcessed
    const [rows, job] = await bq.query({
      query: sql,
      maximumBytesBilled: "1000000000", // 1 GB cap
      defaultDataset: { datasetId: dataset, projectId: bqCreds.projectId },
    });

    const durationMs     = Date.now() - started;
    const bytesProcessed = Number(job?.statistics?.query?.totalBytesProcessed ?? 0);
    const clean          = (rows as Record<string, unknown>[]).map(flattenBqRow);

    // ── Derive schema from first row ──────────────────────────────────────
    const schema = clean.length > 0
      ? Object.entries(clean[0]!).map(([name, val]) => ({
          name,
          type: typeof val === "number" ? "FLOAT64"
               : val instanceof Date   ? "TIMESTAMP"
               : "STRING",
        }))
      : [];

    // ── Record run ────────────────────────────────────────────────────────
    await db.prepare(`
      INSERT INTO model_runs
        (id, model_id, workspace_id, user_id, status, rows_returned, duration_ms, bytes_processed, ran_at)
      VALUES (?, ?, ?, ?, 'success', ?, ?, ?, ?)
    `).run(runId, id, workspaceId, userId, clean.length, durationMs, bytesProcessed, started);

    // ── Update schema_json on the model ──────────────────────────────────
    if (schema.length > 0) {
      await db.prepare("UPDATE models SET schema_json = ?, updated_at = ? WHERE id = ?")
        .run(JSON.stringify(schema), Date.now(), id);
    }

    return NextResponse.json({
      ok: true,
      rows: clean,
      schema,
      rowCount:        clean.length,
      durationMs,
      bytesProcessed,
      capped:          clean.length >= ROW_CAP,
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const durationMs = Date.now() - started;

    // Record failed run
    await db.prepare(`
      INSERT INTO model_runs
        (id, model_id, workspace_id, user_id, status, error, duration_ms, ran_at)
      VALUES (?, ?, ?, ?, 'failed', ?, ?, ?)
    `).run(runId, id, workspaceId, userId, msg, durationMs, started);

    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
