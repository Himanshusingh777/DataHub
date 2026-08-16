/**
 * AI Dashboard Generator
 *
 * Pure heuristic engine — NO LLM / Groq call. Given a Semantic Model's
 * schema (BigQuery column names + types) and, optionally, a fresh row
 * sample pulled purely for local profiling (cardinality, value patterns —
 * never persisted, never sent anywhere), this produces every chart that's a
 * *reasonable* fit for the data as a list of candidates. The caller (the
 * "Generate AI Dashboard" preview UI) lets the user pick which candidates
 * actually become widgets; layoutCandidates() then assigns grid positions
 * to exactly the selected subset, so there are never gaps in the layout.
 *
 * Column understanding is delegated to the existing semantic classifier
 * (lib/engine/semantic.ts) — the same engine the Universal Intelligence
 * Engine uses — rather than re-implementing name-pattern matching here.
 * Rendering is delegated entirely to the existing ChartEngine
 * (components/charts/chart-engine.tsx); this module only decides *what*
 * widgets could exist, never *how* to draw them.
 *
 * Consumed by:
 *   POST /api/models/[id]/generate-dashboard/preview  (generateDashboardCandidates)
 *   POST /api/models/[id]/generate-dashboard          (layoutCandidates)
 */

import type { ChartType, SchemaColumn, WidgetConfig, WidgetPosition, WidgetAggregateConfig } from "@/lib/models-data";
import { classifyColumn, isMonetary, isRatio, type ClassifiedColumn, type SemanticClass } from "@/lib/engine/semantic";

export type WidgetCategory = "kpi" | "trend" | "chart" | "table";

/** A proposed widget the user can accept or skip — no position yet (see layoutCandidates). */
export interface WidgetCandidate {
  id:          string; // stable key for selection round-tripping, e.g. "kpi:sum:total_revenue"
  name:        string;
  chart_type:  ChartType;
  category:    WidgetCategory;
  reason:      string;  // short human-readable "why this chart" shown in the picker UI
  /** True for the curated ~10-widget default set the one-click "Generate AI
   *  Dashboard" button uses without asking — everything else is an extra
   *  candidate offered only in the "Customize charts" picker. */
  recommended: boolean;
  config:      WidgetConfig;
}

export interface GeneratedWidgetSpec {
  name:       string;
  chart_type: ChartType;
  config:     WidgetConfig;
  position:   WidgetPosition;
}

// ── BigQuery type → semantic engine's declared-type vocabulary ─────────────
// Mirrors declaredTypeOf() in app/api/warehouse/intelligence/route.ts — same
// mapping, kept local since that function lives in a route module.

const NUMERIC_BQ_TYPES = new Set<SchemaColumn["type"]>(["INTEGER", "FLOAT64", "NUMERIC", "BIGNUMERIC"]);
const TEMPORAL_BQ_TYPES = new Set<SchemaColumn["type"]>(["TIMESTAMP", "DATE", "DATETIME", "TIME"]);

function bqDeclaredType(t: SchemaColumn["type"]): string {
  if (NUMERIC_BQ_TYPES.has(t)) return "number";
  if (t === "BOOLEAN") return "boolean";
  if (TEMPORAL_BQ_TYPES.has(t)) return "timestamp";
  if (t === "JSON" || t === "RECORD") return "json";
  return "string";
}

interface Col extends ClassifiedColumn {
  bqType:       SchemaColumn["type"];
  uniqueCount?: number; // known only when sample rows were supplied
}

function classify(schema: SchemaColumn[], sampleRows: Record<string, unknown>[]): Col[] {
  return schema.map((c) => {
    const samples = sampleRows.length ? sampleRows.map((r) => r[c.name]) : [];
    const classified = classifyColumn(c.name, bqDeclaredType(c.type), samples);
    const uniqueCount = sampleRows.length
      ? new Set(samples.filter((v) => v !== null && v !== undefined).map((v) => String(v))).size
      : undefined;
    return { ...classified, bqType: c.type, uniqueCount };
  });
}

// ── Selection heuristics ────────────────────────────────────────────────────

const METRIC_PRIORITY: SemanticClass[] = ["revenue", "amount", "currency", "profit", "quantity", "count", "number"];
const DIMENSION_PRIORITY: SemanticClass[] = ["category", "product", "country", "region", "city", "channel", "status", "platform", "campaign", "tag", "device"];

