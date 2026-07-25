/**
 * POST /api/catalog/refresh
 *
 * Triggers schema discovery for every configured connector + the BigQuery warehouse.
 * Upserts into catalog_tables and catalog_columns.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/server/auth-utils";
import { getDb } from "@/lib/server/db";
import { decrypt, genId } from "@/lib/server/crypto";
import { initRegistry, listConnectors, getConnector } from "@/lib/connectors/registry";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { userId, workspaceId } = getAuthContext(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  initRegistry();
  const connectors = listConnectors();

  let tablesUpserted = 0;
  let columnsUpserted = 0;
  const errors: string[] = [];

  for (const meta of connectors) {
    const id = meta.id;
    const connector = getConnector(id);
    if (!connector) continue;
    try {
      const row = db.prepare(
        "SELECT data FROM credentials WHERE user_id = ? AND workspace_id = ? AND service = ? LIMIT 1"
      ).get(userId, workspaceId, id) as { data: string } | undefined;
      if (!row) continue;

      let creds: Record<string, string> = {};
      try { creds = JSON.parse(decrypt(row.data)); } catch { continue; }

      const objects = await connector.discoverObjects(creds);
      for (const obj of objects) {
        const schema = await connector.discoverSchema(obj.id, creds).catch(() => []);

        const existing = db.prepare(
          "SELECT id FROM catalog_tables WHERE user_id = ? AND workspace_id = ? AND connector_id = ? AND table_name = ?"
        ).get(userId, workspaceId, id, obj.table ?? obj.id) as { id: string } | undefined;

        let tableId: string;
        if (existing) {
          tableId = existing.id;
          db.prepare(`
            UPDATE catalog_tables SET
              schema_name = ?, description = ?, column_count = ?,
              last_synced_at = datetime('now'), freshness_hours = 0
            WHERE id = ?
          `).run(id, obj.description ?? null, schema.length, tableId);
        } else {
          // catalog_tables predates multi-connector support and still has
          // project_id/dataset/discovered_at as NOT NULL with no default
          // from its original BigQuery-only design — every insert that
          // omitted them threw a NOT NULL constraint error, so this path
          // had never once succeeded for any connector. project_id/dataset
          // don't have a real meaning for a source connector (only for a
          // BigQuery warehouse table), so the connector id stands in for
          // both, consistent with schema_name already reusing it below.
          tableId = genId("cat");
          db.prepare(`
            INSERT INTO catalog_tables
              (id, user_id, workspace_id, connector_id, schema_name, table_name, description, row_count, column_count,
               project_id, dataset, schema_json, discovered_at, last_synced_at, freshness_hours)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, '[]', ?, datetime('now'), 0)
          `).run(
            tableId, userId, workspaceId, id, id, obj.table ?? obj.id, obj.description ?? null, schema.length,
            id, id, Date.now()
          );
        }
        tablesUpserted++;

        // Upsert columns
        db.prepare("DELETE FROM catalog_columns WHERE table_id = ?").run(tableId);
        for (let i = 0; i < schema.length; i++) {
          const col = schema[i]!;
          db.prepare(`
            INSERT INTO catalog_columns (table_id, column_name, data_type, is_nullable, ordinal_position)
            VALUES (?, ?, ?, ?, ?)
          `).run(tableId, col.name, col.type, col.mode === "NULLABLE" ? 1 : 0, i + 1);
          columnsUpserted++;
        }
      }
    } catch (e: unknown) {
      errors.push(`${id}: ${String(e)}`);
    }
  }

  return NextResponse.json({ tablesUpserted, columnsUpserted, errors });
}
