"use client";

import React from "react";
import { Plus, Zap, ArrowRightLeft, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserProfileDropdown } from "@/components/layout/user-profile-dropdown";
import { useUIStore } from "@/stores/ui.store";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ROUTES } from "@/config/routes";
import { cn } from "@/lib/utils";
import { useFlowWizardStore } from "@/stores/flow-wizard.store";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/flows":     "Flows",
  "/activity":  "Activity",
  "/settings":  "Settings",
  "/profile":   "Profile",
};

function AddFlowButton() {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const { startWizard } = useFlowWizardStore();
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const actions = [
    {
      label: "Connect a new source",
      icon: ArrowRightLeft,
      desc: "Link a source to your destination in minutes",
      onClick: () => { startWizard(); setOpen(false); },
    },
    {
      label: "Run a manual sync",
      icon: Zap,
      desc: "Trigger an immediate sync on any flow",
      onClick: () => { router.push(ROUTES.ACTIVITY); setOpen(false); },
    },
  ];

  return (
    <div className="relative" ref={ref}>
      <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={() => setOpen((p) => !p)}>
        <Plus className="h-3.5 w-3.5" /> New Flow
      </Button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={{ duration: 0.1 }}
            className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-border bg-popover shadow-lg overflow-hidden z-50"
          >
            {actions.map((a) => (
              <button
                key={a.label}
                onClick={a.onClick}
                className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-accent transition-colors"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-950/30 mt-0.5">
                  <a.icon className="h-3.5 w-3.5 text-brand-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{a.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{a.desc}</p>
                </div>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Topbar() {
  const { setSidebarMobileOpen } = useUIStore();
  const pathname = usePathname();

  const title = Object.entries(PAGE_TITLES).find(
    ([key]) => pathname === key || pathname.startsWith(key + "/")
  )?.[1] ?? "CrossTecch";

  return (
    <header className="flex h-[57px] shrink-0 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <button
        className="md:hidden flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"
        onClick={() => setSidebarMobileOpen(true)}
      >
        <Menu className="h-4 w-4" />
      </button>

      <h1 className="text-sm font-semibold text-foreground">{title}</h1>

      <div className="flex-1" />

      <AddFlowButton />
      <UserProfileDropdown />
    </header>
  );
}
