/**
 * CrossTecch Intelligence Platform — TypeScript type definitions
 *
 * Covers: SemanticModel, ModelRun, Dashboard, Widget, BIInsight, WidgetConfig,
 * ChartType, and the viz-recommender schema types.
 */

// ────────────────────────────────────────────────────────────────────────────
// Chart types (35 total)
// ────────────────────────────────────────────────────────────────────────────

export const RECHARTS_TYPES = [
  "bar", "bar_stacked", "bar_horizontal", "bar_horizontal_stacked",
  "line", "line_smooth", "area", "area_stacked",
  "pie", "donut",
  "scatter", "bubble",
  "composed",
  "radar",
  "table",
] as const;

export const ECHARTS_TYPES = [
  "treemap",
  "sunburst",
  "sankey",
  "funnel",
  "heatmap",
  "calendar_heatmap",
  "geo_map",
  "boxplot",
  "candlestick",
  "gauge",
  "waterfall",
  "parallel",
  "theme_river",
  "graph",
  "word_cloud",
  "kpi_card",
  "number_card",
  "progress_bar",
  "sparkline",
  "metric_delta",
] as const;

export type RechartsChartType = (typeof RECHARTS_TYPES)[number];
export type EChartsChartType  = (typeof ECHARTS_TYPES)[number];
export type ChartType         = RechartsChartType | EChartsChartType;

export const ALL_CHART_TYPES: ChartType[] = [
  ...RECHARTS_TYPES,
  ...ECHARTS_TYPES,
];

export const CHART_TYPE_SET = new Set<string>(ALL_CHART_TYPES);

// Human-readable labels for chart types
export const CHART_LABELS: Record<ChartType, string> = {
  // Recharts
  bar:                     "Bar Chart",
  bar_stacked:             "Stacked Bar",
  bar_horizontal:          "Horizontal Bar",
  bar_horizontal_stacked:  "Horizontal Stacked Bar",
  line:                    "Line Chart",
  line_smooth:             "Smooth Line",
  area:                    "Area Chart",
  area_stacked:            "Stacked Area",
  pie:                     "Pie Chart",
  donut:                   "Donut Chart",
  scatter:                 "Scatter Plot",
  bubble:                  "Bubble Chart",
  composed:                "Composed Chart",
  radar:                   "Radar Chart",
  table:                   "Data Table",
  // ECharts
  treemap:                 "Treemap",
  sunburst:                "Sunburst",
  sankey:                  "Sankey Diagram",
  funnel:                  "Funnel Chart",
  heatmap:                 "Heatmap",
  calendar_heatmap:        "Calendar Heatmap",
  geo_map:                 "Geographic Map",
  boxplot:                 "Box Plot",
  candlestick:             "Candlestick",
  gauge:                   "Gauge",
  waterfall:               "Waterfall Chart",
  parallel:                "Parallel Coordinates",
  theme_river:             "Theme River",
  graph:                   "Network Graph",
  word_cloud:              "Word Cloud",
  kpi_card:                "KPI Card",
  number_card:             "Number Card",
  progress_bar:            "Progress Bar",
  sparkline:               "Sparkline",
  metric_delta:            "Metric Delta",
};

// ────────────────────────────────────────────────────────────────────────────
// Schema column types
// ────────────────────────────────────────────────────────────────────────────

export type ColumnDataType =
  | "STRING" | "INTEGER" | "FLOAT64" | "NUMERIC" | "BIGNUMERIC"
  | "BOOLEAN" | "TIMESTAMP" | "DATE" | "DATETIME" | "TIME"
  | "RECORD" | "BYTES" | "JSON" | "UNKNOWN";

