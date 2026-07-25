export type NodeType = "source" | "transform" | "destination";

export type TransformKind =
  | "filter"
  | "rename"
  | "aggregate"
  | "join"
  | "sort"
  | "remove_nulls"
  | "calculated_field"
  | "merge";

export interface FilterConfig {
  column: string;
  operator: "equals" | "not_equals" | "contains" | "gt" | "lt" | "is_null" | "not_null";
  value: string;
}

export interface RenameConfig {
  mappings: Array<{ from: string; to: string }>;
}

export interface AggregateConfig {
  groupBy: string[];
  aggregations: Array<{ column: string; func: "sum" | "avg" | "count" | "min" | "max" }>;
}

export interface SortConfig {
  columns: Array<{ column: string; direction: "asc" | "desc" }>;
}

export interface CalculatedFieldConfig {
  name: string;
  expression: string;
}

export interface PipelineNode {
  id: string;
  type: NodeType;
  transformKind?: TransformKind;
  label: string;
  subtitle?: string;
  config: Record<string, unknown>;
  hasError?: boolean;
  isConfigured?: boolean;
}

export interface PipelineRun {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: "success" | "failed" | "running" | "cancelled";
  recordsIn: number;
  recordsOut: number;
  duration: number | null;
  errorMessage?: string;
}

export interface Pipeline {
  id: string;
  name: string;
  description: string;
  nodes: PipelineNode[];
  status: "active" | "paused" | "draft" | "error";
  lastRun: string | null;
  nextRun: string | null;
  successRate: number;
  totalRuns: number;
  successCount: number;
  failureCount: number;
  schedule: string;
  createdAt: string;
  updatedAt: string;
}

export const TRANSFORM_META: Record<
  TransformKind,
  { label: string; icon: string; description: string; color: string }
> = {
  filter: {
    label: "Filter",
    icon: "Filter",
    description: "Keep rows matching a condition",
    color: "text-blue-600 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-400",
  },
  rename: {
    label: "Rename Columns",
    icon: "PenLine",
    description: "Rename or reorder columns",
    color: "text-violet-600 bg-violet-50 dark:bg-violet-950/40 dark:text-violet-400",
  },
  aggregate: {
    label: "Aggregate",
    icon: "Sigma",
    description: "Group and summarize data",
    color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400",
  },
  join: {
    label: "Join",
    icon: "GitMerge",
    description: "Combine with another source",
    color: "text-orange-600 bg-orange-50 dark:bg-orange-950/40 dark:text-orange-400",
  },
  sort: {
    label: "Sort",
    icon: "ArrowUpDown",
    description: "Order rows by column values",
    color: "text-cyan-600 bg-cyan-50 dark:bg-cyan-950/40 dark:text-cyan-400",
  },
  remove_nulls: {
    label: "Remove Nulls",
    icon: "Eraser",
    description: "Drop or fill null values",
    color: "text-rose-600 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-400",
  },
  calculated_field: {
    label: "Calculated Field",
    icon: "FunctionSquare",
    description: "Add a computed column",
    color: "text-amber-600 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400",
  },
  merge: {
    label: "Merge",
    icon: "Layers",
    description: "Union multiple data streams",
    color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 dark:text-indigo-400",
  },
};

// ── Mock Pipelines ────────────────────────────────────────────────────────────

const NOW = Date.now();
const min = (m: number) => new Date(NOW - m * 60000).toISOString();
const hr  = (h: number) => new Date(NOW - h * 3600000).toISOString();

