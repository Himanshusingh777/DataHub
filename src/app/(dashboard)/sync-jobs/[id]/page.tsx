"use client";

import React, { use } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft, Download, RotateCcw, CheckCircle2, XCircle,
  Loader2, Clock, AlertTriangle, Database, Server,
  ArrowRight, Hash, BarChart2, Info, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { JobStatusBadge } from "@/components/monitoring/job-status-badge";
import { MOCK_SYNC_JOBS } from "@/lib/monitoring-data";
import type { JobStep } from "@/lib/monitoring-data";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/config/routes";

function formatDuration(ms: number | null) {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

function formatTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
}

function StepIcon({ status }: { status: JobStep["status"] }) {
  const base = "h-5 w-5";
  if (status === "success")  return <CheckCircle2 className={cn(base, "text-emerald-500")} />;
  if (status === "failed")   return <XCircle className={cn(base, "text-rose-500")} />;
  if (status === "running")  return <Loader2 className={cn(base, "text-blue-500 animate-spin")} />;
  if (status === "skipped")  return <ChevronRight className={cn(base, "text-muted-foreground")} />;
  return <Clock className={cn(base, "text-muted-foreground/40")} />;
}

function StepRow({ step, isLast }: { step: JobStep; isLast: boolean }) {
  const [open, setOpen] = React.useState(step.status === "failed");
  return (
    <div className="relative flex gap-4">
      {/* Timeline line */}
      {!isLast && (
        <div className="absolute left-[10px] top-6 bottom-0 w-px bg-border" />
      )}

      {/* Icon */}
      <div className="relative z-10 mt-0.5 shrink-0">
        <StepIcon status={step.status} />
      </div>

      {/* Content */}
      <div className="flex-1 pb-6">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between text-left"
        >
          <div className="flex items-center gap-2.5">
            <span className={cn("text-sm font-semibold",
              step.status === "pending" ? "text-muted-foreground" : "text-foreground"
            )}>
              {step.label}
            </span>
            {step.status === "running" && (
              <Badge variant="info" className="text-[10px]">In progress</Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground font-mono">{formatDuration(step.durationMs)}</span>
        </button>

        {(open || step.message) && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-2 overflow-hidden">
            <div className={cn("rounded-lg border p-3 text-xs space-y-1.5",
              step.status === "failed"
                ? "border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/20"
                : "border-border bg-muted/30"
            )}>
              {step.message && (
                <div className="flex items-start gap-2">
                  {step.status === "failed" ? <AlertTriangle className="h-3.5 w-3.5 text-rose-500 mt-0.5 shrink-0" /> : <Info className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />}
                  <span className={step.status === "failed" ? "text-rose-700 dark:text-rose-300" : "text-muted-foreground"}>{step.message}</span>
                </div>
              )}
              {step.rowsIn !== null && (
                <div className="grid grid-cols-3 gap-3 pt-1">
                  <div><p className="text-muted-foreground uppercase tracking-wide text-[9px]">Rows In</p><p className="font-mono font-medium text-foreground">{step.rowsIn.toLocaleString()}</p></div>
                  <div><p className="text-muted-foreground uppercase tracking-wide text-[9px]">Rows Out</p><p className="font-mono font-medium text-foreground">{step.rowsOut?.toLocaleString() ?? "—"}</p></div>
                  <div><p className="text-muted-foreground uppercase tracking-wide text-[9px]">Duration</p><p className="font-mono font-medium text-foreground">{formatDuration(step.durationMs)}</p></div>
                </div>
              )}
              {step.startedAt && (
                <p className="text-muted-foreground/60 text-[10px]">{formatTime(step.startedAt)} → {formatTime(step.completedAt)}</p>
              )}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

export default function JobDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const job = MOCK_SYNC_JOBS.find((j) => j.id === id);

  if (!job) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <XCircle className="h-12 w-12 text-muted-foreground/30" />
        <p className="text-sm font-medium text-foreground">Job not found</p>
        <Button variant="outline" size="sm" onClick={() => router.push(ROUTES.ACTIVITY)}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Activity
        </Button>
      </div>
    );
  }

  const successRate = job.rowsProcessed > 0
    ? Math.round((job.rowsProcessed / (job.rowsProcessed + job.rowsErrored)) * 100)
    : 0;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl">
      {/* Breadcrumb + header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <button onClick={() => router.push(ROUTES.ACTIVITY)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3">
          <ArrowLeft className="h-3.5 w-3.5" /> Activity
        </button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-xl font-bold text-foreground font-mono">{job.id}</h1>
              <JobStatusBadge status={job.status} />
            </div>
            <p className="text-sm text-muted-foreground">{job.pipelineName}</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" className="gap-2 h-9">
              <Download className="h-4 w-4" /> Download Logs
            </Button>
            <Button size="sm" className="gap-2 h-9" disabled={job.status === "running" || job.status === "queued"}>
              <RotateCcw className="h-4 w-4" /> Retry Job
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Error alert */}
      {job.errorMessage && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/20 p-4">
          <AlertTriangle className="h-5 w-5 text-rose-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">Job Failed</p>
            <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">{job.errorMessage}</p>
          </div>
        </motion.div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Started At",        value: formatTime(job.startedAt) },
          { label: "Completed At",      value: formatTime(job.completedAt) },
          { label: "Duration",          value: formatDuration(job.durationMs) },
          { label: "Triggered By",      value: job.triggeredBy.charAt(0).toUpperCase() + job.triggeredBy.slice(1) },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-white dark:bg-[#0e0f1a] p-4 shadow-card">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{s.label}</p>
            <p className="text-sm font-semibold text-foreground mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Records */}
        <div className="rounded-xl border border-border bg-white dark:bg-[#0e0f1a] p-5 shadow-card">
          <div className="flex items-center gap-2 mb-4">
            <Hash className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Records</h3>
          </div>
          <div className="space-y-3">
            {[
              { label: "Rows Processed",  value: job.rowsProcessed.toLocaleString(), color: "text-emerald-600" },
              { label: "Rows Errored",    value: job.rowsErrored > 0 ? job.rowsErrored.toLocaleString() : "0", color: job.rowsErrored > 0 ? "text-rose-600" : "text-muted-foreground" },
              { label: "Warnings",        value: job.warnings.toString(), color: job.warnings > 0 ? "text-amber-600" : "text-muted-foreground" },
              { label: "Data Volume",     value: `${job.dataVolumeMB} MB`, color: "text-foreground" },
            ].map((r) => (
              <div key={r.label} className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{r.label}</span>
                <span className={cn("text-sm font-bold font-mono", r.color)}>{r.value}</span>
              </div>
            ))}
            {/* Success rate bar */}
            {job.rowsProcessed > 0 && (
              <div className="pt-2">
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                  <span>Success rate</span>
                  <span className="font-semibold">{successRate}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
                  <div className={cn("h-full rounded-full", successRate >= 90 ? "bg-emerald-500" : "bg-amber-400")}
                    style={{ width: `${successRate}%` }} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Source → Destination */}
        <div className="rounded-xl border border-border bg-white dark:bg-[#0e0f1a] p-5 shadow-card">
          <div className="flex items-center gap-2 mb-4">
            <Database className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Data Flow</h3>
          </div>
          <div className="space-y-3">
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-1">Source</p>
              <p className="text-sm font-semibold text-foreground">{job.connectorName}</p>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">{job.sourceTable}</p>
            </div>
            <div className="flex justify-center">
              <ArrowRight className="h-4 w-4 text-muted-foreground/50" />
            </div>
            <div className="rounded-lg bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400 mb-1">Destination</p>
              <p className="text-sm font-semibold text-foreground">Warehouse</p>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">{job.destinationTable}</p>
            </div>
          </div>
        </div>

        {/* Connector info */}
        <div className="rounded-xl border border-border bg-white dark:bg-[#0e0f1a] p-5 shadow-card">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Connector</h3>
          </div>
          <div className="flex items-center gap-3 mb-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold text-white shadow-sm"
              style={{ backgroundColor: job.connectorColor }}>
              {job.connectorAbbr}
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">{job.connectorName}</p>
              <p className="text-xs text-muted-foreground">{job.pipelineName}</p>
            </div>
          </div>
          <div className="space-y-2">
            {[
              { label: "Pipeline",   value: job.pipelineName },
              { label: "Job ID",     value: job.id },
              { label: "Source",     value: job.sourceTable },
            ].map((r) => (
              <div key={r.label} className="flex justify-between text-xs">
                <span className="text-muted-foreground">{r.label}</span>
                <span className="font-mono text-foreground truncate max-w-[140px]">{r.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Execution timeline */}
      <div className="rounded-xl border border-border bg-white dark:bg-[#0e0f1a] shadow-card">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Execution Steps</h3>
          <Badge variant="secondary" className="text-[10px]">
            {job.steps.filter((s) => s.status === "success").length} / {job.steps.length} completed
          </Badge>
        </div>
        <div className="p-5">
          {job.steps.map((step, i) => (
            <StepRow key={step.id} step={step} isLast={i === job.steps.length - 1} />
          ))}
        </div>
      </div>
    </div>
  );
}
