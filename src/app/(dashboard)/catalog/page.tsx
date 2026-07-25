"use client";

/**
 * Data Catalog — real, persisted metadata discovered from your connected
 * sources (Shopify, HubSpot, Stripe, PostgreSQL, etc.): tables, columns,
 * types, and freshness. No mock data.
 *
 * Data sources:
 *   GET  /api/catalog?search=&connector=  — search/browse discovered tables + columns
 *   POST /api/catalog/refresh             — re-run schema discovery for every
 *                                            connector with saved credentials
 *   GET  /api/connectors/catalog          — connector metadata (name/color) for badges
 */

import React from "react";
import {
  Search, RefreshCw, Loader2, AlertTriangle, Database, ChevronRight,
  Table2, Clock, Hash,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

// ── Types (mirror the API response shapes) ──────────────────────────────────

interface CatalogColumn {
  name: string;
  type: string;
  nullable: boolean;
  description: string | null;
}

interface CatalogTable {
  id: string;
  connectorId: string;
  schemaName: string | null;
  tableName: string;
  fullName: string;
  description: string | null;
  rowCount: number;
  columnCount: number;
  ownerEmail: string | null;
  lastSyncedAt: string | null;
  freshnessHours: number | null;
  tags: string[];
  columns: CatalogColumn[];
}

interface ConnectorMeta { id: string; name: string; color: string }

async function fetchCatalog(search: string, connector: string): Promise<CatalogTable[] | null> {
  try {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (connector) params.set("connector", connector);
    const res = await fetch(`/api/catalog?${params.toString()}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.tables ?? [];
  } catch { return null; }
}

async function fetchConnectorMeta(): Promise<Map<string, ConnectorMeta>> {
  try {
    const res = await fetch("/api/connectors/catalog");
    const data = await res.json();
    const map = new Map<string, ConnectorMeta>();
    for (const c of data.catalog ?? []) map.set(c.id, { id: c.id, name: c.name, color: c.color });
    return map;
  } catch { return new Map(); }
}

// ── Presentational pieces ────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-white/50 py-16 text-center dark:bg-[#0e0f1a]/50">
      <Database className="h-8 w-8 text-muted-foreground/50" />
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

// The freshness_hours column the API returns is written as a hardcoded 0 on
// every discovery run (never actually computed server-side), so it can't be
// trusted to reflect real staleness. lastSyncedAt is a genuine timestamp
// written at discovery time, so freshness is computed from that instead.
function freshnessLabel(lastSyncedAt: string | null): { label: string; cls: string } {
  if (!lastSyncedAt) return { label: "Unknown", cls: "text-muted-foreground" };
  const hours = (Date.now() - new Date(lastSyncedAt).getTime()) / 3_600_000;
  if (hours < 0) return { label: "Unknown", cls: "text-muted-foreground" };
  if (hours < 1) return { label: "Just now", cls: "text-emerald-600" };
  if (hours < 24) return { label: `${Math.round(hours)}h ago`, cls: "text-emerald-600" };
  if (hours < 24 * 7) return { label: `${Math.round(hours / 24)}d ago`, cls: "text-amber-600" };
  return { label: `${Math.round(hours / 24)}d ago`, cls: "text-rose-600" };
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CatalogPage() {
  const [tables, setTables] = React.useState<CatalogTable[] | null>(null);
  const [connectorMeta, setConnectorMeta] = React.useState<Map<string, ConnectorMeta>>(new Map());
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [connectorFilter, setConnectorFilter] = React.useState("");
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const { toast } = useToast();

  // Guards against out-of-order responses: rapid search/filter changes fire
  // independent requests with no inherent ordering, so a slower earlier
  // request resolving after a faster later one would otherwise overwrite
  // the correct result with stale data. Only the most recently *issued*
  // request is allowed to commit state.
  const requestSeq = React.useRef(0);

  const load = React.useCallback(async (s: string, c: string) => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    const [rows, meta] = await Promise.all([fetchCatalog(s, c), fetchConnectorMeta()]);
    if (seq !== requestSeq.current) return; // a newer request superseded this one
    setLoading(false);
    if (rows === null) {
      setError("Could not reach the catalog endpoint.");
      return;
    }
    setTables(rows);
    setConnectorMeta(meta);
  }, []);

  React.useEffect(() => { load("", ""); }, [load]);

  // Debounced search/filter re-fetch
  React.useEffect(() => {
    const t = setTimeout(() => load(search, connectorFilter), 300);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, connectorFilter]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/catalog/refresh", { method: "POST" });
      const data = await res.json();
      if (data.errors?.length) {
        toast.error("Catalog refresh had errors", `${data.tablesUpserted} tables synced, ${data.errors.length} connector(s) failed.`);
      } else {
        toast.success("Catalog refreshed", `${data.tablesUpserted} tables, ${data.columnsUpserted} columns discovered.`);
      }
      await load(search, connectorFilter);
    } catch {
      toast.error("Refresh failed", "Network error.");
    } finally {
      setRefreshing(false);
    }
  }

  const connectorOptions = Array.from(connectorMeta.values());

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Data Catalog</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Tables and columns discovered from your connected sources — searchable, with freshness and tags.
          </p>
        </div>
        <Button variant="outline" size="sm" className="h-9 gap-2" onClick={handleRefresh} disabled={refreshing}>
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {refreshing ? "Discovering…" : "Refresh"}
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50/50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/10 dark:text-rose-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Search + filter */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tables or descriptions…"
            className="h-9 w-full rounded-lg border border-border bg-white pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-500 dark:bg-[#0e0f1a]"
          />
        </div>
        {connectorOptions.length > 0 && (
          <select
            value={connectorFilter}
            onChange={(e) => setConnectorFilter(e.target.value)}
            className="h-9 rounded-lg border border-border bg-white px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-500 dark:bg-[#0e0f1a]"
          >
            <option value="">All connectors</option>
            {connectorOptions.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </div>

      {!tables && !error && loading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {tables && tables.length === 0 && !loading && (
        <EmptyState message={
          search || connectorFilter
            ? "No tables match your search."
            : "No tables cataloged yet. Connect a source with credentials in a flow, then click Refresh to discover its schema."
        } />
      )}

      {tables && tables.length > 0 && (
        <div className="rounded-xl border border-border bg-white shadow-card dark:bg-[#0e0f1a]">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground bg-muted/20">
                <th className="px-5 pb-2 pt-3 font-medium">Table</th>
                <th className="px-3 pb-2 pt-3 font-medium">Source</th>
                <th className="px-3 pb-2 pt-3 font-medium">Columns</th>
                <th className="px-3 pb-2 pt-3 font-medium">Rows</th>
                <th className="px-3 pb-2 pt-3 font-medium">Freshness</th>
                <th className="px-3 pb-2 pt-3 pr-5 font-medium">Tags</th>
              </tr>
            </thead>
            <tbody>
              {tables.map((t) => {
                const meta = connectorMeta.get(t.connectorId);
                const fresh = freshnessLabel(t.lastSyncedAt);
                const isOpen = expanded === t.id;
                return (
                  <React.Fragment key={t.id}>
                    <tr
                      className="border-b border-border/50 last:border-0 cursor-pointer hover:bg-accent/20 transition-colors"
                      onClick={() => setExpanded((prev) => (prev === t.id ? null : t.id))}
                    >
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <ChevronRight className={cn("h-3 w-3 shrink-0 text-muted-foreground/50 transition-transform", isOpen && "rotate-90")} />
                          <Table2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="font-medium text-foreground">{t.fullName}</span>
                        </div>
                        {t.description && <p className="ml-9 mt-0.5 text-[10px] text-muted-foreground truncate max-w-md">{t.description}</p>}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                          style={{ backgroundColor: meta?.color ?? "#6366f1" }}
                        >
                          {meta?.name ?? t.connectorId}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">{t.columnCount}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{t.rowCount ? t.rowCount.toLocaleString() : "—"}</td>
                      <td className={cn("px-3 py-2.5 font-medium", fresh.cls)}>{fresh.label}</td>
                      <td className="px-3 py-2.5 pr-5">
                        {t.tags.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {t.tags.map((tag) => <Badge key={tag} variant="neutral" className="text-[9px]">{tag}</Badge>)}
                          </div>
                        ) : <span className="text-muted-foreground/50">—</span>}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-border/50">
                        <td colSpan={6} className="bg-muted/20 px-5 py-3">
                          {t.columns.length === 0 ? (
                            <p className="text-[11px] text-muted-foreground">No column metadata recorded for this table.</p>
                          ) : (
                            <table className="w-full text-left text-[11px]">
                              <thead>
                                <tr className="text-muted-foreground">
                                  <th className="pb-1.5 pr-4 font-medium">Column</th>
                                  <th className="pb-1.5 pr-4 font-medium">Type</th>
                                  <th className="pb-1.5 pr-4 font-medium">Nullable</th>
                                  <th className="pb-1.5 font-medium">Description</th>
                                </tr>
                              </thead>
                              <tbody>
                                {t.columns.map((c) => (
                                  <tr key={c.name} className="border-t border-border/40">
                                    <td className="py-1.5 pr-4 font-mono text-foreground flex items-center gap-1.5">
                                      <Hash className="h-2.5 w-2.5 text-muted-foreground/60" />
                                      {c.name}
                                    </td>
                                    <td className="py-1.5 pr-4 text-muted-foreground font-mono">{c.type}</td>
                                    <td className="py-1.5 pr-4 text-muted-foreground">{c.nullable ? "Yes" : "No"}</td>
                                    <td className="py-1.5 text-muted-foreground">{c.description ?? "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                          {t.lastSyncedAt && (
                            <p className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground/70">
                              <Clock className="h-2.5 w-2.5" /> Last discovered {new Date(t.lastSyncedAt).toLocaleString()}
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
