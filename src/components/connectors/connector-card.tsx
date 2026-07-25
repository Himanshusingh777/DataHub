"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  CheckCircle2, Clock, Zap, Settings, MoreHorizontal,
  RefreshCw, Trash2, AlertCircle
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConnectorLogo } from "@/components/connectors/connector-logo";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { cn, formatRelativeTime, formatNumber } from "@/lib/utils";
import { CATEGORY_LABELS, CATEGORY_COLORS } from "@/lib/connectors-data";
import { ROUTES } from "@/config/routes";
import type { ConnectorDef } from "@/lib/connectors-data";

// ── Health bar ────────────────────────────────────────────────────────────────
function HealthBar({ health }: { health: ConnectorDef["health"] }) {
  if (!health) return null;
  const bars = [1, 2, 3, 4, 5];
  const filled = health === "healthy" ? 5 : health === "degraded" ? 3 : 1;
  const color = health === "healthy" ? "bg-emerald-500" : health === "degraded" ? "bg-amber-400" : "bg-rose-500";
  return (
    <div className="flex items-center gap-0.5">
      {bars.map((b) => (
        <div key={b} className={cn("h-2.5 w-1 rounded-sm", b <= filled ? color : "bg-border")} />
      ))}
    </div>
  );
}

// ── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: ConnectorDef["status"] }) {
  const config = {
    connected: { label: "Connected", icon: CheckCircle2, variant: "success" as const },
    available: { label: "Available", icon: Clock, variant: "neutral" as const },
    beta: { label: "Beta", icon: Zap, variant: "warning" as const },
    coming_soon: { label: "Coming Soon", icon: Clock, variant: "neutral" as const },
  }[status];
  return (
    <Badge variant={config.variant} className="gap-1 text-[10px]">
      <config.icon className="h-2.5 w-2.5" />
      {config.label}
    </Badge>
  );
}

interface ConnectorCardProps {
  connector: ConnectorDef;
  index: number;
  onConnect: (connector: ConnectorDef) => void;
  onDisconnect?: (connectorId: string) => void;
  view: "grid" | "list";
}

export function ConnectorCard({ connector, index, onConnect, onDisconnect, view }: ConnectorCardProps) {
  const isConnected = connector.status === "connected";

  if (view === "list") {
    return (
      <motion.div
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2, delay: index * 0.03 }}
        className="group flex items-center gap-4 rounded-xl border border-border bg-white dark:bg-[#0e0f1a] p-4 shadow-card hover:shadow-card-hover transition-shadow"
      >
        <ConnectorLogo connector={connector} size="md" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground">{connector.name}</span>
            <StatusBadge status={connector.status} />
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", CATEGORY_COLORS[connector.category])}>
              {CATEGORY_LABELS[connector.category]}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{connector.description}</p>
        </div>

        <div className="hidden lg:flex items-center gap-6 shrink-0">
          {isConnected && (
            <>
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Last Sync</p>
                <p className="text-xs font-medium text-foreground">
                  {connector.lastSync ? formatRelativeTime(connector.lastSync) : "—"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Records</p>
                <p className="text-xs font-medium text-foreground">{formatNumber(connector.totalRecords)}</p>
              </div>
              <HealthBar health={connector.health} />
            </>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isConnected ? (
            <>
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" asChild>
                <Link href={ROUTES.CONNECTOR(connector.id)}>
                  <Settings className="h-3.5 w-3.5" /> Configure
                </Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem><RefreshCw className="h-3.5 w-3.5" />Sync now</DropdownMenuItem>
                  <DropdownMenuItem><Settings className="h-3.5 w-3.5" />Configure</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-rose-600 focus:text-rose-600 focus:bg-rose-50"
                    onClick={() => onDisconnect?.(connector.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />Disconnect
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => onConnect(connector)}
              disabled={connector.status === "coming_soon"}
            >
              <Zap className="h-3.5 w-3.5" /> Connect
            </Button>
          )}
        </div>
      </motion.div>
    );
  }

  // Grid view
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04 }}
      whileHover={{ y: -2, transition: { duration: 0.15 } }}
      className="group relative flex flex-col rounded-xl border border-border bg-white dark:bg-[#0e0f1a] p-5 shadow-card hover:shadow-card-hover transition-all duration-200"
    >
      {/* Top row */}
      <div className="flex items-start justify-between mb-4">
        <ConnectorLogo connector={connector} size="md" />
        <div className="flex items-center gap-1.5">
          {connector.health && <HealthBar health={connector.health} />}
          {isConnected && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-muted hover:text-foreground group-hover:opacity-100">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem><RefreshCw className="h-3.5 w-3.5" />Sync now</DropdownMenuItem>
                <DropdownMenuItem><Settings className="h-3.5 w-3.5" />Configure</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-rose-600 focus:text-rose-600 focus:bg-rose-50">
                  <Trash2 className="h-3.5 w-3.5" />Disconnect
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Name + category */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <h3 className="text-sm font-semibold text-foreground leading-tight">{connector.name}</h3>
        <StatusBadge status={connector.status} />
      </div>

      <span className={cn("mb-2 inline-block w-fit rounded-full px-2 py-0.5 text-[10px] font-medium", CATEGORY_COLORS[connector.category])}>
        {CATEGORY_LABELS[connector.category]}
      </span>

      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 flex-1">
        {connector.description}
      </p>

      {/* Stats (connected) */}
      {isConnected && (
        <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-muted/40 p-3">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Last Sync</p>
            <p className="text-xs font-medium text-foreground mt-0.5">
              {connector.lastSync ? formatRelativeTime(connector.lastSync) : "—"}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Records</p>
            <p className="text-xs font-medium text-foreground mt-0.5">{formatNumber(connector.totalRecords)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Frequency</p>
            <p className="text-xs font-medium text-foreground mt-0.5">{connector.syncFrequency}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Health</p>
            <p className={cn("text-xs font-medium mt-0.5 capitalize",
              connector.health === "healthy" ? "text-emerald-600" :
              connector.health === "degraded" ? "text-amber-600" : "text-rose-600"
            )}>
              {connector.health}
            </p>
          </div>
        </div>
      )}

      {/* Error state */}
      {connector.health === "error" && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-rose-50 dark:bg-rose-950/20 p-2.5">
          <AlertCircle className="h-3.5 w-3.5 text-rose-500 mt-0.5 shrink-0" />
          <p className="text-xs text-rose-700 dark:text-rose-400">OAuth token expired</p>
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 flex gap-2">
        {isConnected ? (
          <>
            <Button variant="outline" size="sm" className="flex-1 h-8 text-xs gap-1" asChild>
              <Link href={ROUTES.CONNECTOR(connector.id)}>
                <Settings className="h-3.5 w-3.5" /> Configure
              </Link>
            </Button>
            <Button variant="ghost" size="icon-sm" className="h-8 w-8">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            className="w-full h-8 gap-1.5 text-xs"
            onClick={() => onConnect(connector)}
            disabled={connector.status === "coming_soon"}
            variant={connector.status === "coming_soon" ? "secondary" : "default"}
          >
            {connector.status === "coming_soon" ? (
              "Coming Soon"
            ) : (
              <><Zap className="h-3.5 w-3.5" /> Connect</>
            )}
          </Button>
        )}
      </div>
    </motion.div>
  );
}
