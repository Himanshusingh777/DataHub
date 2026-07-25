/**
 * enterprise-data.ts — CLEARED of all mock/demo arrays.
 * Types and RBAC permission definitions kept (these are product logic, not mock data).
 * All demo workspaces, team members, API keys, webhooks, invoices, sessions removed.
 * Real data comes from server APIs.
 */

// ─── Workspace types ──────────────────────────────────────────────────────────

export type WorkspacePlan = "starter" | "growth" | "enterprise";

export interface EnterpriseWorkspace {
  id: string;
  name: string;
  slug: string;
  description: string;
  avatarColor: string;
  plan: WorkspacePlan;
  isDefault: boolean;
  membersCount: number;
  connectorsCount: number;
  pipelinesCount: number;
  syncJobsToday: number;
  dataProcessedGB: number;
  createdAt: string;
  region: string;
}

export const ENTERPRISE_WORKSPACES: EnterpriseWorkspace[] = [];

// ─── Team types ───────────────────────────────────────────────────────────────

export type TeamRole = "owner" | "admin" | "manager" | "developer" | "viewer";
export type MemberStatus = "active" | "suspended" | "invited" | "inactive";

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
  avatarInitials: string;
  role: TeamRole;
  status: MemberStatus;
  lastActive: string | null;
  joinedAt: string;
  timezone: string;
  department?: string;
}

export const TEAM_MEMBERS: TeamMember[] = [];

// ─── RBAC — real product logic, not mock data ─────────────────────────────────

export type RbacRole = "owner" | "admin" | "manager" | "developer" | "viewer";
export type Permission =
  | "connectors.view" | "connectors.create" | "connectors.edit" | "connectors.delete"
  | "pipelines.view" | "pipelines.create" | "pipelines.edit" | "pipelines.delete" | "pipelines.run"
  | "sync_jobs.view" | "sync_jobs.cancel" | "sync_jobs.retry"
  | "logs.view" | "logs.export"
  | "billing.view" | "billing.manage"
  | "workspace.view" | "workspace.manage"
  | "settings.view" | "settings.manage"
  | "api_keys.view" | "api_keys.create" | "api_keys.revoke"
  | "users.view" | "users.invite" | "users.manage";

export interface PermissionGroup {
  label: string;
  key: string;
  permissions: Array<{ key: Permission; label: string; description: string }>;
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    label: "Connectors", key: "connectors",
    permissions: [
      { key: "connectors.view",   label: "View",   description: "View connectors and their status" },
      { key: "connectors.create", label: "Create", description: "Add new connectors" },
      { key: "connectors.edit",   label: "Edit",   description: "Edit connector configuration" },
      { key: "connectors.delete", label: "Delete", description: "Remove connectors" },
    ],
  },
  {
    label: "Pipelines", key: "pipelines",
    permissions: [
      { key: "pipelines.view",   label: "View",   description: "View pipelines" },
      { key: "pipelines.create", label: "Create", description: "Create new pipelines" },
      { key: "pipelines.edit",   label: "Edit",   description: "Modify pipeline configuration" },
      { key: "pipelines.delete", label: "Delete", description: "Delete pipelines" },
      { key: "pipelines.run",    label: "Run",    description: "Trigger pipeline runs" },
    ],
  },
  {
    label: "Sync Jobs", key: "sync_jobs",
    permissions: [
      { key: "sync_jobs.view",   label: "View",   description: "View sync job history" },
      { key: "sync_jobs.cancel", label: "Cancel", description: "Cancel running jobs" },
      { key: "sync_jobs.retry",  label: "Retry",  description: "Retry failed jobs" },
    ],
  },
  {
    label: "Logs", key: "logs",
    permissions: [
      { key: "logs.view",   label: "View",   description: "View activity logs" },
      { key: "logs.export", label: "Export", description: "Export logs to CSV/JSON" },
    ],
  },
  {
    label: "Billing", key: "billing",
    permissions: [
      { key: "billing.view",   label: "View",   description: "View billing and invoices" },
      { key: "billing.manage", label: "Manage", description: "Update payment methods and plan" },
    ],
  },
  {
    label: "Workspace", key: "workspace",
    permissions: [
      { key: "workspace.view",   label: "View",   description: "View workspace settings" },
      { key: "workspace.manage", label: "Manage", description: "Rename, configure workspace" },
    ],
  },
  {
    label: "Settings", key: "settings",
    permissions: [
      { key: "settings.view",   label: "View",   description: "View application settings" },
      { key: "settings.manage", label: "Manage", description: "Change application settings" },
    ],
  },
  {
    label: "API Keys", key: "api_keys",
    permissions: [
      { key: "api_keys.view",   label: "View",   description: "List API keys" },
      { key: "api_keys.create", label: "Create", description: "Generate new API keys" },
      { key: "api_keys.revoke", label: "Revoke", description: "Revoke existing keys" },
    ],
  },
  {
    label: "Users", key: "users",
    permissions: [
      { key: "users.view",   label: "View",   description: "View team members" },
      { key: "users.invite", label: "Invite", description: "Send team invitations" },
      { key: "users.manage", label: "Manage", description: "Change roles, suspend, remove" },
    ],
  },
];

