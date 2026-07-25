/**
 * WarehouseService — client-side wrapper that calls real API routes.
 * Replaces the old AI-driven service that was deleted in Phase 1.
 */

export const WarehouseService = {
  /** Returns true when BigQuery credentials are saved in the vault. */
  async isWarehouseConfigured(): Promise<boolean> {
    try {
      const res = await fetch("/api/credentials?service=bigquery");
      if (!res.ok) return false;
      const data = await res.json();
      return data.configured === true || data.ok === true;
    } catch { return false; }
  },

  /** Always returns true — real flows can always be synced via the API. */
  async canRunRealSync(_sourceId: string, _destId: string): Promise<boolean> {
    return true;
  },

  /** Trigger a manual sync for a flow via POST /api/sync/run */
  async runInstantlyToBigQuery(flowId?: string): Promise<{
    ok: boolean;
    rowsInserted: number;
    table: string;
    dataset: string;
    error?: string;
  }> {
    if (!flowId) {
      return { ok: false, rowsInserted: 0, table: "", dataset: "", error: "No flow ID provided" };
    }
    try {
      const res = await fetch("/api/sync/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flowId, triggerBy: "manual" }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        return { ok: false, rowsInserted: 0, table: "", dataset: "", error: data.error ?? "Sync failed" };
      }
      return {
        ok: true,
        rowsInserted: data.rows ?? 0,
        table: data.table ?? "",
        dataset: data.dataset ?? "",
      };
    } catch (e) {
      return { ok: false, rowsInserted: 0, table: "", dataset: "", error: String(e) };
    }
  },

  /** Build a run record for the demo store from a sync result. */
  buildRun(result: { ok: boolean; rowsInserted: number; error?: string }, durationMs: number) {
    return {
      id: `run-${Date.now()}`,
      startedAt: new Date().toISOString(),
      status: result.ok ? "success" : "failed",
      rows: result.rowsInserted,
      duration: (durationMs / 1000).toFixed(1) + "s",
      error: result.error,
      logs: result.ok
        ? [{ id: `l-${Date.now()}`, ts: new Date().toISOString(), level: "success" as const, message: `${result.rowsInserted.toLocaleString()} rows synced to BigQuery.` }]
        : [{ id: `l-${Date.now()}`, ts: new Date().toISOString(), level: "error" as const, message: result.error ?? "Sync failed" }],
    };
  },

  /** List tables in the connected BigQuery warehouse. */
  async queryWarehouse(action: string, params?: Record<string, string>): Promise<{
    ok: boolean; tables?: string[]; rows?: Record<string, unknown>[]; columns?: string[]; error?: string;
  }> {
    try {
      const url = new URL("/api/warehouse/monitor", window.location.origin);
      if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
      const res = await fetch(url.toString());
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const data = await res.json();
      if (action === "list_tables") {
        const tables = (data.storage?.tables ?? []).map((t: { table: string; dataset: string }) => `${t.dataset}.${t.table}`);
        return { ok: true, tables };
      }
      return { ok: true, ...data };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  /** Get the default dataset name from credentials. */
  async getDatasetName(): Promise<string> {
    try {
      const res = await fetch("/api/credentials?service=bigquery");
      if (!res.ok) return "";
      const data = await res.json();
      return data.dataset ?? "";
    } catch { return ""; }
  },

  /** Run a SQL query via the Query Runner API. */
  async runSQL(sql: string): Promise<{
    ok: boolean;
    columns?: string[];
    rows?: Record<string, unknown>[];
    rowCount?: number;
    bytesProcessed?: number;
    durationMs?: number;
    error?: string;
  }> {
    try {
      const res = await fetch("/api/query/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql }),
      });
      const data = await res.json();
      if (!res.ok || data.error) return { ok: false, error: data.error ?? "Query failed" };
      return { ok: true, ...data.result };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },
};
