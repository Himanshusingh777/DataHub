/**
 * POST /api/warehouse/intelligence
 *
 * The Universal Intelligence Engine's warehouse execution layer.
 *
 * Every number this route returns is read from BigQuery. There is no demo
 * data, no synthetic fallback and no hardcoded analytics anywhere in this file.
 * If the warehouse can't answer, the route says so rather than inventing a value.
 *
 * All SQL is produced by the Dynamic SQL Generator (lib/engine/sql.ts) from
 * semantic metadata — identifiers are whitelisted, literals are bound as query
 * parameters, and only SELECT statements are ever emitted.
 *
 * Modes:
 *   discover  → dataset tables + column schema + storage/partition metadata
 *   profile   → schema + bounded sample + warehouse-side stats for one table
 *   analyze   → executes the full semantic query plan for one table
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { BigQuery } from "@google-cloud/bigquery";
import { getAuthContext } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { resolveBqCreds } from "@/lib/server/bq-creds";

export const dynamic = "force-dynamic";
import {
  buildSchemaIntrospection,
  buildTableMetadata,
  buildSample,
  buildFreshness,
  buildDuplicateCheck,
  buildComparison,
  buildRanking,
  buildRatioRanking,
  buildTimeSeries,
  defaultAggFor,
  safeIdentifier,
  type GeneratedSQL,
  type TableRef,
} from "@/lib/engine/sql";
import { classifyColumn, type ClassifiedColumn } from "@/lib/engine/semantic";

// BigQuery cost guardrail for a single intelligence refresh.
const MAX_BYTES_BILLED = "5000000000"; // 5 GB

interface Body {
  projectId?: string;
  dataset?: string;
  serviceJson?: string;
  mode?: "discover" | "profile" | "analyze";
  table?: string;
  /** Comparison window for period-over-period analysis. */
  windowDays?: number;
  /** Rows to sample for value-pattern classification. */
  sampleSize?: number;
}

/** BigQuery wraps timestamps/dates as { value } — flatten for JSON transport. */
function flatten(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((r) =>
    Object.fromEntries(
      Object.entries(r).map(([k, v]) => [
        k,
        v !== null && typeof v === "object" && "value" in (v as object)
          ? (v as { value: unknown }).value
          : v,
      ])
    )
  );
}

/** Map a BigQuery data_type onto the semantic engine's declared-type vocabulary. */
function declaredTypeOf(bqType: string): string {
  const t = (bqType || "").toUpperCase();
  if (/INT|NUMERIC|FLOAT|BIGNUMERIC/.test(t)) return "number";
  if (/BOOL/.test(t)) return "boolean";
  if (/TIMESTAMP|DATETIME|DATE|TIME/.test(t)) return "timestamp";
  if (/ARRAY|REPEATED/.test(t)) return "array";
  if (/STRUCT|RECORD|JSON/.test(t)) return "json";
  return "string";
}

interface ExecResult {
  key: string;
  description: string;
  rows: Record<string, unknown>[];
  bytesProcessed: number | null;
  ms: number;
  error?: string;
}

/**
 * Execute one generated query. A failure on a single query degrades that one
 * result rather than failing the whole intelligence refresh — a table missing
 * a timestamp column shouldn't cost you the rankings.
 */