function byPriority(order: SemanticClass[]) {
  return (a: Col, b: Col) => {
    const ai = order.indexOf(a.semanticClass);
    const bi = order.indexOf(b.semanticClass);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  };
}

function pickMetrics(cols: Col[]): Col[] {
  return cols.filter((c) => c.role === "metric").sort(byPriority(METRIC_PRIORITY));
}

/** Dimensions usable for grouping — excludes columns that sampling shows are
 *  effectively unique per row (identifier-shaped despite a dimension-like name). */
function pickDimensions(cols: Col[]): Col[] {
  return cols
    .filter((c) => c.role === "dimension")
    .filter((c) => c.uniqueCount === undefined || c.uniqueCount <= 200)
    .filter((c) => c.uniqueCount === undefined || c.uniqueCount >= 2)
    .sort(byPriority(DIMENSION_PRIORITY));
}

function pickTime(cols: Col[]): Col[] {
  return cols.filter((c) => c.role === "time");
}

/**
 * Columns matching one of the given semantic classes — used for
 * entity-flavored KPIs and rankings ("Top Customers", "Total Orders").
 * Matches on semanticClass alone (not role): business-entity classes like
 * "customer"/"order"/"lead" fall through semantic.ts's role buckets to
 * "detail" (none of TIME/ID/METRIC/DIMENSION claim them), but the class
 * itself is already an unambiguous signal that the column is that entity.
 */
function pickEntities(cols: Col[], classes: SemanticClass[]): Col[] {
  return cols.filter((c) => classes.includes(c.semanticClass));
}

function fmtConfig(col: Col): Pick<WidgetConfig, "prefix" | "suffix" | "decimals" | "compact"> {
  if (isMonetary(col.semanticClass)) return { prefix: "$", decimals: 2, compact: true };
  if (isRatio(col.semanticClass))    return { suffix: "%", decimals: 1, compact: false };
  return { decimals: 0, compact: true };
}

/** Prefixes a label with a word, unless the label already starts with it
 *  (humanLabel("total_revenue") is already "Total Revenue" — prefixing
 *  "Total" again would read as "Total Total Revenue"). */
function withPrefix(prefix: string, label: string): string {
  return new RegExp(`^${prefix}\\b`, "i").test(label) ? label : `${prefix} ${label}`;
}

/** Date range (in days) spanned by a time column's sample values, or null if unknown/degenerate. */
function dateRangeDays(sampleRows: Record<string, unknown>[], field: string): number | null {
  if (!sampleRows.length) return null;
  const times = sampleRows
    .map((r) => new Date(String(r[field])).getTime())
    .filter((t) => !isNaN(t));
  if (times.length < 2) return null;
  return (Math.max(...times) - Math.min(...times)) / 86_400_000;
}

function pickDateBucket(sampleRows: Record<string, unknown>[], field: string): WidgetAggregateConfig["dateBucket"] {
  const days = dateRangeDays(sampleRows, field);
  if (days === null) return "month"; // no sample data to judge range — safe default
  if (days <= 60) return "day";
  if (days <= 120) return "week";
  if (days <= 900) return "month";
  return "quarter";
}

