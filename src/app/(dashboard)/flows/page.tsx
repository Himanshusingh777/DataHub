"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  Plus, ArrowRight, Zap, Pause, Play, Trash2, MoreHorizontal,
  CheckCircle2, AlertTriangle, Clock, RefreshCw, Settings,
  Copy, Pencil, CalendarClock, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/config/routes";
import { type DataFlow, type FlowStatus } from "@/lib/flows-data";
import { useFlowWizardStore } from "@/stores/flow-wizard.store";
import { useDemoStore } from "@/stores/demo.store";
import { useToast } from "@/components/ui/toast";
import { useServerFlows, SCHEDULE_LABELS } from "@/hooks/use-server-flows";
import { FlowWizardModal } from "@/components/flows/flow-wizard-modal";

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CFG: Record<FlowStatus, { icon: React.ElementType; dot: string; cls: string; label: string }> = {
  active:  { icon: CheckCircle2,  dot: "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,.5)]", cls: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20", label: "Active" },
  error:   { icon: AlertTriangle, dot: "bg-rose-500",    cls: "text-rose-600 bg-rose-50 dark:bg-rose-950/20",     label: "Error"  },
  paused:  { icon: Clock,         dot: "bg-amber-400",   cls: "text-amber-600 bg-amber-50 dark:bg-amber-950/20",  label: "Paused" },
  draft:   { icon: RefreshCw,     dot: "bg-muted-foreground/30", cls: "text-muted-foreground bg-muted",           label: "Draft"  },
};

function StatusBadge({ status }: { status: FlowStatus }) {
  const cfg = STATUS_CFG[status];
  const Icon = cfg.icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium", cfg.cls)}>
      <div className={cn("h-1.5 w-1.5 rounded-full shrink-0", cfg.dot)} />
      {cfg.label}
    </span>
  );
}

// ── Flow card ─────────────────────────────────────────────────────────────────

