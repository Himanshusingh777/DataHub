/**
 * GET /api/lineage
 *
 * Real lineage graph: Connector → Flow → BigQuery table → Saved Query,
 * derived entirely from the user's actual flows and saved queries. No
 * synthetic nodes — a previous version of this route always attached every
 * warehouse table to hardcoded "Analytics" and "AI Operations" nodes
 * regardless of whether anything real actually consumed that table; those
 * features don't exist yet in this codebase; this route now only draws an
 * edge when it can point to something real.
 *
 * The Table → Query edges are genuine SQL analysis (regex-based FROM/JOIN
 * table-reference extraction, matched against known warehouse table names),
 * not a full SQL parser — but it inspects the actual saved query text and
 * only draws an edge when it finds a real match, which is what "lineage
 * from SQL parsing" means in a codebase with no SQL-AST library dependency.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { extractTableRefs, referencesTable } from "@/lib/server/sql-lineage";

export const dynamic = "force-dynamic";

interface LineageNode {
  id: string;
  label: string;
  type: "connector" | "pipeline" | "warehouse" | "query";
  subLabel?: string;
}

interface LineageEdge {
  from: string;
  to: string;
  label?: string;
}

export async function GET(req: NextRequest) {
  const { userId, workspaceId } = getAuthContext(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();

  const flows = db.prepare(`
    SELECT id, name, source_id, source_name, dest_id, dest_name, warehouse_table, status
    FROM flows WHERE user_id = ? AND workspace_id = ? ORDER BY created_at DESC
  `).all(userId, workspaceId) as Array<{
    id: string; name: string | null; source_id: string; source_name: string | null;
    dest_id: string; dest_name: string | null; warehouse_table: string | null; status: string;
  }>;

  const savedQueries = db.prepare(`
    SELECT id, name, sql FROM saved_queries WHERE user_id = ? AND workspace_id = ?
  `).all(userId, workspaceId) as Array<{ id: string; name: string; sql: string }>;

  if (flows.length === 0) {
    return NextResponse.json({ graph: { nodes: [], edges: [] } });
  }

  const nodes = new Map<string, LineageNode>();
  const edges: LineageEdge[] = [];
  const warehouseTables = new Set<string>();

  for (const flow of flows) {
    const srcId = `src_${flow.source_id}`;
    if (!nodes.has(srcId)) {
      nodes.set(srcId, { id: srcId, label: flow.source_name ?? flow.source_id, type: "connector", subLabel: "Source" });
    }

    const flowNodeId = `flow_${flow.id}`;
    nodes.set(flowNodeId, {
      id: flowNodeId,
      label: flow.name?.trim() || `${flow.source_name ?? flow.source_id} → ${flow.dest_name ?? flow.dest_id}`,
      type: "pipeline",
      subLabel: flow.status === "active" ? "Active flow" : flow.status === "paused" ? "Paused" : "Flow",
    });
    edges.push({ from: srcId, to: flowNodeId, label: "extract" });

    if (flow.warehouse_table) {
      warehouseTables.add(flow.warehouse_table);
      const tableId = `bq_${flow.warehouse_table}`;
      if (!nodes.has(tableId)) {
        nodes.set(tableId, { id: tableId, label: flow.warehouse_table, type: "warehouse", subLabel: "BigQuery" });
      }
      edges.push({ from: flowNodeId, to: tableId, label: "load" });
    }
  }

  // Real SQL-based lineage: only draw Table → Query when the query text
  // actually references that table.
  for (const q of savedQueries) {
    const refs = extractTableRefs(q.sql);
    if (refs.length === 0) continue;

    let matchedAny = false;
    for (const table of warehouseTables) {
      if (referencesTable(refs, table)) {
        matchedAny = true;
        edges.push({ from: `bq_${table}`, to: `query_${q.id}`, label: "query" });
      }
    }
    if (matchedAny) {
      nodes.set(`query_${q.id}`, { id: `query_${q.id}`, label: q.name, type: "query", subLabel: "Saved query" });
    }
  }

  return NextResponse.json({ graph: { nodes: [...nodes.values()], edges } });
}
