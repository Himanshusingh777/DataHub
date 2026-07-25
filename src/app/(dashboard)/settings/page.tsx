"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  Moon, Sun, Monitor, Bell, Clock, Check, Loader2, Key, Eye, EyeOff,
  Zap, AlertCircle, CheckCircle2, Database, User, Building2, Shield,
  CreditCard, Users, Trash2, Copy, Plus, Mail, MoreHorizontal,
  Upload, Camera, Lock, Smartphone, LogOut, AlertTriangle,
  RefreshCw, Download, ExternalLink, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui.store";
import { useToast } from "@/components/ui/toast";

// ── Tab config ────────────────────────────────────────────────────────────────

type Tab = "profile" | "integrations";

const TABS: { value: Tab; label: string; icon: React.ElementType }[] = [
  { value: "profile",      label: "Profile",       icon: User },
  { value: "integrations", label: "Integrations",  icon: Zap },
];

const TIMEZONES = [
  "UTC", "America/New_York", "America/Chicago", "America/Denver",
  "America/Los_Angeles", "America/Toronto", "Europe/London",
  "Europe/Paris", "Europe/Berlin", "Asia/Kolkata", "Asia/Singapore",
  "Asia/Tokyo", "Australia/Sydney",
];

// ── Shared sub-components ─────────────────────────────────────────────────────

function SettingRow({
  label,
  description,
  children,
  divider = true,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
  divider?: boolean;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-6 py-5", divider && "border-b border-border last:border-0")}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
        checked ? "bg-brand-600" : "bg-border"
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transform transition-transform duration-200",
          checked ? "translate-x-4" : "translate-x-0"
        )}
      />
    </button>
  );
}

// ── Profile Tab ───────────────────────────────────────────────────────────────

