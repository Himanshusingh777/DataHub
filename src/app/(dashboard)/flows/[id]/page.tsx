"use client";

import React, { use } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Zap, Pause, Play, Trash2, Settings,
  CheckCircle2, XCircle, RefreshCw, Clock, ChevronDown,
  AlertTriangle, ArrowRight, RotateCcw, Database, Table2,
  Loader2, Check, AlertCircle, Edit2, X, BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatNumber } from "@/lib/utils";
import { ROUTES } from "@/config/routes";
import {
  MOCK_FLOWS,
  type DataFlow, type FlowStatus, type FlowRun, type LogLevel,
} from "@/lib/flows-data";
import { useDemoStore, getAllFlows } from "@/stores/demo.store";
import { useServerFlows } from "@/hooks/use-server-flows";
import { SchemaService, type ObjectSchema } from "@/services/schema.service";
import { generateInsights, generateSyncKPIs, runAgent, formatKPIValue, type AgentResponse } from "@/lib/engine";
import { InsightsPanel, AutoDashboard, ChartCard } from "@/components/engine/auto-dashboard";
import { WarehouseService } from "@/services/warehouse.service";
import { BackendService } from "@/services/backend.service";
import { ConnectorService } from "@/services/connector.service";
import { SCHEDULE_OPTIONS } from "@/services/scheduler.service";

// ── Configs ───────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<FlowStatus, { dot: string; cls: string; label: string }> = {
  active:  { dot: "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,.5)]", cls: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20", label: "Active" },
  error:   { dot: "bg-rose-500",   cls: "text-rose-600 bg-rose-50 dark:bg-rose-950/20",    label: "Error"   },
  paused:  { dot: "bg-amber-400",  cls: "text-amber-600 bg-amber-50 dark:bg-amber-950/20", label: "Paused"  },
  draft:   { dot: "bg-muted-foreground/30", cls: "text-muted-foreground bg-muted",          label: "Draft"   },
};

