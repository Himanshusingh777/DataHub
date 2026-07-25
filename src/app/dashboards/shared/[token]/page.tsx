"use client";

/**
 * Public shared-dashboard view — no authentication, no app chrome. Lives
 * outside the (dashboard) route group deliberately: the sidebar/topbar are
 * built for an authenticated session and would either break or leak
 * internal navigation to anonymous visitors. Excluded from auth middleware
 * (see src/middleware.ts's matcher).
 *
 * Data source: GET /api/dashboards/shared/[token] — public, read-only,
 * never returns model SQL (see that route's own comment).
 */

import React, { use } from "react";
import { Loader2, AlertTriangle, LayoutDashboard } from "lucide-react";
import { ChartEngine } from "@/components/charts/chart-engine";
import type { ChartType, WidgetConfig } from "@/lib/models-data";

interface SharedWidget {
  id: string; name: string; chart_type: ChartType; config: WidgetConfig;
  position: { x: number; y: number; w: number; h: number };
  model_name: string;
}

interface SharedDashboard {
  id: string; name: string; description: string | null; theme: string;
}

function SharedWidgetCard({ token, widget }: { token: string; widget: SharedWidget }) {
  const [rows, setRows] = React.useState<Record<string, unknown>[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/dashboards/shared/${token}/widgets/${widget.id}/data`, { method: "POST" });
        const data = await res.json();
        if (!data.ok) { setError(data.error ?? "Could not load widget data."); return; }
        setRows(data.rows);
      } catch {
        setError("Network error.");
      } finally {
        setLoading(false);
      }
    })();
  }, [token, widget.id]);

  return (
    <div
      className="flex flex-col rounded-xl border border-border bg-white p-4 shadow-card dark:bg-[#0e0f1a]"
      style={{ gridColumn: `span ${Math.min(widget.position.w || 6, 12)}`, minHeight: (widget.position.h || 4) * 70 }}
    >
      <p className="mb-2 text-xs font-semibold text-foreground truncate">{widget.name}</p>
      <div className="flex-1">
        <ChartEngine chartType={widget.chart_type} data={rows ?? []} config={widget.config} height={(widget.position.h || 4) * 60} loading={loading} error={error} />
      </div>
    </div>
  );
}

export default function SharedDashboardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [dashboard, setDashboard] = React.useState<SharedDashboard | null>(null);
  const [widgets, setWidgets] = React.useState<SharedWidget[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/dashboards/shared/${token}`);
        const data = await res.json();
        if (!data.ok) { setError(data.error ?? "Dashboard not found or not published."); return; }
        setDashboard(data.dashboard);
        setWidgets(data.widgets);
      } catch {
        setError("Could not reach the server.");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  return (
    <div className="min-h-screen bg-[#f8f9fc] dark:bg-[#080910]">
      <header className="border-b border-border bg-white px-6 py-4 dark:bg-[#0e0f1a]">
        <div className="mx-auto flex max-w-6xl items-center gap-2">
          <LayoutDashboard className="h-5 w-5 text-brand-600" />
          <span className="font-semibold text-foreground">CrossTecch</span>
          <span className="text-muted-foreground">/ Shared Dashboard</span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-6">
        {loading && (
          <div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        )}

        {!loading && error && (
          <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50/50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/10 dark:text-rose-400">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        {!loading && dashboard && (
          <>
            <div className="mb-6">
              <h1 className="text-xl font-bold text-foreground">{dashboard.name}</h1>
              {dashboard.description && <p className="mt-0.5 text-sm text-muted-foreground">{dashboard.description}</p>}
            </div>
            <div className="grid grid-cols-12 gap-4">
              {widgets.map((w) => <SharedWidgetCard key={w.id} token={token} widget={w} />)}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