function ProfileTab() {
  const { toast } = useToast();
  const [name, setName]   = React.useState("Frugal Product Services");
  const [email, setEmail] = React.useState("techtraining@frugaltestingid.com");
  const [bio, setBio]     = React.useState("Data platform administrator at Frugal Testing.");
  const [saving, setSaving] = React.useState(false);

  async function handleSave() {
    setSaving(true);
    await new Promise(r => setTimeout(r, 800));
    setSaving(false);
    toast.success("Profile updated", "Your profile changes have been saved.");
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-1">Public profile</h3>
        <p className="text-xs text-muted-foreground">This information is visible to members of your workspace.</p>
      </div>

      {/* Avatar */}
      <div className="flex items-center gap-4">
        <div className="relative">
          <div className="h-16 w-16 rounded-full bg-brand-600 flex items-center justify-center text-white text-xl font-bold select-none">
            F
          </div>
          <button className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-white dark:bg-[#0e0f1a] border border-border shadow-sm hover:bg-accent transition-colors">
            <Camera className="h-3 w-3 text-muted-foreground" />
          </button>
        </div>
        <div>
          <button className="text-xs font-medium text-brand-600 hover:text-brand-700 flex items-center gap-1.5">
            <Upload className="h-3 w-3" /> Upload photo
          </button>
          <p className="text-[11px] text-muted-foreground mt-0.5">JPG, PNG or GIF. Max 2MB.</p>
        </div>
      </div>

      {/* Fields */}
      <div className="space-y-4">
        <div>
          <Label htmlFor="name" className="text-xs font-medium">Full name</Label>
          <Input id="name" value={name} onChange={e => setName(e.target.value)} className="mt-1.5 h-9 text-sm" />
        </div>
        <div>
          <Label htmlFor="email" className="text-xs font-medium">Email address</Label>
          <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1.5 h-9 text-sm" />
          <p className="text-[11px] text-muted-foreground mt-1">Used for notifications and account recovery.</p>
        </div>
        <div>
          <Label htmlFor="bio" className="text-xs font-medium">Bio</Label>
          <textarea
            id="bio"
            value={bio}
            onChange={e => setBio(e.target.value)}
            rows={3}
            className="mt-1.5 w-full rounded-lg border border-border bg-white dark:bg-[#0e0f1a] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 transition resize-none"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
          {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving…</> : <><Check className="h-3.5 w-3.5" />Save profile</>}
        </Button>
      </div>
    </div>
  );
}

// ── Workspace Tab ─────────────────────────────────────────────────────────────

function WorkspaceTab() {
  const { toast } = useToast();
  const [wsName, setWsName]   = React.useState("Frugal Testing Workspace");
  const [wsSlug, setWsSlug]   = React.useState("frugal-testing");
  const [saving, setSaving]   = React.useState(false);
  const [logoColor, setLogoColor] = React.useState("#6366f1");

  async function handleSave() {
    setSaving(true);
    await new Promise(r => setTimeout(r, 800));
    setSaving(false);
    toast.success("Workspace updated", "Workspace settings have been saved.");
  }

  const LOGO_COLORS = ["#6366f1","#0ea5e9","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899"];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-1">Workspace settings</h3>
        <p className="text-xs text-muted-foreground">Manage your workspace identity and configuration.</p>
      </div>

      {/* Logo color */}
      <div>
        <Label className="text-xs font-medium">Workspace logo</Label>
        <div className="mt-2 flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl flex items-center justify-center text-white text-sm font-bold shadow-sm" style={{ backgroundColor: logoColor }}>
            {wsName.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex gap-2">
            {LOGO_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setLogoColor(c)}
                className={cn("h-6 w-6 rounded-full transition-transform", logoColor === c && "ring-2 ring-offset-2 ring-brand-600 scale-110")}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="wsName" className="text-xs font-medium">Workspace name</Label>
          <Input id="wsName" value={wsName} onChange={e => setWsName(e.target.value)} className="mt-1.5 h-9 text-sm" />
        </div>
        <div>
          <Label htmlFor="wsSlug" className="text-xs font-medium">Workspace URL</Label>
          <div className="flex items-center mt-1.5">
            <span className="flex h-9 items-center rounded-l-lg border border-r-0 border-border bg-muted px-3 text-xs text-muted-foreground">
              app.crosstecch.io/
            </span>
            <Input
              id="wsSlug"
              value={wsSlug}
              onChange={e => setWsSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              className="rounded-l-none h-9 text-sm font-mono"
            />
          </div>
        </div>
      </div>

      {/* Transfer ownership */}
      <div className="rounded-xl border border-border p-4">
        <p className="text-sm font-medium text-foreground mb-0.5">Transfer ownership</p>
        <p className="text-xs text-muted-foreground mb-3">Transfer this workspace to another member. You will lose admin access.</p>
        <Button size="sm" variant="outline" className="gap-1.5 text-xs">
          <Users className="h-3.5 w-3.5" /> Transfer workspace
        </Button>
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
          {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving…</> : <><Check className="h-3.5 w-3.5" />Save workspace</>}
        </Button>
      </div>
    </div>
  );
}

// ── Appearance Tab ────────────────────────────────────────────────────────────

function AppearanceTab() {
  const { theme, setTheme } = useUIStore();
  const { toast } = useToast();

  const options = [
    { value: "light",  label: "Light",  icon: Sun, preview: "bg-white border-border" },
    { value: "dark",   label: "Dark",   icon: Moon, preview: "bg-[#0e0f1a] border-[#1e1f2e]" },
    { value: "system", label: "System", icon: Monitor, preview: "bg-gradient-to-br from-white to-[#0e0f1a] border-border" },
  ] as const;

  const [selectedDensity, setSelectedDensity] = React.useState<"comfortable" | "compact">("comfortable");
  const [selectedFont, setSelectedFont] = React.useState<"inter" | "system">("inter");

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-1">Theme</h3>
        <p className="text-xs text-muted-foreground mb-4">Choose how CrossTecch looks for you.</p>
        <div className="grid grid-cols-3 gap-3 max-w-sm">
          {options.map((opt) => {
            const Icon = opt.icon;
            const active = theme === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => { setTheme(opt.value); toast.info(`Theme set to ${opt.label}`); }}
                className={cn(
                  "flex flex-col items-center gap-2.5 rounded-xl border-2 p-4 transition-all text-center",
                  active
                    ? "border-brand-500 bg-brand-50/50 dark:bg-brand-950/20"
                    : "border-border hover:border-brand-200 dark:hover:border-brand-800"
                )}
              >
                {/* Preview swatch */}
                <div className={cn("h-10 w-full rounded-lg border", opt.preview)} />
                <div className="flex items-center gap-1.5">
                  <Icon className={cn("h-3.5 w-3.5", active ? "text-brand-600" : "text-muted-foreground")} />
                  <span className={cn("text-xs font-medium", active ? "text-brand-700 dark:text-brand-400" : "text-muted-foreground")}>{opt.label}</span>
                </div>
                {active && <div className="h-1 w-1 rounded-full bg-brand-600" />}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-1">Density</h3>
        <p className="text-xs text-muted-foreground mb-4">Control how compact the interface feels.</p>
        <div className="flex gap-3">
          {(["comfortable", "compact"] as const).map((d) => (
            <button
              key={d}
              onClick={() => setSelectedDensity(d)}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm transition-all capitalize",
                selectedDensity === d
                  ? "border-brand-500 bg-brand-50/50 dark:bg-brand-950/20 text-brand-700 dark:text-brand-400"
                  : "border-border text-muted-foreground hover:border-brand-300"
              )}
            >
              {selectedDensity === d && <Check className="h-3.5 w-3.5 text-brand-600" />}
              {d}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-1">Font</h3>
        <p className="text-xs text-muted-foreground mb-4">Choose your preferred font family.</p>
        <div className="flex gap-3">
          {([{ id: "inter", label: "Inter (default)", sample: "Aa" }, { id: "system", label: "System UI", sample: "Aa" }] as const).map(f => (
            <button
              key={f.id}
              onClick={() => setSelectedFont(f.id)}
              className={cn(
                "flex flex-col items-start gap-1 rounded-lg border px-4 py-3 text-sm transition-all w-36",
                selectedFont === f.id
                  ? "border-brand-500 bg-brand-50/50 dark:bg-brand-950/20"
                  : "border-border text-muted-foreground hover:border-brand-300"
              )}
            >
              <span className="text-lg font-semibold text-foreground">{f.sample}</span>
              <span className="text-xs text-muted-foreground">{f.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Timezone section */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-1">Timezone</h3>
        <p className="text-xs text-muted-foreground mb-4">Sync times and log timestamps will display in this timezone.</p>
        <div className="max-w-xs space-y-3">
          <select
            defaultValue="Asia/Kolkata"
            className="w-full h-9 rounded-lg border border-border bg-white dark:bg-[#0e0f1a] px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-500 transition"
          >
            {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>)}
          </select>
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Current time</p>
            <p className="text-sm font-semibold text-foreground mt-0.5">
              {new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Notifications Tab ─────────────────────────────────────────────────────────

function NotificationsTab() {
  const { toast } = useToast();
  const [saved, setSaved] = React.useState(false);
  const [prefs, setPrefs] = React.useState({
    sync_success:     true,
    sync_failure:     true,
    connection_error: true,
    pipeline_warning: false,
    weekly_summary:   true,
    product_updates:  false,
    security_alerts:  true,
  });

  const toggle = (key: keyof typeof prefs) => setPrefs((p) => ({ ...p, [key]: !p[key] }));

  const sections = [
    {
      title: "Sync events",
      items: [
        { key: "sync_success",     label: "Sync succeeded",       desc: "When a sync completes without errors" },
        { key: "sync_failure",     label: "Sync failed",          desc: "When a sync fails or is cancelled" },
        { key: "pipeline_warning", label: "Schema warnings",      desc: "When CrossTecch detects schema drift" },
      ] as const,
    },
    {
      title: "System",
      items: [
        { key: "connection_error", label: "Connection lost",    desc: "When a source needs re-authentication" },
        { key: "security_alerts",  label: "Security alerts",   desc: "Unusual sign-ins and account activity" },
      ] as const,
    },
    {
      title: "Updates",
      items: [
        { key: "weekly_summary",  label: "Weekly digest",   desc: "A summary of all sync activity every Monday" },
        { key: "product_updates", label: "Product updates", desc: "New features and improvements from CrossTecch" },
      ] as const,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-1">Notification preferences</h3>
        <p className="text-xs text-muted-foreground">Control which alerts CrossTecch sends to your email.</p>
      </div>

      {sections.map((sec) => (
        <div key={sec.title}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">{sec.title}</p>
          <div className="rounded-xl border border-border overflow-hidden">
            {sec.items.map((item, i) => (
              <div key={item.key} className={cn("flex items-center justify-between px-4 py-3.5", i < sec.items.length - 1 && "border-b border-border")}>
                <div>
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                </div>
                <Toggle checked={prefs[item.key]} onChange={() => toggle(item.key)} />
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="flex justify-end">
        <Button size="sm" className="gap-1.5" onClick={() => {
          setSaved(true);
          toast.success("Preferences saved");
          setTimeout(() => setSaved(false), 2000);
        }}>
          {saved ? <><Check className="h-3.5 w-3.5" />Saved!</> : "Save preferences"}
        </Button>
      </div>
    </div>
  );
}

// ── API Keys Tab ──────────────────────────────────────────────────────────────

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  created: string;
  lastUsed: string | null;
  scopes: string[];
}

const MOCK_KEYS: ApiKey[] = [
  { id: "k1", name: "Production connector", prefix: "ct_live_k1x9", created: "2024-10-15", lastUsed: "2 hours ago", scopes: ["flows:read", "flows:write"] },
  { id: "k2", name: "CI/CD integration", prefix: "ct_live_m3y2", created: "2024-11-02", lastUsed: "Yesterday", scopes: ["flows:read"] },
];

function ApiKeysTab() {
  const { toast } = useToast();
  const [keys, setKeys]       = React.useState<ApiKey[]>(MOCK_KEYS);
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName]   = React.useState("");
  const [newKey, setNewKey]     = React.useState<string | null>(null);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [revokeId, setRevokeId] = React.useState<string | null>(null);

  function handleCreate() {
    if (!newName.trim()) return;
    const generated = `ct_live_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;
    const key: ApiKey = {
      id: `k${Date.now()}`,
      name: newName.trim(),
      prefix: generated.slice(0, 14),
      created: new Date().toISOString().slice(0, 10),
      lastUsed: null,
      scopes: ["flows:read", "flows:write"],
    };
    setKeys(prev => [key, ...prev]);
    setNewKey(generated);
    setNewName("");
    setCreating(false);
    toast.success("API key created", "Copy it now — it won't be shown again.");
  }

  function handleCopy(text: string, id: string) {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedId(id);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
  }

  function handleRevoke(id: string) {
    setKeys(prev => prev.filter(k => k.id !== id));
    setRevokeId(null);
    toast.success("API key revoked", "This key can no longer be used.");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-1">API Keys</h3>
          <p className="text-xs text-muted-foreground">Use API keys to authenticate requests to the CrossTecch API.</p>
        </div>
        <Button size="sm" className="gap-1.5 shrink-0" onClick={() => { setCreating(true); setNewKey(null); }}>
          <Plus className="h-3.5 w-3.5" /> New key
        </Button>
      </div>

      {/* Create form */}
      {creating && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-brand-200 dark:border-brand-800 bg-brand-50/30 dark:bg-brand-950/10 p-4 space-y-3"
        >
          <p className="text-sm font-medium text-foreground">Create new API key</p>
          <div>
            <Label className="text-xs">Key name</Label>
            <Input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="e.g. Production connector"
              className="mt-1.5 h-9 text-sm"
              onKeyDown={e => e.key === "Enter" && handleCreate()}
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate} disabled={!newName.trim()} className="gap-1.5">
              <Key className="h-3.5 w-3.5" /> Generate key
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setNewKey(null); }}>
              Cancel
            </Button>
          </div>
        </motion.div>
      )}

      {/* New key reveal */}
      {newKey && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20 p-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Key created — copy it now</p>
          </div>
          <p className="text-xs text-emerald-700 dark:text-emerald-400 mb-3">This is the only time you&apos;ll see the full key.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-[#0e0f1a] px-3 py-2 text-xs font-mono text-foreground break-all">
              {newKey}
            </code>
            <Button size="sm" variant="outline" onClick={() => handleCopy(newKey, "new")} className="gap-1.5 shrink-0">
              {copiedId === "new" ? <><Check className="h-3.5 w-3.5" />Copied</> : <><Copy className="h-3.5 w-3.5" />Copy</>}
            </Button>
          </div>
        </motion.div>
      )}

      {/* Keys list */}
      {keys.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center rounded-xl border border-dashed border-border">
          <Key className="h-8 w-8 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No API keys yet.</p>
          <p className="text-xs text-muted-foreground/60 mt-0.5">Create your first key to start using the API.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-4 py-2.5 border-b border-border bg-muted/30">
            {["Name / Prefix", "Created", "Last used", ""].map(h => (
              <p key={h} className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</p>
            ))}
          </div>
          {keys.map((key, i) => (
            <div key={key.id} className={cn("grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center px-4 py-3.5", i < keys.length - 1 && "border-b border-border")}>
              <div>
                <p className="text-sm font-medium text-foreground">{key.name}</p>
                <code className="text-[11px] text-muted-foreground font-mono">{key.prefix}…</code>
                <div className="flex gap-1 mt-1">
                  {key.scopes.map(s => (
                    <span key={s} className="rounded px-1.5 py-0.5 text-[9px] font-medium bg-brand-50 dark:bg-brand-950/20 text-brand-700 dark:text-brand-400">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{key.created}</p>
              <p className="text-xs text-muted-foreground">{key.lastUsed ?? "Never"}</p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleCopy(key.prefix + "…", key.id)}
                  className="h-7 w-7 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  {copiedId === key.id ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
                {revokeId === key.id ? (
                  <div className="flex items-center gap-1">
                    <button onClick={() => handleRevoke(key.id)} className="h-7 px-2 rounded-lg bg-rose-600 text-white text-xs font-medium hover:bg-rose-700 transition-colors">
                      Confirm
                    </button>
                    <button onClick={() => setRevokeId(null)} className="h-7 px-2 rounded-lg border border-border text-xs text-muted-foreground hover:bg-accent transition-colors">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setRevokeId(key.id)}
                    className="h-7 w-7 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-rose-600 hover:border-rose-300 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-border bg-muted/20 p-4">
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Authentication:</span> Pass your API key in the{" "}
          <code className="text-brand-600 font-mono">Authorization: Bearer ct_live_…</code> header.
          Never share keys or expose them in client-side code.
        </p>
      </div>
    </div>
  );
}

// ── Security Tab ──────────────────────────────────────────────────────────────

function SecurityTab() {
  const { toast } = useToast();
  const [changing, setChanging] = React.useState(false);
  const [currentPwd, setCurrentPwd] = React.useState("");
  const [newPwd, setNewPwd]         = React.useState("");
  const [confirmPwd, setConfirmPwd] = React.useState("");
  const [showPwd, setShowPwd]       = React.useState(false);
  const [saving, setSaving]         = React.useState(false);

  const [mfaEnabled, setMfaEnabled] = React.useState(false);
  const [sessionTimeout, setSessionTimeout] = React.useState("30");

  const sessions = [
    { device: "Chrome on macOS", location: "Mumbai, India", lastActive: "Now", current: true },
    { device: "Safari on iPhone", location: "Delhi, India", lastActive: "2 hours ago", current: false },
  ];

  async function handlePasswordChange() {
    if (!currentPwd || !newPwd || !confirmPwd) { toast.error("All fields are required"); return; }
    if (newPwd !== confirmPwd) { toast.error("Passwords do not match"); return; }
    if (newPwd.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    setSaving(true);
    await new Promise(r => setTimeout(r, 800));
    setSaving(false);
    setChanging(false);
    setCurrentPwd(""); setNewPwd(""); setConfirmPwd("");
    toast.success("Password updated", "You'll be signed out on other devices.");
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-1">Security settings</h3>
        <p className="text-xs text-muted-foreground">Manage your password, MFA, and active sessions.</p>
      </div>

      {/* Password */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
              <Lock className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Password</p>
              <p className="text-xs text-muted-foreground">Last changed 30 days ago</p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => setChanging(!changing)} className="text-xs">
            {changing ? "Cancel" : "Change"}
          </Button>
        </div>

        {changing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="px-5 py-4 space-y-3"
          >
            {[
              { id: "cur", label: "Current password", value: currentPwd, set: setCurrentPwd },
              { id: "new", label: "New password", value: newPwd, set: setNewPwd },
              { id: "con", label: "Confirm new password", value: confirmPwd, set: setConfirmPwd },
            ].map(f => (
              <div key={f.id}>
                <Label className="text-xs">{f.label}</Label>
                <div className="relative mt-1.5">
                  <Input
                    type={showPwd ? "text" : "password"}
                    value={f.value}
                    onChange={e => f.set(e.target.value)}
                    className="pr-10 h-9 text-sm"
                  />
                  {f.id === "new" && (
                    <button
                      type="button"
                      onClick={() => setShowPwd(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPwd ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </div>
              </div>
            ))}
            {newPwd && (
              <div className="flex gap-1">
                {["length", "upper", "number", "special"].map(rule => {
                  const ok = rule === "length" ? newPwd.length >= 8
                    : rule === "upper" ? /[A-Z]/.test(newPwd)
                    : rule === "number" ? /[0-9]/.test(newPwd)
                    : /[^a-zA-Z0-9]/.test(newPwd);
                  const labels: Record<string, string> = { length: "8+ chars", upper: "Uppercase", number: "Number", special: "Symbol" };
                  return (
                    <span key={rule} className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", ok ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400" : "bg-muted text-muted-foreground")}>
                      {ok ? "✓ " : ""}{labels[rule]}
                    </span>
                  );
                })}
              </div>
            )}
            <Button size="sm" onClick={handlePasswordChange} disabled={saving} className="gap-1.5">
              {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Updating…</> : "Update password"}
            </Button>
          </motion.div>
        )}

        {/* MFA */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-border">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
              <Smartphone className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Two-factor authentication</p>
              <p className="text-xs text-muted-foreground">Add an extra layer of security to your account</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {mfaEnabled && <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 rounded-full px-2 py-0.5">Enabled</span>}
            <Button size="sm" variant="outline" onClick={() => { setMfaEnabled(v => !v); toast.info(mfaEnabled ? "2FA disabled" : "2FA enabled"); }} className="text-xs">
              {mfaEnabled ? "Disable" : "Enable"}
            </Button>
          </div>
        </div>

        {/* Session timeout */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-border">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
              <Clock className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Session timeout</p>
              <p className="text-xs text-muted-foreground">Automatically sign out after inactivity</p>
            </div>
          </div>
          <select
            value={sessionTimeout}
            onChange={e => setSessionTimeout(e.target.value)}
            className="h-8 rounded-lg border border-border bg-white dark:bg-[#0e0f1a] px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="15">15 minutes</option>
            <option value="30">30 minutes</option>
            <option value="60">1 hour</option>
            <option value="480">8 hours</option>
            <option value="0">Never</option>
          </select>
        </div>
      </div>

      {/* Active sessions */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Active sessions</p>
        <div className="rounded-xl border border-border overflow-hidden">
          {sessions.map((s, i) => (
            <div key={i} className={cn("flex items-center justify-between px-4 py-3.5", i < sessions.length - 1 && "border-b border-border")}>
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Smartphone className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                    {s.device}
                    {s.current && <span className="text-[9px] bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 rounded-full px-1.5 py-0.5 font-semibold">Current</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{s.location} · {s.lastActive}</p>
                </div>
              </div>
              {!s.current && (
                <button
                  onClick={() => toast.info("Session revoked")}
                  className="text-xs text-rose-600 hover:text-rose-700 font-medium flex items-center gap-1"
                >
                  <LogOut className="h-3 w-3" /> Revoke
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Billing Tab ───────────────────────────────────────────────────────────────

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    period: "/month",
    description: "Perfect for getting started.",
    features: ["3 data flows", "1 GB storage", "7-day history", "Email support"],
    current: false,
    cta: "Downgrade",
  },
  {
    id: "pro",
    name: "Pro",
    price: "$49",
    period: "/month",
    description: "For growing teams.",
    features: ["Unlimited flows", "50 GB storage", "90-day history", "Priority support", "Business IQ", "API access"],
    current: true,
    highlight: true,
    cta: "Current plan",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For large organizations.",
    features: ["Custom flows & storage", "Unlimited history", "Dedicated support", "SSO & SAML", "SLA guarantee", "Custom contracts"],
    current: false,
    cta: "Contact sales",
  },
];

const INVOICES = [
  { date: "Nov 1, 2024", amount: "$49.00", status: "Paid" },
  { date: "Oct 1, 2024", amount: "$49.00", status: "Paid" },
  { date: "Sep 1, 2024", amount: "$49.00", status: "Paid" },
];

function BillingTab() {
  const { toast } = useToast();
  const [usage] = React.useState({ flows: 5, storage: 12.4, maxFlows: "unlimited", maxStorage: 50 });

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-1">Billing & plans</h3>
        <p className="text-xs text-muted-foreground">Manage your subscription and payment method.</p>
      </div>

      {/* Current usage */}
      <div className="rounded-xl border border-border p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Current usage</p>
        <div className="grid grid-cols-2 gap-4">
          {[
            { label: "Active flows", value: usage.flows, max: usage.maxFlows, unit: "flows" },
            { label: "Storage used", value: `${usage.storage} GB`, max: `${usage.maxStorage} GB`, unit: "" },
          ].map(u => (
            <div key={u.label}>
              <div className="flex items-end justify-between mb-1.5">
                <p className="text-xs text-muted-foreground">{u.label}</p>
                <p className="text-xs font-semibold text-foreground">{u.value} <span className="text-muted-foreground font-normal">/ {u.max}</span></p>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-brand-600"
                  style={{ width: typeof u.max === "number" ? `${Math.min(100, (Number(u.value) / u.max) * 100)}%` : "35%" }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Plans */}
      <div className="grid grid-cols-3 gap-4">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className={cn(
              "rounded-xl border p-4 flex flex-col gap-4 relative",
              plan.highlight
                ? "border-brand-500 bg-brand-50/30 dark:bg-brand-950/10"
                : "border-border bg-white dark:bg-[#0e0f1a]"
            )}
          >
            {plan.highlight && (
              <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                <span className="bg-brand-600 text-white text-[9px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wide">
                  Current plan
                </span>
              </div>
            )}
            <div>
              <p className="text-sm font-semibold text-foreground">{plan.name}</p>
              <div className="flex items-end gap-0.5 mt-1">
                <p className="text-2xl font-bold text-foreground">{plan.price}</p>
                <p className="text-xs text-muted-foreground mb-0.5">{plan.period}</p>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{plan.description}</p>
            </div>
            <ul className="space-y-1.5 flex-1">
              {plan.features.map(f => (
                <li key={f} className="flex items-center gap-2 text-xs text-foreground">
                  <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />{f}
                </li>
              ))}
            </ul>
            <Button
              size="sm"
              variant={plan.current ? "outline" : plan.highlight ? "default" : "outline"}
              disabled={plan.current}
              onClick={() => !plan.current && toast.info("Contact sales for plan changes")}
              className="w-full text-xs"
            >
              {plan.cta}
            </Button>
          </div>
        ))}
      </div>

      {/* Payment method placeholder */}
      <div className="rounded-xl border border-border p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-foreground">Payment method</p>
          <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={() => toast.info("Stripe checkout — coming soon")}>
            <CreditCard className="h-3.5 w-3.5" /> Update card
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-8 w-12 rounded-md bg-gradient-to-r from-blue-600 to-blue-700 flex items-center justify-center">
            <span className="text-white text-[8px] font-bold">VISA</span>
          </div>
          <div>
            <p className="text-sm text-foreground">•••• •••• •••• 4242</p>
            <p className="text-xs text-muted-foreground">Expires 12/26</p>
          </div>
        </div>
      </div>

      {/* Invoices */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Recent invoices</p>
        <div className="rounded-xl border border-border overflow-hidden">
          {INVOICES.map((inv, i) => (
            <div key={i} className={cn("flex items-center justify-between px-4 py-3.5", i < INVOICES.length - 1 && "border-b border-border")}>
              <div>
                <p className="text-sm font-medium text-foreground">{inv.date}</p>
                <p className="text-xs text-muted-foreground">{inv.amount}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 rounded-full px-2 py-0.5">{inv.status}</span>
                <button onClick={() => toast.info("Downloading invoice…")} className="text-muted-foreground hover:text-foreground transition-colors">
                  <Download className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Members Tab ───────────────────────────────────────────────────────────────

type MemberRole = "admin" | "editor" | "viewer";

interface Member {
  id: string;
  name: string;
  email: string;
  role: MemberRole;
  avatar: string;
  joinedAt: string;
  status: "active" | "pending";
}

const MOCK_MEMBERS: Member[] = [
  { id: "m1", name: "Frugal Admin", email: "techtraining@frugaltestingid.com", role: "admin", avatar: "F", joinedAt: "Oct 2024", status: "active" },
  { id: "m2", name: "Dev Team",     email: "dev@frugaltestingid.com",          role: "editor", avatar: "D", joinedAt: "Nov 2024", status: "active" },
  { id: "m3", name: "Analyst",      email: "analyst@frugaltestingid.com",      role: "viewer", avatar: "A", joinedAt: "Jan 2025", status: "pending" },
];

const ROLE_CFG: Record<MemberRole, { label: string; cls: string; desc: string }> = {
  admin:  { label: "Admin",  cls: "bg-violet-50 text-violet-700 dark:bg-violet-950/20 dark:text-violet-400",  desc: "Full access, manage workspace" },
  editor: { label: "Editor", cls: "bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400",          desc: "Create and edit flows" },
  viewer: { label: "Viewer", cls: "bg-muted text-muted-foreground",                                           desc: "Read-only access" },
};

function MembersTab() {
  const { toast } = useToast();
  const [members, setMembers] = React.useState<Member[]>(MOCK_MEMBERS);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole]   = React.useState<MemberRole>("editor");
  const [inviting, setInviting]       = React.useState(false);
  const [showInvite, setShowInvite]   = React.useState(false);
  const [editingRole, setEditingRole] = React.useState<string | null>(null);

  async function handleInvite() {
    if (!inviteEmail.includes("@")) { toast.error("Enter a valid email address"); return; }
    setInviting(true);
    await new Promise(r => setTimeout(r, 700));
    const newMember: Member = {
      id: `m${Date.now()}`,
      name: inviteEmail.split("@")[0],
      email: inviteEmail,
      role: inviteRole,
      avatar: inviteEmail[0].toUpperCase(),
      joinedAt: new Date().toLocaleString("en-US", { month: "short", year: "numeric" }),
      status: "pending",
    };
    setMembers(prev => [...prev, newMember]);
    setInviteEmail("");
    setInviting(false);
    setShowInvite(false);
    toast.success("Invitation sent", `${inviteEmail} has been invited as ${inviteRole}.`);
  }

  function handleRemove(id: string) {
    const m = members.find(m => m.id === id);
    setMembers(prev => prev.filter(m => m.id !== id));
    toast.success("Member removed", `${m?.name ?? "Member"} has been removed from the workspace.`);
  }

  function handleRoleChange(id: string, role: MemberRole) {
    setMembers(prev => prev.map(m => m.id === id ? { ...m, role } : m));
    setEditingRole(null);
    toast.success("Role updated");
  }

  const active  = members.filter(m => m.status === "active");
  const pending = members.filter(m => m.status === "pending");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-1">Team members</h3>
          <p className="text-xs text-muted-foreground">{members.length} member{members.length !== 1 ? "s" : ""} in this workspace.</p>
        </div>
        <Button size="sm" className="gap-1.5 shrink-0" onClick={() => setShowInvite(v => !v)}>
          <Mail className="h-3.5 w-3.5" /> Invite member
        </Button>
      </div>

      {/* Invite form */}
      {showInvite && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-brand-200 dark:border-brand-800 bg-brand-50/30 dark:bg-brand-950/10 p-4 space-y-3"
        >
          <p className="text-sm font-medium text-foreground">Invite new member</p>
          <div className="flex gap-2">
            <div className="flex-1">
              <Label className="text-xs">Email address</Label>
              <Input
                autoFocus
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="colleague@company.com"
                className="mt-1.5 h-9 text-sm"
                onKeyDown={e => e.key === "Enter" && handleInvite()}
              />
            </div>
            <div className="w-32">
              <Label className="text-xs">Role</Label>
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value as MemberRole)}
                className="mt-1.5 h-9 w-full rounded-lg border border-border bg-white dark:bg-[#0e0f1a] px-2 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="admin">Admin</option>
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleInvite} disabled={!inviteEmail || inviting} className="gap-1.5">
              {inviting ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Sending…</> : <><Mail className="h-3.5 w-3.5" />Send invite</>}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowInvite(false)}>Cancel</Button>
          </div>
        </motion.div>
      )}

      {/* Roles legend */}
      <div className="grid grid-cols-3 gap-3">
        {(Object.entries(ROLE_CFG) as [MemberRole, typeof ROLE_CFG[MemberRole]][]).map(([role, cfg]) => (
          <div key={role} className="rounded-lg border border-border p-3">
            <span className={cn("inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full mb-1", cfg.cls)}>{cfg.label}</span>
            <p className="text-[11px] text-muted-foreground">{cfg.desc}</p>
          </div>
        ))}
      </div>

      {/* Members list */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-2.5 bg-muted/30 border-b border-border">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Active members ({active.length})
          </p>
        </div>
        {active.map((m, i) => (
          <div key={m.id} className={cn("flex items-center gap-3 px-4 py-3.5", i < active.length - 1 && "border-b border-border")}>
            <div className="h-8 w-8 rounded-full bg-brand-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
              {m.avatar}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{m.name}</p>
              <p className="text-xs text-muted-foreground truncate">{m.email}</p>
            </div>
            {editingRole === m.id ? (
              <div className="flex items-center gap-1">
                {(["admin", "editor", "viewer"] as MemberRole[]).map(r => (
                  <button
                    key={r}
                    onClick={() => handleRoleChange(m.id, r)}
                    className={cn("text-[10px] px-2 py-1 rounded-lg border transition-all capitalize font-medium", m.role === r ? "border-brand-500 bg-brand-50 dark:bg-brand-950/20 text-brand-700" : "border-border text-muted-foreground hover:bg-accent")}
                  >
                    {r}
                  </button>
                ))}
                <button onClick={() => setEditingRole(null)} className="ml-1 text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <>
                <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize", ROLE_CFG[m.role].cls)}>
                  {m.role}
                </span>
                {m.id !== "m1" && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEditingRole(m.id)}
                      className="h-6 w-6 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent transition-colors"
                    >
                      <ChevronRight className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => handleRemove(m.id)}
                      className="h-6 w-6 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-rose-600 hover:border-rose-300 transition-colors"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {/* Pending invitations */}
      {pending.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-2.5 bg-muted/30 border-b border-border">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Pending invitations ({pending.length})
            </p>
          </div>
          {pending.map((m, i) => (
            <div key={m.id} className={cn("flex items-center gap-3 px-4 py-3.5", i < pending.length - 1 && "border-b border-border")}>
              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-xs font-bold shrink-0 border border-dashed border-border">
                {m.avatar}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{m.email}</p>
                <p className="text-xs text-muted-foreground">Invited as <span className="capitalize">{m.role}</span></p>
              </div>
              <span className="text-[10px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400 rounded-full px-2 py-0.5">
                Pending
              </span>
              <button
                onClick={() => handleRemove(m.id)}
                className="text-xs text-muted-foreground hover:text-rose-600 transition-colors"
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Danger Zone Tab ───────────────────────────────────────────────────────────

function DangerZoneTab() {
  const { toast } = useToast();
  const [confirmText, setConfirmText] = React.useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);

  const DANGER_ACTIONS = [
    {
      id: "pause",
      title: "Pause all flows",
      description: "Immediately pause all active data flows. They can be resumed individually.",
      buttonLabel: "Pause all flows",
      buttonVariant: "outline" as const,
      severity: "medium",
      action: () => toast.warning("All flows paused"),
    },
    {
      id: "export",
      title: "Export workspace data",
      description: "Download a copy of all your workspace data, flows, and configuration.",
      buttonLabel: "Export data",
      buttonVariant: "outline" as const,
      severity: "low",
      action: () => toast.info("Export started — you'll receive an email when it's ready."),
    },
    {
      id: "reset",
      title: "Reset warehouse credentials",
      description: "Remove all stored BigQuery credentials from the vault. This will disconnect Intelligence, BI, and Warehouse pages.",
      buttonLabel: "Reset credentials",
      buttonVariant: "outline" as const,
      severity: "high",
      action: () => toast.success("Credentials reset"),
    },
    {
      id: "delete",
      title: "Delete workspace",
      description: "Permanently delete this workspace and all its data. This action cannot be undone.",
      buttonLabel: "Delete workspace",
      buttonVariant: "destructive" as const,
      severity: "critical",
      action: () => setShowDeleteConfirm(true),
    },
  ];

  const SEVERITY_CLS: Record<string, string> = {
    low:      "border-border",
    medium:   "border-amber-200 dark:border-amber-900",
    high:     "border-rose-200 dark:border-rose-900",
    critical: "border-rose-300 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-950/10",
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-rose-600 mb-1">Danger Zone</h3>
        <p className="text-xs text-muted-foreground">These actions are irreversible. Please proceed with caution.</p>
      </div>

      <div className="space-y-3">
        {DANGER_ACTIONS.map(action => (
          <div key={action.id} className={cn("rounded-xl border p-4 flex items-start justify-between gap-4", SEVERITY_CLS[action.severity])}>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{action.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{action.description}</p>
            </div>
            <Button
              size="sm"
              variant={action.buttonVariant}
              className={cn("shrink-0 text-xs", action.severity === "critical" && "border-rose-500 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20")}
              onClick={action.action}
            >
              {action.buttonLabel}
            </Button>
          </div>
        ))}
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md rounded-2xl border border-border bg-white dark:bg-[#0e0f1a] p-6 shadow-2xl mx-4"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-950/30 mb-4">
              <AlertTriangle className="h-5 w-5 text-rose-600" />
            </div>
            <h3 className="text-base font-bold text-foreground mb-1">Delete workspace</h3>
            <p className="text-sm text-muted-foreground mb-4">
              This will permanently delete the <strong>Frugal Testing Workspace</strong> and all associated flows, data, and credentials. This action cannot be undone.
            </p>
            <div className="mb-4">
              <Label className="text-xs text-muted-foreground">Type <strong>delete workspace</strong> to confirm</Label>
              <Input
                autoFocus
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                placeholder="delete workspace"
                className="mt-1.5 h-9 text-sm"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={() => { setShowDeleteConfirm(false); setConfirmText(""); }}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={confirmText !== "delete workspace"}
                className="bg-rose-600 hover:bg-rose-700 text-white border-rose-600"
                onClick={() => { setShowDeleteConfirm(false); toast.error("Workspace deletion requested", "You will receive a confirmation email."); }}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete workspace
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

// ── BigQuery Credentials Section (moved to Integrations) ──────────────────────

function BigQuerySection({ inVault, onSaved }: { inVault: boolean; onSaved: () => void }) {
  const { toast } = useToast();
  const [projectId, setProjectId] = React.useState("");
  const [dataset, setDataset]     = React.useState("");
  const [location, setLocation]   = React.useState("US");
  const [serviceJson, setJson]    = React.useState("");
  const [saving, setSaving]       = React.useState(false);
  const [testing, setTesting]     = React.useState(false);
  const [saved, setSaved]         = React.useState(false);
  const [result, setResult]       = React.useState<"ok" | "error" | null>(null);
  const [errMsg, setErrMsg]       = React.useState("");

  const canSave = projectId.trim() && dataset.trim() && serviceJson.trim();

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service: "bigquery",
          data: { project_id: projectId.trim(), dataset: dataset.trim(), service_json: serviceJson.trim(), location: location.trim() || "US" },
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onSaved();
      toast.success("BigQuery credentials saved");
    } catch { toast.error("Failed to save credentials"); } finally { setSaving(false); }
  }

  async function handleTest() {
    if (!canSave) return;
    await fetch("/api/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service: "bigquery", data: { project_id: projectId.trim(), dataset: dataset.trim(), service_json: serviceJson.trim(), location: location.trim() || "US" } }),
    }).catch(() => {});
    setTesting(true);
    setResult(null);
    try {
      const res  = await fetch("/api/bigquery/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok) {
        setResult("ok"); setErrMsg(""); onSaved();
        toast.success("Connected!", "BigQuery data will now load on Intelligence, Business IQ and Warehouse pages.");
      } else {
        setResult("error"); setErrMsg(json.error ?? `HTTP ${res.status}`);
        toast.error("Connection failed", json.error ?? "Check credentials and try again.");
      }
    } catch (e) {
      setResult("error"); setErrMsg(String(e));
      toast.error("Connection failed");
    } finally { setTesting(false); }
  }

  return (
    <div className="rounded-xl border border-border bg-white dark:bg-[#0e0f1a] p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
          <Database className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">Google BigQuery</p>
          <p className="text-xs text-muted-foreground">Required for Intelligence, Business IQ and Warehouse pages</p>
        </div>
        {inVault && result !== "error" && (
          <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 rounded-full px-2.5 py-1">
            <CheckCircle2 className="h-3 w-3" /> Configured
          </span>
        )}
        {result === "error" && (
          <span className="flex items-center gap-1 text-xs font-medium text-rose-600 bg-rose-50 dark:bg-rose-950/20 rounded-full px-2.5 py-1">
            <AlertCircle className="h-3 w-3" /> Error
          </span>
        )}
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Project ID</Label>
            <Input type="text" value={projectId} onChange={e => setProjectId(e.target.value)} placeholder="my-gcp-project" className="mt-1.5 h-9 text-sm font-mono" />
          </div>
          <div>
            <Label className="text-xs">Dataset</Label>
            <Input type="text" value={dataset} onChange={e => setDataset(e.target.value)} placeholder="crosstecch_data" className="mt-1.5 h-9 text-sm font-mono" />
          </div>
        </div>
        <div>
          <Label className="text-xs">Dataset Location <span className="font-normal text-muted-foreground">(must match your BigQuery region)</span></Label>
          <select value={location} onChange={e => setLocation(e.target.value)} className="mt-1.5 w-full h-9 rounded-lg border border-border bg-white dark:bg-[#0e0f1a] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 transition">
            <option value="US">US (multi-region)</option>
            <option value="EU">EU (multi-region)</option>
            <option value="us-central1">us-central1</option>
            <option value="us-east1">us-east1</option>
            <option value="europe-west1">europe-west1</option>
            <option value="asia-south1">asia-south1 (Mumbai)</option>
            <option value="asia-southeast1">asia-southeast1 (Singapore)</option>
          </select>
        </div>
        <div>
          <Label className="text-xs">
            Service Account JSON{" "}
            <a href="https://console.cloud.google.com/iam-admin/serviceaccounts" target="_blank" rel="noopener noreferrer" className="ml-2 text-brand-600 hover:underline font-normal">
              GCP Console →
            </a>
          </Label>
          <textarea
            value={serviceJson}
            onChange={e => setJson(e.target.value)}
            placeholder={'{\n  "type": "service_account",\n  "project_id": "...",\n  ...\n}'}
            rows={5}
            className="mt-1.5 w-full rounded-lg border border-border bg-white dark:bg-[#0e0f1a] px-3 py-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-brand-500 transition resize-y"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" disabled={!canSave || testing} onClick={handleTest}>
            {testing ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Testing…</> : <><Zap className="h-3.5 w-3.5" />Test connection</>}
          </Button>
          <Button size="sm" className="gap-1.5" disabled={!canSave || saving} onClick={handleSave}>
            {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving…</> : saved ? <><Check className="h-3.5 w-3.5" />Saved!</> : "Save credentials"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function IntegrationsTab() {
  const { toast } = useToast();
  const [keys, setKeys]       = React.useState<Record<string, string>>({});
  const [show, setShow]       = React.useState<Record<string, boolean>>({});
  const [testing, setTesting] = React.useState<string | null>(null);
  const [saving, setSaving]   = React.useState<string | null>(null);
  const [result, setResult]   = React.useState<Record<string, "ok" | "error">>({});
  const [errMsg, setErrMsg]   = React.useState<Record<string, string>>({});
  const [saved, setSaved]     = React.useState<string | null>(null);
  const [hasVaultKey, setHasVaultKey] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    fetch("/api/credentials")
      .then(r => r.json())
      .then((d: { credentials?: { service: string }[] }) => {
        const map: Record<string, boolean> = {};
        (d.credentials ?? []).forEach(c => { map[c.service] = true; });
        setHasVaultKey(map);
      })
      .catch(() => {});
  }, []);

  function handleChange(service: string, value: string) {
    setKeys((k) => ({ ...k, [service]: value }));
    setResult((r) => ({ ...r, [service]: undefined as any }));
  }

  async function handleSave(service: string) {
    const key = (keys[service] ?? "").trim();
    if (!key) return;
    setSaving(service);
    try {
      const res = await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service, data: { api_key: key } }),
      });
      if (res.ok) {
        setHasVaultKey(prev => ({ ...prev, [service]: true }));
        setSaved(service);
        toast.success("API key saved");
        setTimeout(() => setSaved(null), 2000);
      }
    } catch { toast.error("Failed to save key"); } finally { setSaving(null); }
  }

  async function handleTest(service: string) {
    setTesting(service);
    const pendingKey = (keys[service] ?? "").trim();
    if (pendingKey) {
      await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service, data: { api_key: pendingKey } }),
      }).catch(() => {});
    }
    try {
      const res  = await fetch("/api/instantly/campaigns");
      const json = await res.json().catch(() => ({}));
      if (res.ok && !json.demo) {
        setResult((r) => ({ ...r, [service]: "ok" }));
        setHasVaultKey(prev => ({ ...prev, [service]: true }));
        setErrMsg((m) => ({ ...m, [service]: "" }));
        toast.success("Connection successful!", `Real ${service} data will now load automatically.`);
      } else {
        setResult((r) => ({ ...r, [service]: "error" }));
        const msg = json?.error ?? (json?.demo ? "No API key saved yet — enter a key and click Save first." : `HTTP ${res.status}`);
        setErrMsg((m) => ({ ...m, [service]: msg }));
        toast.error("Connection failed", msg);
      }
    } catch (e) {
      setResult((r) => ({ ...r, [service]: "error" }));
      setErrMsg((m) => ({ ...m, [service]: String(e) }));
      toast.error("Connection failed");
    }
    setTesting(null);
  }

  const INTEGRATIONS = [
    {
      id:          "instantly",
      name:        "Instantly",
      description: "Cold email outreach — campaigns, leads, replies, inboxes",
      color:       "#6366F1",
      abbr:        "IN",
      docsUrl:     "https://app.instantly.ai/app/settings/integrations",
      placeholder: "inst_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-1">API Integrations</h3>
        <p className="text-xs text-muted-foreground">Keys are stored in the server-side encrypted vault — never in your browser.</p>
      </div>

      <BigQuerySection inVault={hasVaultKey["bigquery"] ?? false} onSaved={() => setHasVaultKey(prev => ({ ...prev, bigquery: true }))} />

      {INTEGRATIONS.map((svc) => {
        const val      = keys[svc.id] ?? "";
        const shown    = show[svc.id];
        const testRes  = result[svc.id];
        const isSaved  = saved === svc.id;
        const inVault  = hasVaultKey[svc.id];
        const isSaving = saving === svc.id;

        return (
          <div key={svc.id} className="rounded-xl border border-border bg-white dark:bg-[#0e0f1a] p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white text-[11px] font-bold shadow-sm" style={{ backgroundColor: svc.color }}>
                {svc.abbr}
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">{svc.name}</p>
                <p className="text-xs text-muted-foreground">{svc.description}</p>
              </div>
              {inVault && testRes !== "error" && (
                <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 rounded-full px-2.5 py-1">
                  <CheckCircle2 className="h-3 w-3" /> Key saved
                </span>
              )}
              {testRes === "error" && (
                <span className="flex items-center gap-1 text-xs font-medium text-rose-600 bg-rose-50 dark:bg-rose-950/20 rounded-full px-2.5 py-1">
                  <AlertCircle className="h-3 w-3" /> Invalid key
                </span>
              )}
            </div>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">
                  API Key{" "}
                  <a href={svc.docsUrl} target="_blank" rel="noopener noreferrer" className="ml-2 text-brand-600 hover:underline font-normal">
                    Where to find it →
                  </a>
                </Label>
                <div className="relative mt-1.5">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    type={shown ? "text" : "password"}
                    value={val}
                    onChange={(e) => handleChange(svc.id, e.target.value)}
                    placeholder={svc.placeholder}
                    className="pl-9 pr-10 h-9 text-sm font-mono"
                  />
                  <button onClick={() => setShow((s) => ({ ...s, [svc.id]: !s[svc.id] }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {shown ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" disabled={!val || testing === svc.id} onClick={() => handleTest(svc.id)} variant="outline" className="gap-1.5">
                  {testing === svc.id ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Testing…</> : <><Zap className="h-3.5 w-3.5" />Test</>}
                </Button>
                <Button size="sm" disabled={!val || isSaving} onClick={() => handleSave(svc.id)} className="gap-1.5">
                  {isSaving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving…</> : isSaved ? <><Check className="h-3.5 w-3.5" />Saved!</> : "Save key"}
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [tab, setTab] = React.useState<Tab>("profile");

  const TAB_GROUPS = [
    { label: "Account",      tabs: ["profile"] as Tab[] },
    { label: "Integrations", tabs: ["integrations"] as Tab[] },
  ];

  return (
    <div className="flex gap-0 min-h-full">
      {/* ── Sidebar nav ─────────────────────────────────────────────── */}
      <div className="w-52 shrink-0 border-r border-border bg-white dark:bg-[#0e0f1a] flex flex-col py-6 px-3 gap-5">
        {TAB_GROUPS.map(group => (
          <div key={group.label}>
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 px-3 mb-1.5">{group.label}</p>
            {group.tabs.map(t => {
              const cfg = TABS.find(x => x.value === t)!;
              const Icon = cfg.icon;
              const active = tab === t;
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    "w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors text-left",
                    active
                      ? "bg-brand-50 dark:bg-brand-950/30 text-brand-700 dark:text-brand-400"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <Icon className={cn("h-4 w-4 shrink-0", active ? "text-brand-600" : "text-muted-foreground")} />
                  {cfg.label}
                  {t === "danger" && <AlertTriangle className="ml-auto h-3 w-3 text-rose-500" />}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* ── Content ─────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 p-8">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
          className="max-w-2xl"
        >
          {tab === "profile"      && <ProfileTab />}
          {tab === "integrations" && <IntegrationsTab />}
        </motion.div>
      </div>
    </div>
  );
}

// X icon needed inline — import workaround
function X({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
