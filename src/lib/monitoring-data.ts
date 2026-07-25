/**
 * monitoring-data.ts — CLEARED
 * All demo arrays removed. Application uses real server data only.
 * Types kept for backward compatibility.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type JobStatus = "running" | "queued" | "success" | "failed" | "cancelled";
export type TriggerSource = "manual" | "scheduled" | "api" | "retry";

export interface JobStep {
  id: string;
  label: string;
  status: "success" | "failed" | "running" | "pending" | "skipped";
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  rowsIn: number | null;
  rowsOut: number | null;
  message?: string;
}

export interface SyncJob {
  id: string;
  connectorId: string;
  connectorName: string;
  connectorAbbr: string;
  connectorColor: string;
  pipelineId: string;
  pipelineName: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  rowsProcessed: number;
  rowsErrored: number;
  warnings: number;
  status: JobStatus;
  triggeredBy: TriggerSource;
  triggeredByUser?: string;
  errorMessage?: string;
  steps: JobStep[];
  sourceTable: string;
  destinationTable: string;
  dataVolumeMB: number;
}

export interface Schedule {
  id: string;
  name: string;
  connectorId: string;
  connectorName: string;
  connectorAbbr: string;
  connectorColor: string;
  frequency: string;
  nextRunAt: string;
  lastRunAt: string | null;
  status: "active" | "paused" | "error";
  timezone: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  source: string;
  jobId?: string;
  connectorId?: string;
  metadata?: Record<string, unknown>;
}

export interface MonitoringNotification {
  id: string;
  type: "error" | "warning" | "info" | "success";
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  connectorId?: string;
  jobId?: string;
}

// ─── Empty exports (real data comes from server) ──────────────────────────────

export const MOCK_SYNC_JOBS: SyncJob[]                        = [];
export const MOCK_SCHEDULES: Schedule[]                       = [];
export const MOCK_LOGS: LogEntry[]                            = [];
export const MOCK_NOTIFICATIONS: MonitoringNotification[]     = [];
export const SYNC_ACTIVITY_DATA: { date: string; syncs: number }[]  = [];
export const ERROR_RATE_DATA: { date: string; rate: number }[]       = [];
export const API_USAGE_DATA: { hour: string; calls: number }[]       = [];
export const DATA_PROCESSED_DATA: { date: string; gb: number }[]     = [];

export const MONITORING_METRICS = {
  runningPipelines: 0,
  failedConnectors: 0,
  avgRuntimeMs: 0,
  apiCallsToday: 0,
  apiCallsLimit: 10000,
  dataProcessedTodayGB: 0,
  storageUsedGB: 0,
  storageLimitGB: 0,
  errorRatePercent: 0,
  jobsToday: 0,
  jobsSuccess: 0,
  jobsFailed: 0,
};
