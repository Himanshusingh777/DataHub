/**
 * Workflow automation engine — evaluates and executes automation rules
 * (src/lib/server/db.ts's `automations` table) against real trigger events.
 *
 * Triggers: pre_sync / post_sync / on_failure fire inline from worker.ts's
 * sync_flow handler (best-effort — a failing automation must never break the
 * actual sync). schedule fires from a dedicated job type enqueued by
 * scheduler.ts, giving it the same retry/dead-letter durability as syncs.
 *
 * Actions: webhook (HMAC-signed POST to a saved webhooks row), email (via
 * lib/server/email.ts — real Resend delivery, not a stub), retry
 * (re-enqueues the flow that just failed). "transform" is a legacy action
 * type from this table's original design with no execution engine behind
 * it anywhere in this codebase — deliberately not implemented or exposed
 * in the UI rather than faked.
 */

import crypto from "crypto";
import { getDb } from "./db";
import { decrypt } from "./crypto";
import { writeAudit } from "./audit";
import { enqueueJob } from "./jobs";
import { sendEmail } from "./email";

export type AutomationTrigger = "pre_sync" | "post_sync" | "on_failure";

export interface AutomationFireContext {
  userId: string;
  workspaceId: string;
  flowId?: string;
  flowName?: string;
  error?: string;
}

interface AutomationRow {
  id: string;
  name: string;
  trigger_type: string;
  trigger_meta: string | null;
  action_type: string;
  action_meta: string | null;
}

/**
 * Fire every enabled rule matching `trigger` (and, if scoped, this flow).
 * Called inline from worker.ts's sync_flow handler, so each rule's failure
 * is caught here and never allowed to propagate — an automation must never
 * break the actual sync, and one rule's failure shouldn't stop the others.
 */
export async function fireAutomations(trigger: AutomationTrigger, ctx: AutomationFireContext): Promise<void> {
  const db = getDb();
  const rules = db.prepare(`
    SELECT id, name, trigger_type, trigger_meta, action_type, action_meta
    FROM automations
    WHERE user_id = ? AND workspace_id = ? AND trigger_type = ? AND enabled = 1
  `).all(ctx.userId, ctx.workspaceId, trigger) as AutomationRow[];

  for (const rule of rules) {
    const triggerMeta = safeParse<{ flowId?: string }>(rule.trigger_meta) ?? {};
    if (triggerMeta.flowId && ctx.flowId && triggerMeta.flowId !== ctx.flowId) continue;
    try {
      await runRule(rule, ctx);
    } catch {
      // Already logged to last_status/audit/console inside runRule.
    }
  }
}

/**
 * Fire a single schedule-triggered rule by id — called from the
 * fire_automation job handler in worker.ts. Unlike fireAutomations above,
 * this deliberately lets the error propagate: the whole reason this path
 * goes through the job queue (rather than firing inline from the scheduler
 * tick) is so a transient failure — a webhook endpoint that's briefly down,
 * a rate-limited email API — gets the queue's real retry-with-backoff
 * instead of silently failing once and waiting for the next scheduled run.
 */
export async function fireScheduledAutomation(automationId: string): Promise<void> {
  const db = getDb();
  const rule = db.prepare(`
    SELECT id, name, trigger_type, trigger_meta, action_type, action_meta, user_id, workspace_id
    FROM automations WHERE id = ? AND enabled = 1
  `).get(automationId) as (AutomationRow & { user_id: string; workspace_id: string }) | undefined;
  if (!rule) return;

  await runRule(rule, { userId: rule.user_id, workspaceId: rule.workspace_id });
}

/** Executes one rule's action, records last_fired_at/last_status + an audit entry either way, then re-throws on failure. */
async function runRule(rule: AutomationRow, ctx: AutomationFireContext): Promise<void> {
  const db = getDb();
  const now = Date.now();
  try {
    await runAction(rule, ctx);
    db.prepare("UPDATE automations SET last_fired_at = ?, last_status = 'success' WHERE id = ?").run(now, rule.id);
    writeAudit({
      workspaceId: ctx.workspaceId, userId: ctx.userId,
      action: "automation.fired", resource: rule.name,
      meta: { trigger: rule.trigger_type, actionType: rule.action_type, flowId: ctx.flowId },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    db.prepare("UPDATE automations SET last_fired_at = ?, last_status = 'error' WHERE id = ?").run(now, rule.id);
    writeAudit({
      workspaceId: ctx.workspaceId, userId: ctx.userId,
      action: "automation.failed", resource: rule.name,
      meta: { trigger: rule.trigger_type, actionType: rule.action_type, error: msg },
    });
    console.warn(`[automation] rule ${rule.id} (${rule.name}) failed:`, msg);
    throw e;
  }
}

async function runAction(rule: AutomationRow, ctx: AutomationFireContext): Promise<void> {
  const actionMeta = safeParse<Record<string, unknown>>(rule.action_meta) ?? {};

  if (rule.action_type === "webhook") {
    await fireWebhookAction(String(actionMeta.webhookId ?? ""), rule, ctx);
    return;
  }

  if (rule.action_type === "email") {
    const to = String(actionMeta.to ?? "").trim();
    if (!to) throw new Error("email action is missing a 'to' address");
    const subject = String(actionMeta.subject ?? `Automation: ${rule.name}`);
    await sendEmail(to, subject, `
      <p>Automation rule <b>${escapeHtml(rule.name)}</b> fired (${escapeHtml(rule.trigger_type)}).</p>
      ${ctx.flowName ? `<p>Flow: ${escapeHtml(ctx.flowName)}</p>` : ""}
      ${ctx.error ? `<p>Error: ${escapeHtml(ctx.error)}</p>` : ""}
    `);
    return;
  }

  if (rule.action_type === "retry") {
    if (!ctx.flowId) throw new Error("retry action requires a flow-scoped trigger (pre_sync/post_sync/on_failure)");
    enqueueJob("sync_flow", { flowId: ctx.flowId, triggerBy: "automation" }, { workspaceId: ctx.workspaceId });
    return;
  }

  throw new Error(`Unsupported or unimplemented action type "${rule.action_type}"`);
}

async function fireWebhookAction(webhookId: string, rule: AutomationRow, ctx: AutomationFireContext): Promise<void> {
  if (!webhookId) throw new Error("webhook action is missing a target webhookId");
  const db = getDb();
  const wh = db.prepare(
    "SELECT id, url, secret FROM webhooks WHERE id = ? AND user_id = ? AND workspace_id = ? AND status = 'active'"
  ).get(webhookId, ctx.userId, ctx.workspaceId) as { id: string; url: string; secret: string } | undefined;
  if (!wh) throw new Error("webhook target not found, not owned by this workspace, or inactive");

  const payload = JSON.stringify({
    rule: rule.name,
    trigger: rule.trigger_type,
    flowId: ctx.flowId ?? null,
    flowName: ctx.flowName ?? null,
    error: ctx.error ?? null,
    firedAt: new Date().toISOString(),
  });
  const signature = crypto.createHmac("sha256", decrypt(wh.secret)).update(payload).digest("hex");
  const now = Date.now();

  let status = 0;
  try {
    const res = await fetch(wh.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Automation-Signature": signature },
      body: payload,
    });
    status = res.status;
    if (!res.ok) throw new Error(`Webhook endpoint responded ${res.status}`);
  } finally {
    db.prepare("UPDATE webhooks SET last_fired_at = ?, last_status = ? WHERE id = ?").run(now, status, wh.id);
  }
}

function safeParse<T>(json: string | null): T | null {
  if (!json) return null;
  try { return JSON.parse(json) as T; } catch { return null; }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c));
}
