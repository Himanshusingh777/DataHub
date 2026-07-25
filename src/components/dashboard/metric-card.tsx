"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Plug,
  GitBranch,
  RefreshCw,
  AlertTriangle,
  Database,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MetricCard as MetricCardType } from "@/types";

const iconMap: Record<string, React.ElementType> = {
  Plug,
  GitBranch,
  RefreshCw,
  AlertTriangle,
  Database,
  Activity,
};

const colorConfig = {
  blue: {
    icon: "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400",
    badge: "text-blue-600 bg-blue-50 dark:bg-blue-950/30 dark:text-blue-400",
    dot: "bg-blue-500",
  },
  green: {
    icon: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400",
    badge: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  purple: {
    icon: "bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400",
    badge: "text-violet-600 bg-violet-50 dark:bg-violet-950/30 dark:text-violet-400",
    dot: "bg-violet-500",
  },
  rose: {
    icon: "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400",
    badge: "text-rose-600 bg-rose-50 dark:bg-rose-950/30 dark:text-rose-400",
    dot: "bg-rose-500",
  },
  cyan: {
    icon: "bg-cyan-50 text-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-400",
    badge: "text-cyan-600 bg-cyan-50 dark:bg-cyan-950/30 dark:text-cyan-400",
    dot: "bg-cyan-500",
  },
  amber: {
    icon: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
    badge: "text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400",
    dot: "bg-amber-500",
  },
};

interface MetricCardProps {
  card: MetricCardType;
  index: number;
}

export function MetricCard({ card, index }: MetricCardProps) {
  const Icon = iconMap[card.icon] ?? Activity;
  const colors = colorConfig[card.color];

  const trendIcon =
    card.trend === "up" ? (
      <TrendingUp className="h-3 w-3" />
    ) : card.trend === "down" ? (
      <TrendingDown className="h-3 w-3" />
    ) : (
      <Minus className="h-3 w-3" />
    );

  const trendColor =
    card.trend === "up"
      ? card.color === "rose"
        ? "text-rose-600 bg-rose-50 dark:bg-rose-950/30 dark:text-rose-400"
        : "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400"
      : card.trend === "down"
      ? card.color === "rose"
        ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400"
        : "text-rose-600 bg-rose-50 dark:bg-rose-950/30 dark:text-rose-400"
      : "text-muted-foreground bg-muted";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06, ease: "easeOut" }}
      whileHover={{ y: -2, transition: { duration: 0.15 } }}
      className="group relative rounded-xl border border-border bg-white dark:bg-[#0e0f1a] shadow-card hover:shadow-card-hover transition-shadow duration-200 p-5"
    >
      <div className="flex items-start justify-between">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", colors.icon)}>
          <Icon className="h-[18px] w-[18px]" />
        </div>
        <div className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", trendColor)}>
          {trendIcon}
          <span>{Math.abs(card.change)}%</span>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
        <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">
          {card.value}
        </p>
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground/60">{card.changeLabel}</p>
    </motion.div>
  );
}
