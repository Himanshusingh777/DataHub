"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Check, Minus } from "lucide-react";

// ── Avatar ────────────────────────────────────────────────────────────────────
interface AvatarProps {
  name: string;
  color?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}

const AVATAR_SIZES = { xs: "h-6 w-6 text-[10px]", sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-12 w-12 text-base", xl: "h-16 w-16 text-lg" };

export function Avatar({ name, color = "#6366f1", size = "md", className }: AvatarProps) {
  const initials = name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  return (
    <div className={cn("flex shrink-0 items-center justify-center rounded-full font-bold text-white shadow-sm", AVATAR_SIZES[size], className)}
      style={{ backgroundColor: color }}>
      {initials}
    </div>
  );
}

// ── Status dot ────────────────────────────────────────────────────────────────
type StatusVariant = "active" | "inactive" | "suspended" | "invited" | "pending" | "warning";

const STATUS_DOT: Record<StatusVariant, { cls: string; label: string }> = {
  active:    { cls: "bg-emerald-500",              label: "Active" },
  inactive:  { cls: "bg-gray-400",                 label: "Inactive" },
  suspended: { cls: "bg-rose-500",                 label: "Suspended" },
  invited:   { cls: "bg-amber-400 animate-pulse",  label: "Invited" },
  pending:   { cls: "bg-amber-400 animate-pulse",  label: "Pending" },
  warning:   { cls: "bg-amber-500",                label: "Warning" },
};

export function StatusDot({ status, showLabel = false }: { status: StatusVariant; showLabel?: boolean }) {
  const { cls, label } = STATUS_DOT[status] ?? { cls: "bg-gray-400", label: status };
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-2 w-2 rounded-full shrink-0", cls)} />
      {showLabel && <span className="text-xs font-medium text-muted-foreground">{label}</span>}
    </span>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
interface SectionHeaderProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}

export function SectionHeader({ title, description, children, className }: SectionHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}

// ── Page header ───────────────────────────────────────────────────────────────
interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: React.ElementType;
  iconBg?: string;
  iconColor?: string;
  children?: React.ReactNode;
}

export function PageHeader({ title, description, icon: Icon, iconBg = "bg-brand-50 dark:bg-brand-950/20", iconColor = "text-brand-600", children }: PageHeaderProps) {
  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", iconBg)}>
            <Icon className={cn("h-5 w-5", iconColor)} />
          </div>
        )}
        <div>
          <h1 className="text-xl font-bold text-foreground">{title}</h1>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </motion.div>
  );
}

// ── Card wrapper ──────────────────────────────────────────────────────────────
export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-xl border border-border bg-white dark:bg-[#0e0f1a] shadow-card", className)} {...props}>
      {children}
    </div>
  );
}

// ── Card section ──────────────────────────────────────────────────────────────
export function CardSection({ title, description, children, className }: { title?: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("p-5 sm:p-6", className)}>
      {(title || description) && (
        <div className="mb-5">
          {title && <h3 className="text-sm font-semibold text-foreground">{title}</h3>}
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
      )}
      {children}
    </div>
  );
}

// ── Permission toggle ─────────────────────────────────────────────────────────
export function PermissionToggle({
  enabled,
  disabled: isDisabled,
  onChange,
}: { enabled: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      disabled={isDisabled}
      onClick={() => !isDisabled && onChange(!enabled)}
      className={cn(
        "relative flex h-5 w-9 cursor-pointer items-center rounded-full border-2 transition-colors duration-200",
        enabled ? "border-brand-500 bg-brand-500" : "border-border bg-muted",
        isDisabled && "cursor-not-allowed opacity-40"
      )}
    >
      <motion.div
        layout
        className="h-3.5 w-3.5 rounded-full bg-white shadow-sm"
        animate={{ x: enabled ? 14 : 2 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      />
    </button>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

// ── Empty state ───────────────────────────────────────────────────────────────
interface EmptyStateProps {
  icon: React.ElementType;
  title: string;
  description?: string;
  action?: React.ReactNode | { label: string; onClick: () => void };
}
export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  const actionNode = action && typeof action === "object" && "label" in action
    ? <button onClick={(action as { label: string; onClick: () => void }).onClick}
        className="mt-4 flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors">
        {(action as { label: string; onClick: () => void }).label}
      </button>
    : action ? <div className="mt-4">{action as React.ReactNode}</div> : null;

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
        <Icon className="h-7 w-7 text-muted-foreground/50" />
      </div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description && <p className="mt-1 text-xs text-muted-foreground max-w-xs">{description}</p>}
      {actionNode}
    </div>
  );
}

// ── Tab bar ───────────────────────────────────────────────────────────────────
interface TabBarProps {
  tabs: Array<{ id: string; label: string; icon?: React.ElementType }>;
  active: string;
  onChange: (id: string) => void;
  className?: string;
}
export function TabBar({ tabs, active, onChange, className }: TabBarProps) {
  return (
    <div className={cn("flex gap-1 rounded-xl border border-border bg-muted/40 p-1", className)}>
      {tabs.map((tab) => (
        <button key={tab.id} onClick={() => onChange(tab.id)}
          className={cn("flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-medium transition-all",
            active === tab.id
              ? "bg-white dark:bg-[#0e0f1a] text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}>
          {tab.icon && <tab.icon className="h-3.5 w-3.5" />}
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ── Danger zone item ──────────────────────────────────────────────────────────
interface DangerItemProps {
  title: string;
  description: string;
  buttonLabel: string;
  onClick?: () => void;
}
export function DangerItem({ title, description, buttonLabel, onClick }: DangerItemProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-4 border-b border-border last:border-0">
      <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <button onClick={onClick}
        className="shrink-0 rounded-lg border border-rose-300 px-4 py-1.5 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-950/20">
        {buttonLabel}
      </button>
    </div>
  );
}

// ── Form field ────────────────────────────────────────────────────────────────
interface FormFieldProps {
  label: string;
  description?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}
export function FormField({ label, description, required, children, className }: FormFieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label className="text-sm font-medium text-foreground">
        {label}{required && <span className="text-rose-500 ml-0.5">*</span>}
      </label>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      {children}
    </div>
  );
}

// ── Copy button ───────────────────────────────────────────────────────────────
export function CopyButton({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = React.useState(false);
  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button onClick={handleCopy}
      className={cn("inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-all hover:border-brand-300 hover:text-brand-600", className)}>
      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Minus className="h-3 w-3 opacity-0" />}
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

// ── Role badge ────────────────────────────────────────────────────────────────
const ROLE_COLORS: Record<string, string> = {
  owner:     "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400",
  admin:     "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  manager:   "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  developer: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  viewer:    "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

export function RoleBadge({ role }: { role: string }) {
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize", ROLE_COLORS[role] ?? "bg-muted text-muted-foreground")}>
      {role}
    </span>
  );
}

// ── Plan badge ────────────────────────────────────────────────────────────────
const PLAN_COLORS: Record<string, string> = {
  starter:    "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  growth:     "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  enterprise: "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400",
};

export function PlanBadge({ plan }: { plan: string }) {
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize", PLAN_COLORS[plan] ?? "bg-muted text-muted-foreground")}>
      {plan}
    </span>
  );
}
