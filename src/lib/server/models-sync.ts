/**
 * Query Studio → Semantic Models auto-sync.
 *
 * Every query saved in Query Studio (POST/PUT /api/query/saved) should also
 * exist as a Semantic Model, so it's immediately reusable on dashboards
 * without a manual "create model" step. Called from those two routes; never
 * throws — a sync failure (e.g. the query isn't a plain SELECT) must not
 * block saving the query itself.
 */

import { genId } from "./crypto";
import { validateReadOnlySql } from "./sql-safety";

interface SyncParams {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any; // better-sqlite3 instance — untyped, same as getDb()'s return

  workspaceId: string;
  userId: string;
  savedQueryId: string;
  name: string;
  description: string | null;
  sql: string;
}

interface ModelLookupRow {
  id: string;
  name: string;
  description: string | null;
  sql_query: string;
  version: number;
}

export function syncModelFromSavedQuery(params: SyncParams): void {
  const { db, workspaceId, userId, savedQueryId, name, description, sql } = params;

  try {
    const safety = validateReadOnlySql(sql);
    if (!safety.ok) return; // not a plain SELECT/WITH — skip, query is still saved fine

    const now = Date.now();

    // Already synced from this saved query before — update it in place.
    const linked = db.prepare(
      "SELECT id, name, description, sql_query, version FROM models WHERE source_saved_query_id = ? AND workspace_id = ?"
    ).get(savedQueryId, workspaceId) as ModelLookupRow | undefined;

    if (linked) {
      const sqlChanged = sql.trim() !== linked.sql_query;
      const nextVersion = sqlChanged ? linked.version + 1 : linked.version;
      if (sqlChanged) {
        db.prepare(`
          INSERT INTO model_versions (id, model_id, workspace_id, user_id, version, name, description, sql_query, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(genId("mdlv"), linked.id, workspaceId, userId, linked.version, linked.name, linked.description, linked.sql_query, now);
      }
      db.prepare(`
        UPDATE models SET name = ?, description = ?, sql_query = ?, version = ?, updated_at = ?
        WHERE id = ? AND workspace_id = ?
      `).run(name, description, sql.trim(), nextVersion, now, linked.id, workspaceId);
      return;
    }

    // No model linked to this saved query yet. Adopt a same-named,
    // not-yet-linked model if one exists (avoids duplicate model names when
    // a query is saved under a name that already matches a manually-created
    // model); otherwise create a new one.
    const sameName = db.prepare(
      "SELECT id, name, description, sql_query, version FROM models WHERE name = ? AND workspace_id = ? AND source_saved_query_id IS NULL"
    ).get(name, workspaceId) as ModelLookupRow | undefined;

    if (sameName) {
      const sqlChanged = sql.trim() !== sameName.sql_query;
      const nextVersion = sqlChanged ? sameName.version + 1 : sameName.version;
      if (sqlChanged) {
        db.prepare(`
          INSERT INTO model_versions (id, model_id, workspace_id, user_id, version, name, description, sql_query, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(genId("mdlv"), sameName.id, workspaceId, userId, sameName.version, sameName.name, sameName.description, sameName.sql_query, now);
      }
      db.prepare(`
        UPDATE models SET description = ?, sql_query = ?, version = ?, source_saved_query_id = ?, updated_at = ?
        WHERE id = ? AND workspace_id = ?
      `).run(description, sql.trim(), nextVersion, savedQueryId, now, sameName.id, workspaceId);
      return;
    }

    const id = `mdl_${genId("q").replace(/[^a-zA-Z0-9]/g, "")}`;
    db.prepare(`
      INSERT INTO models
        (id, workspace_id, user_id, name, description, sql_query, source_saved_query_id, tags, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, '[]', 'draft', ?, ?)
    `).run(id, workspaceId, userId, name, description, sql.trim(), savedQueryId, now, now);
  } catch (e) {
    console.warn("[models-sync] failed to sync model from saved query:", e instanceof Error ? e.message : e);
  }
}
