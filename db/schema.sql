-- DataHub — Postgres schema (Vercel migration, Phase 0)
--
-- Flat DDL translated from src/lib/server/db.ts's migrate() function, with
-- every additive `addColumnIfMissing()` call folded directly into its base
-- table (this is a fresh database — there's no pre-existing schema to
-- migrate onto). Apply once against a fresh Postgres database.
--
-- Type decisions applied throughout (see plan: peaceful-napping-zephyr.md):
--   - Every epoch-ms timestamp/quantity column that could exceed Postgres's
--     4-byte INTEGER range (~2.1 billion — epoch-ms "now" is already ~1.76
--     trillion) is BIGINT, not INTEGER. SQLite's INTEGER is dynamically
--     sized so this overflow was invisible there.
--   - Small bounded counters/flags (attempts, priority, version,
--     is_nullable, ordinal_position, dismissed, is_published, last_status)
--     stay INTEGER.
--   - jobs.payload and jobs.result are JSONB (enables an indexed
--     payload->>'dedupeKey' lookup). Every other JSON-as-TEXT column stays
--     TEXT, unchanged from SQLite — not required for parity.
--   - catalog_columns.id (SQLite INTEGER PRIMARY KEY AUTOINCREMENT) is
--     BIGSERIAL — verified unreferenced by application code, pure
--     schema-line translation.

-- ── Core ──────────────────────────────────────────────────────────────────

CREATE TABLE users (
  id         TEXT PRIMARY KEY,
  email      TEXT UNIQUE NOT NULL,
  name       TEXT,
  pass_hash  TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'viewer',
  status     TEXT NOT NULL DEFAULT 'active', -- active | suspended
  created_at BIGINT NOT NULL
);

CREATE TABLE sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  expires_at BIGINT NOT NULL
);
CREATE INDEX idx_sessions_tok ON sessions(token);
CREATE INDEX idx_sessions_usr ON sessions(user_id);

CREATE TABLE credentials (
  user_id      TEXT NOT NULL,
  service      TEXT NOT NULL,
  data         TEXT NOT NULL,                       -- AES-256-GCM encrypted JSON
  workspace_id TEXT NOT NULL DEFAULT 'default',
  updated_at   BIGINT NOT NULL,
  PRIMARY KEY (user_id, service)
);
CREATE INDEX idx_creds_user ON credentials(user_id);

CREATE TABLE flows (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  source_id       TEXT NOT NULL,
  source_name     TEXT,
  dest_id         TEXT NOT NULL,
  dest_name       TEXT,
  schedule_value  TEXT NOT NULL,
  warehouse_table TEXT,
  status          TEXT NOT NULL DEFAULT 'active',
  next_run_at     BIGINT,                            -- epoch ms; NULL = manual only
  workspace_id    TEXT NOT NULL DEFAULT 'default',
  sync_mode       TEXT NOT NULL DEFAULT 'full',
  key_columns     TEXT,
  bq_location     TEXT,                               -- per-flow BigQuery dataset location
  dataset         TEXT,                                -- per-flow dataset override
  name            TEXT,
  created_at      BIGINT NOT NULL
);
CREATE INDEX idx_flows_due  ON flows(next_run_at);
CREATE INDEX idx_flows_user ON flows(user_id, created_at DESC);

CREATE TABLE runs (
  id              TEXT PRIMARY KEY,
  flow_id         TEXT NOT NULL,
  status          TEXT NOT NULL,
  rows            BIGINT,
  duration_ms     BIGINT,
  error           TEXT,
  logs            TEXT,                               -- JSON array
  trigger_by      TEXT DEFAULT 'manual',               -- manual | schedule
  trigger_source  TEXT,
  workspace_id    TEXT NOT NULL DEFAULT 'default',
  started_at      BIGINT NOT NULL
);
CREATE INDEX idx_runs_flow ON runs(flow_id, started_at DESC);

-- ── Enterprise layer (v2) ────────────────────────────────────────────────

