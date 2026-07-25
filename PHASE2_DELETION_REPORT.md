# Phase 2 Deletion Report

**Date:** 2026-07-25
**Rules applied:** every candidate below was individually opened and read (not assumed dead from the Phase-0 audit's "zero importers" heuristic, which this pass found to be wrong in at least one case — see "Rejected candidates"). Nothing was removed solely for having zero importers; each item also had to be confirmed mock data, demo code, placeholder UI, a duplicate implementation, or a genuinely unreachable/deprecated route. Anything real, substantial, or plausibly load-bearing for a feature on the keep-and-rebuild list was preserved even if currently disconnected.

The authoritative source for "is this route actually deprecated" was `src/config/routes.ts`'s own header comment, which documents the codebase's intended IA and explicitly lists what was consolidated: *"Removed as top-level nav items: Connections, Destinations, Pipelines, Sync Jobs, Logs, Profile."* Everything else in `ROUTES` (admin, ai-ops, automation, bi, catalog, dashboards, environments, intelligence, lineage, observability, workspace, connectors, developer, activity) is documented as an intended real route tied to a lettered "Phase" in that file's own roadmap — those were preserved, not deleted, even though their `page.tsx` is currently a redirect stub.

---

## Deleted

### Route folders — confirmed either explicitly deprecated in `routes.ts`'s own comment, or absent from its documented IA entirely, and verified to contain nothing but a 2-line unconditional redirect (or, for the three noted below, a fully mock-backed page with zero backend)

| Route | Why |
|---|---|
| `connections/`, `connections/new/` | `routes.ts`: explicitly "removed as top-level nav item," folded into Flows. Verified: 2-line redirect / client-side `router.replace(FLOWS)`. |
| `destinations/`, `destinations/new/` | Same as above — explicitly deprecated, folded into Flows. |
| `pipelines/`, `pipelines/new/`, `pipelines/[id]/builder/` | `routes.ts`: explicitly deprecated. Verified: a fully-built duplicate of Flows (its own wizard/builder, 237-line list page) backed entirely by `MOCK_PIPELINES_FULL` (6 fabricated company pipeline examples with fake names/metrics). Confirmed **zero backend** — no `/api/pipelines/*` route exists anywhere, unlike Catalog/Lineage/Automation/etc., which all have real DB-backed API routes. This is demo frontend with no real investment behind it, not a disconnected real feature. |
| `sync-jobs/`, `sync-jobs/[id]/` | `routes.ts`: explicitly deprecated, replaced by `/activity`. Verified: list page is a 2-line redirect; the `[id]` detail page reads `MOCK_SYNC_JOBS`, which Phase 1's audit found is a hardcoded **empty array** — the page can never show anything but "Job not found." (`components/monitoring/job-status-badge.tsx`, which this page used, was independently verified real and is *not* deleted — see Preserved.) |
| `logs/` | `routes.ts`: explicitly deprecated, replaced by `/activity`. 2-line redirect. |
| `profile/` | `routes.ts`: explicitly deprecated ("profile now lives in avatar dropdown" / Settings). 2-line redirect; the real Profile experience is Settings' `ProfileTab`, which is the live default tab. |
| `billing/` | Absent from `routes.ts`'s `ROUTES` object entirely (no `BILLING` constant). Backend confirmed non-existent — `lib/server/billing.ts` is a no-op stub per Phase 1's audit. 2-line redirect. |
| `team/` | Absent from `routes.ts`. 2-line redirect; team/member management is Settings' `MembersTab` / Admin's user management instead. |
| `webhooks/` | Absent from `routes.ts` (Automation is the documented umbrella for webhook triggers/actions). 2-line redirect. |
| `notifications/` | Absent from `routes.ts`. 2-line redirect. |
| `help/` | Absent from `routes.ts`. 2-line redirect. |
| `docs/` | Absent from `routes.ts`. 2-line redirect. |
| `analytics/` | Absent from `routes.ts` (superseded by the documented BI/Dashboards/Intelligence routes). 2-line redirect. |
| `monitoring/` | Absent from `routes.ts` (Observability is the documented umbrella term). 2-line redirect. |
| `scheduler/` | Absent from `routes.ts` — no `SCHEDULER` constant exists even as an intended future route; scheduler/worker health is documented as part of Observability instead. 2-line redirect. |

### Components — each opened; all were either self-documented single-line "Removed" stubs with zero logic, or (for `pipeline-builder.tsx`) exclusively consumed by the confirmed-mock `pipelines/` feature above

- `components/onboarding/onboarding-gate.tsx` — `// Removed — onboarding deleted`, returns `null`. Re-verified zero importers anywhere.
- `components/onboarding/onboarding-wizard.tsx` — same pattern, re-verified zero importers.
- `components/connectors/connect-modal.tsx` — `// Removed — fake connector modal deleted`, returns `null`. Re-verified zero importers. (Its sibling `connector-card.tsx` was **not** touched — see Preserved, it turned out to be live.)
- `components/pipelines/pipeline-builder.tsx` — real component, but its only two callers were both inside the deleted `pipelines/` tree; deleted alongside its feature, not independently.

### Stores / hooks — self-documented gutted stubs, re-verified zero importers after deleting their only prior consumers

- `stores/connectors.store.ts` — `// Removed — fake connector store deleted`.
- `stores/onboarding.store.ts` — `// Removed — onboarding feature deleted`.
- `hooks/use-bi-data.ts` — `// Removed — BI data hook deleted. No pages import this anymore.` (self-documented as already orphaned).

### Services — literally empty files (`export {};`, nothing else)

- `services/instantly.service.ts`
- `services/sync.service.ts`
- `services/validation.service.ts`

(`services/csv.service.ts` was reviewed and is **not** empty — see Preserved.)

### `lib/` data files

- `lib/mock-data.ts` — self-documented "CLEARED... Type imports kept for backward compatibility," but re-verification found **zero remaining references anywhere** — even the "backward compatibility" purpose no longer applies. Every export is an empty array/object.
- `lib/pipeline-types.ts` — real transform-related type definitions, but 200+ of its 275 lines are `MOCK_PIPELINES_FULL`/`MOCK_PIPELINE_RUNS`, fabricated data for the deleted Pipelines feature specifically (fake company names, fake Stripe/HubSpot/Salesforce pipeline examples). Deleted alongside `pipelines/`.

### API routes — confirmed dead/debug scaffolding, not production modules

- `api/bi/alerts/dispatch/route.ts` — `// Removed — BI alert dispatch deleted`, unconditionally returns `{error: "BI features removed"}, 404`. No real logic to preserve.
- `api/instantly/test-analytics/route.ts`, `api/instantly/test-v1/route.ts` — ad-hoc, unauthenticated debug endpoints (no session/auth check at all) that fan out to 5+ guessed Instantly API URL variants with hardcoded campaign IDs and hardcoded 2026 date ranges, accepting the Instantly API key as a URL query parameter. Confirmed leftover exploration code, not a real integration — the real, working Instantly integration is `lib/connectors/adapters/instantly.ts` plus `api/instantly/{analytics,campaigns,leads}`, none of which are touched.

### Stray root files

- `ecommerce_orders_1000.csv`, `sales_data_q4_2024.csv` — re-confirmed zero references anywhere in application code, config, or scripts (only reference found was this repo's own prior audit report, describing them as artifacts). Manual test-upload leftovers.

---

## Preserved — flagged as dead by the earlier zero-importers heuristic, but confirmed real/relevant on individual review

- **`components/connectors/connector-card.tsx` + `lib/connectors-data.ts` (1089 lines) + `connector-logo.tsx`** — the Phase-0 audit listed `connector-card.tsx` as having zero importers. Re-verification found this was **wrong**: it's imported by `components/flows/flow-wizard-modal.tsx`, the real, live flow-creation wizard. Deleting this would have broken a working feature. This is the clearest justification in this pass for the "never delete solely on zero-importers" rule.
- **`components/charts/chart-engine.tsx`** — real, substantial (35+ chart types across Recharts + ECharts), documented, non-mock rendering engine built specifically for the `/api/widgets/[id]/data` BI widget system. Directly relevant to the Dashboards/BI rebuild on the keep list. Not touched.
- **`services/csv.service.ts`** — real, complete CSV parsing implementation (delimiter detection, quoted-field parsing, type inference, primary-key heuristics, validation) designed against the live `flow-wizard.store.ts` types. Zero importers today, but it's genuine working logic directly relevant to the CSV connector (on the keep list), not mock data. Not touched.
- **`lib/enterprise-data.ts`** — self-documented "CLEARED of all mock/demo arrays. Types and RBAC permission definitions kept (these are product logic, not mock data)." Contains a real, complete RBAC permission taxonomy (`PERMISSION_GROUPS`, `DEFAULT_ROLE_PERMISSIONS`) directly matching the admin panel's explicit "Role & Permission Management" requirement. It also contains one still-fabricated section (`BILLING_PLANS` pricing data) left over from the now-deleted Billing route; left in place rather than doing partial-file surgery on a mixed file — flagged here for cleanup when Settings/Admin is rebuilt for real.
- **`lib/monitoring-data.ts`** — self-documented "CLEARED... Types kept for backward compatibility." All mock arrays are already empty; the types (`SyncJob`, `JobStep`, `Schedule`, `LogEntry`) are real domain types likely to be reused when Activity/Observability gets built for real. Not touched.
- **`components/monitoring/job-status-badge.tsx`** — small, generic, non-mock presentational component. Its only caller (`sync-jobs/[id]`) was deleted above, but the component itself has real, reusable logic worth keeping for the Activity/Observability rebuild.
- **`settings/api-keys/page.tsx` vs. `settings/page.tsx`'s embedded `ApiKeysTab`** — confirmed genuine duplication (two separate, non-trivial API-key management UIs), but **neither actually calls the real `/api/keys` backend** fixed in Phase 1 — both are local-state/mock. Deciding which one to keep (or how to merge them) is a design decision for the dedicated admin-panel build, not something to resolve by deleting one blind. Left both in place.
- **`settings/roles/page.tsx`** — real, reasonably complete RBAC editor UI built against `lib/enterprise-data.ts`'s real permission taxonomy. Directly matches the admin panel's keep-list requirement. Left in place, deferred to the admin-panel build phase for backend wiring.
- **`settings/page.tsx`'s 8 unreachable tabs** (Workspace, Appearance, Notifications, ApiKeys, Security, Billing, Members, DangerZone) — some contain inline hardcoded demo arrays (`MOCK_KEYS`, `MOCK_MEMBERS`). This is a single 1692-line file mixing 2 real/reachable tabs with 8 fully-built-but-disconnected ones; several of those 8 map directly to keep-list items (Workspace, Security/Members → RBAC, ApiKeys). Surgically stripping mock data from a file this size without a concrete plan for what replaces each tab risks half-finished work. Deferred in full to the dedicated admin-panel build phase rather than touched here.
- **All 14 route folders documented as intended real routes in `routes.ts`** (`admin`, `ai-ops`, `automation`, `bi`, `catalog`, `dashboards`, `environments`, `intelligence`, `lineage`, `observability`, `workspace`, `connectors`, `developer`, `activity`) — each is currently a 2-line redirect stub, but each is explicitly documented in the codebase's own roadmap as a real feature tied to a lettered phase, matching this project's keep-and-rebuild list. Not deleted; will be replaced with real pages module-by-module in their own dedicated phases.

---

## Not assessed this pass

`sync-jobs`/`logs`/etc.'s sibling backend API routes (`/api/jobs`, `/api/observability`, `/api/catalog`, `/api/automation`, `/api/models`, `/api/dashboards`, `/api/bi/insights`, etc.) were **not touched** — these are real, DB-backed, production modules per the "keep every production backend module" rule, regardless of whether their frontend is built yet.
