/**
 * GET    /api/models/[id]  — fetch a single model + recent run history
 * PUT    /api/models/[id]  — update name / description / SQL / status
 * DELETE /api/models/[id]  — delete model (widgets referencing it are blocked)
 *
 * Workspace isolation enforced: the model must belong to the caller's workspace.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { genId } from "@/lib/server/crypto";
import { extractTableRefs, referencesTable } from "@/lib/server/sql-lineage";
import type { SemanticModel } from "@/lib/models-data";

export const dynamic = "force-dynamic";

const FORBIDDEN = /\b(insert|update|delete|drop|create|alter|merge|truncate|grant|revoke|call|begin|commit|export)\b/i;

type ModelRow = Omit<SemanticModel, "schema" | "tags_parsed" | "run_count" | "last_run_at" | "widget_count" | "dependencies">;

function computeDependencies(sqlQuery: string, warehouseTables: string[]): string[] {
  const refs = extractTableRefs(sqlQuery);
  if (refs.length === 0) return [];
  return warehouseTables.filter((t) => referencesTable(refs, t));
}

function parseModel(row: ModelRow, warehouseTables: string[]) {
  return {
    ...row,
    schema: (() => { try { return JSON.parse(row.schema_json); } catch { return []; } })(),
    tags:   (() => { try { return JSON.parse(row.tags);        } catch { return []; } })(),
    dependencies: computeDependencies(row.sql_query, warehouseTables),
  };
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, workspaceId } = getAuthContext(req);
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getDb();

  const model = db.prepare(
    "SELECT * FROM models WHERE id = ? AND workspace_id = ?"
  ).get(id, workspaceId) as ModelRow | undefined;

  if (!model) return NextResponse.json({ ok: false, error: "Model not found" }, { status: 404 });

  // Run history (last 20)
  const runs = db.prepare(`
    SELECT id, status, rows_returned, duration_ms, bytes_processed, error, ran_at
    FROM model_runs
    WHERE model_id = ? AND workspace_id = ?
    ORDER BY ran_at DESC LIMIT 20
  `).all(id, workspaceId);

  // Version history (last 20)
  const versions = db.prepare(`
    SELECT id, version, name, sql_query, created_at
    FROM model_versions
    WHERE model_id = ? AND workspace_id = ?
    ORDER BY version DESC LIMIT 20
  `).all(id, workspaceId);

  // Widget usage count
  const widgetCount = (db.prepare(
    "SELECT COUNT(*) as n FROM widgets WHERE model_id = ? AND workspace_id = ?"
  ).get(id, workspaceId) as { n: number }).n;

  const warehouseTables = (db.prepare("SELECT DISTINCT warehouse_table FROM flows WHERE workspace_id = ? AND warehouse_table IS NOT NULL").all(workspaceId) as { warehouse_table: string }[]).map((r) => r.warehouse_table);

  return NextResponse.json({ ok: true, model: parseModel(model, warehouseTables), runs, versions, widgetCount });
}

// ── PUT ───────────────────────────────────────────────────────────────────────

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, workspaceId } = getAuthContext(req);
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getDb();

  // Verify ownership — load the full row so a SQL change can be snapshotted below.
  const existing = db.prepare(
    "SELECT id, name, description, sql_query, version FROM models WHERE id = ? AND workspace_id = ?"
  ).get(id, workspaceId) as { id: string; name: string; description: string | null; sql_query: string; version: number } | undefined;
  if (!existing) return NextResponse.json({ ok: false, error: "Model not found" }, { status: 404 });

  let body: {
    name?: string; description?: string; sql_query?: string;
    source_table?: string; source_dataset?: string; tags?: string[];
    status?: string; schema_json?: string;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 }); }

  // Validate SQL if provided
  if (body.sql_query) {
    const stripped = body.sql_query.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").trim();
    if (!/^(select|with)\b/i.test(stripped))
      return NextResponse.json({ ok: false, error: "Only SELECT / WITH queries are permitted." }, { status: 400 });
    if (FORBIDDEN.test(stripped))
      return NextResponse.json({ ok: false, error: "Write / DDL statements are not allowed." }, { status: 400 });
  }

  const validStatuses = ["draft", "published", "archived"];
  if (body.status && !validStatuses.includes(body.status))
    return NextResponse.json({ ok: false, error: "Invalid status" }, { status: 400 });

  const now = Date.now();

  // Snapshot the pre-update SQL into version history before applying the
  // change — only when the SQL actually changed, so tweaking just the name
  // or status doesn't spam the version list with identical-SQL entries.
  const sqlChanged = body.sql_query !== undefined && body.sql_query.trim() !== existing.sql_query;
  const nextVersion = sqlChanged ? existing.version + 1 : existing.version;
  if (sqlChanged) {
    db.prepare(`
      INSERT INTO model_versions (id, model_id, workspace_id, user_id, version, name, description, sql_query, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(genId("mdlv"), id, workspaceId, userId, existing.version, existing.name, existing.description, existing.sql_query, now);
  }

  db.prepare(`
    UPDATE models SET
      name           = COALESCE(?, name),
      description    = CASE WHEN ? IS NOT NULL THEN ? ELSE description END,
      sql_query      = COALESCE(?, sql_query),
      source_table   = CASE WHEN ? IS NOT NULL THEN ? ELSE source_table END,
      source_dataset = CASE WHEN ? IS NOT NULL THEN ? ELSE source_dataset END,
      tags           = COALESCE(?, tags),
      status         = COALESCE(?, status),
      schema_json    = COALESCE(?, schema_json),
      version        = ?,
      updated_at     = ?
    WHERE id = ? AND workspace_id = ?
  `).run(
    body.name?.trim() ?? null,
    body.description !== undefined ? body.description : null,
    body.description !== undefined ? body.description : null,
    body.sql_query?.trim() ?? null,
    body.source_table !== undefined ? body.source_table : null,
    body.source_table !== undefined ? body.source_table : null,
    body.source_dataset !== undefined ? body.source_dataset : null,
    body.source_dataset !== undefined ? body.source_dataset : null,
    body.tags !== undefined ? JSON.stringify(body.tags) : null,
    body.status ?? null,
    body.schema_json ?? null,
    nextVersion,
    now,
    id, workspaceId
  );

  const updated = db.prepare("SELECT * FROM models WHERE id = ?").get(id) as ModelRow;
  const warehouseTables = (db.prepare("SELECT DISTINCT warehouse_table FROM flows WHERE workspace_id = ? AND warehouse_table IS NOT NULL").all(workspaceId) as { warehouse_table: string }[]).map((r) => r.warehouse_table);
  return NextResponse.json({ ok: true, model: parseModel(updated, warehouseTables) });
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, workspaceId } = getAuthContext(req);
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getDb();

  const existing = db.prepare(
    "SELECT id FROM models WHERE id = ? AND workspace_id = ?"
  ).get(id, workspaceId);
  if (!existing) return NextResponse.json({ ok: false, error: "Model not found" }, { status: 404 });

  // Check for widgets using this model
  const widgetCount = (db.prepare(
    "SELECT COUNT(*) as n FROM widgets WHERE model_id = ? AND workspace_id = ?"
  ).get(id, workspaceId) as { n: number }).n;

  if (widgetCount > 0) {
    return NextResponse.json(
      { ok: false, error: `Cannot delete: ${widgetCount} widget(s) are using this model. Remove the widgets first.` },
      { status: 409 }
    );
  }

  // Delete dependents first (no FK cascade on SQLite without PRAGMA foreign_keys)
  db.prepare("DELETE FROM model_runs WHERE model_id = ?").run(id);
  db.prepare("DELETE FROM model_versions WHERE model_id = ?").run(id);
  db.prepare("DELETE FROM bi_insights WHERE model_id = ?").run(id);
  db.prepare("DELETE FROM models WHERE id = ? AND workspace_id = ?").run(id, workspaceId);

  return NextResponse.json({ ok: true });
}