CREATE TABLE workspaces (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL,
  plan       TEXT NOT NULL DEFAULT 'free',
  dataset_id TEXT,             -- workspace-scoped BigQuery dataset
  created_at BIGINT NOT NULL,
  UNIQUE(owner_id, slug)
);

-- Background Job Engine — see also db/schema.sql's rate_limits table below
-- and src/lib/server/jobs.ts. Claim uses FOR UPDATE SKIP LOCKED (Phase 2),
-- not the SQLite IMMEDIATE-transaction pattern this table used to require.
CREATE TABLE jobs (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'default',
  type         TEXT NOT NULL,                        -- sync_flow | schema_check | rollup | warehouse_audit
  payload      JSONB NOT NULL,
  status       TEXT NOT NULL DEFAULT 'queued',        -- queued | running | success | failed | dead
  priority     INTEGER NOT NULL DEFAULT 0,             -- higher runs first
  attempts     INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  run_after    BIGINT NOT NULL,                        -- epoch ms; claimable once now >= run_after
  locked_by    TEXT,
  locked_at    BIGINT,
  last_error   TEXT,
  result       JSONB,
  created_at   BIGINT NOT NULL,
  updated_at   BIGINT NOT NULL
);
CREATE INDEX idx_jobs_claimable ON jobs(status, run_after, priority DESC);
CREATE INDEX idx_jobs_workspace ON jobs(workspace_id, created_at DESC);
CREATE INDEX idx_jobs_dedupe    ON jobs ((payload->>'dedupeKey')) WHERE status IN ('queued','running');

CREATE TABLE sync_state (
  flow_id      TEXT PRIMARY KEY,
  cursor_field TEXT,                                  -- e.g. "updated_at", "id"
  cursor_value TEXT,                                  -- last seen value, as string
  watermark_at BIGINT,                                 -- epoch ms of the last successful checkpoint
  rows_since   BIGINT NOT NULL DEFAULT 0,
  updated_at   BIGINT NOT NULL
);

CREATE TABLE audit_log (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'default',
  user_id      TEXT,
  action       TEXT NOT NULL,
  resource     TEXT,
  meta         TEXT,                                  -- JSON
  ip           TEXT,
  created_at   BIGINT NOT NULL
);
CREATE INDEX idx_audit_workspace ON audit_log(workspace_id, created_at DESC);

CREATE TABLE usage_events (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'default',
  metric       TEXT NOT NULL,                          -- rows_synced | api_calls | storage_bytes | ...
  quantity     BIGINT NOT NULL,
  created_at   BIGINT NOT NULL
);
CREATE INDEX idx_usage_workspace ON usage_events(workspace_id, metric, created_at DESC);

CREATE TABLE api_keys (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'default',
  user_id      TEXT NOT NULL,
  name         TEXT NOT NULL,
  key_hash     TEXT NOT NULL,
  prefix       TEXT NOT NULL,
  scopes       TEXT NOT NULL DEFAULT '[]',             -- JSON string[]
  status       TEXT NOT NULL DEFAULT 'active',
  created_at   BIGINT NOT NULL,
  last_used_at BIGINT
);

CREATE TABLE password_resets (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL UNIQUE,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM now()) * 1000)::bigint
);

CREATE TABLE catalog_tables (
  id               TEXT PRIMARY KEY,
  workspace_id     TEXT NOT NULL DEFAULT 'default',
  project_id       TEXT NOT NULL,
  dataset          TEXT NOT NULL,
  table_name       TEXT NOT NULL,
  row_count        BIGINT,
  size_bytes       BIGINT,
  schema_json      TEXT NOT NULL DEFAULT '[]',         -- JSON BQField[]
  description      TEXT,
  owner            TEXT,
  freshness_at     BIGINT,                              -- last modified timestamp from BQ metadata
  connector_id     TEXT NOT NULL DEFAULT 'bigquery',
  schema_name      TEXT,
  column_count     INTEGER NOT NULL DEFAULT 0,
  owner_email      TEXT,
  last_synced_at   TEXT,
  freshness_hours  INTEGER,
  tags             TEXT,
  user_id          TEXT NOT NULL DEFAULT 'unknown',
  discovered_at    BIGINT NOT NULL,
  UNIQUE(workspace_id, project_id, dataset, table_name)
);

