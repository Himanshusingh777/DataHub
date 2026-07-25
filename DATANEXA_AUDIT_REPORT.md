# DataNexa Transformation — Architecture Audit Report

**Date:** 2026-07-25
**Scope:** Full repository audit of the existing platform (currently codenamed "CrossTecch") prior to refactor into DataNexa.
**Method:** Direct code reading across four parallel audits (data/auth/security, connectors/ETL/warehouse/SQL runner, scheduler/workers/queue, frontend/API/dead-code). Every claim below is grounded in a real file; no item is speculative. File:line references are to paths as of commit `b35dc8b` (baseline safety checkpoint).

> **Read this first:** the backend engineering (DB, job queue, ETL, BigQuery integration, SQL runner) is substantially real and well-built. The problems are concentrated in three places: (1) a handful of sharp, fixable bugs — some security-critical, (2) a frontend that only exposes ~15% of what the backend can do (a "V1 sidebar" links 4 routes; ~30 page folders are 2-line redirect stubs), and (3) scope creep — a large surface of half-built features (BI builder, lineage, catalog, automation, AI-ops, billing) that don't match the lean product you actually asked to keep.

---

## 1. Current Architecture

Next.js 15 (App Router) + React 19 monolith. Single SQLite file (`better-sqlite3`, WAL mode) is the system of record for everything except warehouse data, which lives in BigQuery. No separate backend service — API routes under `src/app/api/**/route.ts` are the entire server. Background jobs run **in the same Node process** as the web server, started from `src/instrumentation.ts` at boot (see §7). There is no separate worker deployment, no message broker, no cache layer (Redis/etc.) — everything is SQLite + in-process timers.

The existing `ARCHITECTURE.md` describes a clean 8-layer vertical stack (Connector → Extraction → Transformation → Warehouse → Semantic → KPI → Dashboard → Insight/Recommendation/Copilot → Frontend) plus cross-cutting concerns (Jobs, Multi-Workspace, Security, Auth, Billing, Performance). **This document is partially stale**: it doesn't mention the real connector SDK layer (`src/lib/connectors/sdk.ts`, `registry.ts`) that sits alongside the older `lib/server/connectors.ts`, and it overstates what's actually wired (billing, RBAC — see §17).

## 2. Folder Structure

```
src/
  app/
    (auth)/          login, register, forgot-password — real
    (dashboard)/      ~40 route folders — only 6 are real & linked (see §14)
    api/              78 route.ts files — 57 touch the DB directly, rest use lib/server helpers
    pricing/
  components/
    ui/               shadcn primitives (19 files) — real, broadly used
    layout/           sidebar/topbar real; 6 of 9 files unused (§15)
    flows/            flow-wizard-modal, pipeline-builder — real
    dashboard/         10 files, ALL unused — dead dashboard-v1 component set
    charts/, engine/   3 competing charting approaches, only 1 (engine/auto-dashboard) used
    connectors/, copilot/, onboarding/   fully unused
  lib/
    server/           db.ts, auth.ts, crypto.ts, secrets.ts, permissions.ts, audit.ts,
                       rate-limit.ts, workspace.ts, jobs.ts, worker.ts, scheduler.ts,
                       etl.ts, incremental.ts, warehouse-monitor.ts, connectors.ts, runner.ts, billing.ts
    connectors/        sdk.ts, registry.ts, adapters/{instantly,postgresql,shopify,hubspot,stripe,google-sheets}.ts
    engine/            semantic.ts, kpi.ts, viz.ts, insights.ts, recommend.ts, quality.ts, sql.ts
    bi/                dashboard-builder, health, recommendation-center, copilot-warehouse (BI layer — not in keep list)
  stores/             zustand: auth, ui, flow-wizard (real); connectors/copilot/onboarding — gutted stubs
  services/           backend, connector, scheduler, schema, warehouse (real); csv/instantly/sync/validation — unused
scripts/
  admin-reset.js
.crosstecch/          crosstecch.db (WAL) + secret.key — gitignored correctly
```

Root also currently has two stray CSV files (`ecommerce_orders_1000.csv`, `sales_data_q4_2024.csv`) — manual test-upload artifacts, referenced nowhere in code, safe to delete.

