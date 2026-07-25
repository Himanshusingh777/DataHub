/**
 * POST /api/bigquery/csv-import
 *
 * Loads CSV rows (pre-parsed client-side) into BigQuery.
 * Reads BigQuery credentials from the encrypted vault — no client-side secrets needed.
 *
 * Body: { table: string, rows: Record<string, unknown>[], dataset?: string }
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { BigQuery } from "@google-cloud/bigquery";
import { getAuthContext } from "@/lib/server/auth";
import { resolveBqCreds } from "@/lib/server/bq-creds";
import os from "os";
import fs from "fs";
import path from "path";

type BQType = "STRING" | "FLOAT64" | "INT64" | "BOOL" | "TIMESTAMP";
const RE_ISO = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z?$/;

function inferType(values: unknown[]): BQType {
  const vals = values.filter((v) => v !== null && v !== undefined && v !== "");
  if (!vals.length) return "STRING";
  if (vals.every((v) => typeof v === "boolean")) return "BOOL";
  if (vals.every((v) => typeof v === "number")) {
    return vals.every((v) => Number.isInteger(v)) ? "INT64" : "FLOAT64";
  }
  if (vals.every((v) => typeof v === "string" && RE_ISO.test(v as string))) return "TIMESTAMP";
  return "STRING";
}

function sanitizeField(name: string): string {
  let n = name.replace(/[^a-zA-Z0-9_]/g, "_");
  if (/^\d/.test(n)) n = "_" + n;
  return n.slice(0, 128) || "column";
}

function inferSchema(rows: Record<string, unknown>[]) {
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return keys.map((k) => ({
    name: sanitizeField(k),
    type: inferType(rows.map((r) => r[k])),
    mode: "NULLABLE" as const,
  }));
}

function sanitizeRows(rows: Record<string, unknown>[], schema: { name: string; type: BQType }[]) {
  const typeMap = Object.fromEntries(schema.map((f) => [f.name, f.type]));
  return rows.map((r) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      const name = sanitizeField(k);
      if (v === null || v === undefined || v === "") { out[name] = null; continue; }
      const t = typeMap[name];
      if (t === "STRING" && typeof v !== "string")
        out[name] = typeof v === "object" ? JSON.stringify(v) : String(v);
      else out[name] = v;
    }
    return out;
  });
}

export async function POST(req: NextRequest) {
  const { userId, workspaceId } = getAuthContext(req);

  let body: { table?: string; rows?: Record<string, unknown>[]; dataset?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  const { table, rows, dataset: bodyDataset } = body;
  if (!table || !Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ ok: false, error: "table and non-empty rows are required" }, { status: 400 });
  }

  // Resolve BQ credentials from vault
  const creds = resolveBqCreds(userId, workspaceId);
  if (!creds) {
    return NextResponse.json({
      ok: false,
      error: "BigQuery not configured. Go to Settings → Connections → BigQuery and save your service account JSON first.",
      notConfigured: true,
    }, { status: 400 });
  }

  const dataset = bodyDataset || creds.dataset;
  const { projectId, credentials, location } = creds;

  try {
    const bq = new BigQuery({ projectId, credentials });

    // Ensure dataset exists
    const ds = bq.dataset(dataset);
    const [dsExists] = await ds.exists();
    if (!dsExists) await bq.createDataset(dataset, { location });

    // Infer schema + sanitize rows
    const schema = inferSchema(rows);
    const tableName = sanitizeField(table);
    const tbl = ds.table(tableName);
    const [tblExists] = await tbl.exists();
    let tableCreated = false;
    if (!tblExists) {
      await ds.createTable(tableName, { schema: { fields: schema } });
      tableCreated = true;
    }

    // Write NDJSON temp file and load via load job (Sandbox-safe)
    const clean = sanitizeRows(rows, schema);
    const tmpFile = path.join(os.tmpdir(), `csv-import-${Date.now()}.ndjson`);
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

    return NextResponse.json({
      ok: true,
      projectId,
      dataset,
      table: tableName,
      tableCreated,
      rowsInserted: clean.length,
      columns: schema.length,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
