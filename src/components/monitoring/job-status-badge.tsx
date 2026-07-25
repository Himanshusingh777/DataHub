import React from "react";
import { CheckCircle2, XCircle, Loader2, Clock, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import type { JobStatus } from "@/lib/monitoring-data";

const CONFIG: Record<JobStatus, {
  label: string;
  icon: React.ElementType;
  cls: string;
  dot: string;
}> = {
  success:   { label: "Success",   icon: CheckCircle2, cls: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800", dot: "bg-emerald-500" },
  failed:    { label: "Failed",    icon: XCircle,      cls: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800",         dot: "bg-rose-500" },
  running:   { label: "Running",   icon: Loader2,      cls: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800",         dot: "bg-blue-500 animate-pulse" },
  queued:    { label: "Queued",    icon: Clock,        cls: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800",   dot: "bg-amber-500" },
  cancelled: { label: "Cancelled", icon: Ban,          cls: "bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-900/30 dark:text-gray-400 dark:border-gray-700",        dot: "bg-gray-400" },
};

interface JobStatusBadgeProps {
  status: JobStatus;
  size?: "sm" | "md";
}

export function JobStatusBadge({ status, size = "md" }: JobStatusBadgeProps) {
  const { label, icon: Icon, cls, dot } = CONFIG[status];
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full border font-medium",
      size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
      cls
    )}>
      {status === "running"
        ? <Icon className={cn("animate-spin", size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3")} />
        : <span className={cn("rounded-full shrink-0", size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2", dot)} />
      }
      {label}
    </span>
  );
}

export function jobStatusColor(status: JobStatus) {
  return CONFIG[status].cls;
}
