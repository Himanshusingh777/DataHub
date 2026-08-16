/**
 * Warehouse Monitoring — real BigQuery telemetry, no mock data.
 *
 * Complements (does not replace) the Universal Intelligence Engine's
 * warehouse route (/api/warehouse/intelligence, lib/engine/sql.ts). That
 * route answers "what does the data say"; this module answers "how healthy
 * and expensive is the warehouse itself" — storage, query cost, partitions,
 * cluster/table health, and load duration.
 *
 * Every number here is either read live from BigQuery (INFORMATION_SCHEMA,
 * Jobs API) or from this app's own `runs` table (load duration — already
 * recorded by every sync, full or incremental). Nothing is invented.
 */

import { BigQuery } from "@google-cloud/bigquery";
import { buildTableMetadata, buildFreshness, safeProject, safeIdentifier, type TableRef } from "@/lib/engine/sql";
import { classifyColumn } from "@/lib/engine/semantic";
import { getDb } from "./db";
import { namedCache } from "@/lib/perf/cache";

// Storage/query-cost/cluster-health all hit BigQuery (INFORMATION_SCHEMA +
// Jobs API) — genuinely expensive relative to a page load. A short TTL cache
// means opening the Warehouse page twice in quick succession, or a
// dashboard widget polling it, doesn't re-run the same BigQuery calls every
// time. Load duration is excluded from the cache (see getWarehouseSnapshot)
// because it's a cheap local SQLite read and should reflect a just-finished
// sync immediately, not a stale cached value.
const SNAPSHOT_CACHE_TTL_MS = 30_000;
const remoteSnapshotCache = namedCache<{
  storage: Awaited<ReturnType<typeof getStorageOverview>>;
  queryCost: Awaited<ReturnType<typeof getQueryCostEstimate>>;
  clusterHealth: TableHealth[];
}>("warehouse-monitor:remote", { defaultTtlMs: SNAPSHOT_CACHE_TTL_MS, maxEntries: 500 });

// On-demand BigQuery pricing, USD per TB scanned. Used only to *estimate*
// spend from bytes-processed telemetry we already have — this is not a
// billing API call and will not match an actual invoice exactly.
const USD_PER_TB = 6.25;

function flatten(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((r) =>
    Object.fromEntries(
      Object.entries(r).map(([k, v]) => [
        k,
        v !== null && typeof v === "object" && "value" in (v as object) ? (v as { value: unknown }).value : v,
      ])
    )
  );
}

// ── Storage + partitions ──────────────────────────────────────────────────

export interface TableStorage {
  table: string;       // bare table name (no dataset prefix)
  dataset: string;     // dataset the table lives in
  totalRows: number | null;
  totalBytes: number | null;
  totalGB: number | null;
  isPartitioned: boolean;
  createdAt: string | null;
}