CREATE TABLE lineage_events (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'default',
  source_type  TEXT NOT NULL,                          -- 'connector' | 'query' | 'transform'
  source_id    TEXT NOT NULL,
  target_type  TEXT NOT NULL,                           -- 'table' | 'dashboard' | 'report'
  target_id    TEXT NOT NULL,
  flow_id      TEXT,
  created_at   BIGINT NOT NULL
);

CREATE TABLE saved_queries (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'default',
  user_id      TEXT NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT,
  sql          TEXT NOT NULL,
  tags         TEXT NOT NULL DEFAULT '[]',              -- JSON string[]
  created_at   BIGINT NOT NULL,
  updated_at   BIGINT NOT NULL
);

CREATE TABLE query_history (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL DEFAULT 'default',
  user_id         TEXT NOT NULL,
  sql             TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',       -- pending | running | success | error
  rows_returned   BIGINT,
  bytes_processed BIGINT,
  duration_ms     BIGINT,
  error           TEXT,
  result_json     TEXT,                                  -- first 1000 rows cached
  created_at      BIGINT NOT NULL
);

CREATE TABLE webhooks (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL DEFAULT 'default',
  user_id       TEXT NOT NULL,
  name          TEXT NOT NULL,
  url           TEXT NOT NULL,
  events        TEXT NOT NULL DEFAULT '[]',              -- JSON string[] of event types
  secret        TEXT NOT NULL,                            -- HMAC signing secret (encrypted)
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    BIGINT NOT NULL,
  last_fired_at BIGINT,
  last_status   INTEGER                                   -- HTTP status of last delivery
);

CREATE TABLE catalog_columns (
  id               BIGSERIAL PRIMARY KEY,
  table_id         TEXT NOT NULL REFERENCES catalog_tables(id) ON DELETE CASCADE,
  column_name      TEXT NOT NULL,
  data_type        TEXT NOT NULL,
  is_nullable      INTEGER NOT NULL DEFAULT 1,
  ordinal_position INTEGER NOT NULL DEFAULT 0,
  description      TEXT
);
CREATE INDEX idx_catalog_cols_table ON catalog_columns(table_id);

CREATE TABLE environments (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'default',
  name         TEXT NOT NULL,
  slug         TEXT NOT NULL,
  color        TEXT NOT NULL DEFAULT '#6366F1',
  created_at   BIGINT NOT NULL,
  UNIQUE(workspace_id, slug)
);

CREATE TABLE secrets (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'default',
  env_id       TEXT,
  key_name     TEXT NOT NULL,
  encrypted    TEXT NOT NULL,
  created_by   TEXT,
  created_at   BIGINT NOT NULL,
  UNIQUE(workspace_id, env_id, key_name)
);

CREATE TABLE workspace_members (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'default',
  user_id      TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'viewer',           -- admin | editor | viewer
  invited_by   TEXT,
  joined_at    BIGINT NOT NULL,
  UNIQUE(workspace_id, user_id)
);
CREATE INDEX idx_wm_workspace ON workspace_members(workspace_id);
CREATE INDEX idx_wm_user      ON workspace_members(user_id);

-- ── Intelligence Platform v2: Models, Dashboards, Widgets, Insights ────────

