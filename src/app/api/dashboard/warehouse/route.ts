/**
 * POST /api/dashboard/warehouse
 *
 * Warehouse read layer — the Dashboard's ONLY data source for synced data.
 * Executes named, parameterized SQL against BigQuery. The client never sends
 * raw SQL; it selects an action. BigQuery is the single source of truth.
 *
 * Credentials are read from the server-side encrypted vault.
 * Body: { action, params? }   (projectId/dataset/serviceJson are IGNORED — vault only)
 *
 * Actions:
 *   instantly_latest   → latest snapshot of instantly_campaigns (optionally range-matched)
 *   row_count          → total rows + latest synced_at for a table
 *   sync_snapshots     → rows loaded per synced_at (sync history from warehouse)
 *   table_preview      → most recent N records of any table
 *   list_tables        → list all tables in the dataset
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { BigQuery } from "@google-cloud/bigquery";
import { getAuthContext } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { resolveBqCreds } from "@/lib/server/bq-creds";

export const dynamic = "force-dynamic";

// Only [a-z0-9_] table names — prevents SQL injection via identifiers
function safeIdent(s: string): string {
  return (s ?? "").replace(/[^a-zA-Z0-9_]/g, "").slice(0, 128);
}

export async function POST(req: NextRequest) {
  const { userId, workspaceId } = getAuthContext(req);
  // Workspace-scoped BQ credentials
  const bqCreds = resolveBqCreds(userId, workspaceId);
  if (!bqCreds) {
    return NextResponse.json({ ok: false, notConfigured: true, error: "BigQuery credentials not configured — add them in Settings." }, { status: 404 });
  }

  let body: { action?: string; params?: Record<string, string> };
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  const { action, params = {} } = body;
  if (!action)
    return NextResponse.json({ ok: false, error: "action required" }, { status: 400 });

  const { projectId, dataset, credentials } = bqCreds;

  const table = safeIdent(params.table ?? "instantly_campaigns");
  // Project IDs may contain dashes — allow [a-z0-9-] there
  const proj = (projectId ?? "").replace(/[^a-zA-Z0-9-]/g, "");
  const fqTable = `\`${proj}.${safeIdent(dataset)}.${table}\``;

  try {
    const bq = new BigQuery({ projectId, credentials });

    let sql = "";
    const queryParams: Record<string, string | number> = {};

    switch (action) {
      case "instantly_latest":
        sql = `
          SELECT campaign_id, name, status, total_leads, contacted, opened, replied,
                 bounced, open_rate, reply_rate, range_start, range_end, synced_at
          FROM ${fqTable}
          WHERE synced_at = (SELECT MAX(synced_at) FROM ${fqTable})
          ORDER BY contacted DESC`;
        break;

      case "row_count":
        sql = `
          SELECT COUNT(*) AS total_rows,
                 CAST(MAX(synced_at) AS STRING) AS last_synced_at,
                 COUNT(DISTINCT synced_at) AS snapshots
          FROM ${fqTable}`;
        break;

      case "sync_snapshots":
        sql = `
          SELECT CAST(synced_at AS STRING) AS synced_at, COUNT(*) AS rows_loaded
          FROM ${fqTable}
          GROUP BY synced_at
          ORDER BY synced_at DESC
          LIMIT 30`;
        break;

      case "table_preview":
        sql = `SELECT * FROM ${fqTable} ORDER BY synced_at DESC LIMIT @lim`;
        queryParams.lim = Math.min(Number(params.limit ?? 20), 200);
        break;

      case "list_tables": {
        // Return only tables that belong to this user's workspace flows — BigQuery is
        // a shared warehouse and INFORMATION_SCHEMA shows all tables in the dataset.
        const userFlowTables = (
          getDb()
            .prepare("SELECT warehouse_table FROM flows WHERE user_id = ? AND workspace_id = ? AND warehouse_table IS NOT NULL")
            .all(userId, workspaceId) as { warehouse_table: string }[]
        ).map((r) => r.warehouse_table);

        // Return user's flow tables that actually exist in BQ (filter via INFORMATION_SCHEMA)
        if (userFlowTables.length === 0) {
          return NextResponse.json({ ok: true, action, rows: [] });
        }
        const tableList = userFlowTables.map((t) => `'${safeIdent(t)}'`).join(",");
        sql = `
          SELECT table_name
          FROM \`${proj}.${safeIdent(dataset)}\`.INFORMATION_SCHEMA.TABLES
          WHERE table_type = 'BASE TABLE'
            AND table_name IN (${tableList})
          ORDER BY creation_time DESC`;
        break;
      }

      default:
        return NextResponse.json({ ok: false, error: `Unknown action "${action}"` }, { status: 400 });
    }

    let rows: Record<string, unknown>[];
    try {
      [rows] = await bq.query({ query: sql, params: queryParams });
    } catch (e) {
      // table_preview on tables without synced_at → retry unordered
      if (action === "table_preview" && /synced_at/i.test(String(e))) {
        [rows] = await bq.query({
          query: `SELECT * FROM ${fqTable} LIMIT @lim`,
          params: queryParams,
        });
      } else throw e;
    }

    // BigQuery returns timestamps as objects ({ value: "…" }) — flatten for the client
    const clean = rows.map((r) =>
      Object.fromEntries(
        Object.entries(r).map(([k, v]) => [
          k,
          v !== null && typeof v === "object" && "value" in (v as object) ? (v as { value: unknown }).value : v,
        ])
      )
    );

    return NextResponse.json({ ok: true, action, rows: clean });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const notFound = /Not found: Table/i.test(msg);
    return NextResponse.json(
      { ok: false, notFound, error: notFound ? `Table ${table} does not exist yet — run a sync first.` : msg },
      { status: notFound ? 404 : 500 }
    );
  }
}