export async function getStorageOverview(args: {
  bq: BigQuery; projectId: string; dataset: string;
}): Promise<{ tables: TableStorage[]; totalBytes: number; totalGB: number; partitionedCount: number; unpartitionedCount: number }> {
  const { bq, projectId, dataset } = args;

  // Try to get all datasets in the project first, then scan each one.
  // This makes the warehouse monitor resilient to mis-configured dataset names.
  let datasetsToScan: string[] = [dataset];
  try {
    const [datasets] = await bq.getDatasets({ projectId });
    if (datasets.length > 0) {
      datasetsToScan = datasets
        .map((d) => d.id ?? "")
        .filter((id) => id && !id.startsWith("_")); // skip hidden datasets
    }
  } catch {
    // Fallback to configured dataset only
  }

  const allTables: TableStorage[] = [];

  for (const ds of datasetsToScan) {
    try {
      // Use BigQuery client API to list tables — avoids query-job location
      // mismatch (when the BQ client is initialised with a different region
      // than the dataset).  Falls back to a __TABLES__ query job only if the
      // REST call fails (e.g. permission edge-cases in Sandbox).
      let tablesMeta: TableStorage[] = [];

      try {
        const dsRef = bq.dataset(ds, { projectId });
        const [bqTables] = await dsRef.getTables();
        tablesMeta = await Promise.all(
          bqTables.map(async (t) => {
            let totalRows: number | null = null;
            let totalBytes: number | null = null;
            let isPartitioned = false;
            let createdAt: string | null = null;
            try {
              const [meta] = await t.getMetadata();
              totalRows     = meta?.numRows         != null ? Number(meta.numRows)         : null;
              totalBytes    = meta?.numBytes         != null ? Number(meta.numBytes)         : null;
              isPartitioned = meta?.timePartitioning != null || meta?.rangePartitioning != null;
              createdAt     = meta?.creationTime     != null ? new Date(Number(meta.creationTime)).toISOString() : null;
            } catch { /* metadata call optional */ }
            return {
              table:      t.id ?? "",
              dataset:    ds,
              totalRows,
              totalBytes,
              totalGB:    totalBytes != null ? Math.round((totalBytes / 1e9) * 100) / 100 : null,
              isPartitioned,
              createdAt,
            } satisfies TableStorage;
          })
        );
      } catch {
        // Fallback: __TABLES__ query (location-neutral because it runs inside
        // the same dataset region, not the client's configured location).
        const q = buildTableMetadata({ projectId, dataset: ds });
        const [job] = await bq.createQueryJob({
          query: q.sql,
          location: undefined,   // let BQ detect from dataset
          defaultDataset: { datasetId: ds, projectId },
        });
        const [rows] = await job.getQueryResults();
        const flat = flatten(rows as Record<string, unknown>[]);
        tablesMeta = flat.map((r) => {
          const bytes = r.total_logical_bytes != null ? Number(r.total_logical_bytes) : null;
          return {
            table:      String(r.table_name),
            dataset:    ds,
            totalRows:  r.total_rows != null ? Number(r.total_rows) : null,
            totalBytes: bytes,
            totalGB:    bytes != null ? Math.round((bytes / 1e9) * 100) / 100 : null,
            isPartitioned: Boolean(r.is_partitioned),
            createdAt:  r.creation_time != null ? String(r.creation_time) : null,
          } satisfies TableStorage;
        });
      }

      allTables.push(...tablesMeta.filter((t) => t.table !== ""));
    } catch {
      // Dataset may not exist or may be inaccessible — skip it
    }
  }

  const totalBytes = allTables.reduce((s, t) => s + (t.totalBytes ?? 0), 0);
  return {
    tables: allTables,
    totalBytes,
    totalGB: Math.round((totalBytes / 1e9) * 100) / 100,
    partitionedCount: allTables.filter((t) => t.isPartitioned).length,
    unpartitionedCount: allTables.filter((t) => !t.isPartitioned).length,
  };
}

// ── Query cost (BigQuery Jobs API) ────────────────────────────────────────

export interface QueryCostDay { date: string; bytesProcessed: number; estimatedUsd: number; jobCount: number }

