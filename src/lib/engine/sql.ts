/**
 * Dynamic SQL Generator
 *
 * Builds BigQuery Standard SQL from semantic metadata — never from hardcoded
 * per-connector query strings. The generator owns aggregation, grouping,
 * filtering, ranking, comparison and date analysis.
 *
 * Safety model (important — this output is executed):
 *   • Identifiers (project/dataset/table/column) are whitelisted against the
 *     characters BigQuery permits and then backtick-quoted. They can never
 *     carry an injection payload.
 *   • Literals are NEVER interpolated. They are emitted as @named parameters
 *     and returned alongside the SQL for the driver to bind.
 *   • Only SELECT is ever produced (except buildMerge/buildUpsert/
 *     buildAlterTableAddColumns, the three incremental-sync exceptions
 *     documented in their own section below).
 *
 * Query optimization / caching notes (performance layer):
 *   • Every GeneratedSQL is deterministic for a given input — same ref,
 *     dimension, metrics and filters always produce byte-identical SQL. That
 *     makes the *generated string* itself a safe cache key wherever a caller
 *     wants to memoize execution (see lib/perf/cache.ts's TTLCache /
 *     namedCache, applied this way in lib/server/warehouse-monitor.ts).
 *   • This module intentionally does not cache query *results* itself — it
 *     only builds SQL — because staleness tolerance is a caller decision
 *     (a dashboard KPI can tolerate a 60s-old number; a "run now" sync
 *     cannot). Callers wrap execution, not generation.
 *   • LIMIT is always bound as a parameter (@row_limit) rather than
 *     interpolated, and every aggregation caps it — this keeps accidental
 *     full-table scans from becoming accidental full-table *transfers* too.
 *   • buildRanking's CTE computes SUM() OVER () for share-of-total in the
 *     same pass as the GROUP BY, rather than a second query — one scan
 *     instead of two for a very common chart type.
 */

import type { ClassifiedColumn } from "./semantic";
import { isMonetary, isRatio } from "./semantic";

// ── Identifier safety ────────────────────────────────────────────────────────

