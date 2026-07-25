/**
 * Server-side ETL core — shared by every connector adapter.
 *
 *   loadToBigQuery()  dataset ensure → table ensure → load job → verify
 *   inferSchema()     BigQuery schema from raw rows (nullable fields)
 *
 * Any connector reaching the LOAD step goes through this exact code.
 */

import { BigQuery } from "@google-cloud/bigquery";
import os from "os";
import fs from "fs";
import path from "path";
import { buildMerge, buildAlterTableAddColumns, type BQScalarType } from "@/lib/engine/sql";

export interface JobLog { ts: string; level: "info" | "debug" | "success" | "error" | "warn"; message: string }

export type Logger = (level: JobLog["level"], message: string) => void;

export interface BQField { name: string; type: string; mode: "NULLABLE" | "REQUIRED" }

// ── Schema inference (universal) ─────────────────────────────────────────────

const RE_ISO = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z?$/;

export function sanitizeName(name: string): string {
  let n = (name ?? "").replace(/[^a-zA-Z0-9_]/g, "_");
  if (/^\d/.test(n)) n = "_" + n;
  return n.slice(0, 128) || "field";
}

export function inferSchema(rows: Record<string, unknown>[]): BQField[] {
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return keys.map((k) => {
    const vals = rows.map((r) => r[k]).filter((v) => v !== null && v !== undefined && v !== "");
    let type = "STRING";
    if (vals.length) {
      if (vals.every((v) => typeof v === "boolean")) type = "BOOL";
      else if (vals.every((v) => typeof v === "number")) type = vals.every((v) => Number.isInteger(v)) ? "INT64" : "FLOAT64";
      else if (vals.every((v) => typeof v === "string" && RE_ISO.test(v as string))) type = "TIMESTAMP";
    }
    return { name: sanitizeName(k), type, mode: "NULLABLE" as const };
  });
}

function sanitizeRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((r) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      out[sanitizeName(k)] =
        v === null || v === undefined || v === ""
          ? null
          : typeof v === "object" ? JSON.stringify(v) : v;
    }
    return out;
  });
}

// ── Warehouse load (load jobs — Sandbox-safe) ────────────────────────────────

