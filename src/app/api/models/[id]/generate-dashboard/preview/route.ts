/**
 * POST /api/models/[id]/generate-dashboard/preview
 *
 * Step 1 of "✨ Generate AI Dashboard": analyze the model's schema (plus a
 * fresh row sample pulled purely for local cardinality/value profiling —
 * never persisted, never sent anywhere) and return EVERY chart that's a
 * reasonable fit, as a list of candidates. No dashboard or widgets are
 * created here — the user picks which candidates they want in the UI, then
 * POSTs the selected subset to /api/models/[id]/generate-dashboard.
 *
 * No LLM / external AI call — reuses the model's own BigQuery connection
 * (already required to run the model at all) to pull a capped sample.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { BigQuery } from "@google-cloud/bigquery";
import { getAuthContext } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { resolveBqCreds } from "@/lib/server/bq-creds";
import { checkRateLimit, RATE_LIMITS, rateLimitKey, rateLimitResponse, requestIdentity } from "@/lib/server/rate-limit";
import { generateDashboardCandidates } from "@/lib/bi/ai-dashboard-generator";
import type { SchemaColumn } from "@/lib/models-data";

export const dynamic = "force-dynamic";

const SAMPLE_ROW_CAP = 500;

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
  const { userId, workspaceId } = getAuthContext(req);
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const identity = requestIdentity(req, userId);
  const rl = checkRateLimit(rateLimitKey(identity, "ai-dashboard-preview"), RATE_LIMITS.warehouse);
  if (!rl.allowed) {
    const r = rateLimitResponse(rl);
    return NextResponse.json(r.body, { status: r.status, headers: r.headers });
  }

  const { id } = await params;
  const db = getDb();

  const model = db.prepare(
    "SELECT id, name, sql_query, source_dataset, schema_json FROM models WHERE id = ? AND workspace_id = ?"
  ).get(id, workspaceId) as {
    id: string; name: string; sql_query: string; source_dataset: string | null; schema_json: string;
  } | undefined;
  if (!model) return NextResponse.json({ ok: false, error: "Model not found" }, { status: 404 });

  let schema: SchemaColumn[] = [];
  try { schema = JSON.parse(model.schema_json); } catch { schema = []; }
  if (schema.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Run this model at least once first — its column schema isn't known yet." },
      { status: 400 }
    );
  }

  const bqCreds = resolveBqCreds(userId, workspaceId);
  if (!bqCreds) {
    return NextResponse.json(
      { ok: false, notConfigured: true, error: "BigQuery credentials not configured." },
      { status: 404 }
    );
  }

  // Best-effort row sample for local profiling only (cardinality, date
  // ranges, value patterns) — never stored, never leaves this request.
  let sampleRows: Record<string, unknown>[] = [];
  try {
    const bq = new BigQuery({ projectId: bqCreds.projectId, credentials: bqCreds.credentials });
    const baseSql = model.sql_query.trim().replace(/;+\s*$/, "");
    const [rows] = await bq.query({
      query:              `WITH _model AS (\n${baseSql}\n)\nSELECT * FROM _model\nLIMIT ${SAMPLE_ROW_CAP}`,
      maximumBytesBilled: "1000000000",
      defaultDataset:     { datasetId: model.source_dataset ?? bqCreds.dataset, projectId: bqCreds.projectId },
    });
    sampleRows = (rows as Record<string, unknown>[]).map(flattenBqRow);
  } catch (err: unknown) {
    console.warn(
      "[generate-dashboard/preview] sample query failed, falling back to schema-only heuristics:",
      err instanceof Error ? err.message : err
    );
  }

  const candidates = generateDashboardCandidates(schema, sampleRows);
  if (candidates.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Could not find enough usable columns in this model's schema to suggest charts." },
      { status: 422 }
    );
  }

  return NextResponse.json({ ok: true, modelName: model.name, candidates });
}
