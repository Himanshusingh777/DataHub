/**
 * SQLite database layer (better-sqlite3, file-based, zero-config).
 * DB file: .crosstecch/crosstecch.db
 *
 * Requires: npm install better-sqlite3
 */

import path from "path";
import fs from "fs";

// Lazy require so the app still boots (with a clear error) if the dep is missing
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _db: any = null;

export function getDb() {
  if (_db) return _db;
  let Database;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Database = require("better-sqlite3");
  } catch {
    throw new Error("Database driver missing — run: npm install better-sqlite3");
  }
  const dir = path.join(process.cwd(), ".crosstecch");
  fs.mkdirSync(dir, { recursive: true });
  _db = new Database(path.join(dir, "crosstecch.db"));
  _db.pragma("journal_mode = WAL");
  migrate(_db);
  return _db;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrate(db: any) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id         TEXT PRIMARY KEY,
      email      TEXT UNIQUE NOT NULL,
      name       TEXT,
      pass_hash  TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS credentials (
      user_id    TEXT NOT NULL,
      service    TEXT NOT NULL,
      data       TEXT NOT NULL,        -- AES-256-GCM encrypted JSON
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, service)
    );

    CREATE TABLE IF NOT EXISTS flows (
      id              TEXT PRIMARY KEY,
      user_id         TEXT NOT NULL,
      source_id       TEXT NOT NULL,
      source_name     TEXT,
      dest_id         TEXT NOT NULL,
      dest_name       TEXT,
      schedule_value  TEXT NOT NULL,
      warehouse_table TEXT,
      status          TEXT NOT NULL DEFAULT 'active',
      next_run_at     INTEGER,          -- epoch ms; NULL = manual only
      created_at      INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS runs (
      id          TEXT PRIMARY KEY,
      flow_id     TEXT NOT NULL,
      status      TEXT NOT NULL,
      rows        INTEGER,
      duration_ms INTEGER,
      error       TEXT,
      logs        TEXT,                 -- JSON array
      trigger_by  TEXT DEFAULT 'manual',-- manual | schedule
      started_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_runs_flow    ON runs(flow_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_flows_due    ON flows(next_run_at);
    CREATE INDEX IF NOT EXISTS idx_flows_user   ON flows(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sessions_tok ON sessions(token);
    CREATE INDEX IF NOT EXISTS idx_sessions_usr ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_creds_user   ON credentials(user_id);

    -- ── Enterprise layer (v2, fully additive) ──────────────────────────────

    -- Multi-workspace: each customer's own connectors/flows/keys are scoped
    -- by workspace_id. A "default" workspace is implicit for every user so
    -- pre-existing single-tenant installs need no data migration.
    CREATE TABLE IF NOT EXISTS workspaces (
      id         TEXT PRIMARY KEY,
      owner_id   TEXT NOT NULL,
      name       TEXT NOT NULL,
      slug       TEXT NOT NULL,
      plan       TEXT NOT NULL DEFAULT 'free',
      created_at INTEGER NOT NULL,
      UNIQUE(owner_id, slug)
    );

    -- Background Job Engine: durable queue backing the scheduler. Every
    -- scheduled sync (and any future background task) is a row here rather
    -- than an in-process fire-and-forget call, so retries and parallelism
    -- survive a process restart.
    CREATE TABLE IF NOT EXISTS jobs (
      id           TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL DEFAULT 'default',
      type         TEXT NOT NULL,          -- sync_flow | schema_check | rollup | ...
      payload      TEXT NOT NULL,          -- JSON
      status       TEXT NOT NULL DEFAULT 'queued', -- queued | running | success | failed | dead
      priority     INTEGER NOT NULL DEFAULT 0,      -- higher runs first
      attempts     INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      run_after    INTEGER NOT NULL,       -- epoch ms; claimable once now >= run_after
      locked_by    TEXT,
      locked_at    INTEGER,
      last_error   TEXT,
      result       TEXT,                   -- JSON, set on success
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_claimable ON jobs(status, run_after, priority DESC);
    CREATE INDEX IF NOT EXISTS idx_jobs_workspace ON jobs(workspace_id, created_at DESC);

    -- Incremental Sync: per-flow checkpoint/watermark so re-runs pull only
    -- new/changed records instead of a full table scan every time.
    CREATE TABLE IF NOT EXISTS sync_state (
      flow_id        TEXT PRIMARY KEY,
      cursor_field   TEXT,                 -- e.g. "updated_at", "id"
      cursor_value   TEXT,                 -- last seen value, as string
      watermark_at   INTEGER,              -- epoch ms of the last successful checkpoint
      rows_since     INTEGER NOT NULL DEFAULT 0,
      updated_at     INTEGER NOT NULL
    );

    -- Security: append-only audit trail for sensitive actions (credential
    -- writes, flow changes, auth events, permission checks).
    CREATE TABLE IF NOT EXISTS audit_log (
      id           TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL DEFAULT 'default',
      user_id      TEXT,
      action       TEXT NOT NULL,
      resource     TEXT,
      meta         TEXT,                   -- JSON
      ip           TEXT,
      created_at   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audit_workspace ON audit_log(workspace_id, created_at DESC);

    -- Billing-ready: usage events feed plan-limit checks and, eventually,
    -- metered invoicing. Architecture only — no live Stripe calls.
    CREATE TABLE IF NOT EXISTS usage_events (
      id           TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL DEFAULT 'default',
      metric       TEXT NOT NULL,           -- rows_synced | api_calls | storage_bytes | ...
      quantity     INTEGER NOT NULL,
      created_at   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_usage_workspace ON usage_events(workspace_id, metric, created_at DESC);

    -- API keys: real backing store for the Settings → API Keys page.
    -- Keys are stored as a salted hash, never in plaintext.
    CREATE TABLE IF NOT EXISTS api_keys (
      id           TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL DEFAULT 'default',
      user_id      TEXT NOT NULL,
      name         TEXT NOT NULL,
      key_hash     TEXT NOT NULL,
      prefix       TEXT NOT NULL,
      scopes       TEXT NOT NULL DEFAULT '[]', -- JSON string[]
      status       TEXT NOT NULL DEFAULT 'active',
      created_at   INTEGER NOT NULL,
      last_used_at INTEGER
    );

    -- Password reset tokens (1 active token per user at a time, 1-hour TTL)
    CREATE TABLE IF NOT EXISTS password_resets (
      token      TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    -- Data catalog: stores discovered table/column metadata from the warehouse
    CREATE TABLE IF NOT EXISTS catalog_tables (
      id           TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL DEFAULT 'default',
      project_id   TEXT NOT NULL,
      dataset      TEXT NOT NULL,
      table_name   TEXT NOT NULL,
      row_count    INTEGER,
      size_bytes   INTEGER,
      schema_json  TEXT NOT NULL DEFAULT '[]', -- JSON BQField[]
      description  TEXT,
      owner        TEXT,
      freshness_at INTEGER,   -- last modified timestamp from BQ metadata
      discovered_at INTEGER NOT NULL,
      UNIQUE(workspace_id, project_id, dataset, table_name)
    );

    -- Lineage: source → connector → warehouse → dashboard tracking
    CREATE TABLE IF NOT EXISTS lineage_events (
      id            TEXT PRIMARY KEY,
      workspace_id  TEXT NOT NULL DEFAULT 'default',
      source_type   TEXT NOT NULL, -- 'connector' | 'query' | 'transform'
      source_id     TEXT NOT NULL,
      target_type   TEXT NOT NULL, -- 'table' | 'dashboard' | 'report'
      target_id     TEXT NOT NULL,
      flow_id       TEXT,
      created_at    INTEGER NOT NULL
    );

    -- Saved queries (Query Studio)
    CREATE TABLE IF NOT EXISTS saved_queries (
      id           TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL DEFAULT 'default',
      user_id      TEXT NOT NULL,
      name         TEXT NOT NULL,
      description  TEXT,
      sql          TEXT NOT NULL,
      tags         TEXT NOT NULL DEFAULT '[]', -- JSON string[]
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL
    );

    -- Query execution history
    CREATE TABLE IF NOT EXISTS query_history (
      id              TEXT PRIMARY KEY,
      workspace_id    TEXT NOT NULL DEFAULT 'default',
      user_id         TEXT NOT NULL,
      sql             TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'pending', -- pending | running | success | error
      rows_returned   INTEGER,
      bytes_processed INTEGER,
      duration_ms     INTEGER,
      error           TEXT,
      result_json     TEXT, -- first 1000 rows cached
      created_at      INTEGER NOT NULL
    );

    -- Webhook endpoints
    CREATE TABLE IF NOT EXISTS webhooks (
      id           TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL DEFAULT 'default',
      user_id      TEXT NOT NULL,
      name         TEXT NOT NULL,
      url          TEXT NOT NULL,
      events       TEXT NOT NULL DEFAULT '[]', -- JSON string[] of event types
      secret       TEXT NOT NULL,              -- HMAC signing secret (encrypted)
      status       TEXT NOT NULL DEFAULT 'active',
      created_at   INTEGER NOT NULL,
      last_fired_at INTEGER,
      last_status  INTEGER  -- HTTP status of last delivery
    );
  `);

  // Catalog columns — one row per discovered column (additive schema)
  db.exec(`
    CREATE TABLE IF NOT EXISTS catalog_columns (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      table_id          TEXT NOT NULL REFERENCES catalog_tables(id) ON DELETE CASCADE,
      column_name       TEXT NOT NULL,
      data_type         TEXT NOT NULL,
      is_nullable       INTEGER NOT NULL DEFAULT 1,
      ordinal_position  INTEGER NOT NULL DEFAULT 0,
      description       TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_catalog_cols_table ON catalog_columns(table_id);

    -- Environments: dev / staging / prod per workspace
    CREATE TABLE IF NOT EXISTS environments (
      id           TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL DEFAULT 'default',
      name         TEXT NOT NULL,
      slug         TEXT NOT NULL,
      color        TEXT NOT NULL DEFAULT '#6366F1',
      created_at   INTEGER NOT NULL,
      UNIQUE(workspace_id, slug)
    );

    -- Secrets vault: per-environment encrypted key-value pairs
    CREATE TABLE IF NOT EXISTS secrets (
      id           TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL DEFAULT 'default',
      env_id       TEXT,
      key_name     TEXT NOT NULL,
      encrypted    TEXT NOT NULL,
      created_by   TEXT,
      created_at   INTEGER NOT NULL,
      UNIQUE(workspace_id, env_id, key_name)
    );

    -- Workflow automation rules
    CREATE TABLE IF NOT EXISTS automations (
      id           TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL DEFAULT 'default',
      user_id      TEXT NOT NULL,
      name         TEXT NOT NULL,
      trigger_type TEXT NOT NULL, -- 'pre_sync' | 'post_sync' | 'on_failure' | 'schedule'
      trigger_meta TEXT,          -- JSON
      action_type  TEXT NOT NULL, -- 'webhook' | 'email' | 'retry' | 'transform'
      action_meta  TEXT,          -- JSON
      enabled      INTEGER NOT NULL DEFAULT 1,
      created_at   INTEGER NOT NULL
    );
  `);

  // ── Workspace members (multi-user per workspace) ──────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspace_members (
      id           TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL DEFAULT 'default',
      user_id      TEXT NOT NULL,
      role         TEXT NOT NULL DEFAULT 'viewer',  -- admin | editor | viewer
      invited_by   TEXT,
      joined_at    INTEGER NOT NULL,
      UNIQUE(workspace_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_wm_workspace ON workspace_members(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_wm_user      ON workspace_members(user_id);
  `);

  // Additive migrations for pre-existing databases
  addColumnIfMissing(db, "users", "role",   "TEXT NOT NULL DEFAULT 'viewer'");
  addColumnIfMissing(db, "users", "status", "TEXT NOT NULL DEFAULT 'active'"); // active | suspended
  addColumnIfMissing(db, "flows", "workspace_id", "TEXT NOT NULL DEFAULT 'default'");
  addColumnIfMissing(db, "credentials", "workspace_id", "TEXT NOT NULL DEFAULT 'default'");
  addColumnIfMissing(db, "runs", "trigger_source", "TEXT");
  addColumnIfMissing(db, "flows", "sync_mode", "TEXT NOT NULL DEFAULT 'full'");
  addColumnIfMissing(db, "flows", "key_columns", "TEXT");
  addColumnIfMissing(db, "flows", "bq_location", "TEXT"); // per-flow BigQuery dataset location
  addColumnIfMissing(db, "credentials", "service", "TEXT NOT NULL DEFAULT 'unknown'");
  // Workspace scoping for tables that didn't have it at creation time
  addColumnIfMissing(db, "runs",          "workspace_id", "TEXT NOT NULL DEFAULT 'default'");
  addColumnIfMissing(db, "query_history", "workspace_id", "TEXT NOT NULL DEFAULT 'default'");
  addColumnIfMissing(db, "automations",   "workspace_id", "TEXT NOT NULL DEFAULT 'default'");
  // Schedule-trigger tracking (mirrors flows.next_run_at) + last-fire status,
  // surfaced in the Automation UI and used by the scheduler tick.
  addColumnIfMissing(db, "automations",   "next_run_at",  "INTEGER");
  addColumnIfMissing(db, "automations",   "last_fired_at", "INTEGER");
  addColumnIfMissing(db, "automations",   "last_status",  "TEXT"); // 'success' | 'error'
  addColumnIfMissing(db, "models",        "version",      "INTEGER NOT NULL DEFAULT 1");
  addColumnIfMissing(db, "api_keys",      "workspace_id", "TEXT NOT NULL DEFAULT 'default'");
  addColumnIfMissing(db, "environments",  "workspace_id", "TEXT NOT NULL DEFAULT 'default'");
  // Augment catalog_tables to support multi-connector (not just BQ)
  addColumnIfMissing(db, "catalog_tables", "connector_id",    "TEXT NOT NULL DEFAULT 'bigquery'");
  addColumnIfMissing(db, "catalog_tables", "schema_name",     "TEXT");
  addColumnIfMissing(db, "catalog_tables", "column_count",    "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(db, "catalog_tables", "owner_email",     "TEXT");
  addColumnIfMissing(db, "catalog_tables", "last_synced_at",  "TEXT");
  addColumnIfMissing(db, "catalog_tables", "freshness_hours", "INTEGER");
  addColumnIfMissing(db, "catalog_tables", "tags",            "TEXT");
  addColumnIfMissing(db, "catalog_tables", "user_id",         "TEXT NOT NULL DEFAULT 'unknown'");

  // ── Workspace-scoped BigQuery dataset (new architecture) ─────────────────
  // Each workspace owns one BQ dataset (e.g. "acme_ltd"). The admin sets this
  // once; all flows in the workspace share it by default.
  addColumnIfMissing(db, "workspaces", "dataset_id", "TEXT");

  // Per-flow dataset override: if a flow was created with a custom dataset
  // (via the new flow wizard Step 3), this overrides the workspace default.
  addColumnIfMissing(db, "flows", "dataset", "TEXT");

  // Name of the flow (Step 2 of new wizard) — separate from source_name
  addColumnIfMissing(db, "flows", "name", "TEXT");

  // ── Intelligence Platform v2: Models, Dashboards, Widgets, Insights ────────
  // Semantic Models: the intelligence layer between raw warehouse tables and
  // dashboards. Every dashboard widget MUST reference a saved Model.
  // Dashboards and Widgets are persisted server-side (replacing client-only state).
  // bi_insights are AI/statistical insights derived from Model execution results.
  db.exec(`
    CREATE TABLE IF NOT EXISTS models (
      id             TEXT PRIMARY KEY,
      workspace_id   TEXT NOT NULL,
      user_id        TEXT NOT NULL,
      name           TEXT NOT NULL,
      description    TEXT,
      sql_query      TEXT NOT NULL,
      source_table   TEXT,
      source_dataset TEXT,
      schema_json    TEXT NOT NULL DEFAULT '[]',
      status         TEXT NOT NULL DEFAULT 'draft',
      tags           TEXT NOT NULL DEFAULT '[]',
      created_at     INTEGER NOT NULL,
      updated_at     INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_models_workspace ON models(workspace_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_models_user      ON models(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_models_status    ON models(workspace_id, status);

    CREATE TABLE IF NOT EXISTS model_runs (
      id              TEXT PRIMARY KEY,
      model_id        TEXT NOT NULL,
      workspace_id    TEXT NOT NULL,
      user_id         TEXT NOT NULL,
      status          TEXT NOT NULL,
      rows_returned   INTEGER,
      duration_ms     INTEGER,
      bytes_processed INTEGER,
      error           TEXT,
      ran_at          INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_model_runs_model ON model_runs(model_id, ran_at DESC);
    CREATE INDEX IF NOT EXISTS idx_model_runs_ws    ON model_runs(workspace_id, ran_at DESC);

    -- One row per saved SQL edit — snapshotted before each change so a
    -- model's history can be viewed/restored (see PUT /api/models/[id]).
    CREATE TABLE IF NOT EXISTS model_versions (
      id           TEXT PRIMARY KEY,
      model_id     TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      user_id      TEXT NOT NULL,
      version      INTEGER NOT NULL,
      name         TEXT NOT NULL,
      description  TEXT,
      sql_query    TEXT NOT NULL,
      created_at   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_model_versions_model ON model_versions(model_id, version DESC);

    CREATE TABLE IF NOT EXISTS dashboards (
      id           TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      user_id      TEXT NOT NULL,
      name         TEXT NOT NULL,
      description  TEXT,
      layout_json  TEXT NOT NULL DEFAULT '[]',
      theme        TEXT NOT NULL DEFAULT 'light',
      share_token  TEXT,
      is_published INTEGER NOT NULL DEFAULT 0,
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_dashboards_workspace ON dashboards(workspace_id, updated_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_dashboards_token ON dashboards(share_token)
      WHERE share_token IS NOT NULL;

    CREATE TABLE IF NOT EXISTS widgets (
      id            TEXT PRIMARY KEY,
      dashboard_id  TEXT NOT NULL,
      workspace_id  TEXT NOT NULL,
      model_id      TEXT NOT NULL,
      name          TEXT NOT NULL,
      chart_type    TEXT NOT NULL DEFAULT 'table',
      config_json   TEXT NOT NULL DEFAULT '{}',
      position_json TEXT NOT NULL DEFAULT '{}',
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_widgets_dashboard ON widgets(dashboard_id);
    CREATE INDEX IF NOT EXISTS idx_widgets_workspace ON widgets(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_widgets_model     ON widgets(model_id);

    CREATE TABLE IF NOT EXISTS bi_insights (
      id           TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      model_id     TEXT,
      type         TEXT NOT NULL DEFAULT 'trend',
      title        TEXT NOT NULL,
      description  TEXT,
      data_json    TEXT,
      severity     TEXT NOT NULL DEFAULT 'info',
      dismissed    INTEGER NOT NULL DEFAULT 0,
      created_at   INTEGER NOT NULL,
      expires_at   INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_bi_insights_ws    ON bi_insights(workspace_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_bi_insights_model ON bi_insights(model_id);
  `);
}

/** SQLite has no "ADD COLUMN IF NOT EXISTS" — check PRAGMA table_info first. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function addColumnIfMissing(db: any, table: string, column: string, ddl: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

// ── Schedule helpers ─────────────────────────────────────────────────────────

export const SCHEDULE_INTERVALS_MIN: Record<string, number | null> = {
  // Canonical values (used internally)
  every_15m:  15,
  every_hour: 60,
  every_6h:   360,
  daily:      1440,
  weekly:     10080,
  manual:     null,
  // Wizard aliases (every_day, every_week, etc.)
  every_15min: 15,
  every_30min: 30,
  every_3h:   180,
  every_12h:  720,
  every_day:  1440,
  every_week: 10080,
};

export function computeNextRun(scheduleValue: string, from = Date.now()): number | null {
  const min = SCHEDULE_INTERVALS_MIN[scheduleValue];
  if (min === null || min === undefined) return null;
  return from + min * 60_000;
}

// ── Multi-workspace default ───────────────────────────────────────────────────
// Every pre-existing row (and every new row for the single-tenant "local"
// user) lives in this implicit workspace, so multi-workspace support is
// purely additive: nothing has to be migrated for the app to keep working
// exactly as it did before this table existed.
export const DEFAULT_WORKSPACE_ID = "default";