## 3. Dependency Graph (high level)

`app/api/**` → `lib/server/**` (db, auth, workspace, crypto) → `better-sqlite3` / `.crosstecch/crosstecch.db`
`app/api/sync,flows` → `lib/server/runner.ts` → `lib/connectors/{sdk,registry,adapters/*}` (source) + `lib/server/etl.ts` → `@google-cloud/bigquery` (destination)
`app/api/query` → `lib/server/bq-creds.ts` + `@google-cloud/bigquery` directly
`instrumentation.ts` → `lib/server/{scheduler,worker}.ts` → `lib/server/jobs.ts` (queue) → handler registry → `runner.ts` / `billing.ts` / `warehouse-monitor.ts`
`app/(dashboard)/**/page.tsx` → mix of real `fetch()` calls to `app/api/**` (6 live pages) and imports of `lib/{mock-data,enterprise-data,monitoring-data,flows-data,pipeline-types}.ts` (orphaned pages)

No circular dependencies found between layers. The declared layering in `ARCHITECTURE.md` (never import upward) holds in the code that's actually wired; it's just wider than what's live.

## 4. Data Flow

**Sync path (real, working):** UI flow-wizard → `POST /api/flows` (persists flow config + credentials reference) → scheduler marks due → `sync_flow` job enqueued → worker claims job → `runner.ts` loads adapter from registry → `adapter.authenticate()` → `adapter.extract()` per object → `etl.ts` (`sanitizeRows`, `inferSchema`) → `loadToBigQuery` / `loadToBigQueryIncremental` → BigQuery table. Run result written to `runs` table, audit entry for some paths.

**Query path (real):** Query Studio textarea → `POST /api/query/run` → `bq-creds.ts` resolves credentials → BigQuery `createQueryJob` → results + `bytesProcessed`/`durationMs` → `query_history` table.

**Dashboard path (real, narrow):** `/dashboard` page → `GET /api/dashboard/stats` → live SQL aggregates over `flows`/`runs`/`jobs`. This is the only "dashboard" that's both real and reachable.

## 5. Authentication Flow

Email/password only. `POST /api/auth/login` → scrypt hash verify (`crypto.ts:83-88`, timing-safe compare) → 32-byte random session token → `sessions` table, 30-day TTL → httpOnly/SameSite=Lax cookie (Secure in production). OAuth (Google/GitHub/Microsoft) is genuinely architecture-only — `auth-providers.ts` throws "not yet wired" for every provider, matching its own documentation. No CSRF token beyond SameSite=Lax. **Password reset is broken** — see §17.

## 6. Flow Execution Flow

Flow wizard (`flow-wizard-modal.tsx`) UI has 5 steps: source → auth → dataset → schedule → review. **Missing vs. the spec you asked for**: no object/table-selection step, no data-preview step, no column-mapping step. Consequence: full-refresh sync always pulls every object the adapter exposes (`runner.ts:93`); incremental sync hardcodes `adapter.objects[0]` (`runner.ts:229`) — for multi-object sources (Shopify, HubSpot, Stripe all expose 5-6 objects), incremental can only ever sync whichever object the SDK lists first, silently ignoring user intent. This is the single most important functional gap versus your desired flow builder.

## 7. Worker Flow

`startWorkers(concurrency=3)` (`worker.ts:181`), 3 independent poll loops in the same process, 2s poll interval, type-agnostic claiming from a `type → handler` registry. Handlers: `sync_flow` (real), `rollup` (real, but feeds the now-disabled billing no-op), `warehouse_audit` (real, never enqueued), `schema_check` (explicit stub, never enqueued). Started at server boot via `instrumentation.ts`, stored on `globalThis` for hot-reload idempotency. Works correctly for a single long-lived Node process; has no leader election, so horizontal scaling means N redundant schedulers/worker-pools (see §30).

## 8. Queue Flow

