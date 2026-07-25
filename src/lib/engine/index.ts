// Removed — engine deleted. Stubs preserved (typed against real call sites in
// flows/[id]/page.tsx) so the app compiles; real implementation is BI/AI-Ops
// phase work, not a mechanical type fix.
import type { FlowRun } from "@/lib/flows-data";

export interface KPI {
  id: string;
  label: string;
  value?: unknown;
}

export interface ChartSpec {
  id: string;
  [key: string]: unknown;
}

export interface Insight {
  id?: string;
  [key: string]: unknown;
}

export interface AgentResponse {
  message: string;
  kpis: KPI[];
  charts: ChartSpec[];
  insights: Insight[];
  showTable: boolean;
}

export function generateInsights(_args: { runs: FlowRun[]; kpis: KPI[] }): Insight[] { return []; }
export function generateSyncKPIs(_runs: FlowRun[]): KPI[] { return []; }
// Synchronous by design — the caller wraps this in its own setTimeout to
// simulate compute latency (see flows/[id]/page.tsx's DataAgentPanel).
export function runAgent(_query: string, _records: Record<string, unknown>[]): AgentResponse | null { return null; }
export function formatKPIValue(_kpi: KPI): string { return ""; }
