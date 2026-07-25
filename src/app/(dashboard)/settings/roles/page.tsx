"use client";

import React from "react";
import { motion } from "framer-motion";
import { Shield, Info } from "lucide-react";
import { PERMISSION_GROUPS, DEFAULT_ROLE_PERMISSIONS } from "@/lib/enterprise-data";
import type { RbacRole, Permission } from "@/lib/enterprise-data";
import { PageHeader, Card, PermissionToggle, RoleBadge } from "@/components/enterprise/shared";
import { cn } from "@/lib/utils";

const ROLES: RbacRole[] = ["owner", "admin", "manager", "developer", "viewer"];

const ROLE_DESCRIPTIONS: Record<RbacRole, string> = {
  owner:     "Full unrestricted access to everything",
  admin:     "All access except billing management",
  manager:   "Manage data pipelines, connectors, and team",
  developer: "Build, run, and debug data pipelines",
  viewer:    "Read-only access to all resources",
};

export default function RbacPage() {
  const [permissions, setPermissions] = React.useState<Record<RbacRole, Set<Permission>>>(() => {
    return Object.fromEntries(
      ROLES.map((r) => [r, new Set<Permission>(DEFAULT_ROLE_PERMISSIONS[r])])
    ) as Record<RbacRole, Set<Permission>>;
  });

  function toggle(role: RbacRole, permission: Permission) {
    if (role === "owner") return; // owner is always full
    setPermissions((prev) => {
      const next = { ...prev, [role]: new Set(prev[role]) };
      if (next[role].has(permission)) next[role].delete(permission);
      else next[role].add(permission);
      return next;
    });
  }

  function isEnabled(role: RbacRole, perm: Permission) {
    return permissions[role].has(perm);
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Roles & Permissions"
        description="Configure what each role can access and do across CrossTecch"
        icon={Shield}
        iconBg="bg-violet-50 dark:bg-violet-950/20"
        iconColor="text-violet-600"
      />

      {/* Role summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {ROLES.map((role, i) => (
          <motion.div key={role} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
            className="rounded-xl border border-border bg-white dark:bg-[#0e0f1a] p-3 shadow-card text-center">
            <div className="flex justify-center mb-2">
              <RoleBadge role={role} />
            </div>
            <p className="text-[10px] text-muted-foreground leading-snug">{ROLE_DESCRIPTIONS[role]}</p>
            <p className="text-xs font-bold text-foreground mt-2">
              {role === "owner" ? "All" : permissions[role].size} permissions
            </p>
          </motion.div>
        ))}
      </div>

      {/* Owner lock notice */}
      <div className="flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20 p-3.5">
        <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-700 dark:text-blue-300">
          <strong>Owner</strong> permissions are locked and cannot be modified. Owners always have full access to every resource.
        </p>
      </div>

      {/* Permission matrix */}
      <Card>
        {/* Column headers */}
        <div className="grid border-b border-border bg-muted/30" style={{ gridTemplateColumns: "280px repeat(5, 1fr)" }}>
          <div className="p-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Permission</div>
          {ROLES.map((role) => (
            <div key={role} className="p-4 text-center">
              <RoleBadge role={role} />
            </div>
          ))}
        </div>

        {/* Permission groups */}
        {PERMISSION_GROUPS.map((group, gi) => (
          <div key={group.key}>
            {/* Group header */}
            <div className="grid border-b border-border bg-muted/10 px-4 py-2" style={{ gridTemplateColumns: "280px repeat(5, 1fr)" }}>
              <div className="flex items-center">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{group.label}</span>
              </div>
              {ROLES.map((r) => <div key={r} />)}
            </div>

            {/* Permission rows */}
            {group.permissions.map((perm, pi) => (
              <motion.div key={perm.key} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: gi * 0.03 + pi * 0.01 }}
                className="grid items-center border-b border-border last:border-0 hover:bg-muted/10 transition-colors"
                style={{ gridTemplateColumns: "280px repeat(5, 1fr)" }}>
                {/* Permission label */}
                <div className="px-4 py-3">
                  <p className="text-sm font-medium text-foreground">{perm.label}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{perm.description}</p>
                </div>

                {/* Toggles per role */}
                {ROLES.map((role) => (
                  <div key={role} className="flex justify-center py-3">
                    <PermissionToggle
                      enabled={isEnabled(role, perm.key)}
                      disabled={role === "owner"}
                      onChange={() => toggle(role, perm.key)}
                    />
                  </div>
                ))}
              </motion.div>
            ))}
          </div>
        ))}
      </Card>

      {/* Save note */}
      <p className="text-xs text-muted-foreground text-center">
        Changes apply to all members with the respective role immediately. Role assignments are managed in <strong>Team</strong>.
      </p>
    </div>
  );
}