export type RolePermissions = Record<RbacRole, Set<Permission>>;

const ALL_PERMISSIONS = new Set<Permission>(PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key)));

export const DEFAULT_ROLE_PERMISSIONS: Record<RbacRole, Permission[]> = {
  owner: [...ALL_PERMISSIONS] as Permission[],
  admin: [...ALL_PERMISSIONS].filter((p) => p !== "billing.manage") as Permission[],
  manager: [
    "connectors.view", "connectors.create", "connectors.edit",
    "pipelines.view", "pipelines.create", "pipelines.edit", "pipelines.run",
    "sync_jobs.view", "sync_jobs.cancel", "sync_jobs.retry",
    "logs.view", "logs.export",
    "billing.view", "workspace.view", "settings.view",
    "api_keys.view", "users.view", "users.invite",
  ],
  developer: [
    "connectors.view", "connectors.create", "connectors.edit",
    "pipelines.view", "pipelines.create", "pipelines.edit", "pipelines.run",
    "sync_jobs.view", "sync_jobs.retry",
    "logs.view", "logs.export",
    "workspace.view", "settings.view",
    "api_keys.view", "api_keys.create", "users.view",
  ],
  viewer: [
    "connectors.view", "pipelines.view", "sync_jobs.view",
    "logs.view", "billing.view", "workspace.view", "settings.view", "users.view",
  ],
};

// ─── API Key types ────────────────────────────────────────────────────────────

export type ApiKeyStatus = "active" | "revoked" | "expired";

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  status: ApiKeyStatus;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  usageCount: number;
  createdBy: string;
  environment: "production" | "development" | "staging";
}

export const MOCK_API_KEYS: ApiKey[] = [];

// ─── Webhook types ────────────────────────────────────────────────────────────

export type WebhookStatus = "active" | "disabled" | "failing";
export type WebhookEvent =
  | "sync.completed" | "sync.failed" | "sync.started"
  | "pipeline.created" | "pipeline.updated"
  | "connector.connected" | "connector.disconnected"
  | "job.queued" | "job.cancelled";

export interface WebhookDelivery {
  id: string;
  timestamp: string;
  event: WebhookEvent;
  statusCode: number;
  durationMs: number;
  success: boolean;
}

export interface Webhook {
  id: string;
  name: string;
  url: string;
  secretPrefix: string;
  events: WebhookEvent[];
  status: WebhookStatus;
  createdAt: string;
  lastTriggeredAt: string | null;
  successRate: number;
  totalDeliveries: number;
  recentDeliveries: WebhookDelivery[];
}

export const MOCK_WEBHOOKS: Webhook[] = [];

// ─── Billing types ────────────────────────────────────────────────────────────

export interface BillingPlan {
  id: string;
  name: string;
  price: number;
  billingPeriod: "month" | "year";
  features: string[];
  limits: Record<string, number | string>;
  isPopular?: boolean;
}

export const BILLING_PLANS: BillingPlan[] = [
  {
    id: "starter", name: "Starter", price: 49, billingPeriod: "month",
    features: ["5 connectors", "10 flows", "10GB data/month", "Hourly sync", "Email support"],
    limits: { connectors: 5, flows: 10, dataGB: 10, syncInterval: "hourly" },
  },
  {
    id: "growth", name: "Growth", price: 199, billingPeriod: "month",
    features: ["25 connectors", "50 flows", "100GB data/month", "5-min sync", "Priority support", "API access"],
    limits: { connectors: 25, flows: 50, dataGB: 100, syncInterval: "5min" },
    isPopular: true,
  },
  {
    id: "enterprise", name: "Enterprise", price: 799, billingPeriod: "month",
    features: ["Unlimited connectors", "Unlimited flows", "1TB data/month", "Real-time sync", "Dedicated support", "SSO/SAML", "Custom SLA"],
    limits: { connectors: -1, flows: -1, dataGB: 1000, syncInterval: "realtime" },
  },
];

export const MOCK_INVOICES: unknown[] = [];
export const CURRENT_USAGE: Record<string, number> = {};
export const USAGE_HISTORY: unknown[] = [];

// ─── Security/session types ───────────────────────────────────────────────────

export interface Session {
  id: string;
  device: string;
  location: string;
  ip: string;
  lastActive: string;
  isCurrent: boolean;
}

export const MOCK_SESSIONS: Session[] = [];
export const MOCK_LOGIN_ACTIVITY: unknown[] = [];

// ─── Docs ─────────────────────────────────────────────────────────────────────

export const DOC_SECTIONS: unknown[] = [];