function slug(...parts: string[]): string {
  return parts.map((p) => p.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")).join(":");
}

// ── Candidate generation ────────────────────────────────────────────────────

export function generateDashboardCandidates(
  schema: SchemaColumn[],
  sampleRows: Record<string, unknown>[] = []
): WidgetCandidate[] {
  if (!schema || schema.length === 0) return [];

  const cols    = classify(schema, sampleRows);
  const metrics = pickMetrics(cols);
  const dims    = pickDimensions(cols);
  const times   = pickTime(cols);
  const candidates: WidgetCandidate[] = [];

  // ── KPI cards ───────────────────────────────────────────────────────────
  metrics.slice(0, 2).forEach((metric, i) => {
    const title = withPrefix("Total", metric.label);
    candidates.push({
      id: slug("kpi", "sum", metric.name),
      name: title,
      chart_type: "kpi_card",
      category: "kpi",
      reason: `Sum of ${metric.label} across all rows.`,
      recommended: i === 0, // only the headline metric's total is in the curated default
      config: { title, aggregate: { valueField: metric.name, fn: "sum" }, ...fmtConfig(metric) },
    });
  });

  if (metrics[0]) {
    const title = `Average ${metrics[0].label}`;
    candidates.push({
      id: slug("kpi", "avg", metrics[0].name),
      name: title,
      chart_type: "kpi_card",
      category: "kpi",
      reason: `Average ${metrics[0].label} per row.`,
      recommended: true,
      config: { title, aggregate: { valueField: metrics[0].name, fn: "avg" }, ...fmtConfig(metrics[0]) },
    });
  }

  const orderCols = pickEntities(cols, ["order", "transaction", "invoice"]);
  if (orderCols[0]) {
    candidates.push({
      id: slug("kpi", "orders", orderCols[0].name),
      name: "Total Orders",
      chart_type: "kpi_card",
      category: "kpi",
      reason: `Row count, using ${orderCols[0].label} as the order marker.`,
      recommended: true,
      config: { title: "Total Orders", aggregate: { valueField: orderCols[0].name, fn: orderCols[0].role === "identifier" ? "count_distinct" : "count" }, decimals: 0, compact: true },
    });
  } else if (metrics[0]) {
    candidates.push({
      id: slug("kpi", "records", metrics[0].name),
      name: "Total Records",
      chart_type: "kpi_card",
      category: "kpi",
      reason: "Total number of rows returned by this model.",
      recommended: true,
      config: { title: "Total Records", aggregate: { valueField: metrics[0].name, fn: "count" }, decimals: 0, compact: true },
    });
  }

  const customerCols = pickEntities(cols, ["customer", "user", "lead"]);
  if (customerCols[0]) {
    candidates.push({
      id: slug("kpi", "customers", customerCols[0].name),
      name: "Total Customers",
      chart_type: "kpi_card",
      category: "kpi",
      reason: `Distinct count of ${customerCols[0].label}.`,
      recommended: true,
      config: { title: "Total Customers", aggregate: { valueField: customerCols[0].name, fn: "count_distinct" }, decimals: 0, compact: true },
    });
  }

  // ── Trend lines — one per metric against the primary time column ───────
  const trendTime = times.find((t) => {
    const days = dateRangeDays(sampleRows, t.name);
    return days === null || days > 0; // null = no sample data to judge range; assume OK
  });
  if (trendTime) {
    metrics.slice(0, 2).forEach((metric, i) => {
      const title = `${metric.label} Trend`;
      candidates.push({
        id: slug("trend", trendTime.name, metric.name),
        name: title,
        chart_type: "line",
        category: "trend",
        reason: `${metric.label} summed by ${trendTime.label}, bucketed by ${pickDateBucket(sampleRows, trendTime.name)}.`,
        recommended: i === 0,
        config: {
          title, xField: trendTime.name, yField: metric.name,
          aggregate: { groupBy: trendTime.name, valueField: metric.name, fn: "sum", dateBucket: pickDateBucket(sampleRows, trendTime.name) },
          showLegend: false, ...fmtConfig(metric),
        },
      });
    });
  }

  const primaryMetric = metrics[0];

  // ── Category bar charts — one per dimension ─────────────────────────────
  if (primaryMetric) {
    dims.slice(0, 6).forEach((dim, i) => {
      const title = `${primaryMetric.label} by ${dim.label}`;
      candidates.push({
        id: slug("bar", dim.name, primaryMetric.name),
        name: title,
        chart_type: "bar",
        category: "chart",
        reason: `${primaryMetric.label} summed per ${dim.label}, top 10.`,
        recommended: i < 2,
        config: {
          title, xField: dim.name, yField: primaryMetric.name,
          aggregate: { groupBy: dim.name, valueField: primaryMetric.name, fn: "sum", topN: 10, sortDir: "desc" },
          showLegend: false, ...fmtConfig(primaryMetric),
        },
      });
    });

    // ── Ranked entities (Top Customers / Top Products / ...) ─────────────
    const rankEntities = pickEntities(cols, ["customer", "product", "user", "sku"]);
    rankEntities.slice(0, 3).forEach((entity, i) => {
      const title = `Top ${entity.label}`;
      candidates.push({
        id: slug("rank", entity.name, primaryMetric.name),
        name: title,
        chart_type: "bar_horizontal",
        category: "chart",
        reason: `Top 10 ${entity.label} ranked by ${primaryMetric.label}.`,
        recommended: i === 0,
        config: {
          title, xField: entity.name, yField: primaryMetric.name,
          aggregate: { groupBy: entity.name, valueField: primaryMetric.name, fn: "sum", topN: 10, sortDir: "desc" },
          showLegend: false, ...fmtConfig(primaryMetric),
        },
      });
    });

    // ── Distribution pies — one per dimension ─────────────────────────────
    dims.slice(0, 4).forEach((dim, i) => {
      const title = `${dim.label} Distribution`;
      candidates.push({
        id: slug("pie", dim.name, primaryMetric.name),
        name: title,
        chart_type: "pie",
        category: "chart",
        reason: `Share of ${primaryMetric.label} by ${dim.label} (top 8 slices).`,
        recommended: i === 0,
        config: {
          title, xField: dim.name, yField: primaryMetric.name,
          aggregate: { groupBy: dim.name, valueField: primaryMetric.name, fn: "sum", topN: 8, sortDir: "desc" },
          showLegend: true,
        },
      });
    });

    // ── Heatmaps — pairs of dimensions ────────────────────────────────────
    const heatmapDims = dims.slice(0, 4);
    for (let i = 0; i < heatmapDims.length && i < 3; i++) {
      const d1 = heatmapDims[i]!;
      const d2 = heatmapDims[i + 1];
      if (!d2) break;
      const title = `${primaryMetric.label}: ${d1.label} × ${d2.label}`;
      candidates.push({
        id: slug("heatmap", d1.name, d2.name),
        name: `${primaryMetric.label} Heatmap`,
        chart_type: "heatmap",
        category: "chart",
        reason: `${primaryMetric.label} summed across ${d1.label} × ${d2.label}.`,
        recommended: i === 0,
        config: {
          title, xField: d1.name, yField: d2.name, colorField: primaryMetric.name,
          aggregate: { groupBy: d1.name, groupBy2: d2.name, valueField: primaryMetric.name, fn: "sum" },
        },
      });
    }
  }

  // ── Tables ───────────────────────────────────────────────────────────────
  const tableColumns = [
    ...(trendTime ? [trendTime.name] : []),
    ...dims.slice(0, 3).map((d) => d.name),
    ...metrics.slice(0, 3).map((m) => m.name),
  ];
  candidates.push({
    id: "table:top10",
    name: "Top 10 Records",
    chart_type: "table",
    category: "table",
    reason: primaryMetric ? `Highest 10 rows by ${primaryMetric.label}.` : "First rows returned by this model.",
    recommended: true,
    config: {
      title: "Top 10 Records",
      columns: tableColumns.length ? tableColumns : undefined,
      pageSize: 10,
      ...(primaryMetric
        ? { aggregate: { valueField: primaryMetric.name, fn: "top", topN: 10, sortDir: "desc" } as WidgetAggregateConfig }
        : {}),
    },
  });
  candidates.push({
    id: "table:all",
    name: "All Records",
    chart_type: "table",
    category: "table",
    reason: "Every column, paginated — a raw data view.",
    recommended: false,
    config: { title: "All Records", pageSize: 25 },
  });

  return candidates;
}

// ── Layout ───────────────────────────────────────────────────────────────
// Assigns grid positions to exactly the widgets the user selected, grouped
// by category in the standard order (KPIs top, trend middle, charts below,
// tables last) so there are never gaps from skipped candidates.

export function layoutCandidates(
  selected: Pick<WidgetCandidate, "name" | "chart_type" | "category" | "config">[]
): GeneratedWidgetSpec[] {
  const order: WidgetCategory[] = ["kpi", "trend", "chart", "table"];
  const specs: GeneratedWidgetSpec[] = [];
  let y = 0;

  for (const category of order) {
    const items = selected.filter((s) => s.category === category);
    if (items.length === 0) continue;

    if (category === "kpi") {
      items.forEach((item, i) => {
        specs.push({ ...item, position: { x: (i % 4) * 3, y: y + Math.floor(i / 4) * 2, w: 3, h: 2 } });
      });
      y += Math.ceil(items.length / 4) * 2;
    } else if (category === "trend") {
      items.forEach((item) => {
        specs.push({ ...item, position: { x: 0, y, w: 12, h: 4 } });
        y += 4;
      });
    } else if (category === "chart") {
      items.forEach((item, i) => {
        specs.push({ ...item, position: { x: (i % 2) * 6, y: y + Math.floor(i / 2) * 4, w: 6, h: 4 } });
      });
      y += Math.ceil(items.length / 2) * 4;
    } else {
      items.forEach((item) => {
        specs.push({ ...item, position: { x: 0, y, w: 12, h: 5 } });
        y += 5;
      });
    }
  }

  return specs;
}
