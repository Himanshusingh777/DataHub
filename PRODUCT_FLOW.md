# DataNexa (CrossTecch) — Product & Technical Flow

**Status as of:** 2026-07-25, after Phase 8 (commit `31b4c73`).
**Purpose:** This is the single reference document for how the product works today — architecture, every phase of the refactor, the full customer journey, module-by-module status, and what's still incomplete. It reflects the codebase as it actually is, not the aspiration. Where something is stubbed, fake, or missing, this document says so explicitly.

> The product is still branded "CrossTecch" throughout the code, UI copy, DB filename (`.crosstecch/crosstecch.db`), and package name. The "DataNexa" rebrand (Phase 11 in the original roadmap) has **not** happened yet — every "DataNexa" reference in this document is the target name, not what a user currently sees on screen.

---

## 1. Architecture Diagram

### 1.1 Layer stack (data flow, top to bottom)

```
 Connector Layer   →  Extraction   →  Transformation  →  Warehouse (BigQuery)
        │                                                    │
        │                                                    ▼
        │                                          Semantic Engine
        │                                                    │
        │                                                    ▼
        │                                             KPI Engine
        │                                                    │
        │                                                    ▼
        │                                        Dashboard Engine
        │                                                    │
        │                                  ┌─────────────────┼─────────────────┐
        │                                  ▼                 ▼                 ▼
        │                         Insight Engine   Recommendation Engine    Copilot
        │                                  │                 │                 │
        └──────────────────────────────────┴─────────────────┴─────────────────┘
                                             ▼
                                          Frontend
```

Cross-cutting concerns that every layer above can use, but which never depend back on the vertical stack: **Background Job Engine, Multi-Workspace, Security (crypto/audit/RBAC/rate-limit), Auth, Billing (architecture-only), Performance (caching)**.

### 1.2 Request-path stack (how one HTTP request actually moves)

```
Browser (React 19 / Next.js 15 App Router)
   │  fetch()
   ▼
API Routes            src/app/api/**/route.ts        (~80 files, the entire "backend")
   │
   ▼
Services / lib layer   src/lib/server/*.ts, src/lib/engine/*.ts, src/lib/connectors/*
   │  (auth, workspace, crypto, permissions, jobs, etl, connectors, sql-lineage, automation…)
   ▼
Database               better-sqlite3, single file .crosstecch/crosstecch.db (WAL mode)
   │
   ├─▶ Background Job Engine (same Node process)
   │     scheduler.ts (60s tick, finds due flows/automations)
   │        → enqueues into jobs table
   │     worker.ts (3 poll loops, 2s interval, claims via IMMEDIATE transaction)
   │        → runner.ts (sync_flow) / automation.ts (fire_automation) / warehouse-monitor.ts (rollup)
   │
   ▼
Warehouse               @google-cloud/bigquery SDK — real network calls, no mocking layer
   │
   ▼
Observability / Dashboard Engine / AI-Ops
   read the same SQLite tables (runs, jobs, catalog_tables, models, widgets…) back out to the UI
```

**There is no separate backend service.** Next.js API routes are the entire server. Background jobs run in-process, started once at boot from `src/instrumentation.ts`. There is no Redis, no message broker, no second deployable — this is a single Node process end to end. That's a deliberate, documented choice (see `ARCHITECTURE.md`), not an oversight, and it's the right shape for the current stage — but it is the ceiling on horizontal scaling (see §6, Dependency Map).

---

## 2. Phase-by-Phase History

The refactor started from a full architecture audit (`DATANEXA_AUDIT_REPORT.md`, baseline commit `b35dc8b`) that found: a solid backend, a frontend that exposed only ~15% of it (sidebar linked 4 routes; ~30 page folders were 2-line redirect stubs), and a layer of dead/mock code left over from an earlier nav consolidation. Every phase below is a real commit on `master`.

### Baseline — `b35dc8b` "Baseline snapshot before DataNexa refactor"
Safety checkpoint before any changes. Full initial repo state committed to git for the first time.

### Audit — `ef6d0f8` "Add full architecture audit report"
Added `DATANEXA_AUDIT_REPORT.md` — the 30-point audit that drove every subsequent phase. See §7 below for what it found that's now fixed vs. still true.