Real, DB-backed (`jobs` table, `db.ts:108-126`), not in-memory. Claim uses an `IMMEDIATE` SQLite transaction — genuinely race-free against concurrent claimants. Retry backoff: `min(30_000 * 2^attempts, 30min)`, effectively 1min/2min/4min/8min then capped, 5 max attempts before `status='dead'`. Dead-letter is a real DB state with a working requeue API (`POST /api/jobs {action:"retry"}`) — but **nothing in the UI calls it** (scheduler/sync-jobs pages are dead redirect stubs). One real bug: `completeJob`/`failJob` write by `id` alone with no `status='running'` guard, and the 10-minute stale-job reaper can reclaim a job that's merely slow (e.g., a big BigQuery load), producing a genuine duplicate-execution race (§28).

## 9. Connector Flow

Real `ConnectorAdapter`/`ConnectorSDK` interface (`lib/connectors/sdk.ts`). Per-source status against your required list:

| Source | Status |
|---|---|
| PostgreSQL | Real, but caps at 50,000 rows on full refresh with no pagination beyond page 1 (`hasMore` flag is computed and ignored) |
| Shopify | Real auth/schema; pagination is **broken** — cursor hardcoded to `undefined`, silently truncates every store to 250 records |
| HubSpot | Real, correct cursor pagination |
| Stripe | Real, correct cursor pagination |
| Instantly | Real, correct pagination |
| Google Sheets | Code is real but **will throw on every call** — depends on `google-auth-library`, which is not in `package.json`, despite being marked `"production"` in the registry |
| CSV | Works via a separate client-parsed import path (`/api/bigquery/csv-import`), capped at 5,000 rows client-side; the adapter's own `extract()` throws unconditionally |
| Excel | **Missing** — no adapter, no UI path |
| REST API (generic) | **Missing** — no generic adapter exists |
| MySQL | **Missing** — registry lists it `"beta"`/`"coming_soon"`, no adapter file |
| SQL Server | **Missing** — no trace anywhere |
| MongoDB | **Missing** — no trace anywhere |
| BigQuery as source | **Missing** — registry lists `"coming_soon"`, no adapter file |

No retry/backoff logic exists anywhere in any adapter or in `etl.ts`/`warehouse-monitor.ts` — a single transient 429/5xx fails the entire sync.

## 10. BigQuery Flow

Real throughout. `etl.ts` hits the actual `@google-cloud/bigquery` SDK for dataset-ensure, staging-table load jobs, and `MERGE`-based incremental upserts. `warehouse-monitor.ts` does live `getTables()`/`getMetadata()`, `INFORMATION_SCHEMA` fallback, and real Jobs-API cost estimation (`bytesProcessed × USD_PER_TB`), with a 30s TTL cache. No fake stats found here — this layer matches your "everything fetched live" requirement already.

## 11. SQL Runner Flow

Real execution against BigQuery, with a labeled `demo:true` degraded response only when no BigQuery credential exists at all (not a silent fake). Blocks DDL/DML by keyword filter. Saved queries and history persist to real tables and are wired into the UI. Gaps versus your spec: no real autocomplete (a static list of canned template snippets, not schema-aware completion), plain `<textarea>` editor rather than a code editor (no syntax highlighting).

## 12. Database Schema

Single SQLite file, WAL mode on. ~20-25 tables: `users, sessions, credentials, flows, runs, workspaces, jobs, sync_state, audit_log, usage_events, api_keys, password_resets, catalog_tables, catalog_columns, lineage_events, saved_queries, query_history, webhooks, environments, secrets, automations, workspace_members, models, model_runs, dashboards, widgets, bi_insights`. Nearly all tenant tables carry `workspace_id TEXT NOT NULL DEFAULT 'default'`. **`PRAGMA foreign_keys` is never set** — the one declared FK (`catalog_columns → catalog_tables ON DELETE CASCADE`) is unenforced; all cascades are done manually in application code. Migrations are additive/idempotent (`CREATE TABLE IF NOT EXISTS` + `addColumnIfMissing`), no version tracking, no rollback path — safe to re-run, not a real migration system.

## 13. API Map

