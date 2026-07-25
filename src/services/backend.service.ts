/**
 * BackendService — thin client for the real backend (SQLite + vault + scheduler).
 * All calls are fire-safe: failures never break the demo-mode UX.
 */

export const BackendService = {
  /** Store credentials in the encrypted server vault (enables scheduled syncs). */
  async pushCredential(service: string, data: Record<string, string>): Promise<boolean> {
    try {
      const res = await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service, data }),
      });
      return (await res.json()).ok === true;
    } catch { return false; }
  },

  /** Register a flow with the server scheduler. */
  async registerFlow(flow: {
    id: string; sourceId: string; sourceName?: string;
    destId: string; destName?: string;
    scheduleValue: string; warehouseTable?: string;
    name?: string;    // Flow display name (wizard Step 2)
    dataset?: string; // BigQuery dataset override (wizard Step 3)
  }): Promise<boolean> {
    try {
      const res = await fetch("/api/flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(flow),
      });
      return (await res.json()).ok === true;
    } catch { return false; }
  },

  async deleteFlow(id: string): Promise<void> {
    try { await fetch(`/api/flows?id=${encodeURIComponent(id)}`, { method: "DELETE" }); } catch { /* ignore */ }
  },

  // ── Auth ───────────────────────────────────────────────────────────────────
  async register(email: string, password: string, name?: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });
      const json = await res.json();
      return { ok: json.ok === true, error: json.error };
    } catch { return { ok: false, error: "Network error" }; }
  },

  async login(email: string, password: string): Promise<{ ok: boolean; error?: string; user?: { email: string; name: string | null } }> {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      return { ok: json.ok === true, error: json.error, user: json.user };
    } catch { return { ok: false, error: "Network error" }; }
  },

  async logout(): Promise<void> {
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch { /* ignore */ }
  },
};