function FlowCard({
  flow, index, onOpen, onDelete, onTogglePause, onDuplicate, onEdit,
}: {
  flow: DataFlow;
  index: number;
  onOpen: () => void;
  onDelete: () => void;
  onTogglePause: () => void;
  onDuplicate: () => void;
  onEdit: () => void;
}) {
  const [hovered, setHovered] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);
  const [syncResult, setSyncResult] = React.useState<"success" | "error" | null>(null);
  const { toast } = useToast();
  const isDemo = flow.id.startsWith("df-");

  async function handleSyncNow(e: React.MouseEvent) {
    e.stopPropagation();
    if (syncing) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      if (isDemo) {
        await new Promise(r => setTimeout(r, 500));
        setSyncResult("success");
        toast.success("Sync complete", `${flow.source.name} → ${flow.destination.name}`);
      } else {
        const res = await fetch("/api/sync/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ flowId: flow.id, triggerBy: "manual" }),
        });
        setSyncResult(res.ok ? "success" : "error");
        if (res.ok) toast.success("Sync complete", `${flow.source.name} → ${flow.destination.name}`);
        else toast.error("Sync failed", "Check your connector credentials and try again.");
      }
    } catch {
      setSyncResult("error");
      toast.error("Sync failed", "Network error — check your connection.");
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncResult(null), 3000);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="group relative rounded-xl border border-border bg-white dark:bg-[#0e0f1a] hover:border-brand-300 dark:hover:border-brand-700 hover:shadow-sm transition-all duration-200 overflow-hidden cursor-pointer"
      onClick={onOpen}
    >
      {/* Hover accent */}
      <div className={cn("absolute inset-x-0 top-0 h-0.5 bg-brand-500 transition-opacity duration-200", hovered ? "opacity-100" : "opacity-0")} />

      <div className="p-5">
        {/* Source → Destination visual */}
        <div className="flex items-center gap-2 mb-4">
          {/* Source */}
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl flex items-center justify-center text-white text-[10px] font-bold shadow-sm" style={{ backgroundColor: flow.source.color }}>
              {flow.source.abbr}
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground">{flow.source.name}</p>
              <p className="text-[10px] text-muted-foreground">Source</p>
            </div>
          </div>

          {/* Arrow with schedule */}
          <div className="flex flex-col items-center flex-1 px-2">
            <p className="text-[9px] font-semibold text-brand-600 uppercase tracking-wide mb-1">{flow.schedule}</p>
            <div className="flex w-full items-center gap-1">
              <div className="h-px flex-1 bg-border" />
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
              <div className="h-px flex-1 bg-border" />
            </div>
          </div>

          {/* Destination */}
          <div className="flex items-center gap-2">
            <div>
              <p className="text-xs font-semibold text-foreground text-right">{flow.destination.name}</p>
              <p className="text-[10px] text-muted-foreground text-right">Destination</p>
            </div>
            <div className="h-9 w-9 rounded-xl flex items-center justify-center text-white text-[10px] font-bold shadow-sm" style={{ backgroundColor: flow.destination.color }}>
              {flow.destination.abbr}
            </div>
          </div>
        </div>

        {/* Status + success rate */}
        <div className="flex items-center justify-between mb-4">
          <StatusBadge status={flow.status} />
          {flow.status !== "draft" && (
            <span className="text-xs text-muted-foreground">{flow.successRate}% success</span>
          )}
        </div>

        {/* Error message */}
        {flow.recentError && (
          <div className="mb-4 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/20 px-3 py-2">
            <p className="text-xs text-rose-700 dark:text-rose-400 leading-snug">{flow.recentError}</p>
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 pt-3 border-t border-border">
          <div>
            <p className="text-[10px] text-muted-foreground">Last sync</p>
            <p className="text-xs font-semibold text-foreground mt-0.5">{flow.lastSync ?? "Never"}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Next sync</p>
            <p className={cn("text-xs font-semibold mt-0.5", !flow.nextSync ? "text-muted-foreground" : "text-foreground")}>
              {flow.nextSync ?? (flow.status === "paused" ? "Paused" : "—")}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Last run</p>
            <p className="text-xs font-semibold text-foreground mt-0.5">
              {flow.lastSyncRows !== null ? flow.lastSyncRows.toLocaleString() : "—"} rows
            </p>
          </div>
        </div>
      </div>

      {/* Action bar (appears on hover) */}
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.12 }}
            className="border-t border-border bg-muted/30 px-4 py-2.5 flex items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            {flow.status !== "error" && (
              <button
                onClick={handleSyncNow}
                disabled={syncing}
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors",
                  syncing && "opacity-60 cursor-not-allowed",
                  syncResult === "success" && "border-emerald-400 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20",
                  syncResult === "error" && "border-rose-400 text-rose-600 bg-rose-50 dark:bg-rose-950/20",
                  !syncResult && "border-border bg-white dark:bg-[#0e0f1a] text-muted-foreground hover:border-brand-400 hover:text-brand-600",
                )}
              >
                <Zap className={cn("h-3 w-3", syncing && "animate-pulse")} />
                {syncing ? "Syncing…" : syncResult === "success" ? "Synced!" : syncResult === "error" ? "Failed" : "Sync now"}
              </button>
            )}
            {flow.status === "active" && (
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  if (isDemo) { onTogglePause(); return; }
                  await fetch(`/api/flows/${flow.id}/pause`, { method: "POST" });
                  onTogglePause();
                }}
                className="flex h-7 items-center gap-1.5 rounded-lg border border-border bg-white dark:bg-[#0e0f1a] px-3 text-xs font-medium text-muted-foreground hover:border-amber-400 hover:text-amber-600 transition-colors"
              >
                <Pause className="h-3 w-3" /> Pause
              </button>
            )}
            {flow.status === "paused" && (
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  if (isDemo) { onTogglePause(); return; }
                  await fetch(`/api/flows/${flow.id}/resume`, { method: "POST" });
                  onTogglePause();
                }}
                className="flex h-7 items-center gap-1.5 rounded-lg border border-border bg-white dark:bg-[#0e0f1a] px-3 text-xs font-medium text-muted-foreground hover:border-emerald-400 hover:text-emerald-600 transition-colors"
              >
                <Play className="h-3 w-3" /> Resume
              </button>
            )}
            <div className="flex-1" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => onOpen()}>
                  <Settings className="h-3.5 w-3.5" /> View details
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { onEdit(); }}>
                  <Pencil className="h-3.5 w-3.5" /> Edit / Schedule
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { onDuplicate(); }}>
                  <Copy className="h-3.5 w-3.5" /> Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-rose-600 focus:text-rose-600 focus:bg-rose-50 dark:focus:bg-rose-950/20"
                  onClick={onDelete}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete flow
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-24 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 dark:bg-brand-950/20 mb-4">
        <ArrowRight className="h-6 w-6 text-brand-600" />
      </div>
      <p className="text-base font-semibold text-foreground mb-2">No flows yet</p>
      <p className="text-sm text-muted-foreground max-w-xs mb-6">
        Pick a source and a destination — CrossTecch handles the rest in under 3 minutes.
      </p>
      <Button size="sm" onClick={onAdd} className="gap-2">
        <Plus className="h-3.5 w-3.5" /> Connect your first source
      </Button>

    </div>
  );
}

