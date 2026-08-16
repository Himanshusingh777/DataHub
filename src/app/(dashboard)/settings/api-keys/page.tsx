"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Key, Plus, Copy, Check, Trash2, X, Clock, Zap, AlertTriangle,
  ChevronDown, Loader2, Eye, EyeOff, ShieldCheck
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MOCK_API_KEYS } from "@/lib/enterprise-data";
import type { ApiKey, ApiKeyStatus } from "@/lib/enterprise-data";
import { PageHeader, Card, CardSection, SectionHeader, EmptyState, FormField } from "@/components/enterprise/shared";
import { cn } from "@/lib/utils";

// ── helpers ───────────────────────────────────────────────────────────────────
function formatDate(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function formatRelative(iso: string | null) {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function isExpiringSoon(iso: string | null) {
  if (!iso) return false;
  return new Date(iso).getTime() - Date.now() < 30 * 86400000;
}

const STATUS_CONFIG: Record<ApiKeyStatus, { cls: string; label: string; dot: string }> = {
  active:  { cls: "text-emerald-600", label: "Active",  dot: "bg-emerald-500" },
  revoked: { cls: "text-rose-600",    label: "Revoked", dot: "bg-rose-500" },
  expired: { cls: "text-amber-600",   label: "Expired", dot: "bg-amber-500" },
};

const ENV_COLORS: Record<string, string> = {
  production:  "bg-violet-100 text-violet-700 dark:bg-violet-950/30 dark:text-violet-400",
  development: "bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400",
  staging:     "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400",
};

// ── Generated key display ─────────────────────────────────────────────────────
function GeneratedKeyBanner({ value, onDismiss }: { value: string; onDismiss: () => void }) {
  const [copied, setCopied] = React.useState(false);
  const [visible, setVisible] = React.useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/20 p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-emerald-600" />
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">API key generated — copy it now</p>
        </div>
        <button onClick={onDismiss} className="text-emerald-600 hover:text-emerald-800"><X className="h-4 w-4" /></button>
      </div>
      <p className="text-xs text-emerald-700 dark:text-emerald-400 mb-3">This key will only be shown once. Store it securely — you cannot retrieve it again.</p>
      <div className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-white dark:bg-[#0e0f1a] dark:border-emerald-800 px-3 py-2">
        <code className="flex-1 text-[13px] font-mono text-foreground">
          {visible ? value : value.slice(0, 12) + "•".repeat(20)}
        </code>
        <button onClick={() => setVisible((v) => !v)} className="text-muted-foreground hover:text-foreground">
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
        <button onClick={handleCopy}
          className={cn("flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
            copied ? "bg-emerald-100 text-emerald-700" : "bg-muted hover:bg-muted/80 text-foreground"
          )}>
          {copied ? <><Check className="h-3 w-3" />Copied!</> : <><Copy className="h-3 w-3" />Copy</>}
        </button>
      </div>
    </motion.div>
  );
}

// ── Create key modal ──────────────────────────────────────────────────────────
const AVAILABLE_SCOPES = [
  "connectors:read", "connectors:write",
  "pipelines:read", "pipelines:write",
  "sync_jobs:read", "sync_jobs:write",
  "webhooks:write", "billing:read",
];

function CreateKeyModal({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (key: ApiKey, rawKey: string) => void;
}) {
  const [name, setName] = React.useState("");
  const [env, setEnv] = React.useState<"production" | "development" | "staging">("production");
  const [expiry, setExpiry] = React.useState<"never" | "30" | "90" | "180" | "365">("never");
  const [scopes, setScopes] = React.useState<Set<string>>(new Set(["connectors:read", "pipelines:read"]));
  const [creating, setCreating] = React.useState(false);

  function toggleScope(s: string) {
    setScopes((prev) => { const next = new Set(prev); next.has(s) ? next.delete(s) : next.add(s); return next; });
  }

  async function handleCreate() {
    if (!name.trim() || scopes.size === 0) return;
    setCreating(true);
    await new Promise((r) => setTimeout(r, 300));
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const rawKey = `ct_${env === "production" ? "live" : env === "staging" ? "stg" : "test"}_` + Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    const newKey: ApiKey = {
      id: `key-${Date.now()}`, name, prefix: rawKey.slice(0, 12),
      scopes: [...scopes], status: "active",
      createdAt: new Date().toISOString(),
      expiresAt: expiry === "never" ? null : new Date(Date.now() + parseInt(expiry) * 86400000).toISOString(),
      lastUsedAt: null, usageCount: 0, createdBy: "You", environment: env,
    };
    onCreate(newKey, rawKey);
    setCreating(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
        className="relative z-10 w-full max-w-lg rounded-2xl border border-border bg-white dark:bg-[#0e0f1a] shadow-modal p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold">Generate API Key</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4">
          <FormField label="Key Name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Production Sync Agent" className="h-9" autoFocus />
          </FormField>

          <FormField label="Environment">
            <div className="grid grid-cols-3 gap-2">
              {(["production", "development", "staging"] as const).map((e) => (
                <button key={e} onClick={() => setEnv(e)}
                  className={cn("rounded-lg border px-3 py-2 text-xs font-medium capitalize transition-colors",
                    env === e ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-700 dark:bg-brand-950/20 dark:text-brand-400"
                    : "border-border text-muted-foreground hover:bg-muted"
                  )}>{e}</button>
              ))}
            </div>
          </FormField>

          <FormField label="Expiration">
            <div className="relative">
              <select value={expiry} onChange={(e) => setExpiry(e.target.value as typeof expiry)}
                className="w-full appearance-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring pr-8">
                <option value="never">Never expires</option>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
                <option value="180">180 days</option>
                <option value="365">1 year</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            </div>
          </FormField>

          <FormField label="Scopes" description="Select what this key can access">
            <div className="grid grid-cols-2 gap-2">
              {AVAILABLE_SCOPES.map((s) => (
                <button key={s} onClick={() => toggleScope(s)}
                  className={cn("flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs font-mono transition-colors",
                    scopes.has(s) ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-700 dark:bg-brand-950/20 dark:text-brand-400"
                    : "border-border text-muted-foreground hover:bg-muted"
                  )}>
                  <div className={cn("h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0", scopes.has(s) ? "border-brand-500 bg-brand-500" : "border-muted-foreground/30")}>
                    {scopes.has(s) && <Check className="h-2.5 w-2.5 text-white" />}
                  </div>
                  {s}
                </button>
              ))}
            </div>
          </FormField>
        </div>

        <div className="flex gap-3 mt-6">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1 gap-2" onClick={handleCreate} disabled={creating || !name.trim() || scopes.size === 0}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Key className="h-4 w-4" />}
            {creating ? "Generating…" : "Generate Key"}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Key row ───────────────────────────────────────────────────────────────────
function KeyRow({ apiKey, onRevoke }: { apiKey: ApiKey; onRevoke: (id: string) => void }) {
  const [copied, setCopied] = React.useState(false);
  const status = STATUS_CONFIG[apiKey.status];

  async function handleCopy() {
    await navigator.clipboard.writeText(apiKey.prefix + "…");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <motion.div layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className={cn("group border-b border-border p-5 last:border-0 hover:bg-muted/20 transition-colors", apiKey.status !== "active" && "opacity-60")}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Name + env + status */}
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <p className="text-sm font-semibold text-foreground">{apiKey.name}</p>
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize", ENV_COLORS[apiKey.environment])}>{apiKey.environment}</span>
            <span className="flex items-center gap-1 text-[10px] font-semibold">
              <span className={cn("h-1.5 w-1.5 rounded-full", status.dot)} /><span className={status.cls}>{status.label}</span>
            </span>
            {apiKey.status === "active" && isExpiringSoon(apiKey.expiresAt) && (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-600">
                <AlertTriangle className="h-3 w-3" /> Expires soon
              </span>
            )}
          </div>

          {/* Key prefix */}
          <div className="flex items-center gap-2 mb-3">
            <code className="rounded-md bg-muted px-2.5 py-1 text-[12px] font-mono text-foreground">{apiKey.prefix}••••••••••••••••</code>
            <button onClick={handleCopy}
              className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors">
              {copied ? <><Check className="h-3 w-3 text-emerald-500" />Copied</> : <><Copy className="h-3 w-3" />Copy</>}
            </button>
          </div>

          {/* Scopes */}
          <div className="flex flex-wrap gap-1 mb-3">
            {apiKey.scopes.map((s) => (
              <span key={s} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground">{s}</span>
            ))}
          </div>

          {/* Meta */}
          <div className="flex flex-wrap gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Created {formatDate(apiKey.createdAt)}</span>
            <span className="flex items-center gap-1"><Zap className="h-3 w-3" />Last used {formatRelative(apiKey.lastUsedAt)}</span>
            <span className="flex items-center gap-1"><Zap className="h-3 w-3" />{apiKey.usageCount.toLocaleString()} calls</span>
            {apiKey.expiresAt && <span>Expires {formatDate(apiKey.expiresAt)}</span>}
            {!apiKey.expiresAt && apiKey.status === "active" && <span>Never expires</span>}
          </div>
        </div>

        {/* Revoke button */}
        {apiKey.status === "active" && (
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5 shrink-0 text-rose-600 border-rose-200 hover:bg-rose-50 dark:border-rose-800 dark:hover:bg-rose-950/20 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => onRevoke(apiKey.id)}>
            <Trash2 className="h-3 w-3" /> Revoke
          </Button>
        )}
      </div>
    </motion.div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ApiKeysPage() {
  const [keys, setKeys] = React.useState<ApiKey[]>(MOCK_API_KEYS);
  const [showCreate, setShowCreate] = React.useState(false);
  const [newKeyBanner, setNewKeyBanner] = React.useState<{ key: ApiKey; raw: string } | null>(null);

  function handleCreate(key: ApiKey, raw: string) {
    setKeys((p) => [key, ...p]);
    setNewKeyBanner({ key, raw });
  }
  function handleRevoke(id: string) {
    setKeys((p) => p.map((k) => k.id === id ? { ...k, status: "revoked" as const } : k));
  }

  const activeKeys  = keys.filter((k) => k.status === "active");
  const inactiveKeys = keys.filter((k) => k.status !== "active");

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="API Keys"
        description={`${activeKeys.length} active key${activeKeys.length !== 1 ? "s" : ""} · ${inactiveKeys.length} revoked/expired`}
        icon={Key}
        iconBg="bg-amber-50 dark:bg-amber-950/20"
        iconColor="text-amber-600"
      >
        <Button className="gap-2 h-9" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" /> Generate Key
        </Button>
      </PageHeader>

      {/* Generated key banner */}
      <AnimatePresence>
        {newKeyBanner && (
          <GeneratedKeyBanner value={newKeyBanner.raw} onDismiss={() => setNewKeyBanner(null)} />
        )}
      </AnimatePresence>

      {/* Active keys */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Active Keys ({activeKeys.length})</p>
        <Card>
          {activeKeys.length === 0 ? (
            <EmptyState icon={Key} title="No active API keys" description="Generate a key to start using the CrossTecch API" />
          ) : (
            activeKeys.map((k) => <KeyRow key={k.id} apiKey={k} onRevoke={handleRevoke} />)
          )}
        </Card>
      </div>

      {/* Revoked/expired */}
      {inactiveKeys.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Revoked / Expired ({inactiveKeys.length})</p>
          <Card>
            {inactiveKeys.map((k) => <KeyRow key={k.id} apiKey={k} onRevoke={handleRevoke} />)}
          </Card>
        </div>
      )}

      <AnimatePresence>
        {showCreate && <CreateKeyModal onClose={() => setShowCreate(false)} onCreate={handleCreate} />}
      </AnimatePresence>
    </div>
  );
}