78 route files. Real, DB-backed groups: `auth/*`, `flows/*`, `sync/*`, `query/*`, `dashboard/*`, `warehouse/*`, `credentials`, `bigquery/*`, `workspaces`, `admin/*`. A second tier is real and DB-backed but **orphaned — zero call sites anywhere in the frontend**: `/api/catalog`, `/api/lineage`, `/api/observability`, `/api/automation`, `/api/environments`, `/api/audit`, `/api/keys`, `/api/jobs`, `/api/dashboards`, `/api/models`, `/api/bi/insights`, `/api/connectors/catalog`, `/api/connectors/health`, `/api/sdk/openapi.json`. A third, small tier is genuine debug/dead scaffolding: `/api/bi/alerts/dispatch` (returns a hardcoded 404 "BI features removed"), `/api/instantly/test-analytics`, `/api/instantly/test-v1` (fan out to 5 hardcoded Instantly URLs), `/api/debug/warehouse`, `/api/dashboard/query`, `/api/models/preview`.

## 14. UI Map

The sidebar (`src/components/layout/sidebar.tsx`) links exactly 4 routes plus Settings: **Dashboard, Flows, Warehouse, Query**. Of the ~40 folders under `app/(dashboard)/`, roughly 30 are byte-identical 2-line stubs (`redirect("/dashboard")`) — a leftover shell from a nav consolidation the code itself documents (`routes.ts` comment: "Removed as top-level nav items..."). A handful of orphaned-but-fully-built pages still exist behind dead links or direct URL entry: `pipelines` (a complete duplicate of Flows, backed by mock data), `settings/roles`, `settings/api-keys` (duplicates the API-key UI already inside `settings/page.tsx`), `sync-jobs/[id]` (reads a hardcoded-empty mock array, always shows "Job not found").

## 15. Component Hierarchy

Live tree: `layout.tsx` → `sidebar`, `topbar`, `user-profile-dropdown` → page content → `flow-wizard-modal` / `pipeline-builder` (real), `engine/auto-dashboard.tsx` (the one real chart renderer, used in `flows/[id]`). Dead subtrees with zero importers: all 10 files in `components/dashboard/` (a full dashboard-v1 widget set), 6 of 9 files in `components/layout/` (`demo-banner`, `global-search`, `impersonation-banner`, `notification-center`, `page-transition`, `workspace-selector`), `components/copilot/`, `components/onboarding/`, `components/connectors/{connect-modal,connector-card}`, `components/charts/chart-engine.tsx`. Three separate charting approaches exist (`charts/chart-engine`, `dashboard/charts/*`, `engine/auto-dashboard`) — only the third is used.

## 16. Performance Bottlenecks

- `etl.ts` and the CSV-import route buffer entire row sets in memory, `JSON.stringify`, then `fs.writeFileSync` synchronously before loading to BigQuery — no streaming, unbounded memory for large syncs.
- PostgreSQL adapter loads up to 50,000 rows in a single unpaginated query.
- `warehouse-monitor.ts` caches BigQuery calls for 30s (good) but nothing else in the app has any caching layer.
- No virtualization found on any list/table view despite `components/ui/virtual-list.tsx` existing — it's defined but not used anywhere audited.

## 17. Security Issues

Ranked by severity:

1. **Cross-tenant credential leak (critical).** `lib/server/bq-creds.ts:49-54` — when a workspace has no BigQuery credential configured, it falls back to `SELECT data FROM credentials WHERE service='bigquery' LIMIT 1` with **no workspace/user filter at all**. Any workspace without its own credential silently inherits whichever tenant's BigQuery credential happens to be first in the table. This breaks multi-tenant isolation outright.
2. **Cross-tenant flow IDOR (high).** `api/flows/route.ts` POST does `INSERT ... ON CONFLICT(id) DO UPDATE` without verifying the caller owns the existing flow `id` — any authenticated user who supplies another workspace's flow id can rewrite its destination table/dataset/schedule. The route's own GET/DELETE handlers scope by workspace inconsistently with this POST.
3. **RBAC is entirely unenforced (high).** `permissions.ts:requirePermission()` unconditionally returns "allowed." It's called from exactly one route. `ARCHITECTURE.md`'s claim that RBAC is enforced is aspirational.
4. **Hardcoded admin-impersonation backdoor email (medium).** `admin/users/[id]/impersonate/route.ts` defaults `ADMIN_EMAIL` to a different, personal-looking address than every other admin route's default — inconsistent and a latent risk if the env var is ever unset.
5. **Broken password reset (functional, not exploitable).** `reset-password/route.ts` writes to a column (`password_hash`) that doesn't exist in the schema (actual column: `pass_hash`) — every reset attempt throws. Currently fails closed, but it means there is no working self-service password recovery today.
6. **Broken API key creation (functional).** `api/keys/route.ts` inserts into a column (`encrypted_key`) that doesn't exist in the `api_keys` table (only `key_hash` exists) — `POST /api/keys` throws on every call.
7. **Rate limiting covers 6 of ~58 mutating routes.** Real token-bucket implementation, just narrowly applied (login, register, credential POST, sync run/incremental, warehouse monitor).
8. **Audit logging covers 13 of ~58 route files.** Real and functional where wired, not comprehensive.
9. **Billing/usage enforcement is fully disabled** (`billing.ts` is a no-op stub) despite `ARCHITECTURE.md` claiming it's active — not a security bug per se, but means there is currently no usage-limit enforcement of any kind.

