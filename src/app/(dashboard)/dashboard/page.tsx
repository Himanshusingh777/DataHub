"use client";

import React from "react";
import { ArrowRightLeft, Database, AlertTriangle, CheckCircle2, Clock, Loader2, RefreshCw, Play } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DashboardStats {
  totalFlows: number;
  activeFlows: number;
  failedJobs: number;
  warehouseTables: number;
  totalRowsSynced: number;
  lastSyncAt: string | null;
  recentRuns: {
    id: string;
    flowName: string;
    status: string;
    rowsProcessed: number | null;
    durationMs: number | null;
    startedAt: number;
    error: string | null;
  }[];
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: React.ElementType; color: string }) {
  return (
    <div className="rounded-xl border border-border bg-white dark:bg-[#0e0f1a] p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
        <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center", color)}>
          <Icon className="h-4 w-4 text-white" />
        </div>
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
    </div>
  );
}

function fmtDuration(ms: number | null): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

export default function DashboardPage() {
  const [stats, setStats] = React.useState<DashboardStats | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/stats");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStats(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {stats?.lastSyncAt ? `Last sync: ${stats.lastSyncAt}` : "No syncs yet"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Link href="/flows">
            <Button size="sm" className="gap-1.5">
              <Play className="h-3.5 w-3.5" /> New Flow
            </Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-950/20 p-4 text-sm text-rose-700 dark:text-rose-400">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard label="Total Flows"   value={stats?.totalFlows ?? 0}       icon={ArrowRightLeft} color="bg-brand-600" />
        <StatCard label="Active Flows"  value={stats?.activeFlows ?? 0}      icon={CheckCircle2}   color="bg-emerald-500" />
        <StatCard label="Failed Jobs"   value={stats?.failedJobs ?? 0}       icon={AlertTriangle}  color="bg-rose-500" />
        <StatCard label="Tables"        value={stats?.warehouseTables ?? 0}  icon={Database}       color="bg-violet-500" />
        <StatCard label="Rows Synced"   value={(stats?.totalRowsSynced ?? 0).toLocaleString()} icon={CheckCircle2} color="bg-sky-500" />
        <StatCard label="Last Sync"     value={stats?.lastSyncAt ? "Recent" : "Never"} icon={Clock} color="bg-amber-500" />
      </div>

      {/* Recent Runs */}
      <div className="rounded-xl border border-border bg-white dark:bg-[#0e0f1a] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Recent Sync Jobs</p>
          <Link href="/flows" className="text-xs text-brand-600 hover:text-brand-700 font-medium">
            View all flows →
          </Link>
        </div>
        {!stats?.recentRuns?.length ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            No sync jobs yet.{" "}
            <Link href="/flows" className="text-brand-600 hover:underline">Create your first flow →</Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground">Flow</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Rows</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Duration</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Started</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentRuns.map((run, i) => (
                <tr key={run.id} className={cn("border-b border-border last:border-0", i % 2 === 0 ? "" : "bg-muted/10")}>
                  <td className="px-5 py-3 font-medium text-foreground truncate max-w-[180px]">{run.flowName}</td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full",
                      run.status === "success" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400" :
                      run.status === "running"  ? "bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400" :
                      run.status === "failed"   ? "bg-rose-50 text-rose-700 dark:bg-rose-950/20 dark:text-rose-400" :
                      "bg-muted text-muted-foreground"
                    )}>
                      {run.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{run.rowsProcessed?.toLocaleString() ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtDuration(run.durationMs)}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{fmtTime(run.startedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
