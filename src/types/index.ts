// ─── User & Auth ────────────────────────────────────────────────────────────

export type UserRole = "owner" | "admin" | "editor" | "viewer";

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  role: UserRole;
  createdAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  plan: "starter" | "growth" | "enterprise";
  membersCount: number;
}

// ─── Connectors ──────────────────────────────────────────────────────────────

export type ConnectorCategory =
  | "database"
  | "saas"
  | "marketing"
  | "ecommerce"
  | "analytics"
  | "file"
  | "crm"
  | "finance";

export type ConnectorStatus = "active" | "paused" | "error" | "setup";

export interface Connector {
  id: string;
  name: string;
  type: string;
  category: ConnectorCategory;
  logoUrl?: string;
  logoColor: string;
  status: ConnectorStatus;
  lastSync: string | null;
  nextSync: string | null;
  totalRecords: number;
  syncFrequency: string;
  createdAt: string;
  workspace: string;
  errorMessage?: string;
}

// ─── Pipelines ───────────────────────────────────────────────────────────────

export type PipelineStatus = "running" | "idle" | "error" | "paused";

export interface Pipeline {
  id: string;
  name: string;
  sourceConnectorId: string;
  destinationId: string;
  status: PipelineStatus;
  lastRun: string | null;
  nextRun: string | null;
  totalRuns: number;
  successRate: number;
  avgDuration: number;
  createdAt: string;
}

// ─── Sync Jobs ───────────────────────────────────────────────────────────────

export type SyncStatus = "success" | "failed" | "running" | "queued" | "partial";

export interface SyncJob {
  id: string;
  connectorName: string;
  connectorType: string;
  connectorLogo?: string;
  connectorColor: string;
  pipelineName: string;
  startedAt: string;
  duration: number | null;
  recordsProcessed: number | null;
  recordsFailed: number;
  status: SyncStatus;
  errorMessage?: string;
}

// ─── Activity ────────────────────────────────────────────────────────────────

export type ActivityType =
  | "sync_success"
  | "sync_failed"
  | "connector_added"
  | "connector_error"
  | "pipeline_created"
  | "pipeline_paused"
  | "user_invited"
  | "schema_change"
  | "alert_triggered";

export interface ActivityEvent {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  timestamp: string;
  meta?: Record<string, string>;
}

// ─── Metrics ─────────────────────────────────────────────────────────────────

export interface MetricCard {
  id: string;
  label: string;
  value: string | number;
  change: number;
  changeLabel: string;
  trend: "up" | "down" | "neutral";
  icon: string;
  color: "blue" | "green" | "amber" | "rose" | "purple" | "cyan";
}

export interface ChartDataPoint {
  date: string;
  label?: string;
  success?: number;
  failed?: number;
  total?: number;
  value?: number;
}

// ─── Notifications ───────────────────────────────────────────────────────────

export type NotificationType = "error" | "warning" | "info" | "success";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  actionLabel?: string;
  actionUrl?: string;
}

// ─── Destinations ────────────────────────────────────────────────────────────

export interface Destination {
  id: string;
  name: string;
  type: string;
  logoColor: string;
  status: "active" | "error" | "setup";
  connectedPipelines: number;
}

// ─── API Response ─────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
