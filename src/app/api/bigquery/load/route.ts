/**
 * POST /api/bigquery/load
 *
 * Real BigQuery writer:
 *   1. Ensures the dataset exists
 *   2. Ensures the table exists — schema auto-inferred from the rows
 *   3. Inserts rows (streaming insert)
 *
 * Body: {
 *   projectId: string, dataset: string, serviceJson: string,
 *   table: string, rows: Record<string, unknown>[]
 * }
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { BigQuery } from "@google-cloud/bigquery";
import os from "os";
import fs from "fs";
import path from "path";

// ── Schema inference ─────────────────────────────────────────────────────────

type BQType = "STRING" | "FLOAT64" | "INT64" | "BOOL" | "TIMESTAMP";

const RE_ISO = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z?$/;

function inferType(values: unknown[]): BQType {
  const vals = values.filter((v) => v !== null && v !== undefined && v !== "");
  if (!vals.length) return "STRING";
  if (vals.every((v) => typeof v === "boolean")) return "BOOL";
  if (vals.every((v) => typeof v === "number")) {
    return vals.every((v) => Number.isInteger(v)) ? "INT64" : "FLOAT64";
  }
  if (vals.every((v) => typeof v === "string" && RE_ISO.test(v))) return "TIMESTAMP";
  return "STRING";
}

function sanitizeFieldName(name: string): string {
  // BigQuery: letters, numbers, underscores; must not start with a number
  let n = name.replace(/[^a-zA-Z0-9_]/g, "_");
  if (/^\d/.test(n)) n = "_" + n;
  return n.slice(0, 128);
}

function inferSchema(rows: Record<string, unknown>[]) {
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return keys.map((k) => ({
    name: sanitizeFieldName(k),
    type: inferType(rows.map((r) => r[k])),
    mode: "NULLABLE" as const,
  }));
}

function sanitizeRows(rows: Record<string, unknown>[], schema: { name: string; type: BQType }[]) {
  const typeMap = Object.fromEntries(schema.map((f) => [f.name, f.type]));
  return rows.map((r) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      const name = sanitizeFieldName(k);
      if (v === null || v === undefined || v === "") { out[name] = null; continue; }
      const t = typeMap[name];
      if (t === "STRING" && typeof v !== "string") out[name] = typeof v === "object" ? JSON.stringify(v) : String(v);
      else out[name] = v;
    }
    return out;
  });
}

// ── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: {
    projectId?: string; dataset?: string; serviceJson?: string;
    table?: string; rows?: Record<string, unknown>[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  const { projectId, dataset, serviceJson, table, rows } = body;
  if (!projectId || !dataset || !serviceJson || !table || !Array.isArray(rows) || !rows.length) {
    return NextResponse.json({ ok: false, error: "projectId, dataset, serviceJson, table and non-empty rows are required" }, { status: 400 });
  }

  let credentials: Record<string, string>;
  try {
    credentials = JSON.parse(serviceJson);
  } catch {
    return NextResponse.json({ ok: false, error: "Service Account JSON is not valid JSON" }, { status: 400 });
  }

  try {
    const bq = new BigQuery({ projectId, credentials });

    // 1. Ensure dataset
    const ds = bq.dataset(dataset);
    const [dsExists] = await ds.exists();
    if (!dsExists) await bq.createDataset(dataset, { location: "asia-south1" });

    // 2. Ensure table (schema inferred from rows)
    const schema = inferSchema(rows);
    const tbl = ds.table(sanitizeFieldName(table));
    const [tblExists] = await tbl.exists();
    let tableCreated = false;
    if (!tblExists) {
      await ds.createTable(sanitizeFieldName(table), { schema: { fields: schema } });
      tableCreated = true;
    }

    // 3. Load rows via a load job (Sandbox-safe — streaming inserts need billing)
    const clean = sanitizeRows(rows, schema);
    const tmpFile = path.join(os.tmpdir(), `crosstecch-load-${Date.now()}.ndjson`);
    fs.writeFileSync(tmpFile, clean.map((r) => JSON.stringify(r)).join("\n"));
    try {
      const [job] = await tbl.load(tmpFile, {
        sourceFormat: "NEWLINE_DELIMITED_JSON",
        writeDisposition: "WRITE_APPEND",
        schema: { fields: schema },
      });
      const jobErrors = (job as any)?.status?.errors;
      if (jobErrors?.length) throw new Error(jobErrors[0]?.message ?? "Load job failed");
    } finally {
      try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    }
    const inserted = clean.length;

    return NextResponse.json({
      ok: true,
      projectId,
      dataset,
      table: sanitizeFieldName(table),
      tableCreated,
      rowsInserted: inserted,
      columns: schema.length,
    });
  } catch (err: unknown) {
    // BigQuery insert errors carry row-level details
    const anyErr = err as { name?: string; errors?: { errors?: { message?: string }[] }[]; message?: string };
    let msg = anyErr?.message ?? String(err);
    if (anyErr?.name === "PartialFailureError") {
      msg = "Some rows failed: " + (anyErr.errors?.[0]?.errors?.[0]?.message ?? "schema mismatch");
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
