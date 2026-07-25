// Stub — demo flows removed, but types are preserved for use-server-flows.ts and flows/page.tsx

export type FlowStatus = "active" | "error" | "paused" | "draft";
export type LogLevel = "info" | "warn" | "error" | "debug" | "success";

export interface FlowLogEntry {
  id: string;
  ts: string;
  level: LogLevel;
  message: string;
  meta?: Record<string, unknown>;
}

export interface FlowRun {
  id: string;
  startedAt: string;
  status: string;
  rows: number | null;
  duration: string | null;
  error?: string;
  logs: FlowLogEntry[];
}

export interface DataFlow {
  id: string;
  source: { id: string; name: string; abbr: string; color: string };
  destination: { id: string; name: string; abbr: string; color: string };
  schedule: string;
  scheduleValue: string;
  status: FlowStatus;
  lastSync: string | null;
  nextSync: string | null;
  lastSyncRows: number | null;
  lastSyncDuration: string | null;
  totalRowsSynced: number;
  successRate: number;
  totalRuns: number;
  recentError?: string;
  warehouseTable?: string;
  runs: FlowRun[];
}

export const DEMO_FLOWS: never[] = [];
export const MOCK_FLOWS: DataFlow[] = [];
