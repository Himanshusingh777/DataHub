/**
 * CrossTecch routes.
 *
 * Mental model: users think "I want Shopify in BigQuery", not "I need to create
 * a connection, then a pipeline, then a destination." Navigation reflects goals,
 * not implementation details.
 *
 * Primary routes:
 *   /dashboard      → What's happening right now? Health of all data flows.
 *   /flows          → Manage your data flows (source → destination relationships).
 *   /flows/[id]     → Flow detail: stats, run history, inline contextual logs.
 *   /activity       → All runs across all flows. Replaces Sync Jobs + Logs.
 *   /settings       → Preferences.
 *
 * Removed as top-level nav items: Connections, Destinations, Pipelines,
 * Sync Jobs, Logs, Profile (profile now lives in avatar dropdown).
 */
export const ROUTES = {
  // Auth
  LOGIN:           "/login",
  REGISTER:        "/register",
  FORGOT_PASSWORD: "/forgot-password",

  // Core — workflow-driven
  DASHBOARD:  "/dashboard",
  FLOWS:      "/flows",
  FLOW:       (id: string) => `/flows/${id}`,
  CONNECTORS: "/connectors",
  CONNECTOR:  (id: string) => `/connectors/${id}`,
  ACTIVITY:   "/activity",
  // Universal Intelligence Engine — auto-generated warehouse analytics.
  INTELLIGENCE: "/intelligence",
  // Warehouse Monitoring — storage, query cost, partitions, cluster/table
  // health and load duration. Real BigQuery telemetry, additive sibling to
  // Intelligence (which answers data questions, not infrastructure ones).
  WAREHOUSE: "/warehouse",
  // Business Intelligence layer — executive dashboards, copilot, forecast,
  // health, reports, alerts and recommendations.
  BI: "/bi",
  DASHBOARDS: "/dashboards",
  SHARED_DASHBOARD: (token: string) => `/dashboards/shared/${token}`,
  // Data Catalog & Lineage (Phase B+C)
  CATALOG:    "/catalog",
  LINEAGE:    "/lineage",

  // Query Studio (Phase D)
  QUERY:      "/query",

  // Workspace management (Phase E)
  WORKSPACE:    "/workspace",
  ENVIRONMENTS: "/environments",

  // Automation (Phase F)
  AUTOMATION: "/automation",

  // Observability & AI Ops (Phase G+H)
  OBSERVABILITY: "/observability",
  AI_OPS:        "/ai-ops",

  // Developer Platform (Phase I)
  DEVELOPER: "/developer",

  SETTINGS:   "/settings",
  PROFILE:    "/profile",

  // Admin — platform-wide user/flow overview (owner only)
  ADMIN:      "/admin",
} as const;
