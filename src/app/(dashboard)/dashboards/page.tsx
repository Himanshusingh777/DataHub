"use client";

/**
 * Dashboards — real, persisted dashboards built from real Semantic Models.
 * List view. The actual widget grid/builder lives at /dashboards/[id].
 *
 * Data source: GET/POST /api/dashboards
 */

import React from "react";
import Link from "next/link";
import { LayoutDashboard, Plus, Loader2, AlertTriangle, Globe, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { ROUTES } from "@/config/routes";

interface DashboardListItem {
  id: string; name: string; description: string | null; theme: string;
  is_published: number; widget_count: number; updated_at: number;
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-white/50 py-16 text-center dark:bg-[#0e0f1a]/50">
      <LayoutDashboard className="h-8 w-8 text-muted-foreground/50" />
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function DashboardsPage() {
  const [dashboards, setDashboards] = React.useState<DashboardListItem[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const { toast } = useToast();

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboards");
      const data = await res.json();
      if (!data.ok) { setError("Could not reach the dashboards endpoint."); return; }
      setDashboards(data.dashboards);
    } catch {
      setError("Could not reach the dashboards endpoint.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  async function createDashboard() {
    setCreating(true);
    try {
      const res = await fetch("/api/dashboards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `Untitled Dashboard ${new Date().toLocaleDateString()}` }),
      });
      const data = await res.json();
      if (!data.ok) { toast.error("Could not create dashboard", data.error ?? "Unknown error"); return; }
      window.location.href = ROUTES.DASHBOARDS + `/${data.dashboard.id}`;
    } catch {
      toast.error("Could not create dashboard", "Network error.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Dashboards</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Real widgets, built on real Semantic Models, run live against BigQuery.</p>
        </div>
        <Button size="sm" className="h-9 gap-2" onClick={createDashboard} disabled={creating}>
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} New dashboard
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50/50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/10 dark:text-rose-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {!dashboards && !error && loading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {dashboards && dashboards.length === 0 && !loading && (
        <EmptyState message="No dashboards yet. Create one, then add widgets built on your Semantic Models." />
      )}

      {dashboards && dashboards.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {dashboards.map((d) => (
            <Link
              key={d.id}
              href={`${ROUTES.DASHBOARDS}/${d.id}`}
              className="rounded-xl border border-border bg-white p-5 shadow-card transition-shadow hover:shadow-md dark:bg-[#0e0f1a]"
            >
              <div className="mb-3 flex items-start justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-950/20">
                  <LayoutDashboard className="h-4.5 w-4.5 text-brand-600" />
                </div>
                <Badge variant={d.is_published ? "success" : "neutral"} className="gap-1 text-[10px]">
                  {d.is_published ? <Globe className="h-2.5 w-2.5" /> : <Lock className="h-2.5 w-2.5" />}
                  {d.is_published ? "Shared" : "Private"}
                </Badge>
              </div>
              <p className="text-sm font-semibold text-foreground truncate">{d.name}</p>
              {d.description && <p className="mt-0.5 text-xs text-muted-foreground truncate">{d.description}</p>}
              <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{d.widget_count} widget{d.widget_count === 1 ? "" : "s"}</span>
                <span>{fmtTime(d.updated_at)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
