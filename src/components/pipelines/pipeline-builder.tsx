"use client";

import React from "react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import {
  Play, Save, Copy, History, Plus, X, ChevronRight, ChevronDown,
  Database, GitBranch, Server, Filter, BarChart2, ArrowLeftRight,
  ArrowUpDown, Trash2, MinusCircle, Calculator, Merge, Eye, Loader2,
  CheckCircle2, AlertTriangle, Settings2, GripVertical, Zap, Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  TRANSFORM_META, MOCK_PIPELINE_RUNS,
  type PipelineNode, type TransformKind, type NodeType, type PipelineRun
} from "@/lib/pipeline-types";
import type { ConnectorDef } from "@/lib/connectors-data";

// ── Node icon map ────────────────────────────────────────────────────────────
const TRANSFORM_ICONS: Record<TransformKind, React.ElementType> = {
  filter:            Filter,
  rename:            ArrowLeftRight,
  aggregate:         BarChart2,
  join:              GitBranch,
  sort:              ArrowUpDown,
  remove_nulls:      MinusCircle,
  calculated_field:  Calculator,
  merge:             Merge,
};

// ── Source options ─────────────────────────────────────────────────────────
const SOURCE_OPTIONS = [
  { id: "shopify", name: "Shopify", abbr: "SH", color: "#96BF48" },
  { id: "stripe",  name: "Stripe",  abbr: "ST", color: "#635BFF" },
  { id: "ga4",     name: "Google Analytics", abbr: "GA", color: "#F4511E" },
  { id: "pg",      name: "PostgreSQL", abbr: "PG", color: "#336791" },
  { id: "sf",      name: "Salesforce",  abbr: "SF", color: "#00A1E0" },
];

const DEST_OPTIONS = [
  { id: "snowflake", name: "Snowflake",        abbr: "SF", color: "#29B5E8" },
  { id: "bigquery",  name: "BigQuery",         abbr: "BQ", color: "#4285F4" },
  { id: "pg_prod",   name: "PostgreSQL Prod",  abbr: "PG", color: "#336791" },
  { id: "redshift",  name: "Redshift",         abbr: "RS", color: "#FF9900" },
];

