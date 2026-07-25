"use client";

import React from "react";
import { Check, ChevronsUpDown, Plus, Building2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn, getInitials } from "@/lib/utils";
import { MOCK_WORKSPACES } from "@/lib/mock-data";
import { useUIStore } from "@/stores/ui.store";
import type { Workspace } from "@/types";

interface WorkspaceSelectorProps {
  collapsed?: boolean;
}

export function WorkspaceSelector({ collapsed }: WorkspaceSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const { activeWorkspaceId, setActiveWorkspace } = useUIStore();
  const ref = React.useRef<HTMLDivElement>(null);

  const activeWorkspace =
    MOCK_WORKSPACES.find((w) => w.id === activeWorkspaceId) ?? MOCK_WORKSPACES[0];

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const planColors: Record<Workspace["plan"], string> = {
    starter: "text-slate-500 bg-slate-100 dark:bg-slate-800",
    growth: "text-blue-600 bg-blue-50 dark:bg-blue-950/40",
    enterprise: "text-violet-600 bg-violet-50 dark:bg-violet-950/40",
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-sidebar-accent",
          collapsed && "justify-center px-0"
        )}
      >
        {/* Workspace avatar */}
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-600 text-white text-xs font-bold">
          {getInitials(activeWorkspace.name)}
        </div>

        {!collapsed && (
          <>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-sidebar-foreground leading-tight">
                {activeWorkspace.name}
              </p>
              <p className="text-[10px] text-sidebar-foreground/50 capitalize leading-tight mt-0.5">
                {activeWorkspace.plan} plan
              </p>
            </div>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/40" />
          </>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute left-0 top-full z-50 mt-1 w-64 overflow-hidden rounded-xl border border-border bg-popover shadow-modal"
          >
            <div className="p-1">
              <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Workspaces
              </p>
              {MOCK_WORKSPACES.map((workspace) => (
                <button
                  key={workspace.id}
                  onClick={() => {
                    setActiveWorkspace(workspace.id);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-600 text-white text-xs font-bold">
                    {getInitials(workspace.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {workspace.name}
                    </p>
                    <span
                      className={cn(
                        "inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold capitalize mt-0.5",
                        planColors[workspace.plan]
                      )}
                    >
                      {workspace.plan}
                    </span>
                  </div>
                  {workspace.id === activeWorkspaceId && (
                    <Check className="h-4 w-4 text-brand-500 shrink-0" />
                  )}
                </button>
              ))}
            </div>
            <div className="border-t border-border p-1">
              <button className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                <Plus className="h-4 w-4" />
                Create workspace
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