CREATE TABLE models (
  id                     TEXT PRIMARY KEY,
  workspace_id           TEXT NOT NULL,
  user_id                TEXT NOT NULL,
  name                   TEXT NOT NULL,
  description            TEXT,
  sql_query              TEXT NOT NULL,
  source_table           TEXT,
  source_dataset         TEXT,
  schema_json            TEXT NOT NULL DEFAULT '[]',
  status                 TEXT NOT NULL DEFAULT 'draft',
  tags                   TEXT NOT NULL DEFAULT '[]',
  version                INTEGER NOT NULL DEFAULT 1,
  source_saved_query_id  TEXT,                            -- links back to saved_queries (Query Studio auto-sync)
  created_at             BIGINT NOT NULL,
  updated_at             BIGINT NOT NULL
);
CREATE INDEX idx_models_workspace ON models(workspace_id, updated_at DESC);
CREATE INDEX idx_models_user      ON models(user_id, created_at DESC);
CREATE INDEX idx_models_status    ON models(workspace_id, status);

CREATE TABLE model_runs (
  id              TEXT PRIMARY KEY,
  model_id        TEXT NOT NULL,
  workspace_id    TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  status          TEXT NOT NULL,
  rows_returned   BIGINT,
  duration_ms     BIGINT,
  bytes_processed BIGINT,
  error           TEXT,
  ran_at          BIGINT NOT NULL
);
CREATE INDEX idx_model_runs_model ON model_runs(model_id, ran_at DESC);
CREATE INDEX idx_model_runs_ws    ON model_runs(workspace_id, ran_at DESC);

-- One row per saved SQL edit — snapshotted before each change so a model's
-- history can be viewed/restored (see PUT /api/models/[id]).
CREATE TABLE model_versions (
  id           TEXT PRIMARY KEY,
  model_id     TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  version      INTEGER NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT,
  sql_query    TEXT NOT NULL,
  created_at   BIGINT NOT NULL
);
CREATE INDEX idx_model_versions_model ON model_versions(model_id, version DESC);

CREATE TABLE dashboards (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT,
  layout_json  TEXT NOT NULL DEFAULT '[]',
  theme        TEXT NOT NULL DEFAULT 'light',
  share_token  TEXT,
  is_published INTEGER NOT NULL DEFAULT 0,
  created_at   BIGINT NOT NULL,
  updated_at   BIGINT NOT NULL
);
CREATE INDEX idx_dashboards_workspace ON dashboards(workspace_id, updated_at DESC);
CREATE UNIQUE INDEX idx_dashboards_token ON dashboards(share_token) WHERE share_token IS NOT NULL;

CREATE TABLE widgets (
  id            TEXT PRIMARY KEY,
  dashboard_id  TEXT NOT NULL,
  workspace_id  TEXT NOT NULL,
  model_id      TEXT NOT NULL,
  name          TEXT NOT NULL,
  chart_type    TEXT NOT NULL DEFAULT 'table',
  config_json   TEXT NOT NULL DEFAULT '{}',
  position_json TEXT NOT NULL DEFAULT '{}',
  created_at    BIGINT NOT NULL,
  updated_at    BIGINT NOT NULL
);
CREATE INDEX idx_widgets_dashboard ON widgets(dashboard_id);
CREATE INDEX idx_widgets_workspace ON widgets(workspace_id);
CREATE INDEX idx_widgets_model     ON widgets(model_id);

CREATE TABLE bi_insights (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  model_id     TEXT,
  type         TEXT NOT NULL DEFAULT 'trend',
  title        TEXT NOT NULL,
  description  TEXT,
  data_json    TEXT,
  severity     TEXT NOT NULL DEFAULT 'info',
  dismissed    INTEGER NOT NULL DEFAULT 0,
  created_at   BIGINT NOT NULL,
  expires_at   BIGINT
);
CREATE INDEX idx_bi_insights_ws    ON bi_insights(workspace_id, created_at DESC);
CREATE INDEX idx_bi_insights_model ON bi_insights(model_id);

-- ── Rate limiting (Phase 1/3 — replaces the in-memory Map in both
--    src/lib/server/rate-limit.ts and backend/app/rate_limit.py, which had
--    the identical correctness bug under horizontally-scaled serverless) ──

CREATE TABLE rate_limits (
  key        TEXT PRIMARY KEY,          -- "<route>:<identity>"
  tokens     DOUBLE PRECISION NOT NULL,
  updated_at BIGINT NOT NULL            -- epoch ms
);
