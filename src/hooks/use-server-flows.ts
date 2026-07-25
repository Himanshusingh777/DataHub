"use client";

/**
 * useServerFlows — unified data hook for the Flows and Activity pages.
 *
 * • Demo mode  (isDemoMode=true):  reads from useDemoStore (localStorage).
 *   Mutations go straight to the demo store.
 *
 * • Real mode  (isDemoMode=false): fetches GET /api/flows and maps the
 *   SQLite rows to DataFlow objects.  Mutations call the real API routes.
 *
 * The hook re-fetches automatically on mount.  Call `refresh()` to
 * manually trigger a re-fetch (e.g. after a manual sync completes).
 */

import React from "react";
import { useAuthStore } from "@/stores/auth.store";
import { useDemoStore, getAllFlows } from "@/stores/demo.store";
import { MOCK_FLOWS, type DataFlow, type FlowRun } from "@/lib/flows-data";

// ── Visual metadata for every connector ID ────────────────────────────────────

const CONNECTOR_VISUAL: Record<string, { color: string; abbr: string }> = {
  instantly:      { color: "#6366F1", abbr: "IN" },
  shopify:        { color: "#96BF48", abbr: "SH" },
  hubspot:        { color: "#FF7A59", abbr: "HS" },
  stripe:         { color: "#635BFF", abbr: "ST" },
  "google-sheets":{ color: "#34A853", abbr: "GS" },
  google_sheets:  { color: "#34A853", abbr: "GS" },
  postgresql:     { color: "#336791", abbr: "PG" },
  mysql:          { color: "#4479A1", abbr: "MY" },
  salesforce:     { color: "#00A1E0", abbr: "SF" },
  bigquery:       { color: "#4285F4", abbr: "BQ" },
  snowflake:      { color: "#29B5E8", abbr: "SN" },
  redshift:       { color: "#8C4FFF", abbr: "RS" },
  s3:             { color: "#FF9900", abbr: "S3" },
  csv:            { color: "#059669", abbr: "CS" },
  csv_export:     { color: "#6B7280", abbr: "CS" },
  database:       { color: "#336791", abbr: "DB" },
  custom_api:     { color: "#6366F1", abbr: "AP" },
  woocommerce:    { color: "#7F54B3", abbr: "WC" },
  amazon:         { color: "#FF9900", abbr: "AM" },
  google_ads:     { color: "#4285F4", abbr: "GA" },
  meta_ads:       { color: "#1877F2", abbr: "FB" },
  mixpanel:       { color: "#7856FF", abbr: "MX" },
};

function connectorMeta(id: string): { color: string; abbr: string } {
  return (
    CONNECTOR_VISUAL[id] ?? {
      color: "#6B7280",
      abbr: id.slice(0, 2).toUpperCase(),
    }
  );
}

// ── Schedule label lookup ─────────────────────────────────────────────────────

export const SCHEDULE_LABELS: Record<string, string> = {
  every_15min: "Every 15 min",
  every_30min: "Every 30 min",
  every_hour:  "Every hour",
  every_3h:    "Every 3 hours",
  every_6h:    "Every 6 hours",
  every_12h:   "Every 12 hours",
  daily:       "Daily",
  weekly:      "Weekly",
  manual:      "Manual only",
};

// ── Time helpers ──────────────────────────────────────────────────────────────

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