export async function getQueryCostEstimate(args: {
  bq: BigQuery; projectId: string; lookbackDays?: number; maxJobs?: number;
}): Promise<{ days: QueryCostDay[]; totalBytesProcessed: number; totalEstimatedUsd: number; jobsScanned: number; warning?: string }> {
  const { bq, projectId, lookbackDays = 7, maxJobs = 500 } = args;
  const since = Date.now() - lookbackDays * 86_400_000;

  try {
    // BigQuery's Jobs API is project-scoped and lists this service account's
    // own jobs — exactly the query cost this platform itself has incurred.
    const [jobs] = await bq.getJobs({ maxResults: maxJobs, allUsers: false, projection: "full" });
    const byDay = new Map<string, { bytes: number; count: number }>();
    let totalBytes = 0;

    for (const job of jobs) {
      const meta = job.metadata;
      const created = meta?.statistics?.creationTime ? Number(meta.statistics.creationTime) : null;
      if (!created || created < since) continue;
      const bytes = Number(meta?.statistics?.query?.totalBytesProcessed ?? meta?.statistics?.totalBytesProcessed ?? 0);
      if (!bytes) continue;
      const day = new Date(created).toISOString().slice(0, 10);
      const entry = byDay.get(day) ?? { bytes: 0, count: 0 };
      entry.bytes += bytes; entry.count += 1;
      byDay.set(day, entry);
      totalBytes += bytes;
    }

    const days: QueryCostDay[] = [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        date, bytesProcessed: v.bytes, jobCount: v.count,
        estimatedUsd: Math.round((v.bytes / 1e12) * USD_PER_TB * 10000) / 10000,
      }));

    return {
      days,
      totalBytesProcessed: totalBytes,
      totalEstimatedUsd: Math.round((totalBytes / 1e12) * USD_PER_TB * 100) / 100,
      jobsScanned: jobs.length,
    };
  } catch (e) {
    // Jobs API requires bigquery.jobs.list on the service account — degrade
    // gracefully rather than failing the whole monitoring page.
    return {
      days: [], totalBytesProcessed: 0, totalEstimatedUsd: 0, jobsScanned: 0,
      warning: `Query cost unavailable: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

// ── Cluster / table health (freshness-based) ──────────────────────────────

export interface TableHealth {
  table: string;
  status: "healthy" | "stale" | "unknown";
  lagHours: number | null;
  latest: string | null;
  totalRows: number | null;
  timeColumn: string | null;
}

/** Flags a table stale once its freshest row is older than this many hours. */
const STALE_THRESHOLD_HOURS = 30; // covers the slowest scheduled interval (daily) with headroom

export async function getClusterHealth(args: {
  bq: BigQuery; projectId: string; dataset: string; tables: { table: string; columns: string[] }[];
}): Promise<TableHealth[]> {
  const { bq, projectId, dataset, tables } = args;

  const results = await Promise.all(
    tables.map(async ({ table, columns }): Promise<TableHealth> => {
      // Reuse the semantic engine just to pick a plausible time column —
      // same classifier the Intelligence layer uses, so "freshness" means
      // the same thing everywhere in the platform.
      const classified = columns.map((c) => classifyColumn(c, "string", []));
      const timeCol = classified.find((c) => c.role === "time")?.name ?? null;
      if (!timeCol) return { table, status: "unknown", lagHours: null, latest: null, totalRows: null, timeColumn: null };

      try {
        const ref: TableRef = { projectId, dataset, table: safeIdentifier(table) };
        const q = buildFreshness({ ref, timeColumn: timeCol });
        const [job] = await bq.createQueryJob({ query: q.sql, defaultDataset: { datasetId: dataset, projectId } });
        const [rows] = await job.getQueryResults();
        const r = flatten(rows as Record<string, unknown>[])[0] ?? {};
        const lagHours = r.lag_hours != null ? Number(r.lag_hours) : null;
        return {
          table,
          status: lagHours == null ? "unknown" : lagHours > STALE_THRESHOLD_HOURS ? "stale" : "healthy",
          lagHours,
          latest: r.latest != null ? String(r.latest) : null,
          totalRows: r.total_rows != null ? Number(r.total_rows) : null,
          timeColumn: timeCol,
        };
      } catch {
        return { table, status: "unknown", lagHours: null, latest: null, totalRows: null, timeColumn: timeCol };
      }
    })
  );

  return results;
}

// ── Load duration (this app's own sync history — always available) ───────

export interface LoadDurationStats {
  flowId: string;
  sourceId: string;
  destTable: string | null;
  runCount: number;
  avgMs: number;
  p95Ms: number;
  lastMs: number | null;
  lastStatus: string | null;
  lastRunAt: number | null;
}

/**
 * Load duration doesn't need BigQuery at all — every run (full or
 * incremental) already records duration_ms in the local `runs` table via
 * runner.ts. This is real, first-party telemetry, not a warehouse query.
 */
export async function getLoadDurations(args: { userId: string; workspaceId?: string; limit?: number }): Promise<LoadDurationStats[]> {
  const { userId, workspaceId, limit = 200 } = args;
  const db = getDb();
  const flows = (workspaceId
    ? await db.prepare("SELECT id, source_id, warehouse_table FROM flows WHERE user_id = ? AND workspace_id = ?").all(userId, workspaceId)
    : await db.prepare("SELECT id, source_id, warehouse_table FROM flows WHERE user_id = ?").all(userId)) as
    { id: string; source_id: string; warehouse_table: string | null }[];

  const stats = await Promise.all(flows.map(async (f) => {
    const runs = await db.prepare(
      "SELECT duration_ms, status, started_at FROM runs WHERE flow_id = ? AND duration_ms IS NOT NULL ORDER BY started_at DESC LIMIT ?"
    ).all(f.id, limit) as { duration_ms: number; status: string; started_at: number }[];

    const durations = runs.map((r) => r.duration_ms).sort((a, b) => a - b);
    const avgMs = durations.length ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length) : 0;
    const p95Ms = durations.length ? durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))] : 0;

    return {
      flowId: f.id,
      sourceId: f.source_id,
      destTable: f.warehouse_table,
      runCount: runs.length,
      avgMs,
      p95Ms,
      lastMs: runs[0]?.duration_ms ?? null,
      lastStatus: runs[0]?.status ?? null,
      lastRunAt: runs[0]?.started_at ?? null,
    };
  }));
  return stats.filter((s) => s.runCount > 0);
}

// ── Warehouse statistics (composite snapshot) ─────────────────────────────

export interface WarehouseSnapshot {
  storage: Awaited<ReturnType<typeof getStorageOverview>>;
  queryCost: Awaited<ReturnType<typeof getQueryCostEstimate>>;
  clusterHealth: TableHealth[];
  loadDurations: LoadDurationStats[];
  generatedAt: string;
}

async function computeRemoteSnapshot(args: { projectId: string; dataset: string; credentials: Record<string, string>; location?: string }) {
  const { projectId, dataset, credentials } = args;
  // Do NOT pass location to the client — BigQuery auto-detects dataset region
  // from the table reference in each query. Pinning a location here causes
  // "Dataset not found in location X" errors when the dataset is in a
  // different region than what the user saved in Settings.
  const bq = new BigQuery({ projectId, credentials });

  const [storage, queryCost] = await Promise.all([
    getStorageOverview({ bq, projectId, dataset }),
    getQueryCostEstimate({ bq, projectId }),
  ]);

  // Column names per table, keyed by bare table name.
  // INFORMATION_SCHEMA.COLUMNS may not be available in all BigQuery sandbox configs,
  // so failures are silently ignored — cluster health will show "unknown" for those tables.
  const colsByTable = new Map<string, string[]>();
  if (storage.tables.length > 0) {
    // Collect distinct datasets represented in the storage snapshot
    const datasetsInSnapshot = [...new Set(storage.tables.map((t) => t.dataset))];
    for (const ds of datasetsInSnapshot) {
      try {
        const schemaQ = `SELECT table_name, column_name FROM \`${projectId}.${ds}\`.INFORMATION_SCHEMA.COLUMNS`;
        const [schemaJob] = await bq.createQueryJob({ query: schemaQ, defaultDataset: { datasetId: ds, projectId } });
        const [schemaRows] = await schemaJob.getQueryResults();
        for (const row of schemaRows as { table_name: string; column_name: string }[]) {
          const arr = colsByTable.get(row.table_name) ?? [];
          arr.push(row.column_name);
          colsByTable.set(row.table_name, arr);
        }
      } catch {
        // Schema discovery failed for this dataset — skip
      }
    }
  }

  // Use the dataset from the first table in the health check (or the configured default)
  const primaryDataset = storage.tables[0]?.dataset ?? dataset;
  const clusterHealth = await getClusterHealth({
    bq, projectId, dataset: primaryDataset,
    tables: storage.tables.map((t) => ({ table: t.table, columns: colsByTable.get(t.table) ?? [] })),
  });

  return { storage, queryCost, clusterHealth };
}

