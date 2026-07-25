"use client";

/**
 * Dashboard builder — real widgets, each backed by a real Semantic Model,
 * rendered by the real 35-chart-type ChartEngine and run live against
 * BigQuery via /api/widgets/[id]/data. No mock data, no placeholder charts.
 *
 * There's no drag-resize grid library in this project's dependencies, so
 * layout is a plain CSS grid (12 columns) with numeric width/height
 * controls per widget rather than pulling in a new dependency for
 * something this doesn't strictly need.
 *
 * Data sources:
 *   GET/PUT /api/dashboards/[id]        — dashboard + widgets
 *   POST /api/dashboards/[id]/share     — generate/revoke public link
 *   POST/PUT/DELETE /api/widgets[...]   — widget CRUD
 *   POST /api/widgets/[id]/data         — run a widget's model live
 *   GET /api/models                     — model picker
 */

import React, { use } from "react";
import Link from "next/link";
import {
  ArrowLeft, Plus, Loader2, AlertTriangle, Share2, Copy, X, Trash2,
  Settings2, LayoutDashboard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { ChartEngine } from "@/components/charts/chart-engine";
import { ALL_CHART_TYPES, CHART_LABELS, type ChartType, type WidgetConfig, type SchemaColumn } from "@/lib/models-data";
import { ROUTES } from "@/config/routes";

// ── Types ─────────────────────────────────────────────────────────────────────

interface WidgetPosition { x: number; y: number; w: number; h: number }

interface Widget {
  id: string; name: string; chart_type: ChartType; model_id: string;
  config: WidgetConfig; position: WidgetPosition;
}

interface DashboardDetail {
  id: string; name: string; description: string | null; theme: string;
  is_published: boolean; share_token: string | null; widgets: Widget[];
}

interface ModelOption { id: string; name: string; status: string; schema: SchemaColumn[] }

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── Widget card: fetches + renders its own live data ─────────────────────────

function WidgetCard({ widget, onDelete }: { widget: Widget; onDelete: () => void }) {
  const [rows, setRows] = React.useState<Record<string, unknown>[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [meta, setMeta] = React.useState<{ rowCount: number; durationMs: number; bytesProcessed: number } | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/widgets/${widget.id}/data`, { method: "POST" });
      const data = await res.json();
      if (!data.ok) { setError(data.error ?? "Could not load widget data."); return; }
      setRows(data.rows);
      setMeta({ rowCount: data.rowCount, durationMs: data.durationMs, bytesProcessed: data.bytesProcessed });
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [widget.id]);

  React.useEffect(() => { load(); }, [load]);

  return (
    <div
      className="flex flex-col rounded-xl border border-border bg-white p-4 shadow-card dark:bg-[#0e0f1a]"
      style={{ gridColumn: `span ${Math.min(widget.position.w || 6, 12)}`, minHeight: (widget.position.h || 4) * 70 }}
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground truncate">{widget.name}</p>
        <div className="flex items-center gap-1">
          <button onClick={load} className="text-muted-foreground hover:text-foreground" title="Refresh">
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <span className="text-[10px]">↻</span>}
          </button>
          <button onClick={onDelete} className="text-muted-foreground hover:text-rose-600" title="Delete widget">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
      <div className="flex-1">
        <ChartEngine
          chartType={widget.chart_type}
          data={rows ?? []}
          config={widget.config}
          height={(widget.position.h || 4) * 60}
          loading={loading}
          error={error}
        />
      </div>
      {meta && !loading && !error && (
        <p className="mt-2 text-[9px] text-muted-foreground/70">{meta.rowCount.toLocaleString()} rows · {meta.durationMs}ms</p>
      )}
    </div>
  );
}

// ── Add widget form ──────────────────────────────────────────────────────────

function AddWidgetForm({ dashboardId, models, onCreated }: { dashboardId: string; models: ModelOption[]; onCreated: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [modelId, setModelId] = React.useState(models[0]?.id ?? "");
  const [chartType, setChartType] = React.useState<ChartType>("bar");
  const [xField, setXField] = React.useState("");
  const [yField, setYField] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const { toast } = useToast();

  React.useEffect(() => {
    if (!models.some((m) => m.id === modelId)) setModelId(models[0]?.id ?? "");
  }, [models, modelId]);

  const selectedModel = models.find((m) => m.id === modelId);

  async function submit() {
    if (!name.trim()) { toast.error("Name required"); return; }
    if (!modelId) { toast.error("Pick a model", "Create a Semantic Model first."); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/widgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dashboard_id: dashboardId,
          model_id: modelId,
          name: name.trim(),
          chart_type: chartType,
          config: { xField: xField || undefined, yField: yField || undefined },
          position: { x: 0, y: 0, w: 6, h: 4 },
        }),
      });
      const data = await res.json();
      if (!data.ok) { toast.error("Could not create widget", data.error ?? "Unknown error"); return; }
      toast.success("Widget added", name.trim());
      setName(""); setXField(""); setYField(""); setOpen(false);
      onCreated();
    } catch {
      toast.error("Could not create widget", "Network error.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="h-9 gap-2" onClick={() => setOpen(true)} disabled={models.length === 0}
        title={models.length === 0 ? "Create a Semantic Model first" : undefined}>
        <Plus className="h-4 w-4" /> Add widget
      </Button>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-white p-5 shadow-card dark:bg-[#0e0f1a] space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">New widget</h3>
        <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Revenue by product"
            className="h-9 w-full rounded-lg border border-border bg-white px-3 text-sm dark:bg-[#0e0f1a] focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Model</label>
          <select value={modelId} onChange={(e) => setModelId(e.target.value)}
            className="h-9 w-full rounded-lg border border-border bg-white px-3 text-sm dark:bg-[#0e0f1a] focus:outline-none focus:ring-2 focus:ring-brand-500">
            {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Chart type</label>
          <select value={chartType} onChange={(e) => setChartType(e.target.value as ChartType)}
            className="h-9 w-full rounded-lg border border-border bg-white px-3 text-sm dark:bg-[#0e0f1a] focus:outline-none focus:ring-2 focus:ring-brand-500">
            {ALL_CHART_TYPES.map((t) => <option key={t} value={t}>{CHART_LABELS[t]}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">X / category field</label>
          {selectedModel?.schema.length ? (
            <select value={xField} onChange={(e) => setXField(e.target.value)}
              className="h-9 w-full rounded-lg border border-border bg-white px-3 text-sm dark:bg-[#0e0f1a] focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="">Auto (first column)</option>
              {selectedModel.schema.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          ) : (
            <input value={xField} onChange={(e) => setXField(e.target.value)} placeholder="Auto (first column)"
              className="h-9 w-full rounded-lg border border-border bg-white px-3 text-sm dark:bg-[#0e0f1a] focus:outline-none focus:ring-2 focus:ring-brand-500" />
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Y / value field</label>
          {selectedModel?.schema.length ? (
            <select value={yField} onChange={(e) => setYField(e.target.value)}
              className="h-9 w-full rounded-lg border border-border bg-white px-3 text-sm dark:bg-[#0e0f1a] focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="">Auto (second column)</option>
              {selectedModel.schema.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          ) : (
            <input value={yField} onChange={(e) => setYField(e.target.value)} placeholder="Auto (second column)"
              className="h-9 w-full rounded-lg border border-border bg-white px-3 text-sm dark:bg-[#0e0f1a] focus:outline-none focus:ring-2 focus:ring-brand-500" />
          )}
        </div>
      </div>
      {!selectedModel?.schema.length && selectedModel && (
        <p className="text-[11px] text-amber-600">This model has no schema yet — run it once in Models to enable field pickers, or type field names manually.</p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
        <Button size="sm" onClick={submit} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add widget
        </Button>
      </div>
    </div>
  );
}

// ── Share panel ───────────────────────────────────────────────────────────────

function SharePanel({ dashboard, onChanged }: { dashboard: DashboardDetail; onChanged: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const { toast } = useToast();

  async function toggle() {
    setBusy(true);
    try {
      const res = await fetch(`/api/dashboards/${dashboard.id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: dashboard.is_published ? "revoke" : "generate" }),
      });
      const data = await res.json();
      if (!data.ok) { toast.error("Could not update sharing"); return; }
      toast.success(dashboard.is_published ? "Sharing revoked" : "Share link created");
      onChanged();
    } catch {
      toast.error("Could not update sharing", "Network error.");
    } finally {
      setBusy(false);
    }
  }

  function copyLink() {
    const url = `${window.location.origin}${ROUTES.SHARED_DASHBOARD(dashboard.share_token ?? "")}`;
    navigator.clipboard.writeText(url).catch(() => {});
    toast.success("Link copied");
  }

  return (
    <div className="relative">
      <Button variant="outline" size="sm" className="h-9 gap-2" onClick={() => setOpen((v) => !v)}>
        <Share2 className="h-4 w-4" /> {dashboard.is_published ? "Shared" : "Share"}
      </Button>
      {open && (
        <div className="absolute right-0 top-10 z-10 w-72 rounded-xl border border-border bg-white p-4 shadow-lg dark:bg-[#0e0f1a]">
          <p className="mb-2 text-xs text-muted-foreground">
            {dashboard.is_published
              ? "Anyone with this link can view this dashboard (read-only, live data). No model SQL is exposed."
              : "Generate a public read-only link. No login required to view."}
          </p>
          {dashboard.is_published && dashboard.share_token && (
            <div className="mb-2 flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-2 py-1.5">
              <span className="flex-1 truncate text-[10px] font-mono text-foreground">{ROUTES.SHARED_DASHBOARD(dashboard.share_token)}</span>
              <button onClick={copyLink} className="text-muted-foreground hover:text-foreground"><Copy className="h-3 w-3" /></button>
            </div>
          )}
          <Button size="sm" variant={dashboard.is_published ? "destructive" : "default"} className="h-8 w-full text-xs" onClick={toggle} disabled={busy}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : dashboard.is_published ? "Revoke link" : "Generate link"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [dashboard, setDashboard] = React.useState<DashboardDetail | null>(null);
  const [models, setModels] = React.useState<ModelOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const [dashRes, modelsRes] = await Promise.all([
      fetchJson<{ ok: boolean; dashboard: DashboardDetail }>(`/api/dashboards/${id}`),
      fetchJson<{ ok: boolean; models: ModelOption[] }>("/api/models"),
    ]);
    setLoading(false);
    if (!dashRes?.ok) { setError("Dashboard not found."); return; }
    setDashboard(dashRes.dashboard);
    setModels(modelsRes?.models ?? []);
  }, [id]);

  React.useEffect(() => { load(); }, [load]);

  async function deleteWidget(widgetId: string) {
    if (!dashboard) return;
    setDashboard({ ...dashboard, widgets: dashboard.widgets.filter((w) => w.id !== widgetId) });
    await fetch(`/api/widgets/${widgetId}`, { method: "DELETE" });
    load();
  }

  if (loading && !dashboard) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (error || !dashboard) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50/50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/10 dark:text-rose-400">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error ?? "Dashboard not found."}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={ROUTES.DASHBOARDS} className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /></Link>
          <div>
            <h1 className="text-xl font-bold text-foreground">{dashboard.name}</h1>
            {dashboard.description && <p className="mt-0.5 text-sm text-muted-foreground">{dashboard.description}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AddWidgetForm dashboardId={dashboard.id} models={models} onCreated={load} />
          <SharePanel dashboard={dashboard} onChanged={load} />
        </div>
      </div>

      {models.length === 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/10 dark:text-amber-400">
          <Settings2 className="h-4 w-4 shrink-0" />
          No Semantic Models yet — <Link href={ROUTES.MODELS} className="underline">create one</Link> before adding widgets.
        </div>
      )}

      {dashboard.widgets.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-white/50 py-16 text-center dark:bg-[#0e0f1a]/50">
          <LayoutDashboard className="h-8 w-8 text-muted-foreground/50" />
          <p className="max-w-sm text-sm text-muted-foreground">No widgets yet. Add one above to start visualizing a Semantic Model.</p>
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-4">
          {dashboard.widgets.map((w) => (
            <WidgetCard key={w.id} widget={w} onDelete={() => deleteWidget(w.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