### Phase 1 — `3985107` "Critical security fixes, correctness bugs, and a working build"
**Goal:** Make the app secure and buildable before touching features.
**Security fixed:**
- Cross-tenant BigQuery credential leak (`bq-creds.ts` fell back to "any credential in the table, no workspace filter" when a workspace had none of its own — any tenant without a credential silently inherited another tenant's)
- Flow IDOR (`POST /api/flows` upserted by id without verifying ownership — any authenticated user could overwrite another workspace's flow)
- Removed the impersonation feature entirely (inconsistent hardcoded admin-email fallback, unreachable from any UI anyway)

**Correctness fixed:**
- Password reset (wrote to nonexistent column `password_hash`, real column is `pass_hash` — every reset attempt threw)
- API key creation (wrote to nonexistent column `encrypted_key`, real column is `key_hash` — every creation attempt threw; now SHA-256 hashed)
- Job completion race (`completeJob`/`failJob` now guard on `status='running' AND locked_by=<worker>`, closing a duplicate-execution window against the stale-job reaper)
- Shopify pagination (cursor was hardcoded `undefined` — silently capped every sync at 250 records)
- Google Sheets connector (`google-auth-library` was used in code but missing from `package.json` — every call threw)
- PostgreSQL pagination (silently dropped everything past 50,000 rows on full refresh — now paginates until exhausted)
- A real `.map()`-on-object runtime bug in the flow detail page's warehouse tab

**Build/infra:** added missing ESLint config (`next lint` had never actually run in this repo before), fixed 9 routes still on the pre-Next-15 synchronous `params` signature, fixed pre-existing TypeScript errors, removed 15 confirmed-dead files (ai-copilot, the entire dashboard-v1 component set, 5 unused layout components).
**Result:** `type-check` 113 → 0 errors. `build`: failing → succeeds. `lint`: 124 → 93 pre-existing errors (first time it had ever run).
**DB changes:** none (this phase was fixes, not schema).
**Remaining work after this phase:** RBAC still unenforced, admin panel still a stub, scope-reduction (Phase 2) not yet done.

### Phase 2 (batch 1) — `c5dcdfa` "Remove deprecated/orphaned route folders"
**Goal:** Delete confirmed-dead code without touching anything real or load-bearing.
**Rule applied:** never delete solely for "zero importers" — every candidate individually opened and verified as a 2-line redirect stub, a self-documented removed stub, or a fully mock-backed duplicate feature.
**Deleted:** `connections/`, `destinations/`, `pipelines/` (a complete mock-backed duplicate of Flows — 6 fabricated company examples, zero backend), `sync-jobs/`, `logs/`, `profile/`, `billing/`, `team/`, `webhooks/` route folders (all redirect stubs or absent from the app's own documented IA in `routes.ts`), plus `pipeline-builder.tsx` and `lib/pipeline-types.ts` (mock data feeding the deleted Pipelines feature).
**Explicitly preserved despite looking dead:** `connector-card.tsx` (turned out to be a live import of the real flow wizard — the clearest justification for the "never delete on zero-importers alone" rule), `chart-engine.tsx` (real 35-chart-type engine, later used in Phase 8), `services/csv.service.ts` (real CSV parsing logic), `lib/enterprise-data.ts`'s RBAC permission taxonomy, all 14 route folders documented in `routes.ts` as real-but-not-yet-built features (admin, ai-ops, automation, catalog, lineage, observability, dashboards, models, environments, etc.).

### Phase 2 (batch 2) — `ce315d2` "Remove confirmed-dead stubs, empty services, debug routes"
**Deleted:** self-documented "Removed" stub components (onboarding gate/wizard, connect-modal), 3 literally-empty service files, `lib/mock-data.ts` (fully cleared, zero remaining references), debug/unauthenticated Instantly test routes that fanned out to hardcoded URLs with API keys in query strings, the dead `/api/bi/alerts/dispatch` 404 stub, 2 stray test-upload CSV files in the repo root.
**Net Phase 2 result:** ~2,000 lines of dead/mock/duplicate code removed, zero production backend modules touched. Full report in `PHASE2_DELETION_REPORT.md`.

### Phase 3 — `10555ea` "Build a real Observability page on the already-real backend"
**Goal:** Replace the `/observability` redirect stub with a real page.
**Built:** UI consuming `GET /api/observability` (7-day KPIs, queue counts, connector health, warehouse status, recent runs) and `GET/POST /api/jobs` (dead-letter list + retry action) — both fully working, DB-backed endpoints that had zero UI callers before this.
**Bug found & fixed (only surfaced by live browser testing, not type-check):** `GET /api/observability` threw `SqliteError: ambiguous column name: status` on every single request — its 7-day stats query joins `runs` and `flows` (both have a `status` column) and referenced the bare name. Fixed by qualifying as `r.status`. **This endpoint was real code that had never once worked**, because nothing had ever called it.
**APIs:** no new routes, fixed the existing one. **DB:** no schema change. **Nav:** added Observability to sidebar.

### Phase 4 — `b5f829e` "Build a real Catalog page, fixing a backend bug that made every discovery run fail silently"
**Goal:** Replace the `/catalog` redirect stub with a real page.
**Bug found via direct DB script (empirical, not just code reading):** `catalog_tables` inserts had **never once succeeded**. The table predates multi-connector support and still had `project_id`/`dataset`/`discovered_at` as `NOT NULL` with no default, none of which the refresh route supplied — every discovery run silently failed its insert. Separately, the code relied on `lastInsertRowid`, which only works for `INTEGER PRIMARY KEY` tables — but `catalog_tables.id` is `TEXT PRIMARY KEY`, so even if the insert had succeeded, the id linkage to `catalog_columns` would have been broken (every table would show zero columns).
**Fixed:** proper `genId()`-based id generation, all `NOT NULL` columns supplied explicitly.
**Second bug found via live testing:** debounced search had no request-sequencing guard — a slower in-flight request could resolve after a newer one and overwrite correct results with stale data. Fixed with a request-sequence guard.
**Built:** search + connector-filter + expandable column detail, `POST /api/catalog/refresh`, `/api/connectors/catalog` for badge metadata. **Known gap left in place:** `freshness_hours` is written as a hardcoded `0` by the discovery route; the page computes real freshness client-side from `lastSyncedAt` instead of trusting that field.

### Phase 5 — `26072a9` "Build a real Automation engine — triggers, actions, and a UI, not just CRUD scaffolding"
**Goal:** Make `automations` rows actually do something; previously `trigger_meta`/`action_meta` were silently dropped on create and nothing ever evaluated a rule.
**Built:** `lib/server/automation.ts` — `fireAutomations()` evaluates rules inline from the sync worker for `pre_sync`/`post_sync`/`on_failure` (best-effort, a failing automation can never break a real sync); `fireScheduledAutomation()` handles `schedule`-triggered rules via a new `fire_automation` job type on the existing scheduler/queue, giving schedule automations the same retry/backoff/dead-letter durability flows already have.
**Three real actions:** webhook (HMAC-SHA256-signed, reuses the real `webhooks` table), email (extracted from the pre-existing real Resend integration used by forgot-password — not a new fake channel), retry (re-enqueues the failed flow). `transform` is a legacy action type from the table's original schema with no execution engine anywhere — deliberately left unexposed rather than faked.
**Two bugs found via live testing:** (1) the webhook-target `<select>` initialized from a `useState` default that only reflected the list at first mount — creating a webhook and immediately using it in a new rule silently failed with no visible error; fixed with a resync `useEffect`. (2) `fireScheduledAutomation` never re-threw after logging a failure, so the job queue always saw "success" even when the action failed, defeating the entire point of routing through the queue for retry durability — fixed by re-throwing on the job-based path only (the inline sync-hook path still swallows, correctly).
**DB changes:** `next_run_at`, `last_fired_at`, `last_status` added to `automations` (additive).
**Verified cross-feature integration:** a forced-due schedule rule was watched failing against an unreachable endpoint, retrying with real exponential backoff through all 5 attempts, dead-lettering, and then appearing correctly in Observability's dead-letter list with a working Retry button.

### Phase 6 — `9635e40` "Build a real Lineage graph, replacing hardcoded fake nodes with SQL-based analysis"
**Goal:** The old `/api/lineage` was real in the sense that it read actual flows, but unconditionally attached every warehouse table to hardcoded "Analytics" and "AI Operations" nodes — a relationship that was never true for any specific table, since neither feature existed. Its own comment also claimed a "demo graph when empty" fallback that didn't exist anywhere.
**Built:** `lib/server/sql-lineage.ts` — regex-based `FROM`/`JOIN` table-reference extraction (explicitly not a full SQL parser — no AST dependency in this project), matched against real warehouse table names including qualified `project.dataset.table` forms. Rebuilt the route to only draw edges backed by something real: Connector → Flow → BigQuery table, plus a new Table → Saved Query edge from actually parsing saved-query SQL. Each flow is now its own graph node instead of collapsing into one shared fake "ETL Engine" node.
**UI:** force-directed graph via `echarts-for-react` (already a dependency) plus a plain-table fallback.
**Verified:** a real flow + a saved query referencing its output table correctly produced all 3 real edges; an unrelated saved query correctly produced zero edges (no false positives).

### Phase 7 — `41ab091` "Build a real Models page on top of the already-excellent backend"
**Goal:** The Models/model_runs backend (`GET/POST /api/models`, `GET/PUT/DELETE /api/models/[id]`, `POST /api/models/[id]/run`, `POST /api/models/preview`) was already the most complete, production-grade surface in the whole refactor — real SQL-safety validation, real workspace isolation, real BigQuery execution, real widget-usage delete protection. What was missing — versioning and dependency tracking — is now real.
**Built:** new `model_versions` table (additive) + `version` column on `models`. `PUT /api/models/[id]` snapshots the pre-update row whenever `sql_query` actually changes (not on metadata-only edits) and increments version. Dependencies computed by reusing `sql-lineage.ts` from Phase 6 verbatim rather than writing a second parser — and `/api/lineage` extended to draw Table → Model edges with the same matcher, so Models and Lineage genuinely compose.
**UI:** create, inline SQL editor, Run (real BigQuery, shows rows/duration/bytes), Save (version-snapshotting), version history with restore-into-editor, dependency badges, delete (respects widget-usage guard). `/models` didn't exist as a route at all before this phase (unlike prior phases which replaced stubs).
**Bug caught before it ever ran:** a parameter-order bug in the `PUT` handler — `version` and `schema_json` values were swapped against their SQL placeholder positions — caught by re-reading the diff, not by running it once and moving on.
**DB changes:** `model_versions` table, `models.version` column.

### Phase 8 — `31b4c73` "Build a real Dashboards/BI module on the already-real widgets backend"
**Goal:** Same pattern as Phase 7 — a strong backend (`dashboards`, `widgets` tables, full CRUD, real share-token mechanism) with no real frontend.
**Bug found:** `widgets/route.ts` (POST) and `widgets/[id]/route.ts` (PUT) validated `chart_type` against a hand-written list using entirely different names ("column", "grouped_bar", "kpi"...) than what `chart-engine.tsx` (the real 35-type renderer, rescued from deletion in Phase 2) actually knows how to draw. Every widget created via the API would have silently hit the "unsupported chart type" fallback. Fixed by importing `CHART_TYPE_SET` from `models-data.ts` as the single shared source of truth in both routes.
**Gap found and closed:** no public/unauthenticated endpoint existed to fetch a shared dashboard's live widget data — "sharing" only ever showed empty chart shells to anyone not logged in. Built `POST /api/dashboards/shared/[token]/widgets/[widgetId]/data` — resolves BigQuery credentials against the dashboard **owner's** workspace (no requesting user for a public link), never returns model SQL/workspace_id/user_id, accepts no caller-supplied filters (cost/abuse control), rate-limited per IP.
**Built:** `/dashboards` list, `/dashboards/[id]` builder (widget cards running live via `POST /api/widgets/[id]/data`, model picker with schema-aware field pickers, share panel), `/dashboards/shared/[token]` moved to a top-level route (outside the authenticated route group) so anonymous viewers don't inherit the sidebar/topbar chrome.
**Verified end-to-end:** real dashboard + widget created, correct "BigQuery credentials not configured" error surfaced (no fake data), share link generated and loaded in a separate unauthenticated tab with the same real error from the new public endpoint, link revoked and confirmed 404, all test data cleaned up.

### Not yet started (see §8, Pending Phases)
Phase 9 (AI Ops — needs an LLM-provider decision from you), Phase 10 (connector framework completion), Phase 11 (rebrand), Phase 12 (UI polish). Also **not on any numbered phase yet but flagged repeatedly by the audit and still true today:** Admin panel frontend, server-side RBAC enforcement, "Invite Team" flow. See §7.

---

## 3. Complete Customer Journey

This is the real, current path a brand-new user can walk today, with the actual screen, the actual API calls, the actual DB tables touched, and which backend service is responsible. Steps marked **⚠ gap** don't actually exist yet even though they're implied by a complete product.

```
Landing Page (/)
  ↓
Register (/register)                    POST /api/auth/register
  ↓                                       → users table (scrypt pass_hash)
                                          → session cookie issued immediately (no email verification step exists — ⚠ gap vs. your example flow)
  ↓
Auto-created default workspace           lib/server/workspace.ts on first access
  ↓                                       → workspaces, workspace_members tables
[⚠ gap] Invite Team                      No API route, no UI. workspace_members table exists
                                          and is written to (owner auto-added), but there is no
                                          invite endpoint, no invite-by-email UI, no accept-invite
                                          flow anywhere in the codebase today.
  ↓
Create API Key (/settings → API Keys)    POST /api/keys → api_keys table (SHA-256 hash, fixed in Phase 1)
  ↓
Connect BigQuery (destination)           /settings or /flows credential step
                                          POST /api/credentials → credentials table (AES-256-GCM via crypto.ts)
  ↓
Connect a source (Shopify/Postgres/etc.) Same credential flow, service-specific fields
  ↓
Create Flow (/flows → flow wizard)       flow-wizard-modal.tsx, 5 steps: source → auth → dataset → schedule → review
                                          POST /api/flows → flows table
                                          ⚠ gap: no object/table-selection, preview, or column-mapping
                                          step — full-refresh always pulls every object the adapter
                                          exposes; incremental sync hardcodes adapter.objects[0].
  ↓
Configure Sync (schedule/incremental)    flows.sync_mode, flows.schedule_value, flows.next_run_at
  ↓
Run Flow (manual) or wait for schedule   POST /api/sync/run  (manual)
  ↓                                       scheduler.ts 60s tick finds due flows (automatic)
  ↓
Job enqueued                              jobs table, type='sync_flow'
  ↓
Workers execute                          worker.ts (3 poll loops, 2s interval) claims job
  ↓                                       runner.ts: adapter.authenticate() → adapter.extract()
  ↓                                       etl.ts: sanitizeRows/inferSchema → loadToBigQuery(Incremental)
  ↓
Data reaches Warehouse                   Real BigQuery dataset/table, real load job
  ↓                                       runs table gets the result row (rows, duration, status)
  ↓                                       automation.ts fires any post_sync/on_failure rules (Phase 5)
  ↓
Catalog discovers metadata               POST /api/catalog/refresh (manual, from /catalog page)
  ↓                                       BigQuery INFORMATION_SCHEMA → catalog_tables, catalog_columns
                                          ⚠ not automatic — no job type triggers catalog refresh after
                                          a sync completes; the user must click Refresh themselves.
  ↓
Create Semantic Model (/models)          POST /api/models — SQL query over the warehouse table
  ↓                                       models table; sql-lineage.ts computes real dependencies
  ↓
Create Dashboard (/dashboards)           POST /api/dashboards → dashboards table
  ↓
Add Widget                                POST /api/widgets — picks a Model, a chart type (35 real
  ↓                                       types via chart-engine.tsx), runs live against BigQuery
  ↓                                       via POST /api/widgets/[id]/data
  ↓
Share Dashboard                          POST /api/dashboards/[id]/share → share_token, is_published
  ↓                                       Public viewer: /dashboards/shared/[token], no auth, own
                                          layout, real live data via the Phase-8 public data endpoint
  ↓
Automation (/automation)                 Create rules: trigger (pre_sync/post_sync/on_failure/schedule)
  ↓                                       + action (webhook/email/retry) → automations table
  ↓
Observability (/observability)           GET /api/observability — 7d KPIs, queue depth, connector
  ↓                                       health, dead-letter jobs with a working Retry button
  ↓
Lineage (/lineage)                       GET /api/lineage — Connector→Flow→Table→Model→Query graph,
  ↓                                       all edges backed by real SQL parsing or real flow config
  ↓
AI Assistant / AI Ops (/ai-ops)          ⚠ gap: page is still a redirect stub. The backend
  ↓                                       (/api/ai-ops/{insights,recommendations,analyze}) is real
                                          in the sense that it queries real DB tables (dead jobs,
                                          error-rate flows, stale catalog tables) — but there is
                                          NO LLM integration anywhere in this codebase, and
                                          insights/route.ts's "queryOptimizations" array is 3
                                          hardcoded static suggestion strings, not derived from
                                          anything. This does not meet your "only if powered by
                                          real LLMs" rule yet — needs a provider decision (Phase 9).
  ↓
Admin (/admin)                           ⚠ gap: page is still a 2-line redirect stub. Backend is
  ↓                                       real (GET /api/admin/overview, GET/PUT /api/admin/users,
                                          POST .../reset-password) but has no screen. RBAC
                                          (lib/server/permissions.ts) is a hardcoded allow-all —
                                          "not yet implemented server-side" per its own comment.
  ↓
Logout                                   Session cookie cleared, sessions row deleted
```

### Screen-by-screen backend map (the parts that are real and reachable today)

| Screen | Route | Key APIs | DB tables | Worker/Service involved |
|---|---|---|---|---|
| Landing | `/` | — | — | — |
| Register/Login | `/register`, `/login` | `POST /api/auth/{register,login}` | `users`, `sessions` | `lib/server/auth.ts`, `crypto.ts` |
| Forgot/Reset password | `/forgot-password` | `POST /api/auth/{forgot,reset}-password` | `password_resets` | `lib/server/email.ts` (real Resend) |
| Dashboard (home) | `/dashboard` | `GET /api/dashboard/stats` | `flows`, `runs`, `jobs` | — |
| Flows | `/flows`, `/flows/[id]` | `GET/POST /api/flows`, `POST /api/sync/run`, `POST /api/sync/incremental` | `flows`, `runs`, `sync_state` | `runner.ts`, connector adapters, `etl.ts` |
| Warehouse | `/warehouse` | `GET /api/warehouse/{status,monitor,intelligence}` | — (live BigQuery reads) | `warehouse-monitor.ts` |
| Query Studio | `/query` | `POST /api/query/run`, `GET/POST /api/query/saved` | `saved_queries`, `query_history` | `bq-creds.ts` + direct BigQuery SDK |
| Models | `/models` | `GET/POST /api/models`, `PUT/DELETE /api/models/[id]`, `POST .../run` | `models`, `model_runs`, `model_versions` | `sql-lineage.ts` |
| Dashboards | `/dashboards`, `/dashboards/[id]` | `GET/POST /api/dashboards`, `POST/PUT/DELETE /api/widgets*` | `dashboards`, `widgets` | `chart-engine.tsx` (client-side render) |
| Shared dashboard (public) | `/dashboards/shared/[token]` | `GET /api/dashboards/shared/[token]`, `POST .../widgets/[id]/data` | `dashboards`, `widgets`, `models` | rate-limit.ts |
| Catalog | `/catalog` | `GET /api/catalog`, `POST /api/catalog/refresh` | `catalog_tables`, `catalog_columns` | live BigQuery `INFORMATION_SCHEMA` |
| Lineage | `/lineage` | `GET /api/lineage` | `flows`, `saved_queries`, `models`, `catalog_tables` (read-only, computed) | `sql-lineage.ts` |
| Automation | `/automation` | `GET/POST/DELETE /api/automation/rules`, `/api/automation/webhooks` | `automations`, `webhooks` | `automation.ts`, `scheduler.ts` |
| Observability | `/observability` | `GET /api/observability`, `GET/POST /api/jobs` | `jobs`, `runs`, `flows` | `worker.ts`, `scheduler.ts` |
| Settings | `/settings` | `GET/POST /api/credentials`, `GET/POST /api/keys`, `GET/POST /api/environments` | `credentials`, `api_keys`, `environments`, `secrets` | `crypto.ts` |
| **AI Ops** ⚠ | `/ai-ops` (stub) | `GET /api/ai-ops/{insights,recommendations}` real backend, no screen | `jobs`, `catalog_tables`, `runs` | none (no LLM) |
| **Admin** ⚠ | `/admin` (stub) | `GET /api/admin/overview`, `GET/PUT /api/admin/users` real backend, no screen | `users`, `workspace_members` | none |

---

## 4. Backend Architecture, Layer by Layer

1. **Frontend** — Next.js 15 App Router, React 19, `src/app/(dashboard)/**/page.tsx` + `src/components/**`. Client components (`"use client"`) fetch directly against this app's own API routes. No separate API client SDK, no GraphQL — plain `fetch()`.
2. **API Routes** — `src/app/api/**/route.ts`, ~80 files. This is the entire server. Each route: reads session via `getAuthContext(req)`, does its own DB access or delegates to a service, returns `NextResponse.json(...)`. No separate controller/router framework — Next.js file-based routing is it.
3. **Services / lib layer** — `src/lib/server/*` (auth, workspace, crypto, permissions, jobs, worker, scheduler, etl, incremental, warehouse-monitor, connectors, runner, billing, automation, sql-lineage, email, audit, rate-limit, secrets), `src/lib/engine/*` (semantic, kpi, viz, insights, recommend, quality, sql), `src/lib/connectors/*` (sdk, registry, adapters). This is where actual business logic lives — routes are thin.
4. **"Repositories"** — there is no repository/ORM layer. Every service calls `better-sqlite3` directly via `getDb().prepare(...)`. This is a deliberate simplicity choice for a single-SQLite-file system of record, not a missing layer.
5. **Database** — one file, `.crosstecch/crosstecch.db`, WAL mode. 28 tables (full list in §5). Migrations are additive/idempotent (`CREATE TABLE IF NOT EXISTS` + `addColumnIfMissing` via `PRAGMA table_info`) — safe to re-run, but there is no version tracking and no rollback path. `PRAGMA foreign_keys` is never set, so the one declared FK (`catalog_columns → catalog_tables ON DELETE CASCADE`) is unenforced; all cascades are manual in application code.
6. **Workers** — `lib/server/worker.ts`. `startWorkers(concurrency=3)`: 3 independent poll loops in the same process, 2-second interval, claim jobs by `type → handler` registry via a race-free `IMMEDIATE` SQLite transaction. Handlers: `sync_flow` (real), `fire_automation` (real, Phase 5), `rollup` (real, feeds the currently-disabled billing no-op), `warehouse_audit` (real, never enqueued by anything), `schema_check` (explicit stub, never enqueued).
7. **Scheduler** — `lib/server/scheduler.ts`. 60-second tick, finds flows/automations whose `next_run_at <= now`, enqueues a job, reschedules. Dedupe key prevents double-enqueue. No leader election — running 2+ instances of this app produces 2+ independent schedulers against the same DB file.
8. **Warehouse** — BigQuery only, via `@google-cloud/bigquery`. `etl.ts` handles loads/incremental MERGE, `warehouse-monitor.ts` handles live storage/cost/health reads (30s TTL cache), `lib/engine/sql.ts` is the dynamic SQL generator. This layer is genuinely real throughout — no fake stats found anywhere in it.
9. **Observability** — reads the same `jobs`/`runs`/`flows` tables the workers write, no separate telemetry pipeline. This is intentional (SQLite is already the source of truth) but means Observability has no data older than what's still in those tables — no retention/archival policy exists.
10. **Dashboard Engine** — two coexisting implementations: (a) `lib/engine/viz.ts` (`generateDashboard`, 13 auto-generated chart types from column semantics — used by `/dashboard` home page and Warehouse Intelligence), and (b) `chart-engine.tsx` (35 explicit chart types, user-configured, used by the Phase 8 Dashboards/BI builder). These are not unified — see §7 Medium-priority gaps.
11. **AI** — no real LLM integration exists in the codebase (verified: no OpenAI/Anthropic/`gpt-`/etc. references anywhere in `src/`). What exists today under "AI Ops" is a rules engine over real data (dead-job counts, error-rate thresholds, stale-table freshness) — genuinely useful, but not AI, and not what the `/ai-ops` page (still a stub) or your original spec calls for.

---

## 5. Database Schema — Full Table Inventory

All 28 tables, single SQLite file, WAL mode, `workspace_id` scoping on nearly every tenant table (`DEFAULT 'default'` for backward compatibility with pre-multi-tenant rows):

| Table | Purpose |
|---|---|
| `users` | Account records, scrypt `pass_hash`, `role`, `status` |
| `sessions` | 30-day session tokens, httpOnly cookie |
| `credentials` | AES-256-GCM encrypted per-service credentials (BigQuery, source connectors) |
| `flows` | Sync pipeline definitions: source, dest, schedule, sync_mode, warehouse_table |
| `runs` | One row per flow execution: status, rows, duration, error, logs |
| `workspaces` | Multi-tenant workspace records, `dataset_id` (BQ dataset per workspace) |
| `workspace_members` | User↔workspace role mapping (admin/editor/viewer) |
| `jobs` | Background job queue: type, payload, status, attempts, retry/backoff fields |
| `sync_state` | Per-flow incremental checkpoint/watermark |
| `audit_log` | Append-only sensitive-action trail |
| `usage_events` | Metered usage records (rows synced, api calls) — feeds the currently-disabled billing layer |
| `api_keys` | Hashed API keys for programmatic access |
| `password_resets` | 1-hour TTL reset tokens |
| `catalog_tables` / `catalog_columns` | Discovered warehouse metadata (Phase 4) |
| `lineage_events` | Declared source→target lineage edges (mostly superseded by Phase 6's computed-graph approach) |
| `saved_queries` / `query_history` | Query Studio persistence |
| `webhooks` | Automation webhook targets (HMAC secret, delivery status) |
| `automations` | Workflow rules: trigger type/meta, action type/meta, schedule tracking (Phase 5) |
| `environments` | Per-workspace dev/staging/prod tagging |
| `secrets` | Per-environment encrypted key-value vault |
| `models` | Semantic models: SQL query, schema, status, version (Phase 7) |
| `model_runs` | Model execution history |
| `model_versions` | SQL snapshot on every meaningful edit (Phase 7) |
| `dashboards` | Dashboard records, share_token, is_published (Phase 8) |
| `widgets` | Dashboard widgets: model_id, chart_type, config, position (Phase 8) |
| `bi_insights` | AI/statistical insight records — table exists, **currently unpopulated by anything** (no writer found in any route or worker) |

---

## 6. Dependency Map

```
users ──▶ sessions ──▶ every authenticated API route (getAuthContext)
users ──▶ workspaces ──▶ workspace_members ──▶ every workspace-scoped table

credentials ──▶ flows (source+dest auth)
flows ──▶ runs (execution history)
flows ──▶ sync_state (incremental checkpoint)
flows ──▶ jobs (type=sync_flow, via scheduler)

jobs ──▶ worker.ts ──▶ runner.ts ──▶ connector adapters (extraction)
                                 └─▶ etl.ts ──▶ BigQuery (load)
jobs ──▶ worker.ts ──▶ automation.ts (type=fire_automation)
jobs ──▶ worker.ts ──▶ warehouse-monitor.ts (type=rollup)

runs ──▶ automation.ts (post_sync / on_failure triggers)
automations ──▶ webhooks (action_type=webhook)
automations ──▶ email.ts (action_type=email)

BigQuery table (via flows.warehouse_table) ──▶ catalog_tables (manual refresh)
BigQuery table ──▶ models (sql_query references it) ──▶ sql-lineage.ts (dependency detection)
models ──▶ widgets ──▶ dashboards
models ──▶ model_runs, model_versions

flows + saved_queries + models ──▶ /api/lineage (computed graph, no dedicated write path)

jobs + runs + flows ──▶ /api/observability, /api/ai-ops/recommendations (read-only aggregation)
```

**What breaks if a module fails:**
- **`db.ts` (SQLite) down** → entire app down. Everything depends on it; it depends on nothing.
- **Scheduler stops** (e.g., process crash) → no new jobs enqueued automatically; manual "Run" still works via direct API calls, since that path doesn't go through the scheduler.
- **Workers stop** → jobs pile up in `queued` status forever; no data reaches the warehouse; UI still loads (it reads DB state, not live job status).
- **A single connector adapter breaks** (e.g., Shopify API changes) → only flows using that connector fail; isolated by the `type → handler` / adapter-registry pattern. No retry/backoff exists in any adapter today, so a single transient 429/5xx fails the entire sync run rather than being absorbed.
- **BigQuery credentials misconfigured for a workspace** → every downstream feature that depends on warehouse data (Catalog refresh, Models run, Dashboards widget data, Warehouse page) correctly surfaces a "not configured" error rather than showing fake data — this was explicitly verified in Phases 7 and 8.
- **`sql-lineage.ts` regex parser misses a table reference** → silently produces zero edges for that reference (no false positives, but false negatives are possible for SQL forms the regex doesn't recognize — e.g., dynamic SQL, subqueries with unusual aliasing).
- **`permissions.ts` (RBAC)** → currently a no-op; nothing "breaks" if it fails because nothing calls it meaningfully yet. This is itself the gap (see §7, Critical).

---

## 7. What's Still Incomplete

### Critical
1. **RBAC is entirely unenforced.** `lib/server/permissions.ts`'s `requirePermission()` unconditionally returns "allowed" — its own comment says "RBAC not yet implemented server-side." `workspace_members.role` is stored but never checked. Any authenticated member of a workspace can currently do anything any other member can, regardless of role.
2. **Admin panel has no frontend.** `/admin` is still a 2-line redirect stub despite real backend (`GET /api/admin/overview`, `GET/PUT /api/admin/users`, `POST .../reset-password`) — the exact "keep the admin panel but minimal" module you asked for in the original scoping conversation has not been built yet.
3. **No "Invite Team" flow exists.** No API route, no UI, anywhere. `workspace_members` is written to (the owner is auto-added on workspace creation) but there is no way for an owner to invite a second person into a workspace today.

### High
4. **AI Ops has no LLM.** The `/ai-ops` page is a redirect stub; the backend is real-data-driven (dead jobs, error-rate flows, stale tables — genuinely useful rule-based recommendations) but contains at least one hardcoded fake array (`insights/route.ts`'s `queryOptimizations`, 3 static suggestion strings not derived from anything) and has zero LLM/AI integration anywhere in the codebase. Needs your decision on a provider before this can become real per your explicit "only if powered by real LLMs" rule.
5. **Connector framework gaps** (all from the original audit, none touched in Phases 1–8 since they weren't the focus): no retry/backoff logic in any adapter — a single transient network error fails an entire sync; flow wizard has no object-selection/preview/column-mapping step, so full-refresh always pulls every object an adapter exposes and incremental sync hardcodes `adapter.objects[0]` (multi-object sources like Shopify/HubSpot/Stripe can only incrementally sync whichever object happens to be listed first); Excel, generic REST API, MySQL, SQL Server, MongoDB, and BigQuery-as-a-source connectors don't exist (MySQL is listed "beta" in the connector catalog but has no adapter file backing it).
6. **No email verification step at registration** — an account is fully usable immediately after `POST /api/auth/register`, with no confirm-your-email gate.
7. **Catalog refresh is fully manual.** Nothing automatically re-discovers metadata after a sync completes; the user must click "Refresh" on the Catalog page themselves.

### Medium
8. **Two separate, unreconciled dashboard/chart engines**: `lib/engine/viz.ts` (13 auto-generated chart types, used by the `/dashboard` home page) and `chart-engine.tsx` (35 user-configured chart types, used by the Phase 8 Dashboards/BI builder). They don't share config format or code.
9. **Query Studio is a plain `<textarea>`** — no syntax highlighting, no real schema-aware autocomplete (a static list of canned template snippets today).
10. **`bi_insights` table exists but nothing writes to it.** No route, worker, or job produces a row in it — it's schema without a producer.
11. **No graceful shutdown path.** `stopWorkers()` flips a running flag but never calls `clearInterval` on the scheduler tick or stale-job reaper — harmless in a long-lived dev process, but relevant under a real process manager expecting clean stop/restart.
12. **No leader election for the scheduler** — running more than one instance of this app produces N independent schedulers and worker pools against the same SQLite file. Fine at current scale (matches the explicit decision to keep SQLite), but it is the ceiling on horizontal scaling.
13. **Billing is architecture-only.** `usage_events` are real and written on every sync; `billing.ts`'s actual provider integration is a no-op stub (no Stripe SDK installed). No usage-limit enforcement exists today despite the plumbing being present.

### Low
14. Settings page still has some unreachable tabs with inline mock arrays left over from before Phase 2 (deliberately deferred, not touched, since a proper admin/settings rebuild is still pending — see Critical #2).
15. Root `eslint` baseline currently sits at 80 pre-existing errors, held flat (not reduced) through every phase — a real backlog, not a regression, but worth a dedicated cleanup pass eventually.
16. Rebrand (CrossTecch → DataNexa) hasn't started — cosmetic, but affects every screen a user sees.

---

## 8. Completed vs. Pending Phases

**Completed:** Baseline, Audit, Phase 1 (critical fixes), Phase 2 (dead-code removal, 2 batches), Phase 3 (Observability), Phase 4 (Catalog), Phase 5 (Automation), Phase 6 (Lineage), Phase 7 (Models), Phase 8 (Dashboards/BI).

**Pending, in the order they were previously agreed:**
- **Phase 9 — AI Ops.** Blocked on a decision from you: which LLM provider, and an API key. Until then, per your own rule, the honest options are (a) leave `/ai-ops` as a stub, or (b) ship the current rule-based recommendations under a name that doesn't claim "AI" and remove the hardcoded `queryOptimizations` array — I'd recommend confirming which with you before touching this module.
- **Phase 10 — Connector framework completion.** Retry/backoff for all adapters, flow-wizard object-selection/preview/column-mapping steps, fix incremental's hardcoded-first-object bug, build MySQL/SQL Server/MongoDB/Excel/generic-REST adapters.
- **Not yet a numbered phase but should probably be inserted before Phase 10:** Admin panel frontend + server-side RBAC enforcement + Invite Team flow — these are Critical-severity gaps (§7) that were part of your original explicit scope ("keep the admin panel... RBAC... Session Management...") and have had zero work done on them across 8 phases.
- **Phase 11 — Rebrand** (CrossTecch → DataNexa across UI, package.json, `.crosstecch/` → `.datanexa/` with a real data-migration path).
- **Phase 12 — UI polish** (consolidate the two charting/dashboard engines, real code editor with schema-aware autocomplete for Query Studio, design-token cleanup).

---

## 9. Feature List (current, real, reachable)

✅ = real and reachable today · ⚠ = real backend, no/stub frontend · ❌ = not built

| Feature | Status |
|---|---|
| Register / Login / Logout | ✅ |
| Forgot / Reset password | ✅ (fixed Phase 1) |
| Email verification at signup | ❌ |
| Workspace creation | ✅ |
| Invite team members | ❌ |
| API key management | ✅ (fixed Phase 1) |
| Credential storage (BigQuery + sources) | ✅ (cross-tenant leak fixed Phase 1) |
| Connector: Instantly, PostgreSQL, Shopify, HubSpot, Stripe, Google Sheets, CSV | ✅ |
| Connector: MySQL, SQL Server, MongoDB, Excel, generic REST, BigQuery-as-source | ❌ |
| Flow creation wizard (source→auth→dataset→schedule→review) | ✅ (no object/column-mapping step) |
| Manual sync run | ✅ |
| Scheduled sync | ✅ |
| Incremental sync | ✅ (single-object-only for multi-object sources) |
| Retry/backoff on transient connector errors | ❌ |
| Job queue, dead-lettering, retry UI | ✅ (Phase 3) |
| Warehouse monitor (storage/cost/health) | ✅ |
| Query Studio (run/save/history) | ✅ (no syntax highlighting/real autocomplete) |
| Data Catalog (discovery, search, column detail) | ✅ (Phase 4; refresh is manual) |
| Lineage graph | ✅ (Phase 6) |
| Automation rules (triggers + webhook/email/retry actions) | ✅ (Phase 5) |
| Semantic Models (SQL, versioning, dependencies) | ✅ (Phase 7) |
| Dashboards / widgets / 35 chart types | ✅ (Phase 8) |
| Public dashboard sharing (live data) | ✅ (Phase 8) |
| Observability (KPIs, queue, connector health) | ✅ (Phase 3) |
| AI Ops (real-data recommendations) | ⚠ real backend, stub frontend, no LLM |
| Admin panel (users, roles, sessions, audit) | ⚠ real partial backend, stub frontend |
| RBAC enforcement | ❌ (stored but never checked) |
| Billing / usage limits | ⚠ usage tracked, no enforcement, no Stripe |
| Audit log | ✅ (13 of ~58 routes instrumented) |
| Rate limiting | ✅ (narrowly applied — login, register, credential write, sync, warehouse monitor) |

---

## 10. Production Readiness — assessed at documentation time (pre-verification)

This score reflects reading the code, not yet re-running a full manual pass (that's §11/Task #29, tracked separately). It will be revised after that pass.

**Estimated: 62/100.**

- The backend engineering (job queue, ETL, BigQuery integration, workspace isolation, SQL safety, audit logging, encryption) is genuinely strong — this is not a demo. Every phase's live-browser verification found and fixed real bugs, which is a good sign the pattern of "verify before trusting" is working, not a sign the codebase is shaky.
- The deductions are concentrated in three places, matching §7: (1) RBAC/Admin/Invite-team — a fully unenforced permission model in a multi-tenant product is the single largest gap; (2) connector robustness — no retry/backoff anywhere means production syncs will fail on any transient network blip; (3) AI Ops is currently mislabeled (rules engine, not AI) and has at least one hardcoded fake data array still in a "keep only real data" codebase.
- Nothing found suggests a rewrite is needed anywhere — every gap above is additive work on a sound foundation, consistent with how every phase so far has gone.

---

*This document is maintained additively, the same way `ARCHITECTURE.md` is — update it as phases land rather than treating it as a one-time snapshot.*
