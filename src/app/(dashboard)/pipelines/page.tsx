"use client";

import React from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  Plus, Play, Pause, MoreHorizontal, CheckCircle2, XCircle,
  Clock, GitBranch, Zap, TrendingUp, Settings, Copy, Trash2,
  History, ArrowRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { MOCK_PIPELINES_FULL } from "@/lib/pipeline-types";
import type { Pipeline } from "@/lib/pipeline-types";

const STATUS_CONFIG = {
  active: { label: "Active", color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/20", dot: "bg-emerald-500 animate-pulse" },
  paused: { label: "Paused", color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/20", dot: "bg-amber-500" },
  error:  { label: "Error",  color: "text-rose-600",  bg: "bg-rose-50 dark:bg-rose-950/20",   dot: "bg-rose-500" },
  draft:  { label: "Draft",  color: "text-muted-foreground", bg: "bg-muted", dot: "bg-muted-foreground" },
};

function PipelineCard({ pipeline, index }: { pipeline: Pipeline; index: number }) {
  const router = useRouter();
  const cfg = STATUS_CONFIG[pipeline.status];
  const total = pipeline.successCount + pipeline.failureCount;
  const successRate = total > 0 ? Math.round((pipeline.successCount / total) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.05 }}
      whileHover={{ y: -2, transition: { duration: 0.15 } }}
      className="group relative flex flex-col rounded-xl border border-border bg-white dark:bg-[#0e0f1a] p-5 shadow-card hover:shadow-card-hover transition-all duration-200"
    >
      {/* Top */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-950/30">
            <GitBranch className="h-5 w-5 text-brand-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground leading-tight">{pipeline.name}</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">{pipeline.description}</p>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => router.push(`/pipelines/${pipeline.id}/builder`)}>
              <Settings className="h-3.5 w-3.5" /> Edit Pipeline
            </DropdownMenuItem>
            <DropdownMenuItem><Play className="h-3.5 w-3.5" />Run Now</DropdownMenuItem>
            <DropdownMenuItem><History className="h-3.5 w-3.5" />View History</DropdownMenuItem>
            <DropdownMenuItem><Copy className="h-3.5 w-3.5" />Duplicate</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-rose-600 focus:text-rose-600 focus:bg-rose-50">
              <Trash2 className="h-3.5 w-3.5" />Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Node flow preview */}
      <div className="mb-4 flex items-center gap-1 overflow-x-auto scrollbar-hide">
        {pipeline.nodes.map((node, ni) => (
          <React.Fragment key={node.id}>
            <div className={cn(
              "flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold whitespace-nowrap shrink-0 border",
              node.type === "source"
                ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/20 dark:text-blue-400"
                : node.type === "destination"
                ? "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/20 dark:text-violet-400"
                : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-400"
            )}>
              {node.label}
            </div>
            {ni < pipeline.nodes.length - 1 && (
              <ArrowRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 rounded-xl bg-muted/40 p-3 mb-4">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Last Run</p>
          <p className="text-xs font-medium text-foreground mt-0.5">{pipeline.lastRun || "Never"}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Schedule</p>
          <p className="text-xs font-medium text-foreground mt-0.5">{pipeline.schedule}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Success</p>
          <p className={cn("text-xs font-bold mt-0.5",
            successRate >= 90 ? "text-emerald-600" : successRate >= 70 ? "text-amber-600" : "text-rose-600"
          )}>
            {successRate}%
          </p>
        </div>
      </div>

      {/* Success bar */}
      <div className="mb-4">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
          <div
            className={cn("h-full rounded-full", successRate >= 90 ? "bg-emerald-500" : successRate >= 70 ? "bg-amber-400" : "bg-rose-500")}
            style={{ width: `${successRate}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>{pipeline.successCount} passed</span>
          <span>{pipeline.failureCount} failed</span>
        </div>
      </div>

      {/* Bottom row */}
      <div className="flex items-center justify-between">
        <div className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium", cfg.bg, cfg.color)}>
          <div className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
          {cfg.label}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => router.push(`/pipelines/${pipeline.id}/builder`)}>
            <Settings className="h-3 w-3" /> Edit
          </Button>
          <Button size="sm" className="h-7 gap-1 text-xs" disabled={pipeline.status === "draft"}>
            <Play className="h-3 w-3" /> Run
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

// ── Filter options ─────────────────────────────────────────────────────────────
const FILTER_OPTIONS = ["all", "active", "paused", "error", "draft"] as const;
type FilterOption = typeof FILTER_OPTIONS[number];

export default function PipelinesPage() {
  const router = useRouter();
  const [filter, setFilter] = React.useState<FilterOption>("all");

  const filtered = MOCK_PIPELINES_FULL.filter((p) => filter === "all" || p.status === filter);
  const summary = {
    total: MOCK_PIPELINES_FULL.length,
    active: MOCK_PIPELINES_FULL.filter((p) => p.status === "active").length,
    error: MOCK_PIPELINES_FULL.filter((p) => p.status === "error").length,
    avgSuccess: Math.round(
      MOCK_PIPELINES_FULL.reduce((acc, p) => {
        const t = p.successCount + p.failureCount;
        return acc + (t > 0 ? (p.successCount / t) * 100 : 0);
      }, 0) / MOCK_PIPELINES_FULL.length
    ),
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Pipelines</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {summary.total} pipelines · {summary.active} active · {summary.error} with errors
          </p>
        </div>
        <Button className="gap-2 h-9" onClick={() => router.push("/pipelines/new")}>
          <Plus className="h-4 w-4" /> New Pipeline
        </Button>
      </motion.div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Pipelines", value: summary.total, icon: GitBranch, color: "text-brand-600", bg: "bg-brand-50 dark:bg-brand-950/20" },
          { label: "Active",          value: summary.active, icon: Zap, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/20" },
          { label: "Avg Success Rate",value: `${summary.avgSuccess}%`, icon: TrendingUp, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/20" },
          { label: "With Errors",     value: summary.error, icon: XCircle, color: "text-rose-600", bg: "bg-rose-50 dark:bg-rose-950/20" },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }}
            className="rounded-xl border border-border bg-white dark:bg-[#0e0f1a] p-4 shadow-card"
          >
            <div className={cn("mb-2 flex h-8 w-8 items-center justify-center rounded-lg", s.bg)}>
              <s.icon className={cn("h-4 w-4", s.color)} />
            </div>
            <p className="text-xl font-bold text-foreground">{s.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
        {FILTER_OPTIONS.map((f) => {
          const count = f === "all" ? MOCK_PIPELINES_FULL.length : MOCK_PIPELINES_FULL.filter((p) => p.status === f).length;
          return (
            <button key={f} onClick={() => setFilter(f)} className={cn(
              "shrink-0 rounded-lg border px-3.5 py-1.5 text-xs font-medium capitalize transition-colors",
              filter === f
                ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-700 dark:bg-brand-950/20 dark:text-brand-400"
                : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
            )}>
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)} ({count})
            </button>
          );
        })}
      </div>

      {/* Pipeline grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <GitBranch className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-foreground">No pipelines found</p>
          <p className="mt-1 text-xs text-muted-foreground">Try a different filter or create a new pipeline</p>
          <Button variant="outline" size="sm" className="mt-4 gap-2" onClick={() => router.push("/pipelines/new")}>
            <Plus className="h-3.5 w-3.5" /> Create Pipeline
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p, i) => <PipelineCard key={p.id} pipeline={p} index={i} />)}
        </div>
      )}
    </div>
  );
}