// ── Preview mock data ──────────────────────────────────────────────────────
const PREVIEW_ROWS = [
  { order_id: "ORD-10842", customer: "alice@example.com", total: 149.99, status: "completed", country: "US" },
  { order_id: "ORD-10843", customer: "bob@company.io",    total: 178.00, status: "pending",   country: "UK" },
  { order_id: "ORD-10844", customer: "carol@mail.net",    total: 399.00, status: "completed", country: "CA" },
  { order_id: "ORD-10845", customer: "dave@org.com",      total:  59.99, status: "completed", country: "US" },
  { order_id: "ORD-10846", customer: "eve@startup.io",    total:  79.00, status: "refunded",  country: "DE" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Node palette item
// ─────────────────────────────────────────────────────────────────────────────
function PaletteItem({ kind, onAdd }: { kind: TransformKind; onAdd: (k: TransformKind) => void }) {
  const meta = TRANSFORM_META[kind];
  const Icon = TRANSFORM_ICONS[kind];
  return (
    <button
      onClick={() => onAdd(kind)}
      className="group flex items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2.5 text-left transition-all hover:border-brand-200 hover:bg-brand-50/50 dark:hover:border-brand-800 dark:hover:bg-brand-950/10 w-full"
    >
      <div className={cn("flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold shrink-0", meta.color)}>
        <Icon className="h-3 w-3" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-foreground leading-tight">{meta.label}</p>
        <p className="text-[10px] text-muted-foreground truncate">{meta.description}</p>
      </div>
      <Plus className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 shrink-0" />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas node card
// ─────────────────────────────────────────────────────────────────────────────
function CanvasNode({
  node, isSelected, onSelect, onRemove, isFirst, isLast,
}: {
  node: PipelineNode;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const meta = node.transformKind ? TRANSFORM_META[node.transformKind] : null;
  const Icon = node.transformKind ? TRANSFORM_ICONS[node.transformKind] : node.type === "source" ? Database : Server;

  const borderColor =
    node.type === "source"      ? "border-blue-300 dark:border-blue-800"
    : node.type === "destination" ? "border-violet-300 dark:border-violet-800"
    : "border-amber-300 dark:border-amber-800";

  const headerBg =
    node.type === "source"      ? "bg-blue-50 dark:bg-blue-950/20"
    : node.type === "destination" ? "bg-violet-50 dark:bg-violet-950/20"
    : "bg-amber-50 dark:bg-amber-950/20";

  const iconColor =
    node.type === "source"      ? "text-blue-600"
    : node.type === "destination" ? "text-violet-600"
    : meta?.color ?? "bg-amber-100 text-amber-700";

  return (
    <div className="flex items-center gap-2">
      {/* Connector line left */}
      {!isFirst && <div className="h-px w-6 bg-border shrink-0" />}

      <motion.div
        layout
        onClick={onSelect}
        className={cn(
          "relative w-52 shrink-0 rounded-xl border-2 bg-white dark:bg-[#0e0f1a] shadow-card cursor-pointer transition-all duration-150",
          isSelected ? "border-brand-400 shadow-[0_0_0_3px_hsl(var(--ring)/0.15)]" : borderColor,
          "hover:shadow-card-hover"
        )}
      >
        {/* Drag handle */}
        {node.type === "transform" && (
          <div className="absolute left-1.5 top-1/2 -translate-y-1/2 text-muted-foreground/30 cursor-grab">
            <GripVertical className="h-4 w-4" />
          </div>
        )}

        {/* Header */}
        <div className={cn("flex items-center gap-2 rounded-t-[calc(theme(borderRadius.xl)-2px)] px-4 py-2.5", headerBg)}>
          <div className={cn("flex h-5 w-5 items-center justify-center rounded-md",
            node.type === "transform" && meta?.color ? meta.color : ""
          )}>
            <Icon className={cn("h-3 w-3", node.type !== "transform" ? iconColor : "")} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {node.type === "transform" ? (meta?.label ?? "Transform") : node.type}
            </p>
          </div>
          {node.type === "transform" && (
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground/50 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="px-4 py-3">
          <p className="text-sm font-semibold text-foreground truncate">{node.label}</p>
          {node.config && Object.keys(node.config).length > 0 && (
            <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
              {Object.entries(node.config).slice(0, 2).map(([k, v]) => `${k}: ${v}`).join(" · ")}
            </p>
          )}
        </div>

        {/* Selected ring glow */}
        {isSelected && (
          <div className="absolute inset-0 rounded-xl ring-2 ring-brand-400 ring-offset-0 pointer-events-none" />
        )}
      </motion.div>

      {/* Connector line right */}
      {!isLast && <div className="h-px w-6 bg-border shrink-0" />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Config panel for selected node
// ─────────────────────────────────────────────────────────────────────────────
function ConfigPanel({
  node, onUpdate,
}: {
  node: PipelineNode;
  onUpdate: (id: string, config: Record<string, string>) => void;
}) {
  const [localCfg, setLocalCfg] = React.useState<Record<string, string>>(
    Object.fromEntries(Object.entries(node.config ?? {}).map(([k, v]) => [k, String(v ?? "")]))
  );

  React.useEffect(() => {
    setLocalCfg(Object.fromEntries(Object.entries(node.config ?? {}).map(([k, v]) => [k, String(v ?? "")])));
  }, [node.id]);

  function updateField(key: string, val: string) {
    const next = { ...localCfg, [key]: val };
    setLocalCfg(next);
    onUpdate(node.id, next);
  }

  const fields: Array<{ key: string; label: string; placeholder: string; hint?: string }> =
    node.type === "source" ? [
      { key: "table", label: "Source Table / Stream", placeholder: "e.g. orders", hint: "The table or endpoint to read from" },
      { key: "filter", label: "Row Filter (SQL WHERE)", placeholder: "e.g. created_at > '2024-01-01'", hint: "Optional — leave blank to sync all rows" },
      { key: "limit", label: "Row Limit", placeholder: "e.g. 100000" },
    ] : node.type === "destination" ? [
      { key: "schema", label: "Target Schema", placeholder: "e.g. public" },
      { key: "table", label: "Target Table", placeholder: "e.g. fact_orders" },
      { key: "mode", label: "Write Mode", placeholder: "append | replace | upsert" },
    ] : node.transformKind === "filter" ? [
      { key: "column", label: "Column", placeholder: "e.g. status" },
      { key: "operator", label: "Operator", placeholder: "equals | not_equals | contains | gt | lt" },
      { key: "value", label: "Value", placeholder: "e.g. completed" },
    ] : node.transformKind === "rename" ? [
      { key: "from", label: "Original Name", placeholder: "e.g. customer_email" },
      { key: "to", label: "New Name", placeholder: "e.g. email" },
    ] : node.transformKind === "aggregate" ? [
      { key: "groupBy", label: "Group By Column(s)", placeholder: "e.g. status, country" },
      { key: "aggColumn", label: "Aggregate Column", placeholder: "e.g. total_amount" },
      { key: "function", label: "Function", placeholder: "SUM | AVG | COUNT | MIN | MAX" },
    ] : node.transformKind === "sort" ? [
      { key: "column", label: "Sort Column", placeholder: "e.g. order_date" },
      { key: "direction", label: "Direction", placeholder: "ASC | DESC" },
    ] : node.transformKind === "calculated_field" ? [
      { key: "fieldName", label: "New Field Name", placeholder: "e.g. margin_pct" },
      { key: "expression", label: "Expression", placeholder: "e.g. (revenue - cost) / revenue * 100" },
    ] : node.transformKind === "join" ? [
      { key: "rightSource", label: "Right Source", placeholder: "e.g. customers" },
      { key: "leftKey", label: "Left Key", placeholder: "e.g. customer_id" },
      { key: "rightKey", label: "Right Key", placeholder: "e.g. id" },
      { key: "type", label: "Join Type", placeholder: "INNER | LEFT | RIGHT | FULL" },
    ] : [
      { key: "columns", label: "Columns to Deduplicate", placeholder: "e.g. email, phone (blank = all)" },
    ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
        <Settings2 className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Node Config</h3>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            {node.type === "source" ? "Source Settings" : node.type === "destination" ? "Destination Settings" : `${TRANSFORM_META[node.transformKind!]?.label ?? "Transform"} Settings`}
          </p>
          <div className="space-y-3">
            {fields.map(({ key, label, placeholder, hint }) => (
              <div key={key} className="space-y-1.5">
                <Label className="text-xs">{label}</Label>
                <Input
                  value={localCfg[key] ?? ""}
                  onChange={(e) => updateField(key, e.target.value)}
                  placeholder={placeholder}
                  className="h-8 text-xs font-mono"
                />
                {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Run history panel
// ─────────────────────────────────────────────────────────────────────────────
function RunHistoryPanel({ runs }: { runs: PipelineRun[] }) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
        <History className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Run History</h3>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {runs.map((run) => (
          <div key={run.id} className={cn(
            "rounded-lg border p-3",
            run.status === "success" ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/10"
            : run.status === "failed" ? "border-rose-200 bg-rose-50/50 dark:border-rose-800 dark:bg-rose-950/10"
            : run.status === "running" ? "border-brand-200 bg-brand-50/50 dark:border-brand-800 dark:bg-brand-950/10"
            : "border-border bg-muted/20"
          )}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                {run.status === "success" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  : run.status === "failed" ? <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
                  : run.status === "running" ? <Loader2 className="h-3.5 w-3.5 text-brand-500 animate-spin" />
                  : <Clock className="h-3.5 w-3.5 text-muted-foreground" />}
                <span className="text-xs font-semibold capitalize text-foreground">{run.status}</span>
              </div>
              <span className="text-[10px] text-muted-foreground">{run.duration != null ? `${run.duration}s` : "—"}</span>
            </div>
            <p className="text-[10px] text-muted-foreground">{run.startedAt}</p>
            {run.recordsOut > 0 && (
              <p className="text-[10px] font-medium text-foreground mt-0.5">{run.recordsOut.toLocaleString()} rows</p>
            )}
            {run.errorMessage && (
              <p className="text-[10px] text-rose-600 mt-1 line-clamp-2">{run.errorMessage}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Preview data panel
// ─────────────────────────────────────────────────────────────────────────────
function PreviewPanel({ isRunning }: { isRunning: boolean }) {
  const cols = Object.keys(PREVIEW_ROWS[0]);
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
        <Eye className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Data Preview</h3>
        <Badge variant="secondary" className="ml-auto text-[10px]">First 5 rows</Badge>
      </div>
      <div className="flex-1 overflow-auto p-3">
        {isRunning ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
            <p className="text-xs text-muted-foreground">Running pipeline…</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  {cols.map((c) => (
                    <th key={c} className="py-2 px-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PREVIEW_ROWS.map((row, i) => (
                  <tr key={i} className={cn("border-b border-border/50 last:border-0", i % 2 === 0 ? "" : "bg-muted/20")}>
                    {Object.values(row).map((val, ci) => (
                      <td key={ci} className="py-1.5 px-2.5 font-mono text-foreground whitespace-nowrap">{String(val)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main PipelineBuilder component
// ─────────────────────────────────────────────────────────────────────────────

let nodeCounter = 100;
function makeTransformNode(kind: TransformKind): PipelineNode {
  const meta = TRANSFORM_META[kind];
  return {
    id: `t-${++nodeCounter}`,
    type: "transform",
    transformKind: kind,
    label: meta.label,
    config: {} as Record<string, unknown>,
  };
}

interface PipelineBuilderProps {
  initialName?: string;
  pipelineId?: string;
}

export function PipelineBuilder({ initialName = "Untitled Pipeline", pipelineId }: PipelineBuilderProps) {
  const [name, setName] = React.useState(initialName);
  const [source, setSource] = React.useState(SOURCE_OPTIONS[0]);
  const [destination, setDestination] = React.useState(DEST_OPTIONS[0]);
  const [transforms, setTransforms] = React.useState<PipelineNode[]>([]);
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>("source");
  const [rightPanel, setRightPanel] = React.useState<"config" | "history" | "preview">("config");
  const [isRunning, setIsRunning] = React.useState(false);
  const [isSaved, setIsSaved] = React.useState(false);
  const [nameEditing, setNameEditing] = React.useState(false);

  // Build full node list: source → transforms → destination
  const sourceNode: PipelineNode = { id: "source", type: "source", label: source.name, config: { table: "orders" } as Record<string, unknown> };
  const destNode: PipelineNode = { id: "dest", type: "destination", label: destination.name, config: { table: "fact_orders", mode: "append" } as Record<string, unknown> };
  const allNodes = [sourceNode, ...transforms, destNode];

  const selectedNode = allNodes.find((n) => n.id === selectedNodeId) ?? null;

  function addTransform(kind: TransformKind) {
    setTransforms((prev) => [...prev, makeTransformNode(kind)]);
  }

  function removeTransform(id: string) {
    setTransforms((prev) => prev.filter((t) => t.id !== id));
    if (selectedNodeId === id) setSelectedNodeId(null);
  }

  function updateNodeConfig(id: string, config: Record<string, string>) {
    if (id === "source") return;
    if (id === "dest") return;
    setTransforms((prev) => prev.map((t) => t.id === id ? { ...t, config: config as Record<string, unknown> } : t));
  }

  async function handleRun() {
    setIsRunning(true);
    setRightPanel("preview");
    await new Promise((r) => setTimeout(r, 3200));
    setIsRunning(false);
  }

  async function handleSave() {
    setIsSaved(true);
    await new Promise((r) => setTimeout(r, 1500));
    setIsSaved(false);
  }

  const TRANSFORM_GROUPS: { label: string; kinds: TransformKind[] }[] = [
    { label: "Filter & Clean",  kinds: ["filter", "remove_nulls"] },
    { label: "Reshape",         kinds: ["rename", "aggregate", "sort", "calculated_field"] },
    { label: "Combine",         kinds: ["join", "merge"] },
  ];

  const [openGroups, setOpenGroups] = React.useState<Set<string>>(new Set(["Filter & Clean", "Reshape", "Combine"]));
  function toggleGroup(g: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      next.has(g) ? next.delete(g) : next.add(g);
      return next;
    });
  }

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col bg-[#f8f9fc] dark:bg-[#0a0b10]">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-border bg-white dark:bg-[#0e0f1a] px-4 py-2.5 shadow-sm">
        {nameEditing ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setNameEditing(false)}
            onKeyDown={(e) => e.key === "Enter" && setNameEditing(false)}
            className="text-sm font-semibold bg-transparent border-b border-brand-400 outline-none text-foreground min-w-0 max-w-xs"
          />
        ) : (
          <button onClick={() => setNameEditing(true)} className="text-sm font-semibold text-foreground hover:text-brand-600 transition-colors">
            {name}
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setRightPanel("history")}
            className={cn("flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
              rightPanel === "history" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <History className="h-3.5 w-3.5" /> History
          </button>
          <button
            onClick={() => setRightPanel("preview")}
            className={cn("flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
              rightPanel === "preview" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <Eye className="h-3.5 w-3.5" /> Preview
          </button>
          <div className="h-4 w-px bg-border" />
          <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
            <Copy className="h-3.5 w-3.5" /> Duplicate
          </Button>
          <Button variant="outline" size="sm" onClick={handleSave} className="gap-1.5 h-8 text-xs">
            {isSaved ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <Save className="h-3.5 w-3.5" />}
            {isSaved ? "Saved!" : "Save"}
          </Button>
          <Button size="sm" onClick={handleRun} disabled={isRunning} className="gap-1.5 h-8 text-xs">
            {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            {isRunning ? "Running…" : "Run"}
          </Button>
        </div>
      </div>

      {/* Main 3-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Transform palette */}
        <div className="flex w-52 shrink-0 flex-col border-r border-border bg-white dark:bg-[#0e0f1a] overflow-y-auto">
          <div className="px-3 py-3 border-b border-border">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Transforms</p>
          </div>
          <div className="flex-1 p-3 space-y-3">
            {TRANSFORM_GROUPS.map((group) => (
              <div key={group.label}>
                <button
                  onClick={() => toggleGroup(group.label)}
                  className="flex w-full items-center justify-between py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                >
                  {group.label}
                  {openGroups.has(group.label) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                </button>
                <AnimatePresence>
                  {openGroups.has(group.label) && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden space-y-1.5 pt-1.5"
                    >
                      {group.kinds.map((k) => <PaletteItem key={k} kind={k} onAdd={addTransform} />)}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>

          {/* Source & Destination selectors */}
          <div className="border-t border-border p-3 space-y-3">
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Source</Label>
              <select
                value={source.id}
                onChange={(e) => setSource(SOURCE_OPTIONS.find((s) => s.id === e.target.value)!)}
                className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {SOURCE_OPTIONS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Destination</Label>
              <select
                value={destination.id}
                onChange={(e) => setDestination(DEST_OPTIONS.find((d) => d.id === e.target.value)!)}
                className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {DEST_OPTIONS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Center: canvas */}
        <div className="flex-1 overflow-auto p-6 flex flex-col">
          {/* Pipeline canvas */}
          <div className="flex items-center justify-center min-h-[140px] px-8">
            <div className="flex items-center gap-0">
              {/* Source node */}
              <CanvasNode
                node={sourceNode}
                isSelected={selectedNodeId === "source"}
                onSelect={() => { setSelectedNodeId("source"); setRightPanel("config"); }}
                onRemove={() => {}}
                isFirst
                isLast={false}
              />

              {/* Reorderable transforms */}
              <Reorder.Group
                axis="x"
                values={transforms}
                onReorder={setTransforms}
                className="flex items-center gap-0"
              >
                {transforms.map((t, i) => (
                  <Reorder.Item key={t.id} value={t} className="flex items-center gap-0">
                    <CanvasNode
                      node={t}
                      isSelected={selectedNodeId === t.id}
                      onSelect={() => { setSelectedNodeId(t.id); setRightPanel("config"); }}
                      onRemove={() => removeTransform(t.id)}
                      isFirst={false}
                      isLast={false}
                    />
                  </Reorder.Item>
                ))}
              </Reorder.Group>

              {/* Add transform button */}
              {transforms.length < 8 && (
                <div className="flex items-center gap-2">
                  <div className="h-px w-6 bg-border" />
                  <button
                    onClick={() => addTransform("filter")}
                    className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-dashed border-border text-muted-foreground hover:border-brand-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-950/20 transition-colors shrink-0"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                  <div className="h-px w-6 bg-border" />
                </div>
              )}
              {transforms.length >= 8 && <div className="h-px w-12 bg-border" />}

              {/* Destination node */}
              <CanvasNode
                node={destNode}
                isSelected={selectedNodeId === "dest"}
                onSelect={() => { setSelectedNodeId("dest"); setRightPanel("config"); }}
                onRemove={() => {}}
                isFirst={false}
                isLast
              />
            </div>
          </div>

          {/* Empty state hint */}
          {transforms.length === 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 flex flex-col items-center justify-center rounded-xl border border-dashed border-border p-8 text-center mx-auto max-w-sm">
              <Zap className="h-8 w-8 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">Add transforms from the left panel</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Drag to reorder · Click to configure</p>
            </motion.div>
          )}

          {/* Pipeline stats bar */}
          {transforms.length > 0 && (
            <div className="mt-6 flex items-center gap-6 rounded-xl border border-border bg-white dark:bg-[#0e0f1a] px-5 py-3 shadow-card mx-auto">
              <div className="text-center">
                <p className="text-lg font-bold text-foreground">{allNodes.length}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Nodes</p>
              </div>
              <div className="h-8 w-px bg-border" />
              <div className="text-center">
                <p className="text-lg font-bold text-foreground">{transforms.length}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Transforms</p>
              </div>
              <div className="h-8 w-px bg-border" />
              <div className="text-center">
                <p className="text-lg font-bold text-foreground">5,420</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Est. Rows/Run</p>
              </div>
              <div className="h-8 w-px bg-border" />
              <div className="text-center">
                <p className="text-lg font-bold text-foreground">~12s</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Est. Duration</p>
              </div>
            </div>
          )}
        </div>

        {/* Right: config / history / preview */}
        <div className="flex w-72 shrink-0 flex-col border-l border-border bg-white dark:bg-[#0e0f1a] overflow-hidden">
          <AnimatePresence mode="wait">
            {rightPanel === "config" && selectedNode ? (
              <motion.div key="config" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="flex flex-col h-full">
                <ConfigPanel node={selectedNode} onUpdate={updateNodeConfig} />
              </motion.div>
            ) : rightPanel === "history" ? (
              <motion.div key="history" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="flex flex-col h-full">
                <RunHistoryPanel runs={MOCK_PIPELINE_RUNS} />
              </motion.div>
            ) : (
              <motion.div key="preview" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="flex flex-col h-full">
                <PreviewPanel isRunning={isRunning} />
              </motion.div>
            )}
          </AnimatePresence>

          {!selectedNode && rightPanel === "config" && (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center">
              <Settings2 className="h-8 w-8 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">Select a node to configure it</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