const RUN_CFG: Record<string, { icon: React.ElementType; cls: string; label: string }> = {
  success:   { icon: CheckCircle2, cls: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20", label: "Success"   },
  failed:    { icon: XCircle,      cls: "text-rose-600 bg-rose-50 dark:bg-rose-950/20",          label: "Failed"    },
  running:   { icon: RefreshCw,    cls: "text-blue-600 bg-blue-50 dark:bg-blue-950/20",          label: "Running"   },
  queued:    { icon: Clock,        cls: "text-amber-600 bg-amber-50 dark:bg-amber-950/20",        label: "Queued"    },
  retrying:  { icon: RotateCcw,    cls: "text-amber-600 bg-amber-50 dark:bg-amber-950/20",        label: "Retrying"  },
  paused:    { icon: Pause,        cls: "text-amber-600 bg-amber-50 dark:bg-amber-950/20",        label: "Paused"    },
  cancelled: { icon: XCircle,      cls: "text-muted-foreground bg-muted",                        label: "Cancelled" },
};

const LOG_CFG: Record<LogLevel, { cls: string; label: string }> = {
  info:    { cls: "text-blue-600 bg-blue-50 dark:bg-blue-950/20",          label: "INFO"  },
  debug:   { cls: "text-muted-foreground bg-muted",                        label: "DEBUG" },
  warn:    { cls: "text-amber-700 bg-amber-50 dark:bg-amber-950/20",       label: "WARN"  },
  error:   { cls: "text-rose-600 bg-rose-50 dark:bg-rose-950/20",          label: "ERROR" },
  success: { cls: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20", label: "OK"    },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSourceSlug(flow: DataFlow): string {
  // Map source id/name to connector slug for SchemaService
  const name = flow.source.id.toLowerCase().replace(/[^a-z0-9]/g, "_");
  const map: Record<string, string> = {
    shopify: "shopify", stripe: "stripe", hubspot: "hubspot",
    salesforce: "salesforce", instantly: "instantly",
    postgresql: "postgresql", bigquery: "bigquery",
  };
  return map[name] ?? name;
}

// ── Inline log viewer ─────────────────────────────────────────────────────────

function InlineLogs({ run }: { run: FlowRun }) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="overflow-hidden"
    >
      <div className="border-t border-border bg-[#f8f9fc] dark:bg-[#080910]">
        <div className="px-5 py-3 space-y-1">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Sync log · {run.id} · {run.logs.length} {run.logs.length === 1 ? "entry" : "entries"}
          </p>
          {run.logs.map((log) => {
            const cfg = LOG_CFG[log.level];
            return (
              <div key={log.id} className="flex items-start gap-3 font-mono text-[11px]">
                <span className="shrink-0 text-muted-foreground/60 w-16 pt-0.5">
                  {new Date(log.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
                <span className={cn("shrink-0 rounded px-1.5 py-0.5 font-bold text-[9px] tracking-wide", cfg.cls)}>
                  {cfg.label}
                </span>
                <span className={cn("flex-1 leading-relaxed", log.level === "error" ? "text-rose-700 dark:text-rose-400" : "text-foreground/80")}>
                  {log.message}
                  {log.meta && (
                    <span className="ml-2 text-muted-foreground/50">
                      {Object.entries(log.meta).map(([k, v]) => `${k}=${v}`).join(" ")}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

// ── Edit Schedule Modal ───────────────────────────────────────────────────────

function EditScheduleModal({
  current,
  onSave,
  onClose,
}: {
  current: string;
  onSave: (value: string) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = React.useState(current);

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="w-full max-w-md rounded-2xl border border-border bg-white dark:bg-[#0e0f1a] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-bold text-foreground">Edit Schedule</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-2">
          {SCHEDULE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSelected(opt.value)}
              className={cn(
                "w-full flex items-center gap-4 rounded-xl border px-4 py-3 text-left transition-all",
                selected === opt.value
                  ? "border-brand-500 bg-brand-50/50 dark:bg-brand-950/20"
                  : "border-border hover:border-brand-300 bg-white dark:bg-[#0e0f1a]"
              )}
            >
              <div className="flex-1">
                <p className={cn("text-sm font-semibold", selected === opt.value ? "text-brand-700 dark:text-brand-400" : "text-foreground")}>
                  {opt.label}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
              </div>
              {selected === opt.value && (
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 shrink-0">
                  <Check className="h-3 w-3 text-white" />
                </div>
              )}
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => { onSave(selected); onClose(); }}>
            Save schedule
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Delete Confirm Modal ──────────────────────────────────────────────────────

function DeleteFlowModal({ flow, onConfirm, onClose }: {
  flow: DataFlow;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="w-full max-w-sm rounded-2xl border border-border bg-white dark:bg-[#0e0f1a] shadow-2xl"
      >
        <div className="p-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-950/30 mb-4">
            <Trash2 className="h-5 w-5 text-rose-600" />
          </div>
          <h2 className="text-base font-bold text-foreground mb-1">Delete this flow?</h2>
          <p className="text-sm text-muted-foreground mb-6">
            <span className="font-medium text-foreground">{flow.source.name} → {flow.destination.name}</span>{" "}
            will be permanently deleted. Run history, logs, and all sync data will be removed. This cannot be undone.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" size="sm" onClick={onClose}>Cancel</Button>
            <Button variant="destructive" className="flex-1" size="sm" onClick={onConfirm}>
              Delete flow
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ── Schema Panel ──────────────────────────────────────────────────────────────

function SchemaPanel({ slug }: { slug: string }) {
  const [schemas, setSchemas] = React.useState<ObjectSchema[]>([]);
  const [activeId, setActiveId] = React.useState<string>("");
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    setLoading(true);
    SchemaService.getConnectorSchema(slug)
      .then((s) => {
        setSchemas(s);
        setActiveId(s[0]?.id ?? "");
      })
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const schema = schemas.find((s) => s.id === activeId);

  return (
    <div className="space-y-4">
      {/* Object tabs */}
      {schemas.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {schemas.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveId(s.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                activeId === s.id
                  ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-700 dark:bg-brand-950/20 dark:text-brand-400"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              <Table2 className="h-3 w-3" />
              {s.name}
              <span className="text-[10px] text-muted-foreground">{s.fields.length} cols</span>
            </button>
          ))}
        </div>
      )}

      {schema ? (
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2.5">
            <p className="text-xs font-semibold text-foreground">{schema.name}</p>
            <span className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-medium",
              schema.syncMode === "incremental"
                ? "text-blue-700 bg-blue-50 dark:bg-blue-950/30 dark:text-blue-400"
                : "text-violet-700 bg-violet-50 dark:bg-violet-950/30 dark:text-violet-400"
            )}>
              {schema.syncMode === "incremental" ? "Incremental" : "Full Refresh"}
            </span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="py-2 pl-4 pr-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Column</th>
                <th className="py-2 px-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Type</th>
                <th className="py-2 px-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Nullable</th>
                <th className="py-2 px-2 pr-4 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hidden lg:table-cell">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {schema.fields.map((f) => (
                <tr key={f.name} className="bg-white dark:bg-[#0e0f1a]">
                  <td className="py-2 pl-4 pr-2 font-mono text-xs text-foreground">
                    <div className="flex items-center gap-1.5">
                      {f.isPrimaryKey && <span title="Primary key" className="text-amber-500 text-[10px]">🔑</span>}
                      {f.isForeignKey && <span title="Foreign key" className="text-blue-500 text-[10px]">🔗</span>}
                      {f.name}
                    </div>
                  </td>
                  <td className="py-2 px-2">
                    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium font-mono", SchemaService.typeColor(f.type))}>
                      {SchemaService.formatType(f.type)}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-xs text-muted-foreground">
                    {f.nullable ? "Yes" : <span className="font-medium text-foreground">No</span>}
                  </td>
                  <td className="py-2 px-2 pr-4 text-xs text-muted-foreground hidden lg:table-cell">{f.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="py-10 text-center text-sm text-muted-foreground">No schema available for this source.</div>
      )}
    </div>
  );
}

// ── Mapped Columns Panel ──────────────────────────────────────────────────────

function MappedColumnsPanel({ flow }: { flow: DataFlow }) {
  // Build synthetic mapped columns from the source name
  const DEMO_MAPPINGS: Record<string, { src: string; dst: string; type: string }[]> = {
    Shopify: [
      { src: "id",              dst: "order_id",      type: "string" },
      { src: "name",            dst: "order_name",    type: "string" },
      { src: "email",           dst: "email",         type: "string" },
      { src: "total_price",     dst: "total_price",   type: "number" },
      { src: "financial_status",dst: "payment_status",type: "string" },
      { src: "created_at",      dst: "created_at",    type: "timestamp" },
      { src: "customer_id",     dst: "customer_id",   type: "string" },
    ],
    Instantly: [
      { src: "id",          dst: "campaign_id",   type: "uuid" },
      { src: "name",        dst: "campaign_name", type: "string" },
      { src: "status",      dst: "status",        type: "string" },
      { src: "leads_count", dst: "leads_count",   type: "number" },
      { src: "open_rate",   dst: "open_rate",     type: "number" },
      { src: "reply_rate",  dst: "reply_rate",    type: "number" },
      { src: "created_at",  dst: "created_at",    type: "timestamp" },
    ],
    Stripe: [
      { src: "id",       dst: "charge_id",  type: "string" },
      { src: "amount",   dst: "amount",     type: "number" },
      { src: "currency", dst: "currency",   type: "string" },
      { src: "status",   dst: "status",     type: "string" },
      { src: "customer", dst: "customer_id",type: "string" },
      { src: "created",  dst: "created_at", type: "timestamp" },
    ],
    HubSpot: [
      { src: "id",             dst: "contact_id",    type: "uuid" },
      { src: "email",          dst: "email",         type: "string" },
      { src: "firstname",      dst: "first_name",    type: "string" },
      { src: "lastname",       dst: "last_name",     type: "string" },
      { src: "company",        dst: "company",       type: "string" },
      { src: "lifecyclestage", dst: "lifecycle",     type: "string" },
    ],
  };

  const mappings = DEMO_MAPPINGS[flow.source.name] ?? [
    { src: "id",         dst: "id",         type: "string" },
    { src: "created_at", dst: "created_at", type: "timestamp" },
    { src: "updated_at", dst: "updated_at", type: "timestamp" },
  ];

  const typeColor = (t: string) => {
    const m: Record<string, string> = {
      string:    "text-blue-700 bg-blue-50 dark:bg-blue-950/30 dark:text-blue-400",
      number:    "text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400",
      timestamp: "text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400",
      uuid:      "text-slate-700 bg-slate-50 dark:bg-slate-950/30 dark:text-slate-400",
      boolean:   "text-purple-700 bg-purple-50 dark:bg-purple-950/30 dark:text-purple-400",
    };
    return m[t] ?? "text-muted-foreground bg-muted";
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="grid grid-cols-[1fr_auto_1fr_auto] gap-0 border-b border-border bg-muted/40 px-4 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Source ({flow.source.name})</p>
        <div className="w-8" />
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Destination ({flow.destination.name})</p>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground pl-2">Type</p>
      </div>
      <div className="divide-y divide-border">
        {mappings.map((m) => (
          <div key={m.src} className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-0 bg-white dark:bg-[#0e0f1a] px-4 py-2.5">
            <p className="font-mono text-xs text-foreground">{m.src}</p>
            <ArrowRight className="h-3 w-3 text-muted-foreground/40 mx-2" />
            <p className="font-mono text-xs text-foreground">{m.dst}</p>
            <span className={cn("ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium font-mono", typeColor(m.type))}>
              {m.type}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Warehouse Dashboard tab (auto-generated from real BigQuery data) ─────────

function WarehouseDashboardTab({ flow }: { flow: DataFlow }) {
  const initialGuess =
    flow.warehouseTable ??
    (flow.source.id === "instantly" ? "instantly_campaigns" : null);

  const [configured, setConfigured] = React.useState<boolean | null>(null); // null = checking
  const [tables, setTables] = React.useState<string[]>([]);
  const [table, setTable]   = React.useState<string | null>(initialGuess);
  const [rows, setRows]     = React.useState<Record<string, unknown>[] | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    WarehouseService.isWarehouseConfigured().then(setConfigured);
  }, []);

  // No stored table (older CSV flows): list warehouse tables and pick the best guess
  React.useEffect(() => {
    if (!configured || table) return;
    WarehouseService.queryWarehouse("list_tables").then((r) => {
      const names = (r ?? []).map((x: any) => String(x.table_name)).filter(Boolean);
      setTables(names);
      const cand = flow.source.id === "csv"
        ? names.find((n) => !n.startsWith("instantly")) ?? names[0]
        : names[0];
      if (cand) setTable(cand);
      else setLoading(false);
    });
  }, [configured]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch real rows from the warehouse
  React.useEffect(() => {
    if (!configured || !table) return;
    setLoading(true);
    WarehouseService.queryWarehouse("table_preview", { table, limit: "200" }).then((r) => {
      setRows(r);
      setLoading(false);
    });
  }, [table, configured]);

  // Still checking vault
  if (configured === null) {
    return (
      <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking warehouse…
      </div>
    );
  }

  if (!configured) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        BigQuery is not configured — set up the destination in a flow first.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Source line + table picker */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-muted-foreground">
          Auto-generated from <span className="font-semibold text-foreground">BigQuery · {table ?? "—"}</span>
          {rows ? ` · ${rows.length} records` : ""}
        </p>
        {tables.length > 1 && (
          <select
            value={table ?? ""}
            onChange={(e) => setTable(e.target.value)}
            className="rounded-lg border border-border bg-white dark:bg-[#0e0f1a] px-2 py-1.5 text-xs text-foreground"
          >
            {tables.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Querying warehouse…
        </div>
      ) : !rows || rows.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          No data in the warehouse yet — run a sync first.
        </div>
      ) : (
        <>
          <DataAgentPanel records={rows} />
          <AutoDashboard records={rows} runs={flow.runs} />
        </>
      )}
    </div>
  );
}

// ── Data Agent — ask anything about this flow's warehouse data ───────────────

const AGENT_SUGGESTIONS = ["analyze my data", "top 5", "status breakdown", "trend over time"];

function DataAgentPanel({ records }: { records: Record<string, unknown>[] }) {
  const [prompt, setPrompt] = React.useState("");
  const [response, setResponse] = React.useState<AgentResponse | null>(null);
  const [thinking, setThinking] = React.useState(false);

  function ask(q: string) {
    if (!q.trim()) return;
    setThinking(true);
    setPrompt(q);
    // Compute is synchronous; brief delay keeps the interaction feeling natural
    setTimeout(() => {
      setResponse(runAgent(q, records));
      setThinking(false);
    }, 350);
  }

  return (
    <div className="rounded-xl border border-brand-200 dark:border-brand-900 bg-brand-50/40 dark:bg-brand-950/10 p-4 flex flex-col gap-3">
      {/* Prompt bar */}
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-600">
          <Zap className="h-3.5 w-3.5 text-white" />
        </div>
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") ask(prompt); }}
          placeholder='Ask your data anything — e.g. "revenue by country", "top 5 products", "analyze my data"'
          className="flex-1 h-9 rounded-lg border border-border bg-white dark:bg-[#0e0f1a] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <Button size="sm" className="h-9 gap-1.5" disabled={thinking || !prompt.trim()} onClick={() => ask(prompt)}>
          {thinking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Ask"}
        </Button>
        {response && (
          <button onClick={() => { setResponse(null); setPrompt(""); }}
            className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        )}
      </div>

      {/* Suggestion chips */}
      {!response && (
        <div className="flex flex-wrap gap-1.5">
          {AGENT_SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => ask(s)}
              className="rounded-full border border-border bg-white dark:bg-[#0e0f1a] px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:border-brand-400 transition-colors">
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Agent response */}
      {response && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-foreground">{response.message}</p>

          {response.kpis.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {response.kpis.map((k) => (
                <div key={k.id} className="rounded-lg border border-border bg-white dark:bg-[#0e0f1a] px-3 py-2">
                  <p className="text-sm font-bold text-foreground">{formatKPIValue(k)}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{k.label}</p>
                </div>
              ))}
            </div>
          )}

          {response.charts.length > 0 && (
            <div className={cn("grid gap-3", response.charts.length > 1 ? "lg:grid-cols-2" : "grid-cols-1")}>
              {response.charts.map((spec) => <ChartCard key={spec.id} spec={spec} />)}
            </div>
          )}

          {response.insights.length > 0 && <InsightsPanel insights={response.insights} />}

          {response.showTable && (
            <div className="rounded-lg border border-border bg-white dark:bg-[#0e0f1a] overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="border-b border-border">
                  {Object.keys(records[0]).slice(0, 7).map((c) => (
                    <th key={c} className="px-3 py-2 text-left font-semibold text-[10px] uppercase text-muted-foreground whitespace-nowrap">{c}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {records.slice(0, 10).map((r, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      {Object.keys(records[0]).slice(0, 7).map((c) => (
                        <td key={c} className="px-3 py-2 whitespace-nowrap max-w-[160px] truncate text-foreground">
                          {r[c] === null || r[c] === undefined ? "—" : String(r[c])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── SQL Workspace — run SELECT queries on your own warehouse ─────────────────

function SQLWorkspace({ flow }: { flow: DataFlow }) {
  const table = flow.warehouseTable ?? (flow.source.id === "instantly" ? "instantly_campaigns" : "");
  const [dataset, setDataset] = React.useState<string>("");
  const [configured, setConfigured] = React.useState<boolean | null>(null);
  const [sql, setSql] = React.useState(
    table
      ? `SELECT *\nFROM \`[dataset].${table}\`\nLIMIT 10`
      : `SELECT table_name\nFROM \`[dataset]\`.INFORMATION_SCHEMA.TABLES`
  );
  const [running, setRunning] = React.useState(false);
  const [result, setResult] = React.useState<{ rows: Record<string, unknown>[]; ms: number } | null>(null);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    WarehouseService.getDatasetName().then((ds) => {
      setDataset(ds);
      setConfigured(ds.length > 0);
      if (ds) {
        setSql(table
          ? `SELECT *\nFROM \`${ds}.${table}\`\nLIMIT 10`
          : `SELECT table_name\nFROM \`${ds}\`.INFORMATION_SCHEMA.TABLES`
        );
      } else {
        setConfigured(false);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function run() {
    setRunning(true); setError(""); setResult(null);
    const res = await WarehouseService.runSQL(sql);
    if (res.ok) setResult({ rows: res.rows ?? [], ms: res.durationMs ?? 0 });
    else setError(res.error ?? "Query failed");
    setRunning(false);
  }

  if (configured === null) {
    return (
      <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking warehouse…
      </div>
    );
  }

  if (!configured) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        BigQuery is not configured — set up the destination in a flow first.
      </div>
    );
  }

  const cols = result?.rows.length ? Object.keys(result.rows[0]) : [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Query your warehouse directly — <span className="font-medium text-foreground">SELECT only</span>, auto-limited to 200 rows.
          Dataset: <span className="font-mono text-foreground">{dataset}</span>
        </p>
        <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={running || !sql.trim()} onClick={run}>
          {running ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Running…</> : <><Play className="h-3.5 w-3.5" /> Run query</>}
        </Button>
      </div>

      {/* Editor */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/30">
          <span className="h-2 w-2 rounded-full bg-emerald-400/80" />
          <span className="text-[10px] font-mono text-muted-foreground">query.sql · Ctrl+Enter to run</span>
        </div>
        <textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) run(); }}
          rows={6}
          spellCheck={false}
          className="w-full bg-[#f8f9fc] dark:bg-[#080910] px-4 py-3 font-mono text-[13px] text-foreground focus:outline-none resize-y"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/20 px-4 py-3 text-xs text-rose-700 dark:text-rose-400 font-mono whitespace-pre-wrap">
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="rounded-xl border border-border bg-white dark:bg-[#0e0f1a] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
            <p className="text-xs font-semibold text-foreground">
              {result.rows.length} row{result.rows.length !== 1 ? "s" : ""}
            </p>
            <p className="text-[11px] text-muted-foreground">{(result.ms / 1000).toFixed(2)}s</p>
          </div>
          {result.rows.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">Query returned no rows.</p>
          ) : (
            <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white dark:bg-[#0e0f1a]">
                  <tr className="border-b border-border">
                    {cols.map((c) => (
                      <th key={c} className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-[10px] text-muted-foreground whitespace-nowrap">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r, i) => (
                    <tr key={i} className="border-b border-border last:border-0 hover:bg-accent/10">
                      {cols.map((c) => (
                        <td key={c} className="px-3 py-2 whitespace-nowrap max-w-[220px] truncate text-foreground">
                          {r[c] === null || r[c] === undefined ? <span className="text-muted-foreground/50">NULL</span> : String(r[c])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Flow Insights (universal engine) ─────────────────────────────────────────

function FlowInsights({ runs }: { runs: FlowRun[] }) {
  const insights = React.useMemo(
    () => generateInsights({ runs, kpis: generateSyncKPIs(runs) }),
    [runs]
  );
  if (!insights.length) return null;
  return <div className="mt-4"><InsightsPanel insights={insights} /></div>;
}

// ── Run History ───────────────────────────────────────────────────────────────

function RunHistory({ runs }: { runs: FlowRun[] }) {
  const [expandedId, setExpandedId] = React.useState<string | null>(
    runs.find((r) => r.status === "failed")?.id ?? null
  );

  if (!runs.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Clock className="h-8 w-8 text-muted-foreground/20 mb-3" />
        <p className="text-sm text-muted-foreground">No syncs yet. Hit <span className="font-semibold">"Sync now"</span> above to run your first sync.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-white dark:bg-[#0e0f1a] overflow-hidden">
      <div className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-4 px-5 py-3 border-b border-border bg-muted/30">
        <div className="w-6" />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Sync</p>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Rows synced</p>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hidden sm:block">Duration</p>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Started</p>
      </div>

      {runs.map((run) => {
        const cfg = RUN_CFG[run.status] ?? RUN_CFG.queued!;
        const Icon = cfg.icon;
        const isExpanded = expandedId === run.id;

        return (
          <div key={run.id} className="border-b border-border last:border-0">
            <div
              className={cn(
                "grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-4 px-5 py-3.5 cursor-pointer hover:bg-accent/20 transition-colors",
                run.status === "failed" && "bg-rose-50/30 dark:bg-rose-950/5"
              )}
              onClick={() => setExpandedId(isExpanded ? null : run.id)}
            >
              <div className={cn("flex h-6 w-6 items-center justify-center rounded-md", cfg.cls)}>
                <Icon className={cn("h-3.5 w-3.5", run.status === "running" && "animate-spin")} />
              </div>

              <div>
                <p className="text-sm font-medium text-foreground font-mono">{run.id}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={cn("text-[10px] font-semibold", cfg.cls.split(" ")[0])}>{cfg.label}</span>
                  {run.error && <span className="text-[10px] text-rose-600 truncate max-w-[240px]">{run.error}</span>}
                </div>
              </div>

              <p className="text-sm text-muted-foreground text-right">
                {run.rows !== null ? run.rows.toLocaleString() : "—"}
              </p>

              <p className="text-sm text-muted-foreground text-right hidden sm:block">{run.duration ?? "—"}</p>

              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(run.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
                <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform duration-200", isExpanded && "rotate-180")} />
              </div>
            </div>

            <AnimatePresence>
              {isExpanded && <InlineLogs run={run} />}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

// ── Connector Health Card ─────────────────────────────────────────────────────

function ConnectorHealthCard({ flow }: { flow: DataFlow }) {
  const [status, setStatus] = React.useState<"idle" | "checking" | "ok" | "error">("idle");
  const [latencyMs, setLatencyMs] = React.useState<number | null>(null);

  async function check() {
    setStatus("checking");
    try {
      const result = await ConnectorService.testConnection(flow.source.id);
      if (result.ok) {
        setLatencyMs(result.latencyMs);
        setStatus("ok");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="rounded-xl border border-border bg-white dark:bg-[#0e0f1a] p-4 shadow-card"
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Connector Health</p>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 text-xs"
          onClick={check}
          disabled={status === "checking"}
        >
          {status === "checking"
            ? <><Loader2 className="h-3 w-3 animate-spin" />Checking…</>
            : status === "ok"
            ? <><CheckCircle2 className="h-3 w-3 text-emerald-500" />{latencyMs}ms</>
            : <><RefreshCw className="h-3 w-3" />Test</>
          }
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Source</p>
          <div className="flex items-center gap-1.5 mt-1">
            <div className="h-9 w-9 rounded-lg flex items-center justify-center text-white text-[10px] font-bold" style={{ backgroundColor: flow.source.color }}>
              {flow.source.abbr}
            </div>
            <p className="text-sm font-semibold text-foreground">{flow.source.name}</p>
          </div>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Auth Status</p>
          <div className="flex items-center gap-1.5 mt-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <p className="text-sm font-semibold text-foreground">Authorized</p>
          </div>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">API Health</p>
          <div className="flex items-center gap-1.5 mt-2">
            {status === "ok" ? (
              <><CheckCircle2 className="h-4 w-4 text-emerald-500" /><p className="text-sm font-semibold text-emerald-600">{latencyMs}ms</p></>
            ) : status === "error" ? (
              <><AlertCircle className="h-4 w-4 text-rose-500" /><p className="text-sm font-semibold text-rose-600">Error</p></>
            ) : (
              <p className="text-sm font-semibold text-muted-foreground">—</p>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type DetailTab = "dashboard" | "sql" | "runs" | "schema" | "columns";

export default function FlowDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { flows: demoFlows, setFlowStatus, updateFlow, deleteFlow, addEvent, appendRun } = useDemoStore();
  // Merge demo store flows + real backend flows so both demo and real/impersonated flows are found
  const { flows: serverFlows, isLoading: serverLoading } = useServerFlows();
  const allFlows = React.useMemo(() => {
    const demoList = getAllFlows(MOCK_FLOWS, demoFlows);
    // Dedupe: server flows take priority over demo flows with same id
    const serverIds = new Set(serverFlows.map((f) => f.id));
    return [...serverFlows, ...demoList.filter((f) => !serverIds.has(f.id))];
  }, [demoFlows, serverFlows]);
  const flow = allFlows.find((f) => f.id === id);

  const [tab, setTab] = React.useState<DetailTab>("runs");
  const [showEditSchedule, setShowEditSchedule] = React.useState(false);
  const [showDeleteModal, setShowDeleteModal] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);
  const isDemo = id.startsWith("df-");

  // Still loading from server — don't show "not found" yet
  if (serverLoading && !flow) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
        <p className="text-sm text-muted-foreground">Loading flow…</p>
      </div>
    );
  }

  if (!flow) {
    const isClientFlow = id.startsWith("df-") || id.startsWith("flow-") || id.startsWith("usr-");
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-center px-4">
        <XCircle className="h-12 w-12 text-muted-foreground/20" />
        <p className="text-sm font-medium text-foreground">Flow not found in your account</p>
        {isClientFlow && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 max-w-sm text-xs text-amber-700 dark:text-amber-400 text-left">
            <strong>Tip:</strong> This flow may belong to a client account. To view or manage it,
            go to <strong>Admin → User Management</strong> and click <strong>"Work as Client"</strong>
            on the relevant client.
          </div>
        )}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push(ROUTES.FLOWS)}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Flows
          </Button>
          <Button variant="outline" size="sm" onClick={() => router.push(ROUTES.ADMIN)}>
            Go to Admin Panel
          </Button>
        </div>
      </div>
    );
  }

  const cfg = STATUS_CFG[flow.status];
  const successCount = flow.runs.filter((r) => r.status === "success").length;
  const failCount = flow.runs.filter((r) => r.status === "failed").length;
  const avgDurationSec = flow.runs.length > 0
    ? (flow.runs.reduce((acc, r) => {
        const secs = r.duration ? parseFloat(r.duration) : 0;
        return acc + secs;
      }, 0) / flow.runs.length).toFixed(1)
    : null;

  async function handleSyncNow() {
    if (!flow) return;
    setSyncing(true);
    const flowName = `${flow.source.name} → ${flow.destination.name}`;
    addEvent({ type: "sync_started", title: "Manual sync triggered", description: flowName, flowId: flow.id, flowName });

    // Real server-registered flows: pass flowId so the server writes run records to DB
    const isRealFlow = !isDemo;
    const canReal = await WarehouseService.canRunRealSync(flow.source.id, flow.destination.id);

    if (canReal || isRealFlow) {
      // Daton-style REAL ETL: Instantly → BigQuery
      // Pass flow.id if this is a real (non-demo) flow so runner.ts writes to DB
      const started = Date.now();
      const result = await WarehouseService.runInstantlyToBigQuery(isRealFlow ? flow.id : undefined);
      appendRun(flow.id, WarehouseService.buildRun(result, Date.now() - started));
      addEvent({
        type: result.ok ? "sync_run" : "sync_failed",
        title: result.ok ? "Sync completed" : "Sync failed",
        description: result.ok
          ? `${flowName} · ${result.rowsInserted.toLocaleString()} rows loaded to ${result.table}`
          : `${flowName} · ${result.error}`,
        flowId: flow.id, flowName,
      });
    } else {
      // Simulated sync for demo connectors
      await new Promise((r) => setTimeout(r, 2000));
      const rows = Math.floor(Math.random() * 1200 + 150);
      appendRun(flow.id, {
        id: `run-${Date.now()}`,
        startedAt: new Date().toISOString(),
        status: "success",
        rows,
        duration: (Math.random() * 20 + 5).toFixed(1) + "s",
        logs: [
          { id: `l-${Date.now()}-1`, ts: new Date().toISOString(), level: "info",    message: "Manual sync triggered." },
          { id: `l-${Date.now()}-2`, ts: new Date().toISOString(), level: "success", message: `${rows.toLocaleString()} rows written to destination.` },
        ],
      });
      addEvent({ type: "sync_run", title: "Manual sync completed", description: `${flowName} · ${rows.toLocaleString()} rows`, flowId: flow.id, flowName });
    }
    setSyncing(false);
  }

  function handleDeleteConfirm() {
    if (isDemo) {
      deleteFlow(flow.id);
      addEvent({ type: "flow_deleted", title: "Flow deleted", description: `${flow.source.name} → ${flow.destination.name}`, flowId: flow.id });
    }
    BackendService.deleteFlow(flow.id); // remove from server scheduler too
    router.push(ROUTES.FLOWS);
  }

  function handleScheduleSave(scheduleValue: string) {
    const opt = SCHEDULE_OPTIONS.find((o) => o.value === scheduleValue);
    if (isDemo && opt) {
      updateFlow(flow.id, { schedule: opt.label, scheduleValue });
    }
    addEvent({ type: "sync_started", title: "Schedule updated", description: `${flow.source.name} → ${flow.destination.name} now syncs ${opt?.label?.toLowerCase() ?? scheduleValue}`, flowId: flow.id, flowName: `${flow.source.name} → ${flow.destination.name}` });
  }

  const TABS: { id: DetailTab; label: string }[] = [
    { id: "dashboard", label: "Dashboard" },
    { id: "sql",     label: "SQL Workspace" },
    { id: "runs",    label: "Sync History" },
    { id: "schema",  label: "Schema" },
    { id: "columns", label: "Mapped Columns" },
  ];

  const slug = getSourceSlug(flow);

  return (
    <>
      <div className="flex flex-col gap-6 p-6 max-w-5xl">
        {/* Breadcrumb */}
        <motion.button
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={() => router.push(ROUTES.FLOWS)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Flows
        </motion.button>

        {/* Flow header */}
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2.5">
                <div className="h-11 w-11 rounded-xl flex items-center justify-center text-white text-[11px] font-bold shadow-md" style={{ backgroundColor: flow.source.color }}>
                  {flow.source.abbr}
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">{flow.source.name}</p>
                  <p className="text-[10px] text-muted-foreground">Source</p>
                </div>
              </div>

              <div className="flex flex-col items-center px-2">
                <ArrowRight className="h-4 w-4 text-muted-foreground/40" />
                <p className="text-[9px] text-muted-foreground mt-0.5">{flow.schedule}</p>
              </div>

              <div className="flex items-center gap-2.5">
                <div>
                  <p className="text-sm font-bold text-foreground text-right">{flow.destination.name}</p>
                  <p className="text-[10px] text-muted-foreground text-right">Destination</p>
                </div>
                <div className="h-11 w-11 rounded-xl flex items-center justify-center text-white text-[11px] font-bold shadow-md" style={{ backgroundColor: flow.destination.color }}>
                  {flow.destination.abbr}
                </div>
              </div>

              <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium", cfg.cls)}>
                <div className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
                {cfg.label}
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-wrap">
              {flow.status === "active" && (
                <Button
                  variant="outline" size="sm" className="gap-1.5 h-8 text-xs"
                  onClick={() => {
                    setFlowStatus(flow.id, "paused");
                    addEvent({ type: "flow_paused", title: "Flow paused", description: `${flow.source.name} → ${flow.destination.name}`, flowId: flow.id, flowName: `${flow.source.name} → ${flow.destination.name}` });
                  }}
                >
                  <Pause className="h-3.5 w-3.5" /> Pause
                </Button>
              )}
              {flow.status === "paused" && (
                <Button
                  variant="outline" size="sm" className="gap-1.5 h-8 text-xs text-emerald-600 border-emerald-300 hover:bg-emerald-50"
                  onClick={() => {
                    setFlowStatus(flow.id, "active");
                    addEvent({ type: "flow_resumed", title: "Flow resumed", description: `${flow.source.name} → ${flow.destination.name}`, flowId: flow.id, flowName: `${flow.source.name} → ${flow.destination.name}` });
                  }}
                >
                  <Play className="h-3.5 w-3.5" /> Resume
                </Button>
              )}
              <Button
                variant="outline" size="sm" className="gap-1.5 h-8 text-xs"
                onClick={() => setShowEditSchedule(true)}
              >
                <Edit2 className="h-3.5 w-3.5" /> Edit Schedule
              </Button>
              <Button
                size="sm" className="gap-1.5 h-8 text-xs"
                onClick={handleSyncNow}
                disabled={syncing}
              >
                {syncing
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Syncing…</>
                  : <><Zap className="h-3.5 w-3.5" />Sync Now</>
                }
              </Button>
              <Button
                variant="ghost" size="sm" className="gap-1.5 h-8 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                onClick={() => setShowDeleteModal(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Error banner */}
          {flow.recentError && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="mt-4 flex items-start gap-3 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/20 px-4 py-3"
            >
              <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-rose-800 dark:text-rose-300">Action required</p>
                <p className="text-xs text-rose-700 dark:text-rose-400 mt-0.5">{flow.recentError}</p>
              </div>
              <Button size="sm" variant="outline" className="shrink-0 ml-auto h-8 text-xs text-rose-600 border-rose-300 hover:bg-rose-100">
                Reconnect
              </Button>
            </motion.div>
          )}
        </motion.div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { label: "Last sync",     value: flow.lastSync ?? "Never" },
            { label: "Next sync",     value: flow.nextSync ?? (flow.status === "paused" ? "Paused" : "—") },
            { label: "Success rate",  value: flow.totalRuns > 0 ? `${flow.successRate}%` : "—" },
            { label: "Failure rate",  value: flow.totalRuns > 0 ? `${Math.round(failCount / flow.totalRuns * 100)}%` : "—" },
            { label: "Avg duration",  value: avgDurationSec ? `${avgDurationSec}s` : "—" },
            { label: "Total runs",    value: flow.totalRuns.toLocaleString() },
            { label: "Total rows",    value: flow.totalRowsSynced >= 1_000_000
                ? `${(flow.totalRowsSynced / 1_000_000).toFixed(1)}M`
                : flow.totalRowsSynced >= 1_000
                ? `${(flow.totalRowsSynced / 1_000).toFixed(0)}k`
                : flow.totalRowsSynced.toString() },
          ].map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.04 + i * 0.04 }}
              className="rounded-xl border border-border bg-white dark:bg-[#0e0f1a] px-4 py-3"
            >
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{s.label}</p>
              <p className="text-sm font-bold text-foreground mt-1">{s.value}</p>
            </motion.div>
          ))}
        </div>

        {/* Connector health */}
        <ConnectorHealthCard flow={flow} />

        {/* Tab bar */}
        <div className="border-b border-border flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                tab === t.id
                  ? "border-brand-500 text-brand-600 dark:text-brand-400"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t.id === "dashboard" && <BarChart3 className="h-4 w-4" />}
              {t.id === "sql"     && <Database className="h-4 w-4" />}
              {t.id === "runs"    && <RefreshCw className="h-4 w-4" />}
              {t.id === "schema"  && <Database className="h-4 w-4" />}
              {t.id === "columns" && <Table2 className="h-4 w-4" />}
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
          >
            {tab === "dashboard" && <WarehouseDashboardTab flow={flow} />}

            {tab === "sql" && <SQLWorkspace flow={flow} />}

            {tab === "runs" && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-foreground">Sync history</h2>
                  <Button
                    variant="outline" size="sm" className="gap-1.5 h-8 text-xs"
                    disabled={!flow.runs.some((r) => r.status === "failed")}
                    onClick={async () => {
                      const failed = flow.runs.filter((r) => r.status === "failed");
                      if (!failed.length) return;
                      // Real flows: retry = re-run the actual ETL
                      const canReal = await WarehouseService.canRunRealSync(flow.source.id, flow.destination.id);
                      if (canReal || !isDemo) {
                        const started = Date.now();
                        const result = await WarehouseService.runInstantlyToBigQuery(!isDemo ? flow.id : undefined);
                        appendRun(flow.id, WarehouseService.buildRun(result, Date.now() - started));
                        addEvent({
                          type: result.ok ? "sync_run" : "sync_failed",
                          title: result.ok ? "Retry succeeded" : "Retry failed",
                          description: result.ok
                            ? `${flow.source.name} → ${flow.destination.name} · ${result.rowsInserted.toLocaleString()} rows loaded to ${result.table}`
                            : `${flow.source.name} → ${flow.destination.name} · ${result.error}`,
                          flowId: flow.id, flowName: `${flow.source.name} → ${flow.destination.name}`,
                        });
                        return;
                      }
                      const rows = Math.floor(Math.random() * 800 + 200);
                      appendRun(flow.id, {
                        id: `run-retry-${Date.now()}`,
                        startedAt: new Date().toISOString(),
                        status: "success",
                        rows,
                        duration: (Math.random() * 30 + 8).toFixed(1) + "s",
                        logs: [
                          { id: `rl-${Date.now()}-1`, ts: new Date().toISOString(), level: "info",    message: `Retrying ${failed.length} failed run${failed.length > 1 ? "s" : ""} — credentials re-validated.` },
                          { id: `rl-${Date.now()}-2`, ts: new Date().toISOString(), level: "success", message: `${rows.toLocaleString()} rows written to destination.` },
                        ],
                      });
                      addEvent({ type: "sync_run", title: "Retry succeeded", description: `${flow.source.name} → ${flow.destination.name} · ${rows.toLocaleString()} rows`, flowId: flow.id, flowName: `${flow.source.name} → ${flow.destination.name}` });
                    }}
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Retry failed runs
                  </Button>
                </div>
                <RunHistory runs={flow.runs} />
                <FlowInsights runs={flow.runs} />
              </div>
            )}

            {tab === "schema" && <SchemaPanel slug={slug} />}

            {tab === "columns" && <MappedColumnsPanel flow={flow} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showEditSchedule && (
          <EditScheduleModal
            current={flow.scheduleValue ?? "every_hour"}
            onSave={handleScheduleSave}
            onClose={() => setShowEditSchedule(false)}
          />
        )}
        {showDeleteModal && (
          <DeleteFlowModal
            flow={flow}
            onConfirm={handleDeleteConfirm}
            onClose={() => setShowDeleteModal(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