export async function loadToBigQuery(args: {
  projectId: string;
  credentials: Record<string, string>;
  dataset: string;
  table: string;
  rows: Record<string, unknown>[];
  schema?: BQField[];
  log: Logger;
  /** BigQuery dataset location — defaults to "US". Set to "EU" for GDPR compliance. */
  location?: string;
}): Promise<{ rowsInserted: number; tableCreated: boolean; datasetCreated: boolean; warehouseRowCount: number | null }> {
  const { projectId, credentials, dataset, rows, log } = args;
  const table = sanitizeName(args.table);
  const schema = args.schema ?? inferSchema(rows);
  // Location is configurable per-destination — defaults to US (most permissive latency).
  // Enterprise customers in EU set this to "EU"; APAC customers set "asia-south1" etc.
  const location = args.location ?? process.env.BIGQUERY_DEFAULT_LOCATION ?? "US";

  const bq = new BigQuery({ projectId, credentials });

  // Dataset
  const ds = bq.dataset(dataset);
  const [dsExists] = await ds.exists();
  let datasetCreated = false;
  if (!dsExists) {
    await bq.createDataset(dataset, { location });
    datasetCreated = true;
    log("success", `Dataset "${dataset}" created (location: ${location}).`);
  }

  // Table strategy: load into a staging table, then atomically replace the target
  // using BigQuery DDL "CREATE OR REPLACE TABLE target AS SELECT * FROM staging".
  // This avoids ALL schema comparison issues (type changes, field additions, etc.)
  // because the target is recreated from the staging data — no WRITE_TRUNCATE comparison.
  const stagingName = sanitizeName(`_stg_${table}_${Date.now()}`);
  const stagingTbl = ds.table(stagingName);
  let tableCreated = false;

  // Ensure target table exists (so we can track whether it was just created)
  const tbl = ds.table(table);
  const [tblExists] = await tbl.exists();
  if (!tblExists) tableCreated = true;

  // Load job — write to staging (always a fresh table, no schema conflict ever)
  log("info", "Starting BigQuery load job (batch mode via staging table)…");
  const clean = sanitizeRows(rows);
  const tmpFile = path.join(os.tmpdir(), `crosstecch-load-${Date.now()}.ndjson`);
  fs.writeFileSync(tmpFile, clean.map((r) => JSON.stringify(r)).join("\n"));
  try {
    await ds.createTable(stagingName, { schema: { fields: schema }, expirationTime: String(Date.now() + 3_600_000) });
    const [job] = await stagingTbl.load(tmpFile, {
      sourceFormat: "NEWLINE_DELIMITED_JSON",
      writeDisposition: "WRITE_APPEND",
      schema: { fields: schema },
    });
    const jobErrors = (job as any)?.status?.errors;
    if (jobErrors?.length) throw new Error(jobErrors[0]?.message ?? "Load job failed");
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }

  // Atomic replace: CREATE OR REPLACE TABLE target AS SELECT * FROM staging
  // This drops-and-recreates target with the staging schema + data in one DDL operation.
  log("info", `Replacing ${table} with staging data (CREATE OR REPLACE TABLE)…`);
  await bq.query({
    query: `CREATE OR REPLACE TABLE \`${projectId}.${dataset}.${table}\` AS SELECT * FROM \`${projectId}.${dataset}.${stagingName}\``,
    useLegacySql: false,
  });
  // Drop staging (it has a 1-hour expiry as a backstop)
  try { await stagingTbl.delete(); } catch { /* non-fatal */ }

  log("success", `${clean.length} rows written to ${dataset}.${table} via staging load job.`);

  // Verification — query the warehouse back
  let warehouseRowCount: number | null = null;
  try {
    const [res] = await bq.query(`SELECT COUNT(*) AS c FROM \`${projectId}.${dataset}.${table}\``);
    warehouseRowCount = Number(res?.[0]?.c ?? 0);
    log("info", `Warehouse verification: ${table} now holds ${warehouseRowCount.toLocaleString()} total rows.`);
  } catch {
    log("warn", "Warehouse verification query failed (non-fatal).");
  }

  return { rowsInserted: clean.length, tableCreated, datasetCreated, warehouseRowCount };
}

// ── Incremental load (staging table + MERGE) ─────────────────────────────────
//
// Additive sibling to loadToBigQuery(). Full-refresh flows keep calling
// loadToBigQuery() exactly as before — nothing about that path changes.
// A flow opted into incremental mode (flows.sync_mode = 'incremental') calls
// this instead: rows land in a throwaway staging table, any brand-new columns
// are ALTERed onto the target first (automatic schema evolution), then a
// single MERGE upserts staging into target on the caller-supplied key.

function bqScalarType(inferredType: string): BQScalarType {
  switch (inferredType) {
    case "BOOL": return "BOOL";
    case "INT64": return "INT64";
    case "FLOAT64": return "FLOAT64";
    case "TIMESTAMP": return "TIMESTAMP";
    default: return "STRING";
  }
}