No SQL injection found — all queries audited use parameterized `?` placeholders or fixed developer-controlled identifiers.

## 18. Production Risks

In priority order: (1) the cross-tenant credential leak (§17.1) — must fix before any real multi-tenant deployment; (2) no retry/backoff anywhere in the sync path — a transient network blip fails an entire flow run; (3) Shopify/PostgreSQL pagination gaps silently under-sync data with no error surfaced to the user — data-correctness risk, not just a crash; (4) Google Sheets connector is unusable in its current state (missing dependency); (5) the scheduler has no leader election, so any horizontally-scaled deployment produces redundant scheduling; (6) unbounded in-memory row buffering will OOM on large source tables; (7) two functionally broken endpoints (password reset, API key creation) block real user self-service.

## 19. Dead Code

~26 fully orphaned files (zero importers anywhere in `src/`): all of `components/dashboard/*` (10 files), 6 of 9 `components/layout/*` files, `components/copilot/ai-copilot.tsx`, `components/onboarding/*` (2 files), `components/connectors/{connect-modal,connector-card}.tsx`, `components/charts/chart-engine.tsx`, `stores/{connectors,onboarding}.store.ts`, `services/{csv,instantly,sync,validation}.service.ts`, `hooks/use-bi-data.ts`. Plus ~30 route folders that are pure 2-line redirect stubs, and ~13 real backend API routes with zero frontend callers (§13).

## 20. Duplicate Code

`api/bigquery/csv-import/route.ts` reimplements `sanitizeRows`/`inferType` almost verbatim instead of importing from `etl.ts`. Three competing charting components (§15). `pipelines` duplicates `flows` as a whole feature (mock-backed, not wired to nav). `settings/api-keys` duplicates the API-key management UI already inside `settings/page.tsx`. `sync-jobs`, `logs`, `activity` were three separate legacy views of the same run-history concept, now all stubbed identically.

## 21-24. Fake / Demo / Mock / Placeholder Implementations

Concentrated almost entirely in the orphaned-page set, and cleanly correlated with it — the mock data isn't accidental leftover scattered through live code, it's the fallback data for pages that were already deliberately disconnected from navigation. Sources: `lib/mock-data.ts`, `lib/enterprise-data.ts`, `lib/monitoring-data.ts`, `lib/pipeline-types.ts`, `lib/flows-data.ts`. Consumers: `pipelines/*`, `settings/roles`, `settings/api-keys`, `sync-jobs/[id]`. The 6 live, navigable pages (dashboard, flows, warehouse, query, import, settings-core) are clean of mock data. One dead-labeled endpoint: `/api/bi/alerts/dispatch` returns a hardcoded `{error:"BI features removed"}, 404`.

## 25. Unused Dependencies

`google-auth-library` is used by code (`google-sheets.ts`) but **missing** from `package.json` — the inverse problem, a missing dependency causing a runtime crash, not an unused one. A full unused-dependency sweep (comparing every `package.json` entry against actual imports) was not completed in this pass — flagged for Phase 1 verification with `depcheck` or equivalent before any deletion.

## 26. Broken Architecture

