"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  ArrowRightLeft,
  Database,
  Code2,
  Settings,
  ChevronLeft,
  ChevronRight,
  Zap,
  ShieldCheck,
  Activity,
  BookMarked,
  Workflow,
  GitBranch,
  Layers,
  LayoutGrid,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui.store";
import { useAuthStore } from "@/stores/auth.store";
import { ROUTES } from "@/config/routes";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";

/**
 * V1 Sidebar — CrossTecch DataFlow navigation.
 *
 * Scope: Dashboard · Flows · Connectors · Activity · Intelligence ·
 *        Warehouse · Business IQ · Dashboards · Settings
 *
 * Everything else belongs to V2+.
 */

const NAV_ITEMS = [
  { label: "Dashboard",      icon: LayoutDashboard, href: "/dashboard" },
  { label: "Flows",          icon: ArrowRightLeft,  href: "/flows" },
  { label: "Warehouse",      icon: Database,        href: "/warehouse" },
  { label: "Query",          icon: Code2,           href: "/query" },
  { label: "Models",         icon: Layers,          href: "/models" },
  { label: "Dashboards",     icon: LayoutGrid,      href: "/dashboards" },
  { label: "Catalog",        icon: BookMarked,      href: "/catalog" },
  { label: "Lineage",        icon: GitBranch,       href: "/lineage" },
  { label: "Automation",     icon: Workflow,        href: "/automation" },
  { label: "Observability",  icon: Activity,        href: "/observability" },
];

const BOTTOM_ITEMS = [
  { label: "Settings", icon: Settings, href: ROUTES.SETTINGS },
];

function NavItem({
  item,
  collapsed,
}: {
  item: { label: string; icon: React.ElementType; href: string };
  collapsed: boolean;
}) {
  const pathname = usePathname();
  const Icon = item.icon;
  const active =
    item.href === ROUTES.DASHBOARD
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(item.href + "/");

  const inner = (
    <Link
      href={item.href}
      className={cn(
        "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
        active
          ? "bg-brand-50 dark:bg-brand-950/30 text-brand-700 dark:text-brand-400"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
        collapsed && "justify-center px-2"
      )}
    >
      <Icon
        className={cn(
          "h-[18px] w-[18px] shrink-0 transition-colors",
          active ? "text-brand-600 dark:text-brand-400" : "text-muted-foreground group-hover:text-foreground"
        )}
      />
      {!collapsed && <span className="truncate">{item.label}</span>}
      {active && !collapsed && (
        <motion.div
          layoutId="sidebar-active-pill"
          className="ml-auto h-1.5 w-1.5 rounded-full bg-brand-600"
        />
      )}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{inner}</TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    );
  }
  return inner;
}

const ADMIN_EMAIL = (process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? "techtraining@frugaltestingid.com").toLowerCase();

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar, sidebarMobileOpen, setSidebarMobileOpen } =
    useUIStore();
  const { user, isDemoMode } = useAuthStore();
  const isAdmin = !isDemoMode && !!user && user.email.toLowerCase() === ADMIN_EMAIL;

  return (
    <TooltipProvider delayDuration={300}>
      {sidebarMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setSidebarMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          "relative z-50 flex h-screen shrink-0 flex-col border-r border-border bg-white dark:bg-[#0a0b12] transition-all duration-300 ease-in-out",
          sidebarCollapsed ? "w-[60px]" : "w-[220px]",
          "hidden md:flex",
          sidebarMobileOpen && "!flex fixed"
        )}
      >
        {/* Logo */}
        <div
          className={cn(
            "flex h-[57px] shrink-0 items-center gap-2.5 border-b border-border px-4",
            sidebarCollapsed && "justify-center px-2"
          )}
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-600">
            <Zap className="h-3.5 w-3.5 text-white" />
          </div>
          {!sidebarCollapsed && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-[15px] font-bold tracking-tight text-foreground"
            >
              CrossTecch
            </motion.span>
          )}
        </div>

        {/* Primary nav */}
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2 pt-3">
          {NAV_ITEMS.map((item) => (
            <NavItem key={item.href} item={item} collapsed={sidebarCollapsed} />
          ))}
        </nav>

        {/* Bottom: Admin (if owner) + Settings + collapse */}
        <div className="shrink-0 border-t border-border p-2 space-y-0.5">
          {isAdmin && (
            <NavItem
              key={ROUTES.ADMIN}
              item={{ label: "Admin", icon: ShieldCheck, href: ROUTES.ADMIN }}
              collapsed={sidebarCollapsed}
            />
          )}
          {BOTTOM_ITEMS.map((item) => (
            <NavItem key={item.href} item={item} collapsed={sidebarCollapsed} />
          ))}
          <button
            onClick={toggleSidebar}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
              sidebarCollapsed && "justify-center px-2"
            )}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-4 w-4 shrink-0" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4 shrink-0" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </TooltipProvider>
  );
}