export async function getWarehouseSnapshot(args: {
  projectId: string; dataset: string; credentials: Record<string, string>; userId: string; workspaceId?: string; location?: string;
}): Promise<WarehouseSnapshot> {
  const { projectId, dataset, credentials, userId, workspaceId, location } = args;
  safeProject(projectId); safeIdentifier(dataset); // fail fast on malformed identifiers

  const cacheKey = `${projectId}:${dataset}`;
  const { storage, queryCost, clusterHealth } = await remoteSnapshotCache.getOrCompute(
    cacheKey,
    () => computeRemoteSnapshot({ projectId, dataset, credentials, location })
  );

  // Always fresh — cheap local read, and should reflect a sync that just
  // finished rather than whatever was cached 30s ago.
  const loadDurations = await getLoadDurations({ userId, workspaceId });

  // ── Per-user table isolation ──────────────────────────────────────────────
  // BigQuery is a shared warehouse — INFORMATION_SCHEMA returns ALL tables in
  // the dataset. Filter to only the tables that belong to this user's flows so
  // clients cannot see tables created by other users' sync jobs.
  // IMPORTANT: if userFlowTables is empty, return empty (never fall through to all tables).
  const db = getDb();
  // Collect tables from flows belonging to this user.
  // Query by user_id only (not workspace_id) — wizard may store flows under
  // workspace_id='default' while the monitor API resolves the user's own
  // workspace. Also fall back to user_id='local' (unauthenticated single-user
  // setup) so users see their data regardless of when they first registered.
  const LOCAL_UID = "local";
  const userIds = userId === LOCAL_UID ? [LOCAL_UID] : [userId, LOCAL_UID];
  const placeholders = userIds.map(() => "?").join(",");
  let userFlowTables = (
    await db.prepare(`SELECT warehouse_table FROM flows WHERE user_id IN (${placeholders}) AND warehouse_table IS NOT NULL`).all(...userIds) as { warehouse_table: string }[]
  ).map((r) => r.warehouse_table);

  // Self-healing recovery: parse run logs for "Loaded N rows → tablename" and
  // write warehouse_table back to flows so future lookups find it instantly.
  if (userFlowTables.length === 0) {
    try {
      const nullFlows = await db.prepare(
        `SELECT id FROM flows WHERE user_id IN (${placeholders})`
      ).all(...userIds) as { id: string }[];
      for (const { id: fid } of nullFlows) {
        const latestRun = await db.prepare(
          "SELECT logs FROM runs WHERE flow_id = ? AND status = 'success' ORDER BY started_at DESC LIMIT 1"
        ).get(fid) as { logs: string } | undefined;
        if (!latestRun?.logs) continue;
        try {
          const logs: { message?: string }[] = JSON.parse(latestRun.logs);
          for (const entry of logs) {
            const m = entry.message?.match(/Loaded \d+ rows → (\S+)/);
            if (m?.[1]) {
              await db.prepare("UPDATE flows SET warehouse_table = ? WHERE id = ?").run(m[1], fid);
              userFlowTables.push(m[1]);
              break;
            }
          }
        } catch { /* malformed logs */ }
      }
    } catch { /* non-fatal */ }
  }

  const allowed = new Set(userFlowTables);
  const tables = storage.tables.filter((t) => allowed.has(t.table));
  const totalBytes = tables.reduce((s, t) => s + (t.totalBytes ?? 0), 0);
  const filteredStorage = {
    tables,
    totalBytes,
    totalGB: Math.round((totalBytes / 1e9) * 100) / 100,
    partitionedCount: tables.filter((t) => t.isPartitioned).length,
    unpartitionedCount: tables.filter((t) => !t.isPartitioned).length,
  };
  const filteredClusterHealth = clusterHealth.filter((h) => allowed.has(h.table));

  return { storage: filteredStorage, queryCost, clusterHealth: filteredClusterHealth, loadDurations, generatedAt: new Date().toISOString() };
}

/** Force the next call for this project/dataset to hit BigQuery again — e.g. right after a sync completes. */
export function invalidateWarehouseSnapshot(projectId: string, dataset: string): void {
  remoteSnapshotCache.delete(`${projectId}:${dataset}`);
}
