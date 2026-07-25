"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  XCircle,
  Plug,
  AlertCircle,
  GitBranch,
  PauseCircle,
  UserPlus,
  Database,
  Bell,
} from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import { MOCK_ACTIVITY } from "@/lib/mock-data";
import type { ActivityType } from "@/types";
import { ScrollArea } from "@/components/ui/scroll-area";

const activityConfig: Record<
  ActivityType,
  { icon: React.ElementType; className: string }
> = {
  sync_success: {
    icon: CheckCircle2,
    className: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400",
  },
  sync_failed: {
    icon: XCircle,
    className: "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400",
  },
  connector_added: {
    icon: Plug,
    className: "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400",
  },
  connector_error: {
    icon: AlertCircle,
    className: "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400",
  },
  pipeline_created: {
    icon: GitBranch,
    className: "bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-400",
  },
  pipeline_paused: {
    icon: PauseCircle,
    className: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
  },
  user_invited: {
    icon: UserPlus,
    className: "bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400",
  },
  schema_change: {
    icon: Database,
    className: "bg-cyan-50 text-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-400",
  },
  alert_triggered: {
    icon: Bell,
    className: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
  },
};

export function ActivityTimeline() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.45 }}
      className="rounded-xl border border-border bg-white dark:bg-[#0e0f1a] shadow-card flex flex-col"
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Activity Timeline</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Recent events across workspace</p>
        </div>
        <button className="text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors">
          View all →
        </button>
      </div>

      <ScrollArea className="flex-1">
        <div className="relative px-5 py-4">
          {/* Vertical line */}
          <div className="absolute left-[35px] top-4 bottom-4 w-px bg-border" />

          <div className="space-y-4">
            {MOCK_ACTIVITY.sort(
              (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            ).map((event, i) => {
              const { icon: Icon, className } = activityConfig[event.type];

              return (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.25, delay: i * 0.04 }}
                  className="relative flex items-start gap-3 pl-1"
                >
                  <div
                    className={cn(
                      "relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full mt-0.5",
                      className
                    )}
                  >
                    <Icon className="h-3 w-3" />
                  </div>
                  <div className="min-w-0 flex-1 pt-0">
                    <p className="text-sm font-medium text-foreground leading-snug">
                      {event.title}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                      {event.description}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground/60">
                      {formatRelativeTime(event.timestamp)}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </ScrollArea>
    </motion.div>
  );
}
