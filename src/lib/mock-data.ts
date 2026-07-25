/**
 * mock-data.ts — CLEARED
 * All demo arrays removed. The application uses real server data only.
 * Type imports kept for backward compatibility with any remaining references.
 */
import type {
  Connector,
  SyncJob,
  ActivityEvent,
  MetricCard,
  ChartDataPoint,
  Notification,
  Pipeline,
  Workspace,
  User,
} from "@/types";

export const MOCK_WORKSPACES: Workspace[]        = [];
export const MOCK_USER: Partial<User>            = {};
export const MOCK_CONNECTORS: Connector[]        = [];
export const MOCK_PIPELINES: Pipeline[]          = [];
export const MOCK_SYNC_JOBS: SyncJob[]           = [];
export const MOCK_ACTIVITY: ActivityEvent[]      = [];
export const MOCK_NOTIFICATIONS: Notification[]  = [];
export const MOCK_METRICS: MetricCard[]          = [];
export const DAILY_SYNC_DATA: ChartDataPoint[]   = [];
export const CONNECTOR_USAGE_DATA: ChartDataPoint[] = [];
export const PIPELINE_HEALTH_DATA: ChartDataPoint[] = [];
export const HOURLY_SYNC_DATA: ChartDataPoint[]  = [];
export const SUCCESS_VS_FAILED_DATA: ChartDataPoint[] = [];
