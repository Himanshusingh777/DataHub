"use client";

/**
 * Observability — real system health, read live from the job queue, run
 * history, connector credentials and warehouse config. No mock data.
 *
 * Data sources:
 *   GET /api/observability      — 7d KPIs, queue counts, connector health,
 *                                  warehouse status, recent flow runs
 *   GET /api/jobs?status=dead   — dead-lettered jobs (actionable — retry)
 *   POST /api/jobs {action:"retry", id} — requeue a dead-lettered job
 */

import React from "react";
import Link from "next/link";
import {
  Activity, CheckCircle2, XCircle, Clock, RefreshCw, Loader2,
  AlertTriangle, Layers, Server, Skull, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { ROUTES } from "@/config/routes";

// ── Types (mirror the API response shapes) ──────────────────────────────────

interface ObservabilitySnapshot {
  workers: unknown[];
  queue: { queued: number; running: number; failed: number; dead: number; throughputPerHour: number };
  connectors: { connectorId: string; name: string; status: string; latencyMs: number | null; lastChecked: string | null }[];
  warehouse: { configured: boolean; projectId: string | null; dataset: string | null; location: string | null; tablesDiscovered: number; totalRows: number };
  recentRuns: { id: string; flowId: string; flowName: string; status: string; rows: number; durationMs: number; startedAt: string }[];
  successRate7d: number;
  errorRate7d: number;
  avgLatencyMs7d: number;
  totalSyncs7d: number;
}

interface DeadJob {
  id: string; type: string; status: string; attempts: number; maxAttempts: number;
  lastError: string | null; createdAt: number; updatedAt: number;
}

async function fetchObservability(): Promise<ObservabilitySnapshot | null> {
  try {
    const res = await fetch("/api/observability");
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function fetchDeadJobs(): Promise<DeadJob[]> {
  try {
    const res = await fetch("/api/jobs?status=dead&limit=50");
    const data = await res.json();
    return data.ok ? data.jobs : [];
  } catch { return []; }
}

// ── Presentational pieces ────────────────────────────────────────────────────

const StatCard = React.memo(function StatCard({ label, value, sub, icon: Icon, iconBg, iconColor }: {
  label: string; value: string; sub?: string; icon: React.ElementType; iconBg: string; iconColor: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-white p-5 shadow-card dark:bg-[#0e0f1a]">
      <div className={cn("mb-3 flex h-9 w-9 items-center justify-center rounded-xl", iconBg)}>
        <Icon className={cn("h-4.5 w-4.5", iconColor)} />
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
      {sub && <p className="mt-0.5 text-[10px] text-muted-foreground/70">{sub}</p>}
    </div>
  );
});

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-white/50 py-12 text-center dark:bg-[#0e0f1a]/50">
      <Activity className="h-7 w-7 text-muted-foreground/50" />
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

const RUN_STATUS_STYLES: Record<string, { cls: string; icon: React.ElementType }> = {
  success: { cls: "text-emerald-600", icon: CheckCircle2 },
  error:   { cls: "text-rose-600",    icon: XCircle },
  failed:  { cls: "text-rose-600",    icon: XCircle },
  running: { cls: "text-blue-600",    icon: Loader2 },
};

function fmtMs(ms: number): string {
  if (!ms) return "—";
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ObservabilityPage() {
  const [snapshot, setSnapshot] = React.useState<ObservabilitySnapshot | null>(null);
  const [deadJobs, setDeadJobs] = React.useState<DeadJob[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [retryingId, setRetryingId] = React.useState<string | null>(null);
  const { toast } = useToast();

  const load = React.useCallback(async (manual = false) => {
    setLoading(true);
    setError(null);
    const [obs, dead] = await Promise.all([fetchObservability(), fetchDeadJobs()]);
    setLoading(false);
    if (!obs) {
      setError("Could not reach the observability endpoint.");
      if (manual) toast.error("Refresh failed", "Could not reach the observability endpoint.");
      return;
    }
    setSnapshot(obs);
    setDeadJobs(dead);
    if (manual) toast.success("Observability refreshed", `${obs.totalSyncs7d} syncs in the last 7 days`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => { load(false); }, [load]);

  async function retryJob(id: string) {
    setRetryingId(id);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry", id }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Job requeued", "It will run again on the next worker poll.");
        setDeadJobs((prev) => prev.filter((j) => j.id !== id));
      } else {
        toast.error("Retry failed", data.error ?? "Job could not be requeued.");
      }
    } catch {
      toast.error("Retry failed", "Network error.");
    } finally {
      setRetryingId(null);
    }
  }

  const queue = snapshot?.queue;
  const warehouse = snapshot?.warehouse;
  const connectors = snapshot?.connectors ?? [];
  const recentRuns = snapshot?.recentRuns ?? [];

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Observability</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Job queue, connector health, warehouse status and recent runs — read live, no mock data.
          </p>
        </div>
        <Button variant="outline" size="sm" className="h-9 gap-2" onClick={() => load(true)} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50/50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/10 dark:text-rose-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {!snapshot && !error && loading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {snapshot && (
        <>
          {/* 7d KPIs */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label="Success Rate (7d)" value={`${snapshot.successRate7d.toFixed(1)}%`}
              sub={`${snapshot.totalSyncs7d} syncs`}
              icon={CheckCircle2} iconBg="bg-emerald-50 dark:bg-emerald-950/20" iconColor="text-emerald-600"
            />
            <StatCard
              label="Error Rate (7d)" value={`${snapshot.errorRate7d.toFixed(1)}%`}
              sub={snapshot.errorRate7d > 0 ? "needs attention" : "all clear"}
              icon={XCircle} iconBg={snapshot.errorRate7d > 0 ? "bg-rose-50 dark:bg-rose-950/20" : "bg-emerald-50 dark:bg-emerald-950/20"}
              iconColor={snapshot.errorRate7d > 0 ? "text-rose-600" : "text-emerald-600"}
            />
            <StatCard
              label="Avg Run Duration (7d)" value={fmtMs(snapshot.avgLatencyMs7d)}
              sub="successful runs only"
              icon={Clock} iconBg="bg-blue-50 dark:bg-blue-950/20" iconColor="text-blue-600"
            />
            <StatCard
              label="Queue Throughput" value={`${queue?.throughputPerHour ?? 0}/hr`}
              sub={`${queue?.queued ?? 0} queued · ${queue?.running ?? 0} running`}
              icon={Server} iconBg="bg-violet-50 dark:bg-violet-950/20" iconColor="text-violet-600"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Job queue breakdown */}
            <div className="rounded-xl border border-border bg-white p-5 shadow-card dark:bg-[#0e0f1a]">
              <h3 className="mb-4 text-sm font-semibold text-foreground">Job Queue</h3>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Queued",  value: queue?.queued ?? 0,  variant: "neutral" as const },
                  { label: "Running", value: queue?.running ?? 0, variant: "info" as const },
                  { label: "Failed",  value: queue?.failed ?? 0,  variant: "warning" as const },
                  { label: "Dead",    value: queue?.dead ?? 0,    variant: "error" as const },
                ].map((s) => (
                  <div key={s.label} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
                    <span className="text-xs text-muted-foreground">{s.label}</span>
                    <Badge variant={s.variant}>{s.value}</Badge>
                  </div>
                ))}
              </div>
            </div>

            {/* Warehouse status */}
            <div className="rounded-xl border border-border bg-white p-5 shadow-card dark:bg-[#0e0f1a]">
              <h3 className="mb-4 text-sm font-semibold text-foreground">Warehouse</h3>
              {!warehouse?.configured ? (
                <EmptyState message="BigQuery is not configured yet. Connect a warehouse destination in a flow to see live status here." />
              ) : (
                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Project</span>
                    <span className="font-medium text-foreground font-mono">{warehouse.projectId}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Dataset</span>
                    <span className="font-medium text-foreground font-mono">{warehouse.dataset}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Location</span>
                    <span className="font-medium text-foreground">{warehouse.location}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Tables discovered</span>
                    <span className="font-medium text-foreground">{warehouse.tablesDiscovered.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Total rows (cataloged)</span>
                    <span className="font-medium text-foreground">{warehouse.totalRows.toLocaleString()}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Dead-lettered jobs — actionable */}
          <div className="rounded-xl border border-border bg-white shadow-card dark:bg-[#0e0f1a]">
            <div className="flex items-center justify-between px-5 pt-5 pb-4">
              <div className="flex items-center gap-2">
                <Skull className="h-4 w-4 text-rose-500" />
                <h3 className="text-sm font-semibold text-foreground">Dead-Lettered Jobs</h3>
              </div>
              {deadJobs.length > 0 && <Badge variant="error">{deadJobs.length}</Badge>}
            </div>
            {deadJobs.length === 0 ? (
              <div className="px-5 pb-5">
                <EmptyState message="No dead-lettered jobs. Jobs land here after exhausting all retry attempts." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground bg-muted/20">
                      <th className="px-5 pb-2 pt-1 font-medium">Type</th>
                      <th className="px-3 pb-2 pt-1 font-medium">Attempts</th>
                      <th className="px-3 pb-2 pt-1 font-medium">Last Error</th>
                      <th className="px-3 pb-2 pt-1 font-medium">Updated</th>
                      <th className="px-3 pb-2 pt-1 pr-5 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deadJobs.map((j) => (
                      <tr key={j.id} className="border-b border-border/50 last:border-0">
                        <td className="px-5 py-2.5 font-medium text-foreground font-mono">{j.type}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{j.attempts} / {j.maxAttempts}</td>
                        <td className="px-3 py-2.5 text-muted-foreground max-w-[320px] truncate" title={j.lastError ?? ""}>
                          {j.lastError ?? "—"}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">{fmtTime(new Date(j.updatedAt).toISOString())}</td>
                        <td className="px-3 py-2.5 pr-5 text-right">
                          <Button
                            variant="outline" size="sm" className="h-7 gap-1.5 text-xs"
                            disabled={retryingId === j.id}
                            onClick={() => retryJob(j.id)}
                          >
                            {retryingId === j.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                            Retry
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Connector health */}
            <div className="rounded-xl border border-border bg-white p-5 shadow-card dark:bg-[#0e0f1a]">
              <h3 className="mb-4 text-sm font-semibold text-foreground">Connector Health</h3>
              {connectors.length === 0 ? (
                <EmptyState message="No production connectors registered." />
              ) : (
                <div className="space-y-3">
                  {connectors.map((c) => (
                    <div key={c.connectorId} className="flex items-center gap-3">
                      <Layers className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-foreground">{c.name}</p>
                      </div>
                      <Badge variant={c.status === "healthy" ? "success" : "neutral"} className="shrink-0">
                        {c.status === "healthy" ? "Connected" : "Not configured"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent runs */}
            <div className="rounded-xl border border-border bg-white p-5 shadow-card dark:bg-[#0e0f1a]">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Recent Runs</h3>
                <Link href={ROUTES.FLOWS} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                  All flows <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              {recentRuns.length === 0 ? (
                <EmptyState message="No runs recorded yet." />
              ) : (
                <div className="space-y-3 max-h-[360px] overflow-y-auto">
                  {recentRuns.map((r) => {
                    const style = RUN_STATUS_STYLES[r.status] ?? RUN_STATUS_STYLES.success!;
                    const Icon = style.icon;
                    return (
                      <Link
                        key={r.id}
                        href={ROUTES.FLOW(r.flowId)}
                        className="flex items-center gap-3 -mx-1 rounded-lg px-1 py-0.5 hover:bg-accent/40 transition-colors"
                      >
                        <Icon className={cn("h-4 w-4 shrink-0", style.cls, r.status === "running" && "animate-spin")} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-foreground">{r.flowName}</p>
                          <p className="text-[10px] text-muted-foreground">{fmtTime(r.startedAt)} · {r.rows.toLocaleString()} rows</p>
                        </div>
                        <span className="shrink-0 text-[10px] text-muted-foreground">{fmtMs(r.durationMs)}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {!snapshot && !loading && !error && (
        <EmptyState message="No observability data yet." />
      )}
    </div>
  );
}
