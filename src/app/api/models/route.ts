/**
 * GET  /api/models  — list all Semantic Models for the caller's workspace
 * POST /api/models  — create a new Semantic Model
 *
 * Workspace isolation: every row is filtered by workspace_id derived from
 * the server-side session. Client-side filtering is never used.
 *
 * SQL safety: only SELECT / WITH statements are accepted.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";

export const dynamic = "force-dynamic";

// DDL / DML guard — same pattern as /api/dashboard/query
const FORBIDDEN = /\b(insert|update|delete|drop|create|alter|merge|truncate|grant|revoke|call|begin|commit|export)\b/i;

interface ModelRow {
  id: string;
  workspace_id: string;
  user_id: string;
  name: string;
  description: string | null;
  sql_query: string;
  source_table: string | null;
  source_dataset: string | null;
  schema_json: string;
  status: string;
  tags: string;
  created_at: number;
  updated_at: number;
}

function parseModel(row: ModelRow) {
  return {
    ...row,
    schema: (() => { try { return JSON.parse(row.schema_json); } catch { return []; } })(),
    tags:   (() => { try { return JSON.parse(row.tags); }        catch { return []; } })(),
  };
}

// ── GET — list workspace models ───────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { userId, workspaceId } = getAuthContext(req);
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const url    = new URL(req.url);
  const status = url.searchParams.get("status");   // filter by status
  const search = url.searchParams.get("q");         // name search

  const db = getDb();

  let sql = "SELECT * FROM models WHERE workspace_id = ?";
  const params: unknown[] = [workspaceId];

  if (status) { sql += " AND status = ?"; params.push(status); }
  if (search) { sql += " AND name LIKE ?"; params.push(`%${search}%`); }
  sql += " ORDER BY updated_at DESC";

  const rows = db.prepare(sql).all(...params) as ModelRow[];

  return NextResponse.json({ ok: true, models: rows.map(parseModel) });
}

// ── POST — create model ───────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { userId, workspaceId } = getAuthContext(req);
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  let body: {
    name?: string;
    description?: string;
    sql_query?: string;
    source_table?: string;
    source_dataset?: string;
    tags?: string[];
    status?: string;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 }); }

  const { name, description, sql_query, source_table, source_dataset, tags = [], status = "draft" } = body;

  if (!name?.trim())
    return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });
  if (!sql_query?.trim())
    return NextResponse.json({ ok: false, error: "sql_query is required" }, { status: 400 });

  // ── SQL safety ──────────────────────────────────────────────────────────────
  const stripped = sql_query.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").trim();
  if (!/^(select|with)\b/i.test(stripped))
    return NextResponse.json(
      { ok: false, error: "Only SELECT / WITH queries are permitted in Semantic Models." },
      { status: 400 }
    );
  if (FORBIDDEN.test(stripped))
    return NextResponse.json(
      { ok: false, error: "Write / DDL statements are not allowed in Semantic Models." },
      { status: 400 }
    );

  const validStatuses = ["draft", "published", "archived"];
  if (!validStatuses.includes(status))
    return NextResponse.json({ ok: false, error: `status must be one of: ${validStatuses.join(", ")}` }, { status: 400 });

  const id  = `mdl_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const now = Date.now();

  const db = getDb();
  db.prepare(`
    INSERT INTO models
      (id, workspace_id, user_id, name, description, sql_query,
       source_table, source_dataset, tags, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, workspaceId, userId,
    name.trim(),
    description ?? null,
    sql_query.trim(),
    source_table ?? null,
    source_dataset ?? null,
    JSON.stringify(tags),
    status,
    now, now
  );

  const created = db.prepare("SELECT * FROM models WHERE id = ?").get(id) as ModelRow;
  return NextResponse.json({ ok: true, model: parseModel(created) }, { status: 201 });
}