// ── Schedule options ──────────────────────────────────────────────────────────

const SCHEDULE_OPTIONS: { label: string; value: string }[] = [
  { label: "Every 15 minutes", value: "every_15min" },
  { label: "Every 30 minutes", value: "every_30min" },
  { label: "Every hour",       value: "every_hour"  },
  { label: "Every 3 hours",    value: "every_3h"    },
  { label: "Every 6 hours",    value: "every_6h"    },
  { label: "Every 12 hours",   value: "every_12h"   },
  { label: "Daily",            value: "daily"       },
  { label: "Weekly",           value: "weekly"      },
];

// ── Edit Flow Modal ───────────────────────────────────────────────────────────

function EditFlowModal({
  flow,
  onClose,
  onSave,
}: {
  flow: DataFlow;
  onClose: () => void;
  onSave: (scheduleValue: string) => void;
}) {
  const [schedule, setSchedule] = React.useState(flow.scheduleValue ?? "every_hour");

  function handleSave() {
    onSave(schedule);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-white dark:bg-[#0e0f1a] shadow-2xl p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-950/20">
              <CalendarClock className="h-4 w-4 text-brand-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Edit Flow</p>
              <p className="text-xs text-muted-foreground">{flow.source.name} → {flow.destination.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground/60 hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-2">Sync Schedule</label>
            <div className="grid grid-cols-2 gap-2">
              {SCHEDULE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setSchedule(opt.value)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-xs font-medium text-left transition-colors",
                    schedule === opt.value
                      ? "border-brand-500 bg-brand-50 dark:bg-brand-950/20 text-brand-700 dark:text-brand-400"
                      : "border-border bg-transparent text-muted-foreground hover:border-brand-300 hover:text-foreground"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <Button variant="outline" size="sm" className="flex-1 h-8 text-xs" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" className="flex-1 h-8 text-xs" onClick={handleSave}>
            Save changes
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FlowsPage() {
  const router = useRouter();
  const { startWizard } = useFlowWizardStore();
  const { addEvent } = useDemoStore();
  const { toast } = useToast();
  const {
    flows, isLoading,
    deleteFlow, setFlowStatus, updateSchedule, duplicateFlow,
  } = useServerFlows();
  const [editingFlow, setEditingFlow] = React.useState<DataFlow | null>(null);

  const active = flows.filter(f => f.status === "active").length;
  const errors = flows.filter(f => f.status === "error").length;

  function handleDuplicate(flow: DataFlow) {
    duplicateFlow(flow);
    addEvent({
      type: "flow_created",
      title: "Flow duplicated",
      description: `${flow.source.name} → ${flow.destination.name} (copy)`,
      flowId: flow.id,
      flowName: `${flow.source.name} → ${flow.destination.name}`,
    });
    toast.success("Flow duplicated", `A draft copy of ${flow.source.name} → ${flow.destination.name} was created.`);
  }

  function handleSaveEdit(flow: DataFlow, scheduleValue: string) {
    const schedule = SCHEDULE_LABELS[scheduleValue] ?? scheduleValue;
    updateSchedule(flow.id, scheduleValue);
    addEvent({
      type: "schedule_updated",
      title: "Schedule updated",
      description: `${flow.source.name} → ${flow.destination.name}: ${schedule}`,
      flowId: flow.id,
      flowName: `${flow.source.name} → ${flow.destination.name}`,
    });
    toast.success("Schedule updated", `Flow now syncs ${schedule.toLowerCase()}.`);
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Flows</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {active} active · {errors > 0 ? <span className="text-rose-600">{errors} error{errors !== 1 ? "s" : ""}</span> : "no errors"} · {flows.length} total
          </p>
        </div>
        <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={() => startWizard()}>
          <Plus className="h-3.5 w-3.5" /> New Flow
        </Button>
      </motion.div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-white dark:bg-[#0e0f1a] p-5 animate-pulse">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-9 w-9 rounded-xl bg-muted" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-20 bg-muted rounded" />
                  <div className="h-2.5 w-12 bg-muted rounded" />
                </div>
                <div className="h-9 w-9 rounded-xl bg-muted" />
              </div>
              <div className="h-6 w-24 bg-muted rounded-full mb-4" />
              <div className="grid grid-cols-3 gap-3 pt-3 border-t border-border">
                {[0,1,2].map(j => <div key={j} className="space-y-1"><div className="h-2.5 w-12 bg-muted rounded" /><div className="h-3 w-16 bg-muted rounded" /></div>)}
              </div>
            </div>
          ))
        ) : flows.length === 0
          ? <EmptyState onAdd={() => startWizard()} />
          : flows.map((flow, i) => (
              <FlowCard
                key={flow.id}
                flow={flow}
                index={i}
                onOpen={() => router.push(ROUTES.FLOW(flow.id))}
                onDelete={() => {
                  deleteFlow(flow.id);
                  addEvent({ type: "flow_deleted", title: "Flow deleted", description: `${flow.source.name} → ${flow.destination.name}`, flowId: flow.id, flowName: `${flow.source.name} → ${flow.destination.name}` });
                  toast.info("Flow deleted", `${flow.source.name} → ${flow.destination.name} was removed.`);
                }}
                onTogglePause={() => {
                  const next: "active" | "paused" = flow.status === "paused" ? "active" : "paused";
                  setFlowStatus(flow.id, next);
                  addEvent({ type: next === "paused" ? "flow_paused" : "flow_resumed", title: next === "paused" ? "Flow paused" : "Flow resumed", description: `${flow.source.name} → ${flow.destination.name}`, flowId: flow.id, flowName: `${flow.source.name} → ${flow.destination.name}` });
                  toast.info(next === "paused" ? "Flow paused" : "Flow resumed", `${flow.source.name} → ${flow.destination.name}`);
                }}
                onDuplicate={() => handleDuplicate(flow)}
                onEdit={() => setEditingFlow(flow)}
              />
            ))
        }
      </div>

      {/* Edit modal */}
      <AnimatePresence>
        {editingFlow && (
          <EditFlowModal
            flow={editingFlow}
            onClose={() => setEditingFlow(null)}
            onSave={(scheduleValue) => handleSaveEdit(editingFlow, scheduleValue)}
          />
        )}
      </AnimatePresence>

      {/* Flow wizard modal — rendered here so it sits above the page */}
      <FlowWizardModal />
    </div>
  );
}