The core layered design (Connector → ETL → Warehouse → SQL/BI) is sound and mostly matches its own documentation. The break is at the frontend/backend boundary: a real, working backend (jobs, observability, catalog, automation, models, dashboards+widgets BI builder) was built out, then the frontend was deliberately trimmed to 4 nav items without removing the now-orphaned backend routes or the now-orphaned mock-backed pages behind them. The repo currently has two architectures layered on top of each other: the live one (4 pages) and the shelved one (everything else).

## 27. Things That Will Fail in Production Today

Password reset (throws on every call), API key creation (throws on every call), Shopify sync on any store with >250 records of any object (silently truncates), any PostgreSQL table >50,000 rows on full refresh (silently truncates), Google Sheets connector (throws immediately, missing dependency), any workspace without its own BigQuery credential in a multi-tenant deployment (silently uses another tenant's).

## 28. Race Conditions

`completeJob`/`failJob` (`jobs.ts`) write by `id` with no `status='running'` guard; combined with `reapStaleJobs`'s 10-minute unconditional reclaim, a slow-but-alive job (e.g., a large BigQuery load) can be reclaimed and rerun by a second worker while the first worker is still executing — both later write to the same row, producing duplicate execution and a lost-update. Job claiming itself (the SELECT-then-UPDATE inside an `IMMEDIATE` transaction) is correctly race-free.

## 29. Memory Leaks

No unbounded in-memory queues found (the job queue is fully DB-backed). `stopWorkers()` flips a running flag but never calls `clearInterval` on the scheduler tick or the reaper interval — harmless in a long-lived single process, but means there's no clean shutdown path, which matters once you run this under a process manager that expects graceful stop/restart.

## 30. Long-Term Scaling Issues

No leader election for the scheduler — every additional instance in a horizontally-scaled deployment runs its own full scheduler + 3-worker pool against the same SQLite file, which itself only works if every instance shares one disk/volume (breaks across separate machines/containers without a shared filesystem). SQLite as the system-of-record is fine at your current scale and matches your explicit instruction to keep it, but the in-process job runner is the ceiling — moving past single-instance deployment will eventually require either a proper queue (even something as simple as `SELECT ... FOR UPDATE SKIP LOCKED` semantics via a networked DB, or a leader-elected scheduler) rather than N independent timers.

---

## Recommended Phased Refactor (pending your sign-off on order/scope)

**Phase 1 — Critical fixes (small, high-value, low-risk):** cross-tenant credential leak, flow IDOR, password reset column bug, API key creation column bug, job completion race guard, Shopify pagination, Google Sheets missing dependency, PostgreSQL pagination cap.

**Phase 2 — Scope reduction (matches your explicit "keep only" list):** delete the orphaned frontend (dead components/stores/services, redirect-stub route folders) and the backend routes/tables that don't map to Authentication, Users, Workspaces, Credentials, Flows, Connectors, Jobs, Runs, Warehouse, Query Studio, Settings, Profile, Scheduler, Workers — i.e., catalog, lineage, observability, automation, environments, models, dashboards+widgets BI builder, AI-ops, BI layer, analytics, billing (already a no-op — remove per your own "billing placeholder ONLY if backend exists" rule), team, webhooks, developer, docs, help, notifications, logs, activity, monitoring, intelligence, pipelines (duplicate of flows), admin (unless you want it kept — it's real and working, just not on your keep list).

**Phase 3 — Wire the real backend that's currently orphaned but matches the keep list:** scheduler/sync-jobs UI (the API already works — `GET /api/jobs`, `POST /api/jobs {action:"retry"}` — it just has no screen), dead-letter requeue UI.

**Phase 4 — Connector framework completion:** flow-wizard object-selection/preview/column-mapping steps, fix incremental sync's hardcoded-first-object bug, retry/backoff for all adapters, build MySQL/SQL Server/MongoDB/Excel/generic-REST adapters.

**Phase 5 — Rebrand:** CrossTecch → DataNexa across UI copy, package.json, metadata, `.crosstecch/` → `.datanexa/` (needs a data-migration path for existing installs, not just a rename).

**Phase 6 — UI polish pass:** consolidate the 3 charting approaches into 1, centralize the ad-hoc status-color usage into design tokens, replace the SQL Studio textarea with a real code editor, add schema-aware autocomplete.
