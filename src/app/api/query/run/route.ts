/**
 * POST /api/query/run
 *
 * Executes a SQL query against the user's configured BigQuery warehouse.
 * Results are limited to 1,000 rows in the response (full result set is available via export).
 * Every execution is logged to query_history for auditing and cost tracking.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { decrypt } from "@/lib/server/crypto";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface BQResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  bytesProcessed: number;
  durationMs: number;
}

interface WarehouseCreds {
  project_id: string;
  dataset: string;
  service_json: string;
  location?: string;
}

export async function POST(req: NextRequest) {
  const { userId, workspaceId } = await getAuthContext(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { sql?: string };
  const sql = (body.sql ?? "").trim();
  if (!sql) return NextResponse.json({ error: "No SQL provided" }, { status: 400 });

  // Basic safety check: disallow DDL and DML outside SELECT
  const upperSql = sql.toUpperCase().trimStart();
  const DISALLOWED = ["DROP", "DELETE", "UPDATE", "INSERT", "TRUNCATE", "ALTER", "CREATE", "MERGE"];
  for (const kw of DISALLOWED) {
    if (upperSql.startsWith(kw)) {
      return NextResponse.json({ error: `${kw} statements are not allowed in Query Studio` }, { status: 400 });
    }
  }

  const db = getDb();
  const startTime = Date.now();
  const queryId = randomUUID();

  // Record pending history entry
  await db.prepare(`
    INSERT INTO query_history (id, user_id, workspace_id, sql, status, created_at)
    VALUES (?, ?, ?, ?, 'running', ?)
  `).run(queryId, userId, workspaceId, sql, Date.now());

  try {
    // Get BigQuery credentials from vault (column is `data`, not `encrypted_value`)
    const row = await db.prepare(
      "SELECT data FROM credentials WHERE user_id = ? AND service = 'bigquery' LIMIT 1"
    ).get(userId) as { data: string } | undefined;

    if (!row) {
      // Demo mode: return mock results
      const demoResult: BQResult = {
        columns: ["greeting", "value", "computed_at"],
        rows: [
          { greeting: "Hello from CrossTecch Query Studio!", value: 42, computed_at: new Date().toISOString() },
        ],
        rowCount: 1,
        bytesProcessed: 0,
        durationMs: Date.now() - startTime,
      };
      await db.prepare("UPDATE query_history SET status='success', rows_returned=1, duration_ms=? WHERE id=?")
        .run(demoResult.durationMs, queryId);
      return NextResponse.json({ result: demoResult, demo: true });
    }

    let creds: WarehouseCreds;
    try {
      creds = JSON.parse(decrypt(row.data));
    } catch {
      throw new Error("Credential decryption failed");
    }

    // Dynamic import of BigQuery client
    let BigQuery: typeof import("@google-cloud/bigquery").BigQuery;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      BigQuery = require("@google-cloud/bigquery").BigQuery;
    } catch {
      throw new Error("BigQuery client not installed — run: npm install @google-cloud/bigquery");
    }

    const serviceAccount = JSON.parse(creds.service_json);
    const bq = new BigQuery({
      projectId: creds.project_id,
      credentials: serviceAccount,
    });

    const [job] = await bq.createQueryJob({
      query: sql,
      useLegacySql: false,
      // Pass location at job level (not client level) so query runs in the
      // same region as the dataset — avoids "not found in location US" errors
      location: creds.location ?? undefined,
      maximumBytesBilled: "10000000000", // 10 GB safety limit
    });

    const [rows, , metadata] = await job.getQueryResults({ maxResults: 1000 });
    const durationMs = Date.now() - startTime;
    const bytesProcessed = Number(metadata?.totalBytesProcessed ?? 0);
    const schema = metadata?.schema?.fields ?? [];
    const columns = schema.map((f) => f.name ?? "");

    // BigQuery returns TIMESTAMP/DATE values as { value: "..." } objects — flatten to strings
    const flattenBQValue = (v: unknown): unknown => {
      if (v === null || v === undefined) return null;
      if (typeof v === "object" && !Array.isArray(v) && "value" in (v as object))
        return (v as { value: unknown }).value;
      return v;
    };
    const flatRows = (rows as Record<string, unknown>[]).map(row =>
      Object.fromEntries(Object.entries(row).map(([k, v]) => [k, flattenBQValue(v)]))
    );

    const result: BQResult = {
      columns,
      rows: flatRows,
      rowCount: flatRows.length,
      bytesProcessed,
      durationMs,
    };

    await db.prepare(`
      UPDATE query_history
      SET status='success', rows_returned=?, bytes_processed=?, duration_ms=?, result_json=?
      WHERE id=?
    `).run(result.rowCount, bytesProcessed, durationMs, JSON.stringify(rows.slice(0, 100)), queryId);

    return NextResponse.json({ result });
  } catch (e: unknown) {
    const msg = (e as Error).message ?? String(e);
    const durationMs = Date.now() - startTime;
    await db.prepare("UPDATE query_history SET status='error', duration_ms=?, error=? WHERE id=?")
      .run(durationMs, msg, queryId);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