export interface SchemaColumn {
  name:        string;
  type:        ColumnDataType;
  mode?:       "NULLABLE" | "REQUIRED" | "REPEATED";
  description?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Widget config
// ────────────────────────────────────────────────────────────────────────────

export interface WidgetPosition {
  x: number;   // column (0–11, 12-col grid)
  y: number;   // row
  w: number;   // width in columns
  h: number;   // height in rows
}

/** Axis / series configuration shared by most chart types */
export interface AxisConfig {
  field:   string;
  label?:  string;
  format?: string; // e.g. "$,.2f", "%", ",.0f"
  color?:  string;
}

/** Filter applied at widget execution time (on top of model SQL via CTE) */
export interface WidgetFilter {
  field: string;
  op:    "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "contains";
  value: unknown;
}

/**
 * Client-side data prep applied to a widget's already-fetched rows, before
 * they reach the chart renderer. Lets a widget's config declare "group by X,
 * sum Y" (or "collapse to one aggregate", or "top N rows") instead of relying
 * on the bound model's SQL already being at the right grain — the row cap
 * (5,000, see /api/widgets/[id]/data) makes this a safe client-side op.
 * Consumed by ChartEngine (components/charts/chart-engine.tsx); produced by
 * the AI Dashboard Generator (lib/bi/ai-dashboard-generator.ts), but any
 * widget's config can set it manually too.
 */
export interface WidgetAggregateConfig {
  /** Field to group rows by. Omit to collapse ALL rows into a single aggregate. */
  groupBy?:    string;
  /** Second group-by field, for two-key aggregation (e.g. heatmap x/y). */
  groupBy2?:   string;
  /** Field to aggregate (or sort by, when fn is "top"). */
  valueField:  string;
  /** "top" sorts+slices the original rows unchanged (no grouping). */
  fn:          "sum" | "avg" | "count" | "count_distinct" | "min" | "max" | "top";
  /** Buckets a date/timestamp groupBy field into a coarser period. */
  dateBucket?: "day" | "week" | "month" | "quarter" | "year";
  /** Cap the number of output rows (groups, or raw rows when fn is "top"). */
  topN?:       number;
  sortDir?:    "asc" | "desc";
}

export interface WidgetConfig {
  // ── Axis / data mapping ─────────────────────────────────────────────────
  xField?:        string;         // primary category / time axis
  yField?:        string;         // primary value axis
  yFields?:       string[];       // multi-series
  sizeField?:     string;         // bubble chart radius
  colorField?:    string;         // segment / grouping column
  labelField?:    string;         // node labels in graph/sankey
  valueField?:    string;         // weight in sankey/treemap/funnel
  sourceField?:   string;         // sankey source
  targetField?:   string;         // sankey target
  latField?:      string;         // geo latitude
  lngField?:      string;         // geo longitude

  // ── Series labels / colors ─────────────────────────────────────────────
  series?:        AxisConfig[];   // override per-series color/label

  // ── Display options ────────────────────────────────────────────────────
  title?:         string;
  subtitle?:      string;
  showLegend?:    boolean;
  showGrid?:      boolean;
  showLabels?:    boolean;
  showTooltip?:   boolean;
  colorPalette?:  string[];       // custom hex colors
  theme?:         "light" | "dark" | "auto";

  // ── Numeric formatting ─────────────────────────────────────────────────
  prefix?:        string;         // "$", "€", etc.
  suffix?:        string;         // "k", "%", " units", etc.
  decimals?:      number;         // decimal places (0–4)
  compact?:       boolean;        // 1200 → "1.2K"

  // ── KPI / metric cards ─────────────────────────────────────────────────
  metricField?:   string;
  compareField?:  string;         // delta comparison column
  trendField?:    string;         // sparkline data column

  // ── Table config ───────────────────────────────────────────────────────
  columns?:       string[];       // ordered column list (empty = all)
  columnLabels?:  Record<string, string>;
  pageSize?:      number;         // rows per page (default 25)
  sortField?:     string;
  sortDir?:       "asc" | "desc";
  frozenCols?:    number;

  // ── Filters ────────────────────────────────────────────────────────────
  filters?:       WidgetFilter[];

  // ── Client-side aggregation (group-by / collapse / top-N) ──────────────
  aggregate?:     WidgetAggregateConfig;

  // ── Layout ─────────────────────────────────────────────────────────────
  position?:      WidgetPosition;

