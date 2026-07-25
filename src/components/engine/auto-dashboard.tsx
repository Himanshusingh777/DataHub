// Removed — AI engine deleted. Stubs preserved (typed against real call
// sites in flows/[id]/page.tsx) so the app compiles; real implementation is
// BI/AI-Ops phase work, not a mechanical type fix.
import type { ChartSpec, Insight } from "@/lib/engine";
import type { FlowRun } from "@/lib/flows-data";

export function AutoDashboard(_props: { records: Record<string, unknown>[]; runs: FlowRun[] }) { return null; }
export function InsightsPanel(_props: { insights: Insight[] }) { return null; }
export function ChartCard(_props: { spec: ChartSpec }) { return null; }