export const MOCK_PIPELINES_FULL: Pipeline[] = [
  {
    id: "p-1",
    name: "Revenue Intelligence Feed",
    description: "Stripe payments + HubSpot deals merged into a unified revenue model with churn scoring",
    status: "active",
    lastRun: "6 min ago",
    nextRun: "in 54 min",
    successRate: 99.4,
    totalRuns: 2841,
    successCount: 2824,
    failureCount: 17,
    schedule: "Every hour",
    createdAt: "2024-01-08T07:00:00Z",
    updatedAt: min(6),
    nodes: [
      { id: "n-src1", type: "source", label: "Stripe", subtitle: "payments, subscriptions, refunds", config: { connector: "c-stripe" }, isConfigured: true },
      { id: "n-t1", type: "transform", transformKind: "join", label: "Join", subtitle: "+ HubSpot deals", config: {}, isConfigured: true },
      { id: "n-t2", type: "transform", transformKind: "calculated_field", label: "Calculated Field", subtitle: "churn_risk_score", config: {}, isConfigured: true },
      { id: "n-t3", type: "transform", transformKind: "filter", label: "Filter", subtitle: "amount_usd > 0", config: {}, isConfigured: true },
      { id: "n-dst", type: "destination", label: "BigQuery", subtitle: "revenue.unified_mrr", config: {}, isConfigured: true },
    ],
  },
  {
    id: "p-2",
    name: "Marketing Attribution Model",
    description: "GA4 sessions joined with ad spend from Google & Meta to compute blended ROAS per channel",
    status: "error",
    lastRun: "2 hours ago",
    nextRun: null,
    successRate: 87.3,
    totalRuns: 634,
    successCount: 553,
    failureCount: 81,
    schedule: "Every 6 hours",
    createdAt: "2024-03-10T10:00:00Z",
    updatedAt: hr(2),
    nodes: [
      { id: "n-src1", type: "source", label: "Google Analytics 4", subtitle: "sessions, conversions, events", config: {}, isConfigured: true, hasError: true },
      { id: "n-t1", type: "transform", transformKind: "merge", label: "Merge", subtitle: "+ Google Ads + Meta Ads", config: {}, isConfigured: true },
      { id: "n-t2", type: "transform", transformKind: "aggregate", label: "Aggregate", subtitle: "ROAS by channel × week", config: {}, isConfigured: true },
      { id: "n-dst", type: "destination", label: "Snowflake", subtitle: "MARKETING.attribution", config: {}, isConfigured: true },
    ],
  },
  {
    id: "p-3",
    name: "Product Usage → Data Warehouse",
    description: "Raw Mixpanel events cleaned, deduplicated and loaded into the product analytics schema",
    status: "active",
    lastRun: "14 min ago",
    nextRun: "in 16 min",
    successRate: 99.8,
    totalRuns: 4210,
    successCount: 4202,
    failureCount: 8,
    schedule: "Every 30 min",
    createdAt: "2023-11-15T06:00:00Z",
    updatedAt: min(14),
    nodes: [
      { id: "n-src", type: "source", label: "Mixpanel", subtitle: "events, funnels, cohorts", config: {}, isConfigured: true },
      { id: "n-t1", type: "transform", transformKind: "remove_nulls", label: "Remove Nulls", subtitle: "user_id, event_name", config: {}, isConfigured: true },
      { id: "n-t2", type: "transform", transformKind: "filter", label: "Filter", subtitle: "event_type ≠ 'bot'", config: {}, isConfigured: true },
      { id: "n-t3", type: "transform", transformKind: "rename", label: "Rename Columns", subtitle: "snake_case schema", config: {}, isConfigured: true },
      { id: "n-dst", type: "destination", label: "PostgreSQL", subtitle: "product.events_cleaned", config: {}, isConfigured: true },
    ],
  },
  {
    id: "p-4",
    name: "Customer 360 Enrichment",
    description: "Salesforce contacts joined with Intercom history and Stripe lifetime value for a unified customer profile",
    status: "active",
    lastRun: "31 min ago",
    nextRun: "in 29 min",
    successRate: 96.1,
    totalRuns: 1077,
    successCount: 1035,
    failureCount: 42,
    schedule: "Every hour",
    createdAt: "2024-02-01T09:00:00Z",
    updatedAt: min(31),
    nodes: [
      { id: "n-src", type: "source", label: "Salesforce", subtitle: "contacts, accounts", config: {}, isConfigured: true },
      { id: "n-t1", type: "transform", transformKind: "join", label: "Join", subtitle: "+ Intercom conversations", config: {}, isConfigured: true },
      { id: "n-t2", type: "transform", transformKind: "join", label: "Join", subtitle: "+ Stripe LTV", config: {}, isConfigured: true },
      { id: "n-t3", type: "transform", transformKind: "calculated_field", label: "Calculated Field", subtitle: "health_score", config: {}, isConfigured: true },
      { id: "n-dst", type: "destination", label: "Snowflake", subtitle: "CUSTOMERS.c360_profiles", config: {}, isConfigured: true },
    ],
  },
  {
    id: "p-5",
    name: "Inventory Sync",
    description: "Shopify inventory levels synced to the ERP every 15 min with low-stock alerts flagged",
    status: "paused",
    lastRun: "3 days ago",
    nextRun: null,
    successRate: 93.5,
    totalRuns: 287,
    successCount: 268,
    failureCount: 19,
    schedule: "Every 15 min",
    createdAt: "2024-04-05T11:00:00Z",
    updatedAt: hr(72),
    nodes: [
      { id: "n-src", type: "source", label: "Shopify", subtitle: "inventory, variants, locations", config: {}, isConfigured: true },
      { id: "n-t1", type: "transform", transformKind: "filter", label: "Filter", subtitle: "quantity_available < 50", config: {}, isConfigured: true },
      { id: "n-t2", type: "transform", transformKind: "calculated_field", label: "Calculated Field", subtitle: "reorder_flag", config: {}, isConfigured: true },
      { id: "n-dst", type: "destination", label: "PostgreSQL", subtitle: "ops.inventory_alerts", config: {}, isConfigured: true },
    ],
  },
  {
    id: "p-6",
    name: "NPS → Sentiment Rollup",
    description: "Typeform NPS responses classified by sentiment and rolled up weekly per product segment",
    status: "draft",
    lastRun: null,
    nextRun: null,
    successRate: 0,
    totalRuns: 0,
    successCount: 0,
    failureCount: 0,
    schedule: "Weekly",
    createdAt: "2024-07-10T14:00:00Z",
    updatedAt: hr(1),
    nodes: [
      { id: "n-src", type: "source", label: "Typeform", subtitle: "NPS survey responses", config: {}, isConfigured: false },
      { id: "n-t1", type: "transform", transformKind: "calculated_field", label: "Calculated Field", subtitle: "sentiment_label", config: {}, isConfigured: false },
      { id: "n-t2", type: "transform", transformKind: "aggregate", label: "Aggregate", subtitle: "avg NPS by segment × week", config: {}, isConfigured: false },
      { id: "n-dst", type: "destination", label: "BigQuery", subtitle: "cx.nps_weekly", config: {}, isConfigured: false },
    ],
  },
];

export const MOCK_PIPELINE_RUNS: PipelineRun[] = [
  { id: "r-1", startedAt: min(6),   finishedAt: min(3),   status: "success", recordsIn: 91_204, recordsOut: 91_004, duration: 188 },
  { id: "r-2", startedAt: min(66),  finishedAt: min(63),  status: "success", recordsIn: 89_911, recordsOut: 89_911, duration: 174 },
  { id: "r-3", startedAt: min(126), finishedAt: min(123), status: "success", recordsIn: 92_330, recordsOut: 92_102, duration: 201 },
  { id: "r-4", startedAt: min(186), finishedAt: min(185), status: "failed",  recordsIn: 0, recordsOut: 0, duration: 18, errorMessage: "OAuth token expired — reconnect Stripe connector" },
  { id: "r-5", startedAt: min(246), finishedAt: min(243), status: "success", recordsIn: 88_745, recordsOut: 88_745, duration: 166 },
  { id: "r-6", startedAt: min(306), finishedAt: min(303), status: "success", recordsIn: 90_512, recordsOut: 90_301, duration: 179 },
];