export async function loadToBigQueryIncremental(args: {
  projectId: string;
  credentials: Record<string, string>;
  dataset: string;
  table: string;
  rows: Record<string, unknown>[];
  keyColumns: string[];
  schema?: BQField[];
  log: Logger;
  /** BigQuery dataset location. Defaults to "US". Set to "EU" for GDPR compliance. */
  location?: string;
}): Promise<{
  rowsStaged: number;
  columnsAdded: string[];
  tableCreated: boolean;
  datasetCreated: boolean;
  warehouseRowCount: number | null;
}> {
  const { projectId, credentials, dataset, rows, keyColumns, log } = args;
  const table = sanitizeName(args.table);
  const schema = args.schema ?? inferSchema(rows);
  const location = args.location ?? process.env.BIGQUERY_DEFAULT_LOCATION ?? "US";

  if (!keyColumns.length) throw new Error("Incremental load requires at least one key column to MERGE on");
  if (!rows.length) return { rowsStaged: 0, columnsAdded: [], tableCreated: false, datasetCreated: false, warehouseRowCount: null };

  const bq = new BigQuery({ projectId, credentials });

  // Dataset — same ensure-logic as the full-refresh path.
  const ds = bq.dataset(dataset);
  const [dsExists] = await ds.exists();
  let datasetCreated = false;
  if (!dsExists) {
    await bq.createDataset(dataset, { location });
    datasetCreated = true;
    log("success", `Dataset "${dataset}" created (location: ${location}).`);
  }

  // Target table — create with the full inferred schema on first run.
  const tbl = ds.table(table);
  const [tblExists] = await tbl.exists();
  let tableCreated = false;
  if (!tblExists) {
    await ds.createTable(table, { schema: { fields: schema } });
    tableCreated = true;
    log("success", `Table "${table}" created (${schema.length} columns, schema auto-generated).`);
  }

  // Automatic schema evolution: diff staging-batch schema vs. live target schema.
  const columnsAdded: string[] = [];
  if (!tableCreated) {
    const [metadata] = await tbl.getMetadata();
    const existingCols = new Set<string>((metadata?.schema?.fields ?? []).map((f: { name: string }) => f.name));
    const newCols = schema.filter((f) => !existingCols.has(f.name));
    if (newCols.length) {
      const alterStatements = buildAlterTableAddColumns({
        ref: { projectId, dataset, table },
        newColumns: newCols.map((f) => ({ name: f.name, type: bqScalarType(f.type) })),
      });
      for (const stmt of alterStatements) {
        await bq.query({ query: stmt.sql });
        columnsAdded.push(stmt.description.split(" ")[2]);
      }
      log("success", `Schema evolved: added column(s) ${newCols.map((c) => c.name).join(", ")}.`);
    }
  }

  // Stage the batch in a throwaway table (WRITE_TRUNCATE — staging never accumulates).
  const stagingTable = `_staging_${table}_${Date.now()}`;
  const stagingSchema = schema; // staging always carries this batch's full inferred schema
  await ds.createTable(stagingTable, { schema: { fields: stagingSchema }, expirationTime: String(Date.now() + 60 * 60_000) });

  log("info", "Staging incremental batch…");
  const clean = sanitizeRows(rows);
  const tmpFile = path.join(os.tmpdir(), `crosstecch-incr-${Date.now()}.ndjson`);
  fs.writeFileSync(tmpFile, clean.map((r) => JSON.stringify(r)).join("\n"));
  try {
    const stagingTbl = ds.table(stagingTable);
    const [job] = await stagingTbl.load(tmpFile, {
      sourceFormat: "NEWLINE_DELIMITED_JSON",
      writeDisposition: "WRITE_TRUNCATE",
      schema: { fields: stagingSchema },
    });
    const jobErrors = (job as any)?.status?.errors;
    if (jobErrors?.length) throw new Error(jobErrors[0]?.message ?? "Staging load job failed");

    // MERGE staging into target on the sync key(s).
    log("info", `Merging ${clean.length} rows into ${dataset}.${table} on [${keyColumns.join(", ")}]…`);
    const merge = buildMerge({
      ref: { projectId, dataset, table },
      stagingTable,
      keyColumns: keyColumns.map(sanitizeName),
      allColumns: schema.map((f) => f.name),
    });
    await bq.query({ query: merge.sql });
    log("success", `Merge complete — ${clean.length} rows upserted.`);
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    try { await ds.table(stagingTable).delete(); } catch { /* staging has a 1h expiry as a backstop */ }
  }

  let warehouseRowCount: number | null = null;
  try {
    const [res] = await bq.query(`SELECT COUNT(*) AS c FROM \`${projectId}.${dataset}.${table}\``);
    warehouseRowCount = Number(res?.[0]?.c ?? 0);
    log("info", `Warehouse verification: ${table} now holds ${warehouseRowCount.toLocaleString()} total rows.`);
  } catch {
    log("warn", "Warehouse verification query failed (non-fatal).");
  }

  return { rowsStaged: clean.length, columnsAdded, tableCreated, datasetCreated, warehouseRowCount };
}
