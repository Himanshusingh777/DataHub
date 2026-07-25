"use client";

/**
 * Lineage — real Source → Flow → Warehouse Table → Saved Query graph,
 * derived from actual flows and SQL-parsed saved queries. No mock data,
 * no synthetic downstream nodes for features that don't exist yet.
 *
 * Data source: GET /api/lineage (src/app/api/lineage/route.ts)
 */

import React, { Suspense, lazy } from "react";
import { Loader2, AlertTriangle, GitBranch, Database, Code2, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const EChartsReact = lazy(() => import("echarts-for-react"));

// ── Types (mirror the API response shape) ────────────────────────────────────

type NodeType = "connector" | "pipeline" | "warehouse" | "query";

interface LineageNode { id: string; label: string; type: NodeType; subLabel?: string }
interface LineageEdge { from: string; to: string; label?: string }
interface LineageGraph { nodes: LineageNode[]; edges: LineageEdge[] }

const NODE_STYLE: Record<NodeType, { color: string; icon: React.ElementType; category: number }> = {
  connector: { color: "#6366f1", icon: GitBranch, category: 0 },
  pipeline:  { color: "#f59e0b", icon: ArrowRight, category: 1 },
  warehouse: { color: "#10b981", icon: Database, category: 2 },
  query:     { color: "#0ea5e9", icon: Code2, category: 3 },
};

const CATEGORY_LABELS = ["Source", "Flow", "Warehouse Table", "Saved Query"];

async function fetchLineage(): Promise<LineageGraph | null> {
  try {
    const res = await fetch("/api/lineage");
    if (!res.ok) return null;
    const data = await res.json();
    return data.graph ?? null;
  } catch { return null; }
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-white/50 py-16 text-center dark:bg-[#0e0f1a]/50">
      <GitBranch className="h-8 w-8 text-muted-foreground/50" />
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function buildOption(graph: LineageGraph) {
  const nodes = graph.nodes.map((n) => ({
    id: n.id,
    name: n.label,
    category: NODE_STYLE[n.type].category,
    symbolSize: n.type === "pipeline" ? 36 : 44,
    itemStyle: { color: NODE_STYLE[n.type].color },
    label: { show: true, position: "bottom" as const, fontSize: 11 },
  }));
  const links = graph.edges.map((e) => ({
    source: e.from,
    target: e.to,
    label: { show: !!e.label, formatter: e.label ?? "", fontSize: 9 },
    lineStyle: { color: "#9ca3af", curveness: 0.1 },
  }));

  return {
    tooltip: {},
    legend: [{
      data: CATEGORY_LABELS,
      bottom: 0,
      textStyle: { fontSize: 11 },
    }],
    series: [{
      type: "graph",
      layout: "force",
      roam: true,
      draggable: true,
      force: { repulsion: 220, edgeLength: 110, gravity: 0.15 },
      categories: CATEGORY_LABELS.map((label, i) => ({
        name: label,
        itemStyle: { color: Object.values(NODE_STYLE)[i]!.color },
      })),
      data: nodes,
      links,
      edgeSymbol: ["none", "arrow"],
      edgeSymbolSize: 6,
      label: { show: true },
      emphasis: { focus: "adjacency" as const },
    }],
  };
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function LineagePage() {
  const [graph, setGraph] = React.useState<LineageGraph | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      const g = await fetchLineage();
      setLoading(false);
      if (!g) { setError("Could not reach the lineage endpoint."); return; }
      setGraph(g);
    })();
  }, []);

  const grouped = React.useMemo(() => {
    if (!graph) return [];
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    return graph.edges
      .map((e) => ({ from: byId.get(e.from), to: byId.get(e.to), label: e.label }))
      .filter((e): e is { from: LineageNode; to: LineageNode; label: string | undefined } => !!e.from && !!e.to);
  }, [graph]);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Lineage</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Source → Flow → Warehouse Table → Saved Query — traced from your real flows and SQL-parsed queries.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50/50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/10 dark:text-rose-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {!graph && !error && loading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {graph && graph.nodes.length === 0 && !loading && (
        <EmptyState message="No lineage yet. Create a flow to see Source → Flow → Warehouse Table relationships here." />
      )}

      {graph && graph.nodes.length > 0 && (
        <>
          <div className="rounded-xl border border-border bg-white shadow-card dark:bg-[#0e0f1a]" style={{ height: 480 }}>
            <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
              <EChartsReact option={buildOption(graph)} style={{ height: "100%", width: "100%" }} notMerge />
            </Suspense>
          </div>

          {/* Accessible tabular fallback of the same graph */}
          <div className="rounded-xl border border-border bg-white shadow-card dark:bg-[#0e0f1a]">
            <div className="px-5 pt-5 pb-3">
              <h3 className="text-sm font-semibold text-foreground">Relationships</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground bg-muted/20">
                    <th className="px-5 pb-2 pt-1 font-medium">From</th>
                    <th className="px-3 pb-2 pt-1 font-medium"></th>
                    <th className="px-3 pb-2 pt-1 font-medium">To</th>
                    <th className="px-3 pb-2 pt-1 pr-5 font-medium">Relationship</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped.map((row, i) => {
                    const FromIcon = NODE_STYLE[row.from.type].icon;
                    const ToIcon = NODE_STYLE[row.to.type].icon;
                    return (
                      <tr key={i} className="border-b border-border/50 last:border-0">
                        <td className="px-5 py-2.5">
                          <span className="flex items-center gap-1.5 font-medium text-foreground">
                            <FromIcon className="h-3.5 w-3.5 shrink-0" style={{ color: NODE_STYLE[row.from.type].color }} />
                            {row.from.label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground"><ArrowRight className="h-3 w-3" /></td>
                        <td className="px-3 py-2.5">
                          <span className="flex items-center gap-1.5 font-medium text-foreground">
                            <ToIcon className="h-3.5 w-3.5 shrink-0" style={{ color: NODE_STYLE[row.to.type].color }} />
                            {row.to.label}
                          </span>
                        </td>
                        <td className={cn("px-3 py-2.5 pr-5 text-muted-foreground")}>{row.label ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
