"use client";

/**
 * Semantic Models — real, versioned, reusable SQL against BigQuery.
 * Every model shown here is a real row in the `models` table; every run
 * actually executes against BigQuery (see /api/models/[id]/run); every
 * version is a real pre-update snapshot (model_versions); every dependency
 * is a real SQL-parsed table reference, not a guess.
 *
 * Data sources:
 *   GET/POST /api/models              — list/create
 *   GET/PUT/DELETE /api/models/[id]   — detail (+ runs + versions), update, delete
 *   POST /api/models/[id]/run         — execute the saved model
 *   POST /api/models/preview          — execute unsaved SQL while editing
 */

import React from "react";
import {
  Layers, Plus, Trash2, Loader2, AlertTriangle, Play, ChevronRight, ChevronDown,
  History, Table2, CheckCircle2, XCircle, Clock, GitCommitHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { ModelStatus, SchemaColumn } from "@/lib/models-data";

// ── Types (mirror the API response shapes) ──────────────────────────────────

interface ModelListItem {
  id: string; name: string; description: string | null; sql_query: string;
  source_dataset: string | null; status: ModelStatus; version: number;
  tags: string[]; dependencies: string[]; created_at: number; updated_at: number;
}

interface ModelRun {
  id: string; status: "success" | "failed"; rows_returned: number | null;
  duration_ms: number | null; bytes_processed: number | null; error: string | null; ran_at: number;
}

interface ModelVersion {
  id: string; version: number; name: string; sql_query: string; created_at: number;
}

interface ModelDetail extends ModelListItem {
  schema: SchemaColumn[];
  runs: ModelRun[];
  versions: ModelVersion[];
  widgetCount: number;
}

interface RunResult {
  ok: boolean; rows?: Record<string, unknown>[]; schema?: SchemaColumn[];
  rowCount?: number; durationMs?: number; bytesProcessed?: number; capped?: boolean;
  error?: string; notConfigured?: boolean;
}

const STATUS_VARIANT: Record<ModelStatus, "neutral" | "success" | "warning"> = {
  draft: "neutral", published: "success", archived: "warning",
};

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-white/50 py-12 text-center dark:bg-[#0e0f1a]/50">
      <Layers className="h-7 w-7 text-muted-foreground/50" />
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function fmtBytes(b: number): string {
  if (b >= 1e9) return `${(b / 1e9).toFixed(2)} GB`;
  if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`;
  if (b >= 1e3) return `${(b / 1e3).toFixed(1)} KB`;
  return `${b} B`;
}

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ── New model form ───────────────────────────────────────────────────────────

function NewModelForm({ onCreated }: { onCreated: (id: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [sql, setSql] = React.useState("SELECT *\nFROM `dataset.table`\nLIMIT 100");
  const [saving, setSaving] = React.useState(false);
  const { toast } = useToast();

  async function submit() {
    if (!name.trim()) { toast.error("Name required"); return; }
    if (!sql.trim()) { toast.error("SQL required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), sql_query: sql }),
      });
      const data = await res.json();
      if (!data.ok) { toast.error("Could not create model", data.error ?? "Unknown error"); return; }
      toast.success("Model created", name.trim());
      setName(""); setSql("SELECT *\nFROM `dataset.table`\nLIMIT 100"); setOpen(false);
      onCreated(data.model.id);
    } catch {
      toast.error("Could not create model", "Network error.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="h-9 gap-2" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> New model
      </Button>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-white p-5 shadow-card dark:bg-[#0e0f1a] space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">New semantic model</h3>
      </div>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Monthly revenue by product"
        className="h-9 w-full rounded-lg border border-border bg-white px-3 text-sm dark:bg-[#0e0f1a] focus:outline-none focus:ring-2 focus:ring-brand-500" />
      <textarea value={sql} onChange={(e) => setSql(e.target.value)} rows={5} spellCheck={false}
        className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2 font-mono text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-brand-500" />
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
        <Button size="sm" onClick={submit} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Create model
        </Button>
      </div>
    </div>
  );
}

// ── Model detail / editor panel ──────────────────────────────────────────────

function ModelPanel({ id, onChanged, onDeleted }: { id: string; onChanged: () => void; onDeleted: () => void }) {
  const [detail, setDetail] = React.useState<ModelDetail | null>(null);
  const [sql, setSql] = React.useState("");
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [result, setResult] = React.useState<RunResult | null>(null);
  const [showVersions, setShowVersions] = React.useState(false);
  const { toast } = useToast();

  const load = React.useCallback(async () => {
    const data = await fetchJson<{ ok: boolean; model: ModelDetail; runs: ModelRun[]; versions: ModelVersion[]; widgetCount: number }>(`/api/models/${id}`);
    if (data?.ok) {
      const d = { ...data.model, runs: data.runs, versions: data.versions, widgetCount: data.widgetCount };
      setDetail(d);
      setSql(d.sql_query);
      setDirty(false);
    }
  }, [id]);

  React.useEffect(() => { load(); }, [load]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/models/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql_query: sql }),
      });
      const data = await res.json();
      if (!data.ok) { toast.error("Could not save", data.error ?? "Unknown error"); return; }
      toast.success("Model saved", `Now at v${data.model.version}`);
      await load();
      onChanged();
    } catch {
      toast.error("Could not save", "Network error.");
    } finally {
      setSaving(false);
    }
  }

  async function run() {
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch(`/api/models/${id}/run`, { method: "POST" });
      const data: RunResult = await res.json();
      setResult(data);
      if (!data.ok) toast.error("Run failed", data.error ?? "Unknown error");
      else toast.success("Run complete", `${data.rowCount} rows · ${fmtBytes(data.bytesProcessed ?? 0)}`);
      await load();
      onChanged();
    } catch {
      setResult({ ok: false, error: "Network error." });
    } finally {
      setRunning(false);
    }
  }

  async function remove() {
    try {
      const res = await fetch(`/api/models/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.ok) { toast.error("Could not delete", data.error ?? "Unknown error"); return; }
      toast.success("Model deleted");
      onDeleted();
    } catch {
      toast.error("Could not delete", "Network error.");
    }
  }

  function restoreVersion(v: ModelVersion) {
    setSql(v.sql_query);
    setDirty(true);
    toast.success("Version loaded into editor", `v${v.version} — click Save to restore it`);
  }

  if (!detail) {
    return <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4 px-5 pb-5">
      {detail.dependencies.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Depends on</span>
          {detail.dependencies.map((t) => (
            <Badge key={t} variant="info" className="gap-1 text-[10px]"><Table2 className="h-2.5 w-2.5" />{t}</Badge>
          ))}
        </div>
      )}

      <textarea
        value={sql}
        onChange={(e) => { setSql(e.target.value); setDirty(true); }}
        rows={8}
        spellCheck={false}
        className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2 font-mono text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-brand-500"
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={run} disabled={running}>
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Run
        </Button>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={save} disabled={saving || !dirty}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitCommitHorizontal className="h-3.5 w-3.5" />} Save {dirty && "(unsaved changes)"}
        </Button>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setShowVersions((v) => !v)}>
          <History className="h-3.5 w-3.5" /> Versions ({detail.versions.length + 1})
        </Button>
        <div className="flex-1" />
        <Button
          variant="outline" size="sm" className="h-8 gap-1.5 text-xs text-rose-600 hover:text-rose-600"
          onClick={remove} disabled={detail.widgetCount > 0}
          title={detail.widgetCount > 0 ? `${detail.widgetCount} widget(s) use this model` : undefined}
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </Button>
      </div>

      {result && (
        <div className={cn("rounded-lg border p-3", result.ok ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/10" : "border-rose-200 bg-rose-50/50 dark:border-rose-900 dark:bg-rose-950/10")}>
          {!result.ok ? (
            <p className="text-xs text-rose-700 dark:text-rose-400">{result.error}</p>
          ) : (
            <>
              <p className="mb-2 text-[11px] text-muted-foreground">
                {result.rowCount?.toLocaleString()} rows · {(result.durationMs ?? 0) / 1000}s · {fmtBytes(result.bytesProcessed ?? 0)} scanned
                {result.capped && " · capped"}
              </p>
              {result.rows && result.rows.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead>
                      <tr className="text-muted-foreground">
                        {Object.keys(result.rows[0]!).slice(0, 8).map((c) => <th key={c} className="pb-1.5 pr-4 font-medium">{c}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.slice(0, 10).map((r, i) => (
                        <tr key={i} className="border-t border-border/40">
                          {Object.keys(r).slice(0, 8).map((c) => (
                            <td key={c} className="py-1.5 pr-4 text-foreground">{r[c] === null ? "—" : String(r[c])}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {showVersions && (
        <div className="rounded-lg border border-border/60">
          <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2 text-xs">
            <span className="font-medium text-foreground">v{detail.version}</span>
            <span className="text-muted-foreground">current</span>
          </div>
          {detail.versions.length === 0 ? (
            <p className="px-3 py-3 text-[11px] text-muted-foreground">No earlier versions — this is the only revision.</p>
          ) : (
            detail.versions.map((v) => (
              <div key={v.id} className="flex items-center gap-2 border-b border-border/40 px-3 py-2 last:border-0 text-xs">
                <span className="font-medium text-foreground">v{v.version}</span>
                <span className="text-muted-foreground">{fmtTime(v.created_at)}</span>
                <div className="flex-1" />
                <button onClick={() => restoreVersion(v)} className="text-brand-600 hover:underline text-[11px]">Load into editor</button>
              </div>
            ))
          )}
        </div>
      )}

      <div>
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Recent runs</h4>
        {detail.runs.length === 0 ? (
          <p className="text-xs text-muted-foreground">Never run yet.</p>
        ) : (
          <div className="space-y-1.5">
            {detail.runs.slice(0, 5).map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-xs">
                {r.status === "success" ? <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-600" /> : <XCircle className="h-3 w-3 shrink-0 text-rose-600" />}
                <span className="text-muted-foreground">{fmtTime(r.ran_at)}</span>
                {r.status === "success" ? (
                  <span className="text-muted-foreground">{r.rows_returned?.toLocaleString()} rows · {r.duration_ms}ms</span>
                ) : (
                  <span className="truncate text-rose-600">{r.error}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ModelsPage() {
  const [models, setModels] = React.useState<ModelListItem[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const data = await fetchJson<{ ok: boolean; models: ModelListItem[] }>("/api/models");
    setLoading(false);
    if (!data?.ok) { setError("Could not reach the models endpoint."); return; }
    setModels(data.models);
  }, []);

  React.useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Models</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Versioned, reusable SQL against BigQuery — the foundation dashboards and widgets build on.
          </p>
        </div>
        <NewModelForm onCreated={(id) => { load(); setExpanded(id); }} />
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50/50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/10 dark:text-rose-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {!models && !error && loading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {models && models.length === 0 && !loading && (
        <EmptyState message="No models yet. Create one to save reusable SQL that dashboards and widgets can build on." />
      )}

      {models && models.length > 0 && (
        <div className="rounded-xl border border-border bg-white shadow-card dark:bg-[#0e0f1a]">
          {models.map((m) => {
            const isOpen = expanded === m.id;
            return (
              <div key={m.id} className="border-b border-border/60 last:border-0">
                <div
                  className="flex cursor-pointer items-center gap-3 px-5 py-3 hover:bg-accent/20 transition-colors"
                  onClick={() => setExpanded((prev) => (prev === m.id ? null : m.id))}
                >
                  {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                  <Layers className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{m.name}</p>
                    {m.description && <p className="text-[11px] text-muted-foreground truncate">{m.description}</p>}
                  </div>
                  <span className="shrink-0 text-[10px] text-muted-foreground">v{m.version}</span>
                  <Badge variant={STATUS_VARIANT[m.status]} className="shrink-0 text-[10px]">{m.status}</Badge>
                  <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                    <Clock className="h-2.5 w-2.5" /> {fmtTime(m.updated_at)}
                  </span>
                </div>
                {isOpen && <ModelPanel id={m.id} onChanged={load} onDeleted={() => { setExpanded(null); load(); }} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
