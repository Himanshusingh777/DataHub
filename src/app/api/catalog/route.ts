/**
 * Data Catalog API
 *
 * GET /api/catalog?search=&schema=&connector=
 *   → lists discovered tables with columns, row counts, owners, freshness
 *
 * POST /api/catalog/refresh
 *   → triggers a full schema re-discovery for the user's warehouse
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { userId, workspaceId } = await getAuthContext(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const search    = searchParams.get("search")?.toLowerCase() ?? "";
  const connector = searchParams.get("connector") ?? "";

  const db = getDb();

  // Pull catalog_tables for this workspace
  const rows = await db.prepare(`
    SELECT
      ct.id, ct.connector_id, ct.schema_name, ct.table_name, ct.description,
      ct.row_count, ct.column_count, ct.owner_email, ct.last_synced_at,
      ct.freshness_hours, ct.tags
    FROM catalog_tables ct
    WHERE ct.user_id = ? AND ct.workspace_id = ?
      ${search    ? "AND (lower(ct.table_name) LIKE ? OR lower(ct.description) LIKE ?)" : ""}
      ${connector ? "AND ct.connector_id = ?" : ""}
    ORDER BY ct.last_synced_at DESC
    LIMIT 200
  `).all(
    userId, workspaceId,
    ...(search    ? [`%${search}%`, `%${search}%`] : []),
    ...(connector ? [connector]                    : [])
  ) as Array<{
    id: number; connector_id: string; schema_name: string; table_name: string;
    description: string | null; row_count: number; column_count: number;
    owner_email: string | null; last_synced_at: string | null;
    freshness_hours: number | null; tags: string | null;
  }>;

  // Fetch columns for each table
  const tableIds = rows.map(r => r.id);
  let columns: Array<{
    table_id: number; column_name: string; data_type: string; is_nullable: number; description: string | null;
  }> = [];
  if (tableIds.length > 0) {
    const placeholders = tableIds.map(() => "?").join(",");
    columns = await db.prepare(`
      SELECT table_id, column_name, data_type, is_nullable, description
      FROM catalog_columns
      WHERE table_id IN (${placeholders})
      ORDER BY ordinal_position
    `).all(...tableIds) as typeof columns;
  }

  const columnsByTable = new Map<number, typeof columns>();
  for (const col of columns) {
    if (!columnsByTable.has(col.table_id)) columnsByTable.set(col.table_id, []);
    columnsByTable.get(col.table_id)!.push(col);
  }

  const tables = rows.map(r => ({
    id: r.id,
    connectorId: r.connector_id,
    schemaName: r.schema_name,
    tableName: r.table_name,
    fullName: r.schema_name ? `${r.schema_name}.${r.table_name}` : r.table_name,
    description: r.description,
    rowCount: r.row_count,
    columnCount: r.column_count,
    ownerEmail: r.owner_email,
    lastSyncedAt: r.last_synced_at,
    freshnessHours: r.freshness_hours,
    tags: r.tags ? JSON.parse(r.tags) : [],
    columns: (columnsByTable.get(r.id) ?? []).map(c => ({
      name: c.column_name,
      type: c.data_type,
      nullable: Boolean(c.is_nullable),
      description: c.description,
    })),
  }));

  return NextResponse.json({ tables, total: tables.length });
}