/** BigQuery column/table identifiers: letters, digits, underscore only. */
export function safeIdentifier(raw: string): string {
  const cleaned = (raw ?? "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 300);
  if (!cleaned) throw new Error("Invalid SQL identifier");
  return cleaned;
}

/** Project IDs additionally permit dashes. */
export function safeProject(raw: string): string {
  const cleaned = (raw ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 300);
  if (!cleaned) throw new Error("Invalid project id");
  return cleaned;
}

/** Fully-qualified, backtick-quoted table reference. */
export function qualify(projectId: string, dataset: string, table: string): string {
  return `\`${safeProject(projectId)}.${safeIdentifier(dataset)}.${safeIdentifier(table)}\``;
}

const col = (name: string) => `\`${safeIdentifier(name)}\``;

// ── Query model ──────────────────────────────────────────────────────────────

export type AggFn = "SUM" | "AVG" | "COUNT" | "COUNT_DISTINCT" | "COUNT_STAR" | "MIN" | "MAX";

export interface FilterSpec {
  column: string;
  op: "=" | "!=" | ">" | ">=" | "<" | "<=" | "IN" | "LIKE" | "IS NULL" | "IS NOT NULL";
  value?: string | number | (string | number)[];
}

export interface GeneratedSQL {
  sql: string;
  params: Record<string, unknown>;
  /** What this query answers — surfaced in the UI and in audit logs. */
  description: string;
}

export interface TableRef {
  projectId: string;
  dataset: string;
  table: string;
}

// ── Fragment builders ────────────────────────────────────────────────────────

function aggExpr(fn: AggFn, column: string, alias: string): string {
  const c = col(column);
  const a = col(alias);
  switch (fn) {
    case "COUNT":          return `COUNT(${c}) AS ${a}`;
    case "COUNT_DISTINCT": return `COUNT(DISTINCT ${c}) AS ${a}`;
    case "COUNT_STAR":     return `COUNT(*) AS ${a}`;
    // SAFE_CAST protects against string-typed numeric columns, which are
    // extremely common in warehouse landings.
    default:               return `${fn}(SAFE_CAST(${c} AS FLOAT64)) AS ${a}`;
  }
}

/**
 * Build a WHERE clause + its bound parameters. Values are always parameterized.
 */
function buildWhere(
  filters: FilterSpec[],
  params: Record<string, unknown>,
  prefix = "f"
): string {
  if (!filters.length) return "";
  const clauses: string[] = [];

  filters.forEach((f, i) => {
    const c = col(f.column);
    const key = `${prefix}${i}`;

    if (f.op === "IS NULL" || f.op === "IS NOT NULL") {
      clauses.push(`${c} ${f.op}`);
      return;
    }
    if (f.op === "IN") {
      const arr = Array.isArray(f.value) ? f.value : [f.value ?? ""];
      if (!arr.length) return;
      params[key] = arr;
      clauses.push(`${c} IN UNNEST(@${key})`);
      return;
    }
    if (f.op === "LIKE") {
      params[key] = String(f.value ?? "");
      clauses.push(`CAST(${c} AS STRING) LIKE @${key}`);
      return;
    }
    params[key] = f.value;
    clauses.push(`${c} ${f.op} @${key}`);
  });

  return clauses.length ? `WHERE ${clauses.join("\n    AND ")}` : "";
}

// ── Generators ───────────────────────────────────────────────────────────────

/**
 * Aggregation + GROUP BY.
 * "Total <metric> by <dimension>" — the workhorse behind bar/donut/ranking charts.
 */
export function buildAggregation(args: {
  ref: TableRef;
  dimension?: string;
  metrics: { column: string; fn: AggFn; alias?: string }[];
  filters?: FilterSpec[];
  orderBy?: { alias: string; direction: "ASC" | "DESC" };
  limit?: number;
}): GeneratedSQL {
  const { ref, dimension, metrics, filters = [], orderBy, limit = 100 } = args;
  if (!metrics.length) throw new Error("buildAggregation requires at least one metric");

  const params: Record<string, unknown> = {};
  const selects: string[] = [];
  const groups: string[] = [];

  if (dimension) {
    selects.push(`${col(dimension)} AS ${col("dimension")}`);
    groups.push("1");
  }
  for (const m of metrics) {
    selects.push(aggExpr(m.fn, m.column, m.alias ?? m.column));
  }

  // Collect every predicate, then emit a single well-formed WHERE clause.
  const predicates = buildWhere(filters, params).replace(/^WHERE\s*/, "");
  const conditions = [predicates, dimension ? `${col(dimension)} IS NOT NULL` : ""].filter(Boolean);

  const order = orderBy
    ? `ORDER BY ${col(orderBy.alias)} ${orderBy.direction}`
    : metrics[0]
      ? `ORDER BY ${col(metrics[0].alias ?? metrics[0].column)} DESC`
      : "";

  params.row_limit = Math.min(Math.max(Number(limit) || 100, 1), 10_000);

  const sql = [
    `SELECT ${selects.join(",\n       ")}`,
    `FROM ${qualify(ref.projectId, ref.dataset, ref.table)}`,
    conditions.length ? `WHERE ${conditions.join("\n  AND ")}` : "",
    groups.length ? `GROUP BY ${groups.join(", ")}` : "",
    order,
    `LIMIT @row_limit`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    sql,
    params,
    description: dimension
      ? `${metrics[0].fn} of ${metrics[0].column} grouped by ${dimension}`
      : `${metrics[0].fn} of ${metrics[0].column}`,
  };
}

/**
 * Date analysis — a time series bucketed to day/week/month.
 */
export function buildTimeSeries(args: {
  ref: TableRef;
  timeColumn: string;
  metric?: { column: string; fn: AggFn };
  grain?: "DAY" | "WEEK" | "MONTH";
  filters?: FilterSpec[];
  lookbackDays?: number;
  limit?: number;
}): GeneratedSQL {
  const { ref, timeColumn, metric, grain = "DAY", filters = [], lookbackDays, limit = 180 } = args;
  const params: Record<string, unknown> = {};

  const bucket = `DATE_TRUNC(DATE(SAFE_CAST(${col(timeColumn)} AS TIMESTAMP)), ${grain})`;
  const valueExpr = metric
    ? aggExpr(metric.fn, metric.column, "value")
    : `COUNT(*) AS ${col("value")}`;

  const allFilters = [...filters];
  let lookbackClause = "";
  if (lookbackDays && lookbackDays > 0) {
    params.lookback = Math.min(Math.floor(lookbackDays), 3650);
    lookbackClause = `SAFE_CAST(${col(timeColumn)} AS TIMESTAMP) >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @lookback DAY)`;
  }

  const where = buildWhere(allFilters, params);
  const conditions = [
    where.replace(/^WHERE\s*/, ""),
    lookbackClause,
    `SAFE_CAST(${col(timeColumn)} AS TIMESTAMP) IS NOT NULL`,
  ].filter(Boolean);

  params.row_limit = Math.min(Math.max(Number(limit) || 180, 1), 5_000);

  const sql = [
    `SELECT ${bucket} AS ${col("bucket")},`,
    `       ${valueExpr}`,
    `FROM ${qualify(ref.projectId, ref.dataset, ref.table)}`,
    conditions.length ? `WHERE ${conditions.join("\n  AND ")}` : "",
    `GROUP BY 1`,
    `ORDER BY 1 ASC`,
    `LIMIT @row_limit`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    sql,
    params,
    description: `${metric ? `${metric.fn}(${metric.column})` : "row count"} by ${grain.toLowerCase()} on ${timeColumn}`,
  };
}

/**
 * Ranking — top N members of a dimension by a metric, with share of total.
 */
export function buildRanking(args: {
  ref: TableRef;
  dimension: string;
  metric: { column: string; fn: AggFn };
  filters?: FilterSpec[];
  topN?: number;
}): GeneratedSQL {
  const { ref, dimension, metric, filters = [], topN = 10 } = args;
  const params: Record<string, unknown> = {};
  const where = buildWhere(filters, params);
  params.row_limit = Math.min(Math.max(Number(topN) || 10, 1), 500);

  const sql = [
    `WITH ranked AS (`,
    `  SELECT ${col(dimension)} AS ${col("dimension")},`,
    `         ${aggExpr(metric.fn, metric.column, "value")}`,
    `  FROM ${qualify(ref.projectId, ref.dataset, ref.table)}`,
    where ? `  ${where}` : "",
    `  GROUP BY 1`,
    `)`,
    `SELECT ${col("dimension")},`,
    `       ${col("value")},`,
    `       SAFE_DIVIDE(${col("value")}, SUM(${col("value")}) OVER ()) * 100 AS ${col("share_pct")},`,
    `       RANK() OVER (ORDER BY ${col("value")} DESC) AS ${col("rank")}`,
    `FROM ranked`,
    `WHERE ${col("dimension")} IS NOT NULL`,
    `ORDER BY ${col("value")} DESC`,
    `LIMIT @row_limit`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    sql,
    params,
    description: `Top ${topN} ${dimension} by ${metric.fn}(${metric.column}) with share of total`,
  };
}

/**
 * Ratio ranking — top N members of a dimension by numerator/denominator*100.
 * Used for "Top campaigns by reply rate" where reply_rate = replied/contacted.
 * Filters out rows where denominator is 0.
 */
export function buildRatioRanking(args: {
  ref: TableRef;
  dimension: string;
  numerator: string;
  denominator: string;
  topN?: number;
}): GeneratedSQL {
  const { ref, dimension, numerator, denominator, topN = 10 } = args;
  const params: Record<string, unknown> = { row_limit: Math.min(Math.max(Number(topN) || 10, 1), 100) };

  const sql = [
    `WITH ranked AS (`,
    `  SELECT ${col(dimension)} AS ${col("dimension")},`,
    `         SAFE_DIVIDE(`,
    `           SUM(SAFE_CAST(${col(numerator)} AS FLOAT64)),`,
    `           NULLIF(SUM(SAFE_CAST(${col(denominator)} AS FLOAT64)), 0)`,
    `         ) * 100 AS ${col("value")}`,
    `  FROM ${qualify(ref.projectId, ref.dataset, ref.table)}`,
    `  GROUP BY 1`,
    `  HAVING SUM(SAFE_CAST(${col(denominator)} AS FLOAT64)) > 0`,
    `)`,
    `SELECT ${col("dimension")},`,
    `       ${col("value")},`,
    `       SAFE_DIVIDE(${col("value")}, SUM(${col("value")}) OVER ()) * 100 AS ${col("share_pct")}`,
    `FROM ranked`,
    `WHERE ${col("dimension")} IS NOT NULL`,
    `ORDER BY ${col("value")} DESC`,
    `LIMIT @row_limit`,
  ].join("\n");

  return {
    sql,
    params,
    description: `Top ${topN} ${dimension} by ${numerator}/${denominator} ratio (%)`,
  };
}

/**
 * Period-over-period comparison — current window vs the window before it.
 * Powers every "revenue increased / decreased" insight.
 */
export function buildComparison(args: {
  ref: TableRef;
  timeColumn: string;
  metric: { column: string; fn: AggFn };
  windowDays?: number;
  filters?: FilterSpec[];
}): GeneratedSQL {
  const { ref, timeColumn, metric, windowDays = 30, filters = [] } = args;
  const params: Record<string, unknown> = {};
  const where = buildWhere(filters, params);
  params.window_days = Math.min(Math.max(Math.floor(windowDays), 1), 3650);

  const ts = `SAFE_CAST(${col(timeColumn)} AS TIMESTAMP)`;
  const isCount = metric.fn === "COUNT" || metric.fn === "COUNT_DISTINCT";
  const inner = isCount ? col(metric.column) : `SAFE_CAST(${col(metric.column)} AS FLOAT64)`;

  // Wrap a conditional expression in the requested aggregate.
  const wrap = (cond: string) => {
    const expr = `IF(${cond}, ${inner}, NULL)`;
    return metric.fn === "COUNT_DISTINCT" ? `COUNT(DISTINCT ${expr})` : `${metric.fn}(${expr})`;
  };

  const cutoff = `TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @window_days DAY)`;
  const priorCutoff = `TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @window_days * 2 DAY)`;

  const sql = [
    `SELECT`,
    `  ${wrap(`${ts} >= ${cutoff}`)} AS ${col("current_value")},`,
    `  ${wrap(`${ts} < ${cutoff} AND ${ts} >= ${priorCutoff}`)} AS ${col("previous_value")}`,
    `FROM ${qualify(ref.projectId, ref.dataset, ref.table)}`,
    where,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    sql,
    params,
    description: `${metric.fn}(${metric.column}) — last ${windowDays}d vs prior ${windowDays}d`,
  };
}

/**
 * Column profile executed IN the warehouse — null rate, cardinality, min/max.
 * Lets the Semantic Engine profile billion-row tables without extracting them.
 */
export function buildColumnProfile(args: {
  ref: TableRef;
  columns: { name: string; numeric: boolean }[];
}): GeneratedSQL {
  const { ref, columns } = args;
  if (!columns.length) throw new Error("buildColumnProfile requires columns");

  const selects: string[] = [`COUNT(*) AS ${col("total_rows")}`];
  for (const c of columns.slice(0, 60)) {
    const q = col(c.name);
    const base = safeIdentifier(c.name);
    selects.push(`COUNTIF(${q} IS NULL) AS ${col(`${base}__nulls`)}`);
    selects.push(`COUNT(DISTINCT ${q}) AS ${col(`${base}__distinct`)}`);
    if (c.numeric) {
      selects.push(`MIN(SAFE_CAST(${q} AS FLOAT64)) AS ${col(`${base}__min`)}`);
      selects.push(`MAX(SAFE_CAST(${q} AS FLOAT64)) AS ${col(`${base}__max`)}`);
      selects.push(`AVG(SAFE_CAST(${q} AS FLOAT64)) AS ${col(`${base}__avg`)}`);
      selects.push(`COUNTIF(SAFE_CAST(${q} AS FLOAT64) < 0) AS ${col(`${base}__negatives`)}`);
    }
  }

  return {
    sql: `SELECT ${selects.join(",\n       ")}\nFROM ${qualify(ref.projectId, ref.dataset, ref.table)}`,
    params: {},
    description: `Warehouse-side column profile of ${columns.length} columns`,
  };
}

/**
 * Duplicate detection on a candidate key, executed in the warehouse.
 */
export function buildDuplicateCheck(args: { ref: TableRef; keyColumn: string }): GeneratedSQL {
  const { ref, keyColumn } = args;
  return {
    sql: [
      `SELECT COUNT(*) AS ${col("duplicate_groups")},`,
      `       SUM(${col("n")}) - COUNT(*) AS ${col("excess_rows")}`,
      `FROM (`,
      `  SELECT ${col(keyColumn)}, COUNT(*) AS ${col("n")}`,
      `  FROM ${qualify(ref.projectId, ref.dataset, ref.table)}`,
      `  WHERE ${col(keyColumn)} IS NOT NULL`,
      `  GROUP BY 1`,
      `  HAVING COUNT(*) > 1`,
      `)`,
    ].join("\n"),
    params: {},
    description: `Duplicate check on ${keyColumn}`,
  };
}

/**
 * Freshness — newest timestamp and lag in hours.
 */
export function buildFreshness(args: { ref: TableRef; timeColumn: string }): GeneratedSQL {
  const { ref, timeColumn } = args;
  const ts = `SAFE_CAST(${col(timeColumn)} AS TIMESTAMP)`;
  return {
    sql: [
      `SELECT CAST(MAX(${ts}) AS STRING) AS ${col("latest")},`,
      `       TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), MAX(${ts}), HOUR) AS ${col("lag_hours")},`,
      `       COUNT(*) AS ${col("total_rows")}`,
      `FROM ${qualify(ref.projectId, ref.dataset, ref.table)}`,
    ].join("\n"),
    params: {},
    description: `Freshness of ${timeColumn}`,
  };
}

/** A bounded sample used to seed value-pattern classification. */
export function buildSample(args: { ref: TableRef; limit?: number }): GeneratedSQL {
  const limit = Math.min(Math.max(Number(args.limit) || 500, 1), 5_000);
  return {
    sql: `SELECT * FROM ${qualify(args.ref.projectId, args.ref.dataset, args.ref.table)} LIMIT @row_limit`,
    params: { row_limit: limit },
    description: `Sample of ${limit} rows`,
  };
}

/** Table + column metadata from INFORMATION_SCHEMA. */
export function buildSchemaIntrospection(args: {
  projectId: string;
  dataset: string;
  table?: string;
}): GeneratedSQL {
  const { projectId, dataset, table } = args;
  const params: Record<string, unknown> = {};
  let filter = "";
  if (table) {
    params.table_name = safeIdentifier(table);
    filter = `WHERE table_name = @table_name`;
  }
  return {
    sql: [
      `SELECT table_name, column_name, data_type, is_nullable, ordinal_position`,
      `FROM \`${safeProject(projectId)}.${safeIdentifier(dataset)}\`.INFORMATION_SCHEMA.COLUMNS`,
      filter,
      `ORDER BY table_name, ordinal_position`,
    ]
      .filter(Boolean)
      .join("\n"),
    params,
    description: table ? `Schema of ${table}` : `Schema of dataset ${dataset}`,
  };
}

/** Storage/partition metadata used by the warehouse performance recommender.
 *  Uses __TABLES__ (legacy metadata) instead of INFORMATION_SCHEMA.TABLE_STORAGE
 *  so this works on BigQuery Sandbox projects (TABLE_STORAGE requires billing). */
export function buildTableMetadata(args: { projectId: string; dataset: string }): GeneratedSQL {
  const p = safeProject(args.projectId);
  const d = safeIdentifier(args.dataset);
  return {
    // Use __TABLES__ directly — works in sandbox mode and doesn't require
    // INFORMATION_SCHEMA permissions. Falls back gracefully when the dataset
    // is empty (returns 0 rows instead of throwing).
    sql: [
      `SELECT`,
      `  table_id                          AS table_name,`,
      `  TIMESTAMP_MILLIS(creation_time)   AS creation_time,`,
      `  row_count                         AS total_rows,`,
      `  size_bytes                        AS total_logical_bytes,`,
      `  FALSE                             AS is_partitioned`,
      `FROM \`${p}.${d}.__TABLES__\``,
      `ORDER BY size_bytes DESC`,
    ].join("\n"),
    params: {},
    description: `Storage and partition metadata for ${args.dataset}`,
  };
}

// ── Semantic-driven planner ──────────────────────────────────────────────────

/**
 * Chooses the right aggregation for a column based on what it MEANS:
 * money and counts sum, rates and ratios average, identifiers count distinct.
 */
export function defaultAggFor(column: ClassifiedColumn): AggFn {
  if (column.role === "identifier") return "COUNT_DISTINCT";
  if (isRatio(column.semanticClass)) return "AVG";
  if (column.semanticClass === "roas") return "AVG";
  if (isMonetary(column.semanticClass)) return "SUM";
  if (column.role === "metric") return "SUM";
  return "COUNT";
}

/**
 * Given classified columns, produce the full set of queries that make sense for
 * this table. This is what the Warehouse Intelligence layer executes — every
 * query the platform runs originates here, from semantics, not from a connector.
 */
export function planQueries(args: {
  ref: TableRef;
  columns: ClassifiedColumn[];
  maxCharts?: number;
}): { key: string; query: GeneratedSQL }[] {
  const { ref, columns, maxCharts = 12 } = args;
  const plan: { key: string; query: GeneratedSQL }[] = [];

  const timeCols = columns.filter((c) => c.role === "time");
  const metricCols = columns.filter((c) => c.role === "metric");
  const dimCols = columns.filter((c) => c.role === "dimension");
  const primaryMetric = metricCols[0];

  // Time series on the primary metric
  if (timeCols[0]) {
    plan.push({
      key: "timeseries",
      query: buildTimeSeries({
        ref,
        timeColumn: timeCols[0].name,
        metric: primaryMetric
          ? { column: primaryMetric.name, fn: defaultAggFor(primaryMetric) }
          : undefined,
        grain: "DAY",
        lookbackDays: 90,
      }),
    });

    // Period comparison
    if (primaryMetric) {
      plan.push({
        key: "comparison",
        query: buildComparison({
          ref,
          timeColumn: timeCols[0].name,
          metric: { column: primaryMetric.name, fn: defaultAggFor(primaryMetric) },
          windowDays: 30,
        }),
      });
    }

    plan.push({ key: "freshness", query: buildFreshness({ ref, timeColumn: timeCols[0].name }) });
  }

  // Rankings across the most informative dimensions.
  // Use COUNT(*) so rankings always have data even when numeric metric columns
  // are 0 or null (common with Instantly campaigns, CSV imports, etc.).
  // Skip id/uuid columns — they produce meaningless per-row treemaps.
  const rankDims = dimCols.filter((c) => !/^(id|uuid|guid|_id|campaign_id|lead_id|email_id)$/i.test(c.name));
  for (const dim of rankDims.slice(0, Math.max(0, maxCharts - plan.length))) {
    plan.push({
      key: `ranking:${dim.name}`,
      query: buildRanking({
        ref,
        dimension: dim.name,
        metric: { column: "__count__", fn: "COUNT_STAR" },
        topN: 12,
      }),
    });
  }

  // Top N by computed ratio — e.g. "Top campaigns by reply rate".
  // Prefers replied/contacted over the stored reply_rate column (which is often 0
  // from the Instantly API). Detects numerator/denominator pairs by column name.
  const nameDim = dimCols.find((c) => /^(name|campaign_name|title|label)$/i.test(c.name))
    ?? dimCols.find((c) => /name|title|label/i.test(c.name));
  if (nameDim && plan.length < maxCharts) {
    // Reply rate: replied / contacted
    const repliedCol = metricCols.find((c) => /^(replied|replies|reply_count)$/i.test(c.name));
    const contactedCol = metricCols.find((c) => /^(contacted|contact_count|sent)$/i.test(c.name));
    if (repliedCol && contactedCol) {
      plan.push({
        key: `computed_rate:reply_rate:${nameDim.name}`,
        query: buildRatioRanking({ ref, dimension: nameDim.name, numerator: repliedCol.name, denominator: contactedCol.name, topN: 10 }),
      });
    }
    // Open rate: opened / contacted
    const openedCol = metricCols.find((c) => /^(opened|opens|open_count)$/i.test(c.name));
    if (openedCol && contactedCol && plan.length < maxCharts) {
      plan.push({
        key: `computed_rate:open_rate:${nameDim.name}`,
        query: buildRatioRanking({ ref, dimension: nameDim.name, numerator: openedCol.name, denominator: contactedCol.name, topN: 10 }),
      });
    }
  }

  // Distribution of status-like columns (donut)
  const status = columns.find((c) => c.semanticClass === "status");
  if (status) {
    plan.push({
      key: `distribution:${status.name}`,
      query: buildAggregation({
        ref,
        dimension: status.name,
        metrics: [{ column: status.name, fn: "COUNT", alias: "value" }],
        limit: 12,
      }),
    });
  }

  // Duplicate check on the best key candidate
  const key = columns.find((c) => c.isPrimaryKey) ?? columns.find((c) => c.role === "identifier");
  if (key) {
    plan.push({ key: "duplicates", query: buildDuplicateCheck({ ref, keyColumn: key.name }) });
  }

  return plan;
}

// ── Incremental sync: MERGE / UPSERT / schema evolution ─────────────────────
//
// These are the only three functions in this file that emit DML/DDL rather
// than SELECT. They exist solely to support `loadToBigQueryIncremental()` in
// `src/lib/server/etl.ts`, which runs a staging table through them. Every
// identifier still goes through `safeIdentifier`/`qualify` — no raw string
// ever reaches the generated SQL uninspected. Row *values* are never
// interpolated here either: MERGE reads them from the staging table, not
// from parameters, so there is nothing to bind.

/**
 * MERGE the staging table into the target table on a set of key columns:
 * update matching rows, insert new ones. This is the UPSERT primitive behind
 * incremental sync — full-refresh loads never call this.
 */
export function buildMerge(args: {
  ref: TableRef;
  stagingTable: string;
  keyColumns: string[];
  allColumns: string[];
}): GeneratedSQL {
  const { ref, stagingTable, keyColumns, allColumns } = args;
  if (!keyColumns.length) throw new Error("buildMerge requires at least one key column");
  if (!allColumns.length) throw new Error("buildMerge requires at least one column");

  const target = qualify(ref.projectId, ref.dataset, ref.table);
  const staging = qualify(ref.projectId, ref.dataset, stagingTable);

  const onClause = keyColumns.map((k) => `T.${col(k)} = S.${col(k)}`).join(" AND ");
  const updateCols = allColumns.filter((c) => !keyColumns.includes(c));
  const updateClause = updateCols.length
    ? updateCols.map((c) => `${col(c)} = S.${col(c)}`).join(", ")
    : keyColumns.map((c) => `${col(c)} = S.${col(c)}`).join(", "); // key-only table: no-op update, still valid
  const insertCols = allColumns.map((c) => col(c)).join(", ");
  const insertVals = allColumns.map((c) => `S.${col(c)}`).join(", ");

  const sql = [
    `MERGE ${target} T`,
    `USING ${staging} S`,
    `ON ${onClause}`,
    `WHEN MATCHED THEN`,
    `  UPDATE SET ${updateClause}`,
    `WHEN NOT MATCHED THEN`,
    `  INSERT (${insertCols})`,
    `  VALUES (${insertVals})`,
  ].join("\n");

  return {
    sql,
    params: {},
    description: `Upsert ${staging} into ${target} on ${keyColumns.join(", ")}`,
  };
}

/** Alias for buildMerge — same operation, name matches the task vocabulary ("UPSERT"). */
export function buildUpsert(args: {
  ref: TableRef;
  stagingTable: string;
  keyColumns: string[];
  allColumns: string[];
}): GeneratedSQL {
  return buildMerge(args);
}

/** Map a JS-inferred value type to a BigQuery column type for ALTER TABLE. */
export type BQScalarType = "STRING" | "INT64" | "FLOAT64" | "BOOL" | "TIMESTAMP";

/**
 * Automatic schema evolution: ADD COLUMN for every field present in the
 * incoming batch but absent from the target table. BigQuery only supports
 * adding nullable columns via ALTER TABLE (never dropping/retyping), which is
 * exactly the safe, additive operation incremental sync needs — existing
 * rows get NULL in the new column, nothing already loaded is touched.
 */
export function buildAlterTableAddColumns(args: {
  ref: TableRef;
  newColumns: { name: string; type: BQScalarType }[];
}): GeneratedSQL[] {
  const { ref, newColumns } = args;
  const target = qualify(ref.projectId, ref.dataset, ref.table);
  return newColumns.map((c) => ({
    sql: `ALTER TABLE ${target} ADD COLUMN IF NOT EXISTS ${col(c.name)} ${c.type}`,
    params: {},
    description: `Add column ${c.name} (${c.type}) to ${ref.table} — automatic schema evolution`,
  }));
}
