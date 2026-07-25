"use client";

/**
 * CrossTecch Toast System
 * Lightweight, accessible toast notifications with a Zustand store.
 * Usage:
 *   import { useToast } from "@/components/ui/toast";
 *   const { toast } = useToast();
 *   toast.success("Flow synced!")
 *   toast.error("Sync failed")
 *   toast.info("Settings saved")
 *   toast.warning("Schema drift detected")
 */

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from "lucide-react";
import { create } from "zustand";
import { cn } from "@/lib/utils";

// ── Store ─────────────────────────────────────────────────────────────────────

type ToastType = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
}

interface ToastStore {
  toasts: ToastItem[];
  add: (toast: Omit<ToastItem, "id">) => void;
  remove: (id: string) => void;
}

let _counter = 0;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  add: (toast) => {
    const id = `toast-${++_counter}`;
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, toast.duration ?? 4000);
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useToast() {
  const { add } = useToastStore();

  const toast = {
    success: (title: string, description?: string) =>
      add({ type: "success", title, description }),
    error: (title: string, description?: string) =>
      add({ type: "error", title, description, duration: 6000 }),
    info: (title: string, description?: string) =>
      add({ type: "info", title, description }),
    warning: (title: string, description?: string) =>
      add({ type: "warning", title, description }),
    custom: (opts: Omit<ToastItem, "id">) => add(opts),
  };

  return { toast };
}

// ── Config ────────────────────────────────────────────────────────────────────

const TOAST_CFG: Record<ToastType, {
  icon: React.ElementType;
  iconCls: string;
  borderCls: string;
  bgCls: string;
}> = {
  success: {
    icon: CheckCircle2,
    iconCls: "text-emerald-600",
    borderCls: "border-emerald-200 dark:border-emerald-800",
    bgCls: "bg-white dark:bg-[#0e0f1a]",
  },
  error: {
    icon: XCircle,
    iconCls: "text-rose-600",
    borderCls: "border-rose-200 dark:border-rose-800",
    bgCls: "bg-white dark:bg-[#0e0f1a]",
  },
  info: {
    icon: Info,
    iconCls: "text-blue-600",
    borderCls: "border-blue-200 dark:border-blue-800",
    bgCls: "bg-white dark:bg-[#0e0f1a]",
  },
  warning: {
    icon: AlertTriangle,
    iconCls: "text-amber-600",
    borderCls: "border-amber-200 dark:border-amber-800",
    bgCls: "bg-white dark:bg-[#0e0f1a]",
  },
};

// ── Toast item ────────────────────────────────────────────────────────────────

function ToastItem({ toast }: { toast: ToastItem }) {
  const { remove } = useToastStore();
  const cfg = TOAST_CFG[toast.type];
  const Icon = cfg.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className={cn(
        "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border p-4 shadow-lg shadow-black/5",
        cfg.borderCls,
        cfg.bgCls
      )}
    >
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", cfg.iconCls)} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground leading-snug">{toast.title}</p>
        {toast.description && (
          <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{toast.description}</p>
        )}
      </div>
      <button
        onClick={() => remove(toast.id)}
        className="shrink-0 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  );
}

// ── Toast container (render in layout) ───────────────────────────────────────

export function ToastContainer() {
  const { toasts } = useToastStore();

  return (
    <div
      className="pointer-events-none fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 w-full max-w-sm"
      aria-live="polite"
      aria-label="Notifications"
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} />
        ))}
      </AnimatePresence>
    </div>
  );
}
