/**
 * GET /api/lineage
 *
 * Returns a lineage graph derived from the user's actual flows.
 * Falls back to an empty graph; the UI shows a demo graph when empty.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";

export const dynamic = "force-dynamic";

interface LineageNode {
  id: string;
  label: string;
  type: "connector" | "warehouse" | "transform" | "dashboard" | "report" | "ai";
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

  // Pull all flows for this workspace
  const flows = db.prepare(`
    SELECT id, source_id, source_name, dest_id, dest_name, warehouse_table, status
    FROM flows WHERE user_id = ? AND workspace_id = ? ORDER BY created_at DESC
  `).all(userId, workspaceId) as Array<{
    id: string; source_id: string; source_name: string | null;
    dest_id: string; dest_name: string | null; warehouse_table: string | null; status: string;
  }>;

  if (flows.length === 0) {
    return NextResponse.json({ graph: { nodes: [], edges: [] } });
  }

  const nodes = new Map<string, LineageNode>();
  const edges: LineageEdge[] = [];

  // ETL transform node (shared)
  nodes.set("etl", { id: "etl", label: "ETL Engine", type: "transform", subLabel: "Transform" });
  // Analytics dashboard node
  nodes.set("analytics", { id: "analytics", label: "Analytics", type: "dashboard", subLabel: "Dashboard" });
  // AI Operations node
  nodes.set("ai_ops", { id: "ai_ops", label: "AI Operations", type: "ai", subLabel: "Insights" });

  for (const flow of flows) {
    // Source connector node
    const srcId = `src_${flow.source_id}`;
    if (!nodes.has(srcId)) {
      nodes.set(srcId, {
        id: srcId,
        label: flow.source_name ?? flow.source_id,
        type: "connector",
        subLabel: "Source",
      });
    }

    // Source → ETL
    if (!edges.some(e => e.from === srcId && e.to === "etl")) {
      edges.push({ from: srcId, to: "etl", label: "extract" });
    }

    // Warehouse table node
    if (flow.warehouse_table) {
      const tableId = `bq_${flow.warehouse_table}`;
      if (!nodes.has(tableId)) {
        nodes.set(tableId, {
          id: tableId,
          label: flow.warehouse_table,
          type: "warehouse",
          subLabel: "BigQuery",
        });
      }
      // ETL → warehouse
      if (!edges.some(e => e.from === "etl" && e.to === tableId)) {
        edges.push({ from: "etl", to: tableId, label: "load" });
      }
      // Warehouse → analytics
      if (!edges.some(e => e.from === tableId && e.to === "analytics")) {
        edges.push({ from: tableId, to: "analytics", label: "query" });
      }
    }
  }

  // Analytics → AI ops
  edges.push({ from: "analytics", to: "ai_ops", label: "feed" });

  return NextResponse.json({
    graph: {
      nodes: [...nodes.values()],
      edges,
    },
  });
}
