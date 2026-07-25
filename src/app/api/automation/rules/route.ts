import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/server/auth";
import { getDb, computeNextRun } from "@/lib/server/db";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

const TRIGGER_TYPES = ["pre_sync", "post_sync", "on_failure", "schedule"];
const ACTION_TYPES = ["webhook", "email", "retry"]; // "transform" has no execution engine — not offered

export async function GET(req: NextRequest) {
  const { userId, workspaceId } = getAuthContext(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const rules = db.prepare(`
    SELECT id, name, trigger_type AS triggerType, trigger_meta AS triggerMeta,
           action_type AS actionType, action_meta AS actionMeta, enabled,
           datetime(last_fired_at / 1000, 'unixepoch') AS lastFiredAt, last_status AS lastStatus,
           datetime(created_at / 1000, 'unixepoch') AS createdAt
    FROM automations WHERE user_id = ? AND workspace_id = ? ORDER BY created_at DESC
  `).all(userId, workspaceId) as Array<Record<string, unknown>>;

  return NextResponse.json({
    rules: rules.map((r) => ({
      ...r,
      triggerMeta: r.triggerMeta ? JSON.parse(r.triggerMeta as string) : {},
      actionMeta: r.actionMeta ? JSON.parse(r.actionMeta as string) : {},
    })),
  });
}

export async function POST(req: NextRequest) {
  const { userId, workspaceId } = getAuthContext(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    name?: string; triggerType?: string; actionType?: string;
    triggerMeta?: { flowId?: string; scheduleValue?: string };
    actionMeta?: { webhookId?: string; to?: string; subject?: string };
  };
  if (!body.name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (!body.triggerType || !TRIGGER_TYPES.includes(body.triggerType))
    return NextResponse.json({ error: `triggerType must be one of ${TRIGGER_TYPES.join(", ")}` }, { status: 400 });
  if (!body.actionType || !ACTION_TYPES.includes(body.actionType))
    return NextResponse.json({ error: `actionType must be one of ${ACTION_TYPES.join(", ")}` }, { status: 400 });
  if (body.actionType === "retry" && body.triggerType === "schedule")
    return NextResponse.json({ error: "the retry action requires a flow-scoped trigger, not schedule" }, { status: 400 });
  if (body.actionType === "email" && !body.actionMeta?.to?.trim())
    return NextResponse.json({ error: "email action requires actionMeta.to" }, { status: 400 });

  const scheduleValue = body.triggerMeta?.scheduleValue ?? "every_hour";
  const nextRunAt = body.triggerType === "schedule" ? computeNextRun(scheduleValue) : null;

  const db = getDb();

  if (body.triggerMeta?.flowId) {
    const flow = db.prepare("SELECT id FROM flows WHERE id = ? AND user_id = ? AND workspace_id = ?")
      .get(body.triggerMeta.flowId, userId, workspaceId);
    if (!flow) return NextResponse.json({ error: "triggerMeta.flowId does not refer to a flow you own" }, { status: 400 });
  }

  if (body.actionType === "webhook") {
    if (!body.actionMeta?.webhookId)
      return NextResponse.json({ error: "webhook action requires actionMeta.webhookId" }, { status: 400 });
    const target = db.prepare("SELECT id FROM webhooks WHERE id = ? AND user_id = ? AND workspace_id = ?")
      .get(body.actionMeta.webhookId, userId, workspaceId);
    if (!target) return NextResponse.json({ error: "webhookId does not refer to a webhook target you own" }, { status: 400 });
  }

  const id = randomUUID();
  db.prepare(`
    INSERT INTO automations
      (id, user_id, workspace_id, name, trigger_type, trigger_meta, action_type, action_meta, enabled, next_run_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(
    id, userId, workspaceId, body.name.trim(), body.triggerType,
    JSON.stringify(body.triggerMeta ?? {}), body.actionType, JSON.stringify(body.actionMeta ?? {}),
    nextRunAt, Date.now()
  );

  const rule = db.prepare(`
    SELECT id, name, trigger_type AS triggerType, trigger_meta AS triggerMeta,
           action_type AS actionType, action_meta AS actionMeta, enabled,
           datetime(created_at / 1000, 'unixepoch') AS createdAt
    FROM automations WHERE id = ?
  `).get(id) as Record<string, unknown>;

  return NextResponse.json({
    rule: { ...rule, triggerMeta: JSON.parse(rule.triggerMeta as string), actionMeta: JSON.parse(rule.actionMeta as string) },
  });
}
