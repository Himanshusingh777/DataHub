"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  AlertTriangle,
  MoreHorizontal,
  ArrowUpRight,
  RotateCcw,
} from "lucide-react";
import { cn, formatRelativeTime, formatNumber, formatDuration } from "@/lib/utils";
import { MOCK_SYNC_JOBS } from "@/lib/mock-data";
import type { SyncJob, SyncStatus } from "@/types";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const statusConfig: Record<
  SyncStatus,
  { label: string; icon: React.ElementType; variant: "success" | "error" | "info" | "warning" | "neutral" }
> = {
  success: { label: "Success", icon: CheckCircle2, variant: "success" },
  failed: { label: "Failed", icon: XCircle, variant: "error" },
  running: { label: "Running", icon: Loader2, variant: "info" },
  queued: { label: "Queued", icon: Clock, variant: "neutral" },
  partial: { label: "Partial", icon: AlertTriangle, variant: "warning" },
};

function SyncJobRow({ job, index }: { job: SyncJob; index: number }) {
  const { label, icon: StatusIcon, variant } = statusConfig[job.status];

  return (
    <motion.tr
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04 }}
      className="group border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors"
    >
      {/* Connector */}
      <td className="py-3 pl-5 pr-3">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white text-[9px] font-bold"
            style={{ backgroundColor: job.connectorColor }}
          >
            {job.connectorName.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-medium text-foreground leading-tight">
              {job.connectorName}
            </p>
            <p className="text-[11px] text-muted-foreground capitalize">{job.connectorType}</p>
          </div>
        </div>
      </td>

      {/* Pipeline */}
      <td className="py-3 px-3">
        <span className="text-sm text-foreground">{job.pipelineName}</span>
      </td>

      {/* Started */}
      <td className="py-3 px-3">
        <span className="text-sm text-muted-foreground">
          {formatRelativeTime(job.startedAt)}
        </span>
      </td>

      {/* Duration */}
      <td className="py-3 px-3">
        <span className="text-sm text-muted-foreground tabular-nums">
          {job.duration !== null ? formatDuration(job.duration) : "—"}
        </span>
      </td>

      {/* Records */}
      <td className="py-3 px-3">
        {job.recordsProcessed !== null ? (
          <div>
            <span className="text-sm font-medium text-foreground tabular-nums">
              {formatNumber(job.recordsProcessed)}
            </span>
            {job.recordsFailed > 0 && (
              <span className="ml-1 text-[11px] text-rose-500">
                ({job.recordsFailed} err)
              </span>
            )}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </td>

      {/* Status */}
      <td className="py-3 px-3">
        <Badge variant={variant} className="gap-1">
          <StatusIcon
            className={cn("h-3 w-3", job.status === "running" && "animate-spin")}
          />
          {label}
        </Badge>
      </td>

      {/* Action */}
      <td className="py-3 pl-3 pr-5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-muted hover:text-foreground group-hover:opacity-100">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>
              <ArrowUpRight className="h-3.5 w-3.5" />
              View details
            </DropdownMenuItem>
            <DropdownMenuItem>
              <RotateCcw className="h-3.5 w-3.5" />
              Retry sync
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </motion.tr>
  );
}

export function RecentSyncJobs() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.4 }}
      className="rounded-xl border border-border bg-white dark:bg-[#0e0f1a] shadow-card overflow-hidden"
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Recent Sync Jobs</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Latest pipeline executions</p>
        </div>
        <button className="text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors">
          View all →
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px]">
          <thead>
            <tr className="border-b border-border/50 bg-muted/20">
              <th className="py-2.5 pl-5 pr-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Connector
              </th>
              <th className="py-2.5 px-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Pipeline
              </th>
              <th className="py-2.5 px-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Started
              </th>
              <th className="py-2.5 px-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Duration
              </th>
              <th className="py-2.5 px-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Records
              </th>
              <th className="py-2.5 px-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Status
              </th>
              <th className="py-2.5 pl-3 pr-5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {MOCK_SYNC_JOBS.map((job, i) => (
              <SyncJobRow key={job.id} job={job} index={i} />
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
