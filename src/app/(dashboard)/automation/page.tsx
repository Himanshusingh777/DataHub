"use client";

/**
 * Automation — real workflow automation rules. Triggers (before a sync,
 * after success, after failure, or on a schedule) fire real actions (a
 * signed webhook POST, a real email via Resend, or re-running the flow).
 * No mock data; every rule shown here is enforced by the actual job
 * worker/scheduler (see lib/server/automation.ts).
 *
 * Data sources:
 *   GET/POST /api/automation/rules        — list/create rules
 *   PATCH/DELETE /api/automation/rules/:id — toggle enabled / delete
 *   GET/POST /api/automation/webhooks     — list/create webhook targets
 *   DELETE /api/automation/webhooks/:id   — delete a webhook target
 *   GET /api/flows                        — flow picker for flow-scoped triggers
 */

import React from "react";
import {
  Zap, Plus, Trash2, Loader2, AlertTriangle, Webhook, Mail, RotateCcw,
  CheckCircle2, XCircle, Play, ArrowRight, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { SCHEDULE_OPTIONS } from "@/services/scheduler.service";

// ── Types ─────────────────────────────────────────────────────────────────────

type TriggerType = "pre_sync" | "post_sync" | "on_failure" | "schedule";
type ActionType = "webhook" | "email" | "retry";

interface AutomationRule {
  id: string;
  name: string;
  triggerType: TriggerType;
  triggerMeta: { flowId?: string; scheduleValue?: string };
  actionType: ActionType;
  actionMeta: { webhookId?: string; to?: string; subject?: string };
  enabled: number;
  lastFiredAt: string | null;
  lastStatus: "success" | "error" | null;
  createdAt: string;
}

interface WebhookTarget {
  id: string;
  name: string;
  url: string;
  status: string;
  lastFiredAt: string | null;
  lastStatus: number | null;
  createdAt: string;
}

interface FlowOption { id: string; name: string | null; sourceName: string | null; sourceId: string }

const TRIGGER_LABELS: Record<TriggerType, string> = {
  pre_sync: "Before a sync runs",
  post_sync: "After a sync succeeds",
  on_failure: "After a sync fails",
  schedule: "On a schedule",
};

const ACTION_LABELS: Record<ActionType, string> = {
  webhook: "Send a webhook",
  email: "Send an email",
  retry: "Retry the flow",
};

const ACTION_ICONS: Record<ActionType, React.ElementType> = { webhook: Webhook, email: Mail, retry: RotateCcw };

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-white/50 py-10 text-center dark:bg-[#0e0f1a]/50">
      <Zap className="h-7 w-7 text-muted-foreground/50" />
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function flowLabel(f: FlowOption): string {
  return f.name?.trim() || f.sourceName || f.sourceId;
}

// ── New rule form ────────────────────────────────────────────────────────────

function NewRuleForm({ webhooks, flows, onCreated }: { webhooks: WebhookTarget[]; flows: FlowOption[]; onCreated: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [triggerType, setTriggerType] = React.useState<TriggerType>("on_failure");
  const [flowId, setFlowId] = React.useState("");
  const [scheduleValue, setScheduleValue] = React.useState("every_hour");
  const [actionType, setActionType] = React.useState<ActionType>("email");
  const [webhookId, setWebhookId] = React.useState(webhooks[0]?.id ?? "");
  const [to, setTo] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const { toast } = useToast();

  // This form stays mounted continuously (only its `open` flag toggles the
  // collapsed/expanded view), so webhookId's useState initial value only
  // ever reflects `webhooks` as it was at first page load. Creating a
  // webhook target and then picking it here in the same session — the
  // obvious first thing to do — left webhookId stuck at "" even though the
  // <select> visually showed a target selected (the browser's fallback
  // behavor for a controlled value that matches no <option>), so submit
  // silently rejected every attempt. Keep it synced to whatever is
  // currently selectable instead of only initializing once.
  React.useEffect(() => {
    if (!webhooks.some((w) => w.id === webhookId)) setWebhookId(webhooks[0]?.id ?? "");
  }, [webhooks, webhookId]);

  React.useEffect(() => {
    if (triggerType === "schedule" && actionType === "retry") setActionType("email");
  }, [triggerType, actionType]);

  async function submit() {
    if (!name.trim()) { toast.error("Name required"); return; }
    if (actionType === "webhook" && !webhookId) { toast.error("Pick a webhook target", "Create one below first."); return; }
    if (actionType === "email" && !to.trim()) { toast.error("Recipient required"); return; }

    setSaving(true);
    try {
      const res = await fetch("/api/automation/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          triggerType,
          triggerMeta: triggerType === "schedule" ? { scheduleValue } : (flowId ? { flowId } : {}),
          actionType,
          actionMeta: actionType === "webhook" ? { webhookId } : actionType === "email" ? { to: to.trim(), subject: subject.trim() || undefined } : {},
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error("Could not create rule", data.error ?? "Unknown error"); return; }
      toast.success("Automation rule created", name.trim());
      setName(""); setFlowId(""); setTo(""); setSubject(""); setOpen(false);
      onCreated();
    } catch {
      toast.error("Could not create rule", "Network error.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="h-9 gap-2" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> New rule
      </Button>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-white p-5 shadow-card dark:bg-[#0e0f1a] space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">New automation rule</h3>
        <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Notify on failure"
            className="h-9 w-full rounded-lg border border-border bg-white px-3 text-sm dark:bg-[#0e0f1a] focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Trigger</label>
          <select value={triggerType} onChange={(e) => setTriggerType(e.target.value as TriggerType)}
            className="h-9 w-full rounded-lg border border-border bg-white px-3 text-sm dark:bg-[#0e0f1a] focus:outline-none focus:ring-2 focus:ring-brand-500">
            {(Object.keys(TRIGGER_LABELS) as TriggerType[]).map((t) => <option key={t} value={t}>{TRIGGER_LABELS[t]}</option>)}
          </select>
        </div>

        {triggerType === "schedule" ? (
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Frequency</label>
            <select value={scheduleValue} onChange={(e) => setScheduleValue(e.target.value)}
              className="h-9 w-full rounded-lg border border-border bg-white px-3 text-sm dark:bg-[#0e0f1a] focus:outline-none focus:ring-2 focus:ring-brand-500">
              {SCHEDULE_OPTIONS.filter((o) => o.value !== "manual").map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Flow (optional)</label>
            <select value={flowId} onChange={(e) => setFlowId(e.target.value)}
              className="h-9 w-full rounded-lg border border-border bg-white px-3 text-sm dark:bg-[#0e0f1a] focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="">Any flow</option>
              {flows.map((f) => <option key={f.id} value={f.id}>{flowLabel(f)}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Action</label>
          <select value={actionType} onChange={(e) => setActionType(e.target.value as ActionType)}
            className="h-9 w-full rounded-lg border border-border bg-white px-3 text-sm dark:bg-[#0e0f1a] focus:outline-none focus:ring-2 focus:ring-brand-500">
            {(Object.keys(ACTION_LABELS) as ActionType[])
              .filter((a) => !(a === "retry" && triggerType === "schedule"))
              .map((a) => <option key={a} value={a}>{ACTION_LABELS[a]}</option>)}
          </select>
        </div>

        {actionType === "webhook" && (
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Webhook target</label>
            {webhooks.length === 0 ? (
              <p className="text-xs text-amber-600">Create a webhook target below first.</p>
            ) : (
              <select value={webhookId} onChange={(e) => setWebhookId(e.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-white px-3 text-sm dark:bg-[#0e0f1a] focus:outline-none focus:ring-2 focus:ring-brand-500">
                {webhooks.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            )}
          </div>
        )}

        {actionType === "email" && (
          <>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Send to</label>
              <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="ops@yourco.com" type="email"
                className="h-9 w-full rounded-lg border border-border bg-white px-3 text-sm dark:bg-[#0e0f1a] focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Subject (optional)</label>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={`Automation: ${name || "..."}`}
                className="h-9 w-full rounded-lg border border-border bg-white px-3 text-sm dark:bg-[#0e0f1a] focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
        <Button size="sm" onClick={submit} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Create rule
        </Button>
      </div>
    </div>
  );
}

// ── New webhook form ─────────────────────────────────────────────────────────

function NewWebhookForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const { toast } = useToast();

  async function submit() {
    if (!name.trim() || !url.trim()) { toast.error("Name and URL required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/automation/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), url: url.trim(), events: [] }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error("Could not create webhook", data.error ?? "Unknown error"); return; }
      toast.success("Webhook target created", name.trim());
      setName(""); setUrl(""); setOpen(false);
      onCreated();
    } catch {
      toast.error("Could not create webhook", "Network error.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" /> New webhook target
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-3">
      <div>
        <label className="mb-1 block text-[10px] font-medium text-muted-foreground">Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Slack alerts"
          className="h-8 w-40 rounded-lg border border-border bg-white px-2.5 text-xs dark:bg-[#0e0f1a] focus:outline-none focus:ring-2 focus:ring-brand-500" />
      </div>
      <div className="flex-1 min-w-[200px]">
        <label className="mb-1 block text-[10px] font-medium text-muted-foreground">URL</label>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://hooks.example.com/…"
          className="h-8 w-full rounded-lg border border-border bg-white px-2.5 text-xs dark:bg-[#0e0f1a] focus:outline-none focus:ring-2 focus:ring-brand-500" />
      </div>
      <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={submit} disabled={saving}>
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Add
      </Button>
      <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setOpen(false)}>Cancel</Button>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AutomationPage() {
  const [rules, setRules] = React.useState<AutomationRule[] | null>(null);
  const [webhooks, setWebhooks] = React.useState<WebhookTarget[]>([]);
  const [flows, setFlows] = React.useState<FlowOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const { toast } = useToast();

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const [rulesRes, whRes, flowsRes] = await Promise.all([
      fetchJson<{ rules: AutomationRule[] }>("/api/automation/rules"),
      fetchJson<{ webhooks: WebhookTarget[] }>("/api/automation/webhooks"),
      fetchJson<{ ok: boolean; flows: Array<{ id: string; name: string | null; source_name: string | null; source_id: string }> }>("/api/flows"),
    ]);
    setLoading(false);
    if (!rulesRes) { setError("Could not reach the automation endpoint."); return; }
    setRules(rulesRes.rules);
    setWebhooks(whRes?.webhooks ?? []);
    setFlows((flowsRes?.flows ?? []).map((f) => ({ id: f.id, name: f.name, sourceName: f.source_name, sourceId: f.source_id })));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  async function toggleRule(rule: AutomationRule) {
    const enabled = !rule.enabled;
    setRules((prev) => prev?.map((r) => (r.id === rule.id ? { ...r, enabled: enabled ? 1 : 0 } : r)) ?? null);
    try {
      const res = await fetch(`/api/automation/rules/${rule.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error("Could not update rule");
      load();
    }
  }

  async function deleteRule(id: string) {
    setRules((prev) => prev?.filter((r) => r.id !== id) ?? null);
    try {
      await fetch(`/api/automation/rules/${id}`, { method: "DELETE" });
      toast.success("Rule deleted");
    } catch {
      toast.error("Could not delete rule");
      load();
    }
  }

  async function deleteWebhook(id: string) {
    setWebhooks((prev) => prev.filter((w) => w.id !== id));
    try {
      await fetch(`/api/automation/webhooks/${id}`, { method: "DELETE" });
      toast.success("Webhook target deleted");
    } catch {
      toast.error("Could not delete webhook");
      load();
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Automation</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Rules that fire real actions when a flow runs, fails, or on a schedule.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50/50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/10 dark:text-rose-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {!rules && !error && loading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {rules && (
        <>
          {/* Rules */}
          <div className="rounded-xl border border-border bg-white shadow-card dark:bg-[#0e0f1a]">
            <div className="flex items-center justify-between px-5 pt-5 pb-4">
              <h3 className="text-sm font-semibold text-foreground">Rules</h3>
              <NewRuleForm webhooks={webhooks} flows={flows} onCreated={load} />
            </div>
            {rules.length === 0 ? (
              <div className="px-5 pb-5"><EmptyState message="No automation rules yet. Create one to react automatically to flow runs." /></div>
            ) : (
              <div className="divide-y divide-border/60">
                {rules.map((rule) => {
                  const ActionIcon = ACTION_ICONS[rule.actionType];
                  const flow = rule.triggerMeta.flowId ? flows.find((f) => f.id === rule.triggerMeta.flowId) : undefined;
                  return (
                    <div key={rule.id} className="flex items-center gap-3 px-5 py-3">
                      <button
                        onClick={() => toggleRule(rule)}
                        className={cn(
                          "flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition-colors",
                          rule.enabled ? "bg-brand-600 justify-end" : "bg-muted justify-start"
                        )}
                      >
                        <span className="h-4 w-4 rounded-full bg-white shadow" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{rule.name}</p>
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground flex-wrap">
                          <span>{TRIGGER_LABELS[rule.triggerType]}</span>
                          {flow && <><span>·</span><span className="font-medium">{flowLabel(flow)}</span></>}
                          {rule.triggerType === "schedule" && rule.triggerMeta.scheduleValue && (
                            <><span>·</span><span>{SCHEDULE_OPTIONS.find((o) => o.value === rule.triggerMeta.scheduleValue)?.label ?? rule.triggerMeta.scheduleValue}</span></>
                          )}
                          <ArrowRight className="h-2.5 w-2.5" />
                          <ActionIcon className="h-3 w-3" />
                          <span>{ACTION_LABELS[rule.actionType]}</span>
                        </div>
                      </div>
                      {rule.lastStatus && (
                        <Badge variant={rule.lastStatus === "success" ? "success" : "error"} className="shrink-0 gap-1">
                          {rule.lastStatus === "success" ? <CheckCircle2 className="h-2.5 w-2.5" /> : <XCircle className="h-2.5 w-2.5" />}
                          {rule.lastFiredAt}
                        </Badge>
                      )}
                      <button onClick={() => deleteRule(rule.id)} className="shrink-0 text-muted-foreground hover:text-rose-600 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Webhook targets */}
          <div className="rounded-xl border border-border bg-white p-5 shadow-card dark:bg-[#0e0f1a]">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Webhook Targets</h3>
                <p className="text-[11px] text-muted-foreground">Reusable delivery targets — reference one from a &quot;Send a webhook&quot; rule above.</p>
              </div>
              <NewWebhookForm onCreated={load} />
            </div>
            {webhooks.length === 0 ? (
              <EmptyState message="No webhook targets yet." />
            ) : (
              <div className="space-y-2">
                {webhooks.map((w) => (
                  <div key={w.id} className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2">
                    <Play className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground truncate">{w.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate font-mono">{w.url}</p>
                    </div>
                    {w.lastStatus != null && (
                      <span className={cn("shrink-0 text-[10px] font-mono", w.lastStatus >= 200 && w.lastStatus < 300 ? "text-emerald-600" : "text-rose-600")}>
                        {w.lastStatus}
                      </span>
                    )}
                    <button onClick={() => deleteWebhook(w.id)} className="shrink-0 text-muted-foreground hover:text-rose-600 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