function relAgo(tsMs: number): string {
  const diff = Date.now() - tsMs;
  const min = Math.floor(diff / 60_000);
  if (min < 1)  return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24)   return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function relUntil(tsMs: number): string {
  const diff = tsMs - Date.now();
  if (diff <= 0) return "now";
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `in ${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24)   return `in ${h}h`;
  return `in ${Math.floor(h / 24)}d`;
}

// ── DB row → DataFlow ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDbFlow(dbFlow: any): DataFlow {
  const srcMeta = connectorMeta(dbFlow.source_id ?? "");
  const dstMeta = connectorMeta(dbFlow.dest_id ?? "");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runs: FlowRun[] = (dbFlow.runs ?? []).map((r: any): FlowRun => ({
    id:        r.id,
    startedAt: Number.isFinite(r.started_at)
      ? new Date(r.started_at).toISOString()
      : String(r.started_at),
    status:    r.status,
    rows:      r.rows ?? null,
    duration:  r.duration_ms != null ? fmtDuration(r.duration_ms) : null,
    error:     r.error ?? undefined,
    logs:      [],  // detail endpoint loads full logs; list view omits them
  }));

  const successRuns = runs.filter((r) => r.status === "success");
  const failedRuns  = runs.filter((r) => r.status === "failed");
  const finished    = successRuns.length + failedRuns.length;
  const successRate = finished > 0
    ? Math.round((successRuns.length / finished) * 100)
    : 100;
  const totalRowsSynced = successRuns.reduce((a, r) => a + (r.rows ?? 0), 0);

  const lastSuccess = successRuns[0] ?? null;
  const lastFailed  = failedRuns[0]  ?? null;

  // Compute status: prefer DB value, but override to "error" when last run failed
  let status: DataFlow["status"] = (dbFlow.status as DataFlow["status"]) ?? "active";
  if (status === "active" && runs.length > 0 && runs[0]?.status === "failed") {
    status = "error";
  }

  return {
    id: dbFlow.id,
    source: {
      id:    dbFlow.source_id,
      name:  dbFlow.source_name ?? dbFlow.source_id,
      abbr:  srcMeta.abbr,
      color: srcMeta.color,
    },
    destination: {
      id:    dbFlow.dest_id,
      name:  dbFlow.dest_name ?? dbFlow.dest_id,
      abbr:  dstMeta.abbr,
      color: dstMeta.color,
    },
    schedule:         SCHEDULE_LABELS[dbFlow.schedule_value] ?? dbFlow.schedule_value ?? "Every hour",
    scheduleValue:    dbFlow.schedule_value ?? "every_hour",
    status,
    lastSync:         lastSuccess
      ? relAgo(new Date(lastSuccess.startedAt).getTime())
      : null,
    nextSync:         dbFlow.next_run_at && status === "active"
      ? relUntil(dbFlow.next_run_at)
      : null,
    lastSyncRows:     lastSuccess?.rows ?? null,
    lastSyncDuration: lastSuccess?.duration ?? null,
    totalRowsSynced,
    successRate,
    totalRuns:        runs.length,
    recentError:      lastFailed?.error
      ?? (status === "error" && runs.length > 0 ? "Last sync failed" : undefined),
    warehouseTable:   dbFlow.warehouse_table ?? undefined,
    runs,
  };
}

// ── Public interface ──────────────────────────────────────────────────────────

export interface ServerFlowsReturn {
  flows:     DataFlow[];
  isLoading: boolean;
  error:     string | null;
  refresh:   () => Promise<void>;
  deleteFlow:      (id: string) => Promise<void>;
  setFlowStatus:   (id: string, status: "active" | "paused") => Promise<void>;
  updateSchedule:  (id: string, scheduleValue: string) => Promise<void>;
  duplicateFlow:   (flow: DataFlow) => Promise<void>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useServerFlows(): ServerFlowsReturn {
  const { isDemoMode } = useAuthStore();

  // Demo store (always read — needed both for demo mode and for addFlow in duplicate)
  const {
    flows: demoFlows,
    deleteFlow:   deleteDemoFlow,
    setFlowStatus:setDemoStatus,
    updateFlow:   updateDemoFlow,
    addFlow:      addDemoFlow,
  } = useDemoStore();

  // Server state (only used in real mode)
  const [serverFlows, setServerFlows] = React.useState<DataFlow[]>([]);
  const [isLoading,   setIsLoading]   = React.useState(!isDemoMode);
  const [error,       setError]       = React.useState<string | null>(null);

  const fetchFlows = React.useCallback(async () => {
    if (isDemoMode) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/flows");
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json() as { ok: boolean; flows?: unknown[] };
      setServerFlows((data.flows ?? []).map(mapDbFlow));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  }, [isDemoMode]);

  React.useEffect(() => {
    fetchFlows();
  }, [fetchFlows]);

  // ── Demo mode ─────────────────────────────────────────────────────────────

  if (isDemoMode) {
    return {
      flows:     getAllFlows(MOCK_FLOWS, demoFlows),
      isLoading: false,
      error:     null,
      refresh:   async () => {},

      deleteFlow: async (id) => {
        deleteDemoFlow(id);
      },

      setFlowStatus: async (id, status) => {
        setDemoStatus(id, status);
      },

      updateSchedule: async (id, scheduleValue) => {
        const label = SCHEDULE_LABELS[scheduleValue] ?? scheduleValue;
        updateDemoFlow(id, { schedule: label, scheduleValue });
      },

      duplicateFlow: async (flow) => {
        const newFlow: DataFlow = {
          ...flow,
          id:              `df-dup-${Date.now()}`,
          status:          "draft",
          lastSync:        null,
          nextSync:        null,
          lastSyncRows:    null,
          lastSyncDuration:null,
          totalRowsSynced: 0,
          totalRuns:       0,
          successRate:     100,
          recentError:     undefined,
          runs:            [],
        };
        addDemoFlow(newFlow);
      },
    };
  }

  // ── Real backend mode ─────────────────────────────────────────────────────

  return {
    flows:     serverFlows,
    isLoading,
    error,
    refresh:   fetchFlows,

    deleteFlow: async (id) => {
      // Optimistic update
      setServerFlows((prev) => prev.filter((f) => f.id !== id));
      try {
        await fetch(`/api/flows?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      } catch {
        // If the delete fails, re-fetch to restore state
        await fetchFlows();
      }
    },

    setFlowStatus: async (id, status) => {
      // Optimistic update
      setServerFlows((prev) =>
        prev.map((f) =>
          f.id === id
            ? { ...f, status, nextSync: status === "paused" ? null : f.nextSync }
            : f
        )
      );
      try {
        const route = status === "paused" ? "pause" : "resume";
        await fetch(`/api/flows/${encodeURIComponent(id)}/${route}`, { method: "POST" });
      } catch {
        await fetchFlows();
      }
    },

    updateSchedule: async (id, scheduleValue) => {
      const flow = serverFlows.find((f) => f.id === id);
      if (!flow) return;
      const label = SCHEDULE_LABELS[scheduleValue] ?? scheduleValue;
      // Optimistic update
      setServerFlows((prev) =>
        prev.map((f) =>
          f.id === id ? { ...f, schedule: label, scheduleValue } : f
        )
      );
      try {
        await fetch("/api/flows", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id,
            sourceId:       flow.source.id,
            sourceName:     flow.source.name,
            destId:         flow.destination.id,
            destName:       flow.destination.name,
            scheduleValue,
            warehouseTable: flow.warehouseTable,
          }),
        });
      } catch {
        await fetchFlows();
      }
    },

    duplicateFlow: async (flow) => {
      const newId = `flow-dup-${Date.now()}`;
      try {
        await fetch("/api/flows", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id:             newId,
            sourceId:       flow.source.id,
            sourceName:     flow.source.name,
            destId:         flow.destination.id,
            destName:       flow.destination.name,
            scheduleValue:  flow.scheduleValue ?? "every_hour",
            warehouseTable: flow.warehouseTable,
          }),
        });
        // Refresh to get the new flow with server-assigned timestamps
        await fetchFlows();
      } catch {
        // No optimistic update for duplicate — just swallow silently
      }
    },
  };
}
