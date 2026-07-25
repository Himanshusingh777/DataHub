"use client";

/**
 * Warehouse Monitoring — real BigQuery infrastructure telemetry.
 *
 * Storage, query cost, partitions, cluster/table health, and load duration.
 * Sibling to /intelligence (which answers data questions); this page answers
 * "is the warehouse itself healthy, and what is it costing us." Every number
 * is read live from BigQuery INFORMATION_SCHEMA + Jobs API, or from this
 * app's own sync history (load duration) — no mock data, ever.
 */

import React from "react";
import {
  HardDrive, DollarSign, Layers, Activity, RefreshCw, Loader2,
  AlertTriangle, CheckCircle2, HelpCircle, Clock, Database,
  Search, ChevronDown, ChevronUp, ChevronsUpDown, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
// ── Types (mirror the API response shape) ────────────────────────────────

interface TableStorage {
  table: string; dataset: string; totalRows: number | null; totalBytes: number | null;
  totalGB: number | null; isPartitioned: boolean; createdAt: string | null;
}
interface QueryCostDay { date: string; bytesProcessed: number; estimatedUsd: number; jobCount: number }
interface TableHealth {
  table: string; status: "healthy" | "stale" | "unknown";
  lagHours: number | null; latest: string | null; totalRows: number | null; timeColumn: string | null;
}
interface LoadDurationStats {
  flowId: string; sourceId: string; destTable: string | null;
  runCount: number; avgMs: number; p95Ms: number; lastMs: number | null;
  lastStatus: string | null; lastRunAt: number | null;
}
interface Snapshot {
  ok: boolean;
  storage: { tables: TableStorage[]; totalBytes: number; totalGB: number; partitionedCount: number; unpartitionedCount: number };
  queryCost: { days: QueryCostDay[]; totalBytesProcessed: number; totalEstimatedUsd: number; jobsScanned: number; warning?: string };
  clusterHealth: TableHealth[];
  loadDurations: LoadDurationStats[];
  generatedAt: string;
  error?: string;
  notFound?: boolean;
}

/**
 * Fetch the warehouse snapshot using credentials from the server-side vault.
 * Credentials are NEVER stored or read client-side.
 */
async function fetchSnapshot(): Promise<Snapshot> {
  try {
    const res = await fetch("/api/warehouse/monitor");
    const data: Snapshot = await res.json();
    if (res.status === 404 && (data as { notConfigured?: boolean }).notConfigured) {
      return { ok: false, notConfigured: true, error: "BigQuery is not configured yet. Add your credentials in Settings → Integrations." } as unknown as Snapshot;
    }
    return data;
  } catch {
    return { ok: false, error: "Network error — could not reach the warehouse monitor." } as Snapshot;
  }
}

function fmtBytes(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(2)} TB`;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${bytes.toLocaleString()} B`;
}
function fmtMs(ms: number): string {
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ── Presentational pieces ─────────────────────────────────────────────────

// Memoized: the parent re-renders every time `snapshot` refreshes, but most
// individual stat values are unchanged between refreshes — React.memo skips
// re-rendering a card whose props are referentially/shallowly identical.
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

const HEALTH_STYLES: Record<TableHealth["status"], { icon: React.ElementType; cls: string; label: string }> = {
  healthy: { icon: CheckCircle2, cls: "text-emerald-600", label: "Healthy" },
  stale:   { icon: AlertTriangle, cls: "text-amber-600", label: "Stale" },
  unknown: { icon: HelpCircle,   cls: "text-muted-foreground", label: "No time column" },
};

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-white/50 py-16 text-center dark:bg-[#0e0f1a]/50">
      <Database className="h-8 w-8 text-muted-foreground/50" />
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

// ── Sort helper ───────────────────────────────────────────────────────────

type SortKey = "table" | "totalRows" | "totalBytes";
type SortDir = "asc" | "desc";

function SortIcon({ col, sort }: { col: SortKey; sort: { key: SortKey; dir: SortDir } }) {
  if (sort.key !== col) return <ChevronsUpDown className="ml-1 inline h-3 w-3 text-muted-foreground/40" />;
  return sort.dir === "asc"
    ? <ChevronUp className="ml-1 inline h-3 w-3 text-brand-600" />
    : <ChevronDown className="ml-1 inline h-3 w-3 text-brand-600" />;
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function WarehousePage() {
  const [snapshot, setSnapshot] = React.useState<Snapshot | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [notConfigured, setNotConfigured] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [tableSearch, setTableSearch] = React.useState("");
  const [sort, setSort] = React.useState<{ key: SortKey; dir: SortDir }>({ key: "totalBytes", dir: "desc" });
  const [expandedTable, setExpandedTable] = React.useState<string | null>(null);
  const { toast } = useToast();

  const load = React.useCallback(async (manual = false) => {
    setLoading(true);
    setError(null);
    setNotConfigured(false);
    const s = await fetchSnapshot();
    setLoading(false);
    if (!s.ok) {
      if ((s as { notConfigured?: boolean }).notConfigured) {
        setNotConfigured(true);
      } else {
        setError(s.error ?? "Could not load warehouse telemetry.");
        if (manual) toast.error("Refresh failed", s.error ?? "Could not reach the warehouse monitor.");
      }
      setSnapshot(null);
      return;
    }
    setSnapshot(s);
    if (manual) toast.success("Warehouse refreshed", `${s.storage.tables.length} tables · ${s.storage.totalGB.toFixed(2)} GB`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => { load(false); }, [load]);

  function toggleSort(key: SortKey) {
    setSort(prev => prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" });
  }

  const storage = snapshot?.storage;
  const queryCost = snapshot?.queryCost;
  const clusterHealth = snapshot?.clusterHealth ?? [];
  const loadDurations = snapshot?.loadDurations ?? [];
  const staleCount = clusterHealth.filter((t) => t.status === "stale").length;

  // Filtered + sorted tables. This useMemo (and every hook above it) must run
  // on every render, including the notConfigured render below — an early
  // return placed before a hook call changes the hook count between renders
  // and React throws "Rendered fewer hooks than expected."
  const filteredTables = React.useMemo(() => {
    const q = tableSearch.toLowerCase();
    const tables = (storage?.tables ?? []).filter(t => !q || t.table.toLowerCase().includes(q));
    return [...tables].sort((a, b) => {
      const dir = sort.dir === "asc" ? 1 : -1;
      if (sort.key === "table") return dir * a.table.localeCompare(b.table);
      if (sort.key === "totalRows") return dir * ((a.totalRows ?? 0) - (b.totalRows ?? 0));
      return dir * ((a.totalBytes ?? 0) - (b.totalBytes ?? 0));
    });
  }, [storage, tableSearch, sort]);

  if (!loading && notConfigured) {
    return (
      <div className="p-6">
        <EmptyState message="BigQuery is not configured yet. Connect a warehouse destination in a flow's Destination step, then this page will show live storage, cost, health and load-duration telemetry." />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Warehouse Monitoring</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {snapshot ? `Last refreshed ${new Date(snapshot.generatedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Storage, query cost, partitions, cluster health and load duration — read live from BigQuery."}
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
          {/* Top stat row */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label="Warehouse Storage" value={`${storage?.totalGB.toFixed(2) ?? "0"} GB`}
              sub={`${storage?.tables.length ?? 0} tables`}
              icon={HardDrive} iconBg="bg-blue-50 dark:bg-blue-950/20" iconColor="text-blue-600"
            />
            <StatCard
              label="Est. Query Cost (7d)" value={`$${queryCost?.totalEstimatedUsd.toFixed(2) ?? "0.00"}`}
              sub={queryCost?.warning ? "Jobs API unavailable" : `${queryCost?.jobsScanned ?? 0} jobs scanned`}
              icon={DollarSign} iconBg="bg-emerald-50 dark:bg-emerald-950/20" iconColor="text-emerald-600"
            />
            <StatCard
              label="Partitioned Tables" value={`${storage?.partitionedCount ?? 0} / ${storage?.tables.length ?? 0}`}
              sub={`${storage?.unpartitionedCount ?? 0} unpartitioned`}
              icon={Layers} iconBg="bg-violet-50 dark:bg-violet-950/20" iconColor="text-violet-600"
            />
            <StatCard
              label="Table Health" value={`${clusterHealth.length - staleCount} / ${clusterHealth.length}`}
              sub={staleCount ? `${staleCount} stale` : "all fresh"}
              icon={Activity} iconBg={staleCount ? "bg-amber-50 dark:bg-amber-950/20" : "bg-emerald-50 dark:bg-emerald-950/20"}
              iconColor={staleCount ? "text-amber-600" : "text-emerald-600"}
            />
          </div>

          {/* Storage + partitions table */}
          <div className="rounded-xl border border-border bg-white shadow-card dark:bg-[#0e0f1a]">
            <div className="flex items-center justify-between px-5 pt-5 pb-4">
              <h3 className="text-sm font-semibold text-foreground">Storage &amp; Partitions</h3>
              {(storage?.tables.length ?? 0) > 0 && (
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
                  <input
                    value={tableSearch}
                    onChange={e => setTableSearch(e.target.value)}
                    placeholder="Search tables…"
                    className="h-7 rounded-lg border border-border bg-muted/50 pl-7 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-500 w-44"
                  />
                </div>
              )}
            </div>
            {!storage?.tables.length ? (
              <div className="px-5 pb-5">
                <EmptyState message="No tables found yet — run a sync to populate the warehouse." />
              </div>
            ) : filteredTables.length === 0 ? (
              <div className="px-5 pb-5">
                <EmptyState message={`No tables matching "${tableSearch}".`} />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground bg-muted/20">
                      <th className="px-5 pb-2 pt-1 font-medium">
                        <button className="flex items-center hover:text-foreground transition-colors" onClick={() => toggleSort("table")}>
                          Table <SortIcon col="table" sort={sort} />
                        </button>
                      </th>
                      <th className="px-3 pb-2 pt-1 font-medium">
                        <button className="flex items-center hover:text-foreground transition-colors" onClick={() => toggleSort("totalRows")}>
                          Rows <SortIcon col="totalRows" sort={sort} />
                        </button>
                      </th>
                      <th className="px-3 pb-2 pt-1 font-medium">
                        <button className="flex items-center hover:text-foreground transition-colors" onClick={() => toggleSort("totalBytes")}>
                          Size <SortIcon col="totalBytes" sort={sort} />
                        </button>
                      </th>
                      <th className="px-3 pb-2 pt-1 font-medium">Partitioned</th>
                      <th className="px-3 pb-2 pt-1 pr-5 font-medium">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTables.map((t) => (
                      <React.Fragment key={t.table}>
                        <tr
                          className="border-b border-border/50 last:border-0 cursor-pointer hover:bg-accent/20 transition-colors"
                          onClick={() => setExpandedTable(prev => prev === t.table ? null : t.table)}
                        >
                          <td className="px-5 py-2.5 font-medium text-foreground flex items-center gap-1.5">
                            <ChevronRight className={cn("h-3 w-3 text-muted-foreground/50 transition-transform", expandedTable === t.table && "rotate-90")} />
                            {t.table}
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground">{t.totalRows?.toLocaleString() ?? "—"}</td>
                          <td className="px-3 py-2.5 text-muted-foreground">{t.totalBytes != null ? fmtBytes(t.totalBytes) : "—"}</td>
                          <td className="px-3 py-2.5">
                            <Badge variant="outline" className={cn("text-[10px]", t.isPartitioned ? "text-emerald-600 border-emerald-200" : "text-muted-foreground")}>
                              {t.isPartitioned ? "Yes" : "No"}
                            </Badge>
                          </td>
                          <td className="px-3 py-2.5 pr-5 text-muted-foreground">{t.createdAt ? new Date(t.createdAt).toLocaleDateString() : "—"}</td>
                        </tr>
                        {expandedTable === t.table && (
                          <tr className="border-b border-border/50">
                            <td colSpan={5} className="px-5 py-3 bg-muted/20">
                              <div className="grid grid-cols-3 gap-4 text-xs">
                                <div>
                                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Total Storage</p>
                                  <p className="text-foreground font-medium">{t.totalBytes != null ? fmtBytes(t.totalBytes) : "—"}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Total Rows</p>
                                  <p className="text-foreground font-medium">{t.totalRows?.toLocaleString() ?? "—"}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Partitioned</p>
                                  <p className={cn("font-medium", t.isPartitioned ? "text-emerald-600" : "text-muted-foreground")}>
                                    {t.isPartitioned ? "Yes — partitioned table" : "No — full table scans"}
                                  </p>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Cluster / table health */}
            <div className="rounded-xl border border-border bg-white p-5 shadow-card dark:bg-[#0e0f1a]">
              <h3 className="mb-4 text-sm font-semibold text-foreground">Cluster &amp; Table Health</h3>
              {!clusterHealth.length ? (
                <EmptyState message="No tables to check yet." />
              ) : (
                <div className="space-y-3">
                  {clusterHealth.map((h) => {
                    const s = HEALTH_STYLES[h.status];
                    const Icon = s.icon;
                    return (
                      <div key={h.table} className="flex items-center gap-3">
                        <Icon className={cn("h-4 w-4 shrink-0", s.cls)} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-foreground">{h.table}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {h.timeColumn ? `${h.timeColumn} · ${h.lagHours != null ? `${h.lagHours}h lag` : "—"}` : "no time column to check freshness"}
                          </p>
                        </div>
                        <span className={cn("shrink-0 text-[10px] font-medium", s.cls)}>{s.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Load duration */}
            <div className="rounded-xl border border-border bg-white p-5 shadow-card dark:bg-[#0e0f1a]">
              <h3 className="mb-4 text-sm font-semibold text-foreground">Load Duration by Flow</h3>
              {!loadDurations.length ? (
                <EmptyState message="No sync runs recorded yet." />
              ) : (
                <div className="space-y-3">
                  {loadDurations.map((d) => (
                    <div key={d.flowId} className="flex items-center gap-3">
                      <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-foreground">{d.destTable ?? d.sourceId}</p>
                        <p className="text-[10px] text-muted-foreground">
                          avg {fmtMs(d.avgMs)} · p95 {fmtMs(d.p95Ms)} · {d.runCount} runs
                        </p>
                      </div>
                      <span className={cn(
                        "shrink-0 text-[10px] font-medium",
                        d.lastStatus === "success" ? "text-emerald-600" : "text-rose-600"
                      )}>
                        {d.lastMs != null ? fmtMs(d.lastMs) : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Query cost by day */}
          <div className="rounded-xl border border-border bg-white p-5 shadow-card dark:bg-[#0e0f1a]">
            <h3 className="mb-1 text-sm font-semibold text-foreground">Query Cost — Last 7 Days</h3>
            <p className="mb-4 text-xs text-muted-foreground">
              Estimated at $6.25/TB scanned (on-demand pricing) from this service account&apos;s own job history — not an actual invoice.
            </p>
            {queryCost?.warning ? (
              <EmptyState message={queryCost.warning} />
            ) : !queryCost?.days.length ? (
              <EmptyState message="No query jobs recorded in the last 7 days." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="pb-2 font-medium">Date</th>
                      <th className="pb-2 font-medium">Jobs</th>
                      <th className="pb-2 font-medium">Bytes Scanned</th>
                      <th className="pb-2 font-medium">Est. Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {queryCost.days.map((d) => (
                      <tr key={d.date} className="border-b border-border/50 last:border-0">
                        <td className="py-2 font-medium text-foreground">{d.date}</td>
                        <td className="py-2 text-muted-foreground">{d.jobCount}</td>
                        <td className="py-2 text-muted-foreground">{fmtBytes(d.bytesProcessed)}</td>
                        <td className="py-2 text-muted-foreground">${d.estimatedUsd.toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
