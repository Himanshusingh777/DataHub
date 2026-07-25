# CrossTecch DataFlow — Enterprise Architecture

This document describes the layer separation the platform actually has in
code today — every path below is a real file in this repository, not an
aspiration. It exists so the strict separation between layers survives
future changes: a rule of thumb, if a change to one layer requires editing
files in a layer two or more steps away in the diagram below, something is
probably leaking across a boundary that shouldn't be crossed.

## Layer diagram

```
 Connector Layer   →  Extraction   →  Transformation  →  Warehouse
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

Cross-cutting concerns (Background Jobs, Multi-Workspace, Security,
Billing/Auth-ready, Performance) sit beside this vertical stack rather than
inside it — every layer above can depend on them, but they never depend
back on Connector/Extraction/Transformation/Warehouse. See "Cross-cutting
layers" below.

## Dependency direction rule

**Data flows down the stack; dependencies point down too.** A layer may
import from any layer above it in the diagram, never from a layer below.
Concretely:

- `lib/server/connectors.ts` (Connector Layer) knows nothing about BigQuery,
  KPIs, dashboards, or React. It only knows how to authenticate against a
  source and return rows + a schema.
- `lib/server/etl.ts` (Transformation + Warehouse) knows nothing about
  Instantly, CSV, or any other source-specific format — it receives already
  source-agnostic `Record<string, unknown>[]` rows and a `BQField[]` schema.
- `lib/engine/semantic.ts` (Semantic Engine) knows nothing about BigQuery,
  connectors, or HTTP. It classifies a `(name, declaredType)` pair into a
  semantic role — that's the entire contract in and out.
- `lib/engine/kpi-catalog.ts` (KPI Engine) depends on the Semantic Engine's
  `ClassifiedColumn` output, never the other way around.
- `lib/bi/*` (the Business Intelligence layer — Insight/Recommendation/
  Copilot/Forecast/Reports/Alerts) depends on the Semantic + KPI + Warehouse
  layers, never the reverse.
- `src/app/(dashboard)/*` and `src/components/*` (Frontend) depend on
  everything below; nothing below ever imports from `app/` or the
  component tree. The one enforced exception is `src/lib/engine/warehouse-intel.ts`
  and `src/lib/bi/*`'s client-side orchestrators, whose entire job is being
  the seam the Frontend calls through — they still only call `fetch()`
  against this app's own API routes, never import React.

## Layer → file map

| Layer | Primary files | Contract |
|---|---|---|
| **Connector Layer** | `lib/server/connectors.ts` (`ConnectorAdapter` interface, `instantlyAdapter`, `csvAdapter`, `getAdapter()`) | `authenticate(creds)`, `objects`, `extract(objectId, creds, {startDate,endDate}, log)` → `{rows, schema}` |
| **Extraction** | `ConnectorAdapter.extract()` implementations inside `lib/server/connectors.ts` | Pull (Instantly: HTTP fetch) or push (CSV: pre-parsed client-side) — the route/runner never cares which |
| **Transformation** | `lib/server/etl.ts` (`sanitizeName`, `sanitizeRows`, `inferSchema`) | Normalizes arbitrary source field names/types into safe BigQuery identifiers + a `BQField[]` schema |
| **Warehouse** | `lib/server/etl.ts` (`loadToBigQuery`, `loadToBigQueryIncremental`), `lib/engine/sql.ts` (Dynamic SQL Generator), `lib/server/warehouse-monitor.ts` (storage/cost/health/load-duration) | All warehouse I/O — loads, MERGE/UPSERT, generated SELECT/DDL, INFORMATION_SCHEMA + Jobs API reads |
| **Semantic Engine** | `lib/engine/semantic.ts`, `lib/engine/semantic-store.ts`, `lib/engine/profile.ts` | Classifies columns (role, semantic class), profiles statistical shape, caches per-table metadata |
| **KPI Engine** | `lib/engine/kpi.ts`, `lib/engine/kpi-catalog.ts` | Turns classified columns + warehouse aggregates into typed, formatted KPIs |
| **Dashboard Engine** | `lib/engine/viz.ts` (`generateDashboard`, 13 chart types), `lib/bi/dashboard-builder.ts` | Chooses chart types from column semantics; the Universal Dashboard Builder layers user-driven layout on top |
| **Insight Engine** | `lib/engine/insights.ts`, `lib/engine/insights-warehouse.ts`, `lib/bi/health.ts` | Comparison/ranking/freshness results → natural-language insights + health scoring |
| **Recommendation Engine** | `lib/engine/recommend.ts`, `lib/bi/recommendation-center.ts` | Table metadata + quality findings → prioritized, actionable recommendations |
| **Copilot** | `lib/bi/copilot-warehouse.ts`, `components/copilot/ai-copilot.tsx`, `stores/copilot.store.ts` | Natural-language question → warehouse query → grounded answer; never invents numbers outside what the warehouse returned |
| **Frontend** | `src/app/(dashboard)/**/page.tsx`, `src/components/**` | Presentation only — every number displayed traces back to an API route, never hardcoded |

Also part of the vertical stack, standard library rather than app-specific:
`lib/engine/quality.ts` (Data Quality Engine — null rates, duplicates,
outliers) sits beside the Semantic Engine and feeds both the Recommendation
Engine and the quality panel on `/intelligence`.

## Cross-cutting layers (enterprise additions)

These sit outside the vertical data-flow stack — every layer above may use
them, but they never import Connector/Extraction/Transformation/Warehouse
code directly (with the narrow, intentional exception of the Job Engine,
whose `sync_flow` handler calls the Warehouse layer's `runFlowSync` because
running a sync *is* its job).

| Concern | Files | Notes |
|---|---|---|
| **Background Job Engine** | `lib/server/jobs.ts` (queue), `lib/server/worker.ts` (pool + handlers), `lib/server/scheduler.ts` (what's due) | Scheduler enqueues, workers execute via a `type → handler` registry, retries use exponential backoff, dead-letters after `max_attempts` |
| **Incremental Sync** | `lib/server/incremental.ts` (checkpoint/watermark), additive functions in `lib/engine/sql.ts` (`buildMerge`/`buildUpsert`/`buildAlterTableAddColumns`), `lib/server/etl.ts` (`loadToBigQueryIncremental`) | Opt-in per flow (`flows.sync_mode`); full-refresh (`loadToBigQuery`) is untouched and remains the default |
| **Multi-Workspace** | `lib/server/workspace.ts` | `workspace_id` on every tenant-scoped table, nullable-with-default so single-tenant installs need no migration |
| **Security** | `lib/server/crypto.ts` (encryption/hashing), `lib/server/secrets.ts` (Secret Manager abstraction), `lib/server/audit.ts` (append-only audit log), `lib/server/permissions.ts` (RBAC), `lib/server/rate-limit.ts` (token bucket) | Every credential write, auth event, and permission denial is audited; every mutating route is rate-limited |
| **Auth-ready** | `lib/server/auth.ts` (active: email/password sessions), `lib/server/auth-providers.ts` (architecture-only: Google/GitHub/Microsoft) | OAuth providers are env-gated and throw a clear "not configured" error rather than silently no-op-ing |
| **Billing-ready** | `lib/server/billing.ts` (`BillingProvider` abstraction + real usage/limit tracking against `usage_events`) | Stripe itself is architecture-only (no SDK installed); usage recording and limit checks are real and already wired into every sync path |
| **Performance** | `lib/perf/cache.ts` (TTL cache + memoization), `components/ui/virtual-list.tsx` (windowed rendering) | Applied, not just declared — `warehouse-monitor.ts` caches BigQuery calls for 30s; the `rollup` background job compacts `usage_events` |

## Why this separation matters in practice

- **Adding a connector** touches exactly one file (`connectors.ts`, one new
  `ConnectorAdapter`) plus a registry entry. Nothing in Transformation,
  Warehouse, or any layer above changes.
- **Adding a warehouse destination** (Snowflake, Redshift) touches
  `etl.ts`/`sql.ts` only — connectors and everything above them are
  warehouse-agnostic already (they operate on rows + schema, not SQL).
- **Adding a chart type** touches `viz.ts` only; the Semantic and KPI
  layers underneath don't know charts exist.
- **Enabling real Stripe billing** means installing the `stripe` package
  and filling in five methods on `StripeBillingProvider` in `billing.ts`
  — every caller already goes through `getBillingProvider()`, so nothing
  else in the app changes.

## Non-goals of this document

This is a map of what exists, not a spec for what should exist next. It is
updated additively as layers are extended — it does not gate or block
changes; it exists so the next change can find the right file on the first
try instead of grepping the whole repo.