  // ── Misc ───────────────────────────────────────────────────────────────
  refreshSeconds?: number;        // auto-refresh interval (0 = off)
  limit?:          number;        // row cap override (max 5000)
  [key: string]: unknown;         // allow custom chart-specific keys
}

// ────────────────────────────────────────────────────────────────────────────
// Semantic Model
// ────────────────────────────────────────────────────────────────────────────

export type ModelStatus = "draft" | "published" | "archived";

export interface SemanticModel {
  id:             string;         // mdl_<16hex>
  workspace_id:   string;
  user_id:        string;
  name:           string;
  description:    string | null;
  sql_query:      string;
  source_table:   string | null;
  source_dataset: string | null;
  schema_json:    string;         // JSON: SchemaColumn[]
  status:         ModelStatus;
  tags:           string;         // JSON: string[]
  version:        number;         // incremented on every SQL-changing update
  created_at:     number;         // Unix ms
  updated_at:     number;
  // Computed / joined fields (not stored in DB)
  schema?:        SchemaColumn[];
  tags_parsed?:   string[];
  run_count?:     number;
  last_run_at?:   number | null;
  widget_count?:  number;
  dependencies?:  string[];       // warehouse tables referenced by sql_query (SQL-parsed)
}

/** One snapshot of a model's SQL, taken automatically before each SQL-changing update. */
export interface ModelVersion {
  id:           string;           // mdlv_<16hex>
  model_id:     string;
  workspace_id: string;
  user_id:      string;
  version:      number;
  name:         string;
  description:  string | null;
  sql_query:    string;
  created_at:   number;
}

export interface ModelRun {
  id:               string;       // run_<16hex>
  model_id:         string;
  workspace_id:     string;
  user_id:          string;
  status:           "success" | "failed";
  rows_returned:    number | null;
  duration_ms:      number | null;
  bytes_processed:  number | null;
  error:            string | null;
  ran_at:           number;
}

// ────────────────────────────────────────────────────────────────────────────
// Dashboard & Widget
// ────────────────────────────────────────────────────────────────────────────

export type DashboardTheme = "light" | "dark";

export interface Dashboard {
  id:           string;           // dsh_<16hex>
  workspace_id: string;
  user_id:      string;
  name:         string;
  description:  string | null;
  layout_json:  string;           // JSON: WidgetPosition[]
  theme:        DashboardTheme;
  share_token:  string | null;
  is_published: number;           // 0 | 1 (SQLite bool)
  created_at:   number;
  updated_at:   number;
  // Joined
  widget_count?: number;
  widgets?:      Widget[];
}

export interface Widget {
  id:            string;          // wgt_<16hex>
  dashboard_id:  string;
  workspace_id:  string;
  model_id:      string;
  name:          string;
  chart_type:    ChartType;
  config_json:   string;          // JSON: WidgetConfig
  position_json: string;          // JSON: WidgetPosition
  created_at:    number;
  updated_at:    number;
  // Parsed at runtime
  config?:       WidgetConfig;
  position?:     WidgetPosition;
  // Joined
  model_name?:   string;
}

// ────────────────────────────────────────────────────────────────────────────
// BI Insights
// ────────────────────────────────────────────────────────────────────────────

export type InsightType     = "kpi" | "trend" | "anomaly" | "recommendation" | "forecast";
export type InsightSeverity = "info" | "success" | "warning" | "critical";

export interface BIInsight {
  id:           string;           // ins_<16hex>
  workspace_id: string;
  model_id:     string | null;
  type:         InsightType;
  title:        string;
  description:  string | null;
  data_json:    string | null;    // JSON: varies by type
  severity:     InsightSeverity;
  dismissed:    number;           // 0 | 1
  created_at:   number;
  expires_at:   number | null;
  // Joined
  model_name?:  string | null;
}

// ────────────────────────────────────────────────────────────────────────────
// Viz recommender types
// ────────────────────────────────────────────────────────────────────────────

export type ColumnKind =
  | "numeric"    // any number type
  | "temporal"   // DATE, TIMESTAMP, DATETIME, TIME
  | "categorical"// STRING, BOOLEAN
  | "geo"        // columns named lat/lng/latitude/longitude/country/city
  | "unknown";

export interface ColumnProfile {
  name:        string;
  type:        ColumnDataType;
  kind:        ColumnKind;
  cardinality?: "low" | "medium" | "high"; // optional hint
}

export interface VizRecommendation {
  chartType:   ChartType;
  score:       number;            // 0–100, higher = better fit
  reason:      string;
  xField?:     string;
  yField?:     string;
  colorField?: string;
  sizeField?:  string;
}