async function exec(
  bq: BigQuery,
  key: string,
  q: GeneratedSQL,
  dataset: string,
  projectId: string
): Promise<ExecResult> {
  const started = Date.now();
  try {
    const [job] = await bq.createQueryJob({
      query: q.sql,
      params: q.params,
      maximumBytesBilled: MAX_BYTES_BILLED,
      defaultDataset: { datasetId: dataset, projectId },
    });
    const [rows] = await job.getQueryResults();
    const meta = job.metadata?.statistics?.query?.totalBytesProcessed;
    return {
      key,
      description: q.description,
      rows: flatten(rows as Record<string, unknown>[]),
      bytesProcessed: meta ? Number(meta) : null,
      ms: Date.now() - started,
    };
  } catch (err: unknown) {
    return {
      key,
      description: q.description,
      rows: [],
      bytesProcessed: null,
      ms: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function POST(req: NextRequest) {
  const { userId, workspaceId } = getAuthContext(req);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  const { mode = "discover", table } = body;

  // ── Credentials: vault-first, body fallback (for wizard pre-save path) ──────
  let projectId = body.projectId;
  let dataset   = body.dataset;
  let credentials: Record<string, string> | undefined;
  let bqLocation = process.env.BIGQUERY_DEFAULT_LOCATION ?? "US";

  if (!projectId || !dataset || !body.serviceJson) {
    // Read from vault — workspace-scoped BQ credentials
    const bqCreds = resolveBqCreds(userId, workspaceId);
    if (!bqCreds) {
      return NextResponse.json(
        { ok: false, notConfigured: true, error: "BigQuery credentials not configured — add them in Settings or during flow creation." },
        { status: 404 }
      );
    }
    projectId   = bqCreds.projectId;
    dataset     = bqCreds.dataset;
    credentials = bqCreds.credentials;
    bqLocation  = bqCreds.location;
  } else {
    // Explicit body credentials (wizard pre-save path)
    try {
      credentials = JSON.parse(body.serviceJson!);
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid service account JSON" }, { status: 400 });
    }
  }

  const bq = new BigQuery({ projectId, credentials });
  const startedAll = Date.now();

  try {
    // ── DISCOVER ────────────────────────────────────────────────────────────
    if (mode === "discover") {
      const schemaQ = buildSchemaIntrospection({ projectId, dataset });
      const metaQ = buildTableMetadata({ projectId, dataset });

      const [schemaRes, metaRes] = await Promise.all([
        exec(bq, "schema", schemaQ, dataset, projectId),
        exec(bq, "metadata", metaQ, dataset, projectId),
      ]);

      if (schemaRes.error) {
        return NextResponse.json(
          { ok: false, error: `Could not read dataset schema: ${schemaRes.error}` },
          { status: 500 }
        );
      }

      // Group columns by table and classify each one from its name + BQ type
      const byTable = new Map<string, ClassifiedColumn[]>();
      for (const row of schemaRes.rows) {
        const t = String(row.table_name ?? "");
        const name = String(row.column_name ?? "");
        if (!t || !name) continue;
        const declared = declaredTypeOf(String(row.data_type ?? ""));
        if (!byTable.has(t)) byTable.set(t, []);
        byTable.get(t)!.push(classifyColumn(name, declared, []));
      }

      // ── Per-user table isolation ─────────────────────────────────────────
      // BigQuery is shared — only expose tables that belong to this user's flows.
      // IMPORTANT: if the user has no synced flows, return empty (not all tables).
      const db = getDb();
      // Each user/workspace sees only their own tables.
      let userFlowTables = (
        db.prepare("SELECT warehouse_table FROM flows WHERE user_id = ? AND workspace_id = ? AND warehouse_table IS NOT NULL")
          .all(userId, workspaceId) as { warehouse_table: string }[]
      ).map((r) => r.warehouse_table);

      // Self-healing recovery: for flows where warehouse_table is still NULL,
      // parse run logs for "Loaded N rows → tablename" and write it back to the DB.
      // This makes Intelligence/Warehouse work after the first sync without a page reload.
      if (userFlowTables.length === 0) {
        try {
          const nullFlows = db.prepare(
            "SELECT id FROM flows WHERE user_id = ? AND workspace_id = ?"
          ).all(userId, workspaceId) as { id: string }[];
          for (const { id: fid } of nullFlows) {
            const latestRun = db.prepare(
              "SELECT logs FROM runs WHERE flow_id = ? AND status = 'success' ORDER BY started_at DESC LIMIT 1"
            ).get(fid) as { logs: string } | undefined;
            if (!latestRun?.logs) continue;
            try {
              const logs: { message?: string }[] = JSON.parse(latestRun.logs);
              for (const entry of logs) {
                const m = entry.message?.match(/Loaded \d+ rows → (\S+)/);
                if (m?.[1]) {
                  db.prepare("UPDATE flows SET warehouse_table = ? WHERE id = ?").run(m[1], fid);
                  userFlowTables.push(m[1]);
                  break;
                }
              }
            } catch { /* malformed logs */ }
          }
        } catch { /* non-fatal */ }
      }

      // Empty = no synced flows for this user → show nothing (never fall through to all tables)
      const allowedTables = new Set(userFlowTables);

      const tables = [...byTable.entries()]
        .filter(([name]) => allowedTables.has(name))
        .map(([name, columns]) => {
        const meta = metaRes.rows.find((m) => String(m.table_name) === name);
        return {
          table: name,
          columns,
          totalRows: meta?.total_rows != null ? Number(meta.total_rows) : null,
          totalBytes: meta?.total_logical_bytes != null ? Number(meta.total_logical_bytes) : null,
          isPartitioned: Boolean(meta?.is_partitioned),
          // Surface the best partition/cluster candidates for the recommender
          partitionCandidate: columns.find((c) => c.role === "time")?.name ?? null,
          clusterCandidate: columns.find((c) => c.role === "dimension")?.name ?? null,
        };
      });

      return NextResponse.json({
        ok: true,
        mode,
        dataset,
        tables,
        latency: {
          queryMs: Date.now() - startedAll,
          bytesProcessed: (schemaRes.bytesProcessed ?? 0) + (metaRes.bytesProcessed ?? 0) || null,
          tablesScanned: tables.length,
        },
        // Metadata query can legitimately fail on datasets without TABLE_STORAGE access
        warnings: metaRes.error ? [`Storage metadata unavailable: ${metaRes.error}`] : [],
      });
    }

    // Both remaining modes operate on a single table
    if (!table) {
      return NextResponse.json(
        { ok: false, error: "`table` is required for profile and analyze modes" },
        { status: 400 }
      );
    }

    const safeTable = safeIdentifier(table);
    const ref: TableRef = { projectId, dataset, table: safeTable };

    // ── PROFILE ─────────────────────────────────────────────────────────────
    // Schema + a bounded sample. The sample feeds value-pattern classification
    // and the client-side statistical profiler; it is never used as a data
    // source for KPIs (those come from the aggregate queries in analyze mode).
    if (mode === "profile") {
      const schemaQ = buildSchemaIntrospection({ projectId, dataset, table: safeTable });
      const sampleQ = buildSample({ ref, limit: body.sampleSize ?? 500 });

      const [schemaRes, sampleRes] = await Promise.all([
        exec(bq, "schema", schemaQ, dataset, projectId),
        exec(bq, "sample", sampleQ, dataset, projectId),
      ]);

      if (schemaRes.error) {
        return NextResponse.json({ ok: false, error: schemaRes.error }, { status: 500 });
      }

      const declaredTypes: Record<string, string> = {};
      for (const row of schemaRes.rows) {
        declaredTypes[String(row.column_name)] = declaredTypeOf(String(row.data_type ?? ""));
      }

      return NextResponse.json({
        ok: true,
        mode,
        table: safeTable,
        declaredTypes,
        sample: sampleRes.rows,
        sampleError: sampleRes.error ?? null,
        latency: {
          queryMs: Date.now() - startedAll,
          bytesProcessed: (schemaRes.bytesProcessed ?? 0) + (sampleRes.bytesProcessed ?? 0) || null,
          tablesScanned: 1,
        },
      });
    }

    // ── ANALYZE ─────────────────────────────────────────────────────────────
    // Executes the semantic query plan. Every KPI, chart and insight the client
    // renders originates from these aggregates — computed IN the warehouse.
    const schemaRes = await exec(
      bq,
      "schema",
      buildSchemaIntrospection({ projectId, dataset, table: safeTable }),
      dataset,
      projectId
    );
    if (schemaRes.error) {
      return NextResponse.json({ ok: false, error: schemaRes.error }, { status: 500 });
    }
    if (!schemaRes.rows.length) {
      return NextResponse.json(
        { ok: false, notFound: true, error: `Table ${safeTable} not found in ${dataset}.` },
        { status: 404 }
      );
    }

    const columns: ClassifiedColumn[] = schemaRes.rows.map((row) =>
      classifyColumn(String(row.column_name), declaredTypeOf(String(row.data_type ?? "")), [])
    );

    const timeCol = columns.find((c) => c.role === "time");
    const metricCols = columns.filter((c) => c.role === "metric");
    const dimCols = columns.filter((c) => c.role === "dimension");
    const keyCol = columns.find((c) => c.role === "identifier");
    const primary = metricCols[0];
    const windowDays = Math.min(Math.max(Number(body.windowDays) || 30, 1), 365);

    // Assemble the plan — driven entirely by what the columns MEAN
    const plan: { key: string; query: GeneratedSQL }[] = [];

    if (timeCol) {
      plan.push({ key: "freshness", query: buildFreshness({ ref, timeColumn: timeCol.name }) });
      plan.push({
        key: "timeseries",
        query: buildTimeSeries({
          ref,
          timeColumn: timeCol.name,
          metric: primary ? { column: primary.name, fn: defaultAggFor(primary) } : undefined,
          grain: "DAY",
          lookbackDays: 90,
        }),
      });

      // A comparison per headline metric (capped — each is a full scan)
      for (const m of metricCols.slice(0, 4)) {
        plan.push({
          key: `comparison:${m.name}`,
          query: buildComparison({
            ref,
            timeColumn: timeCol.name,
            metric: { column: m.name, fn: defaultAggFor(m) },
            windowDays,
          }),
        });
      }
    }

    // Rankings — use COUNT(*) so charts always have data even when the primary
    // metric is 0 (common with Instantly, CSV, etc.). Skip id/uuid columns.
    const ID_PATTERN = /^(id|uuid|guid)$|_id$|_uuid$/i;
    const rankDims = dimCols.filter((c) => !ID_PATTERN.test(c.name));
    for (const d of rankDims.slice(0, 3)) {
      plan.push({
        key: `ranking:${d.name}`,
        query: buildRanking({
          ref,
          dimension: d.name,
          metric: { column: "__count__", fn: "COUNT_STAR" },
          topN: 12,
        }),
      });
    }

    // Computed ratio charts — e.g. "Top campaigns by reply rate"
    const nameDim = rankDims.find((c) => /^(name|campaign_name|title|label)$/i.test(c.name))
      ?? rankDims.find((c) => /name|title|label/i.test(c.name));
    if (nameDim) {
      const repliedCol  = metricCols.find((c) => /^(replied|replies|reply_count)$/i.test(c.name));
      const contactedCol = metricCols.find((c) => /^(contacted|contact_count|sent)$/i.test(c.name));
      const openedCol   = metricCols.find((c) => /^(opened|opens|open_count)$/i.test(c.name));

      if (repliedCol && contactedCol) {
        plan.push({
          key: `computed_rate:reply_rate:${nameDim.name}`,
          query: buildRatioRanking({ ref, dimension: nameDim.name, numerator: repliedCol.name, denominator: contactedCol.name, topN: 10 }),
        });
      }
      if (openedCol && contactedCol) {
        plan.push({
          key: `computed_rate:open_rate:${nameDim.name}`,
          query: buildRatioRanking({ ref, dimension: nameDim.name, numerator: openedCol.name, denominator: contactedCol.name, topN: 10 }),
        });
      }
    }

    if (keyCol) {
      plan.push({ key: "duplicates", query: buildDuplicateCheck({ ref, keyColumn: keyCol.name }) });
    }

    // Run the plan concurrently — individual failures degrade gracefully
    const results = await Promise.all(
      plan.map((p) => exec(bq, p.key, p.query, dataset, projectId))
    );

    const totalBytes = results.reduce((s, r) => s + (r.bytesProcessed ?? 0), 0);

    return NextResponse.json({
      ok: true,
      mode,
      table: safeTable,
      columns,
      windowDays,
      results: results.map((r) => ({
        key: r.key,
        description: r.description,
        rows: r.rows,
        error: r.error ?? null,
        ms: r.ms,
      })),
      // The exact SQL is returned so the platform is auditable — a user can see
      // precisely which query produced every number on screen.
      queries: plan.map((p) => ({ key: p.key, sql: p.query.sql, description: p.query.description })),
      latency: {
        queryMs: Date.now() - startedAll,
        bytesProcessed: totalBytes || null,
        tablesScanned: 1,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const notFound = /Not found: (Table|Dataset)/i.test(msg);
    return NextResponse.json(
      {
        ok: false,
        notFound,
        error: notFound
          ? "That table or dataset doesn't exist yet — run a sync first."
          : msg,
      },
      { status: notFound ? 404 : 500 }
    );
  }
}
