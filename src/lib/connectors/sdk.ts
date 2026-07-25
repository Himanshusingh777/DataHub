/**
 * CrossTecch Universal Connector SDK
 *
 * Every connector must implement ConnectorSDK. The base class (BaseConnector)
 * provides default implementations for optional methods and enforces the
 * standard lifecycle: authenticate → validate → discoverObjects → discoverSchema
 * → extract → transform → load → health.
 *
 * A minimal new connector only needs to implement:
 *   - authenticate()
 *   - discoverObjects()
 *   - discoverSchema()
 *   - extract()
 *
 * Everything else has sensible defaults.
 */

export interface ConnectorField {
  name: string;
  type: "STRING" | "INTEGER" | "FLOAT" | "BOOLEAN" | "TIMESTAMP" | "DATE" | "RECORD" | "BYTES";
  mode: "NULLABLE" | "REQUIRED" | "REPEATED";
  description?: string;
}

export interface ConnectorObject {
  id: string;
  name: string;
  description?: string;
  table: string;            // default BigQuery table name
  supportsIncremental: boolean;
  cursorField?: string;     // field used as watermark for incremental sync
  keyFields?: string[];     // fields used as MERGE key for incremental upsert
  estimatedRows?: number;
}

export interface ExtractOptions {
  startDate?: string;       // ISO timestamp — used for incremental extraction
  endDate?: string;
  pageSize?: number;
  filter?: Record<string, unknown>;
}

export type LogFn = (level: "info" | "debug" | "success" | "warn" | "error", message: string) => void;

export interface ExtractResult {
  rows: Record<string, unknown>[];
  schema: ConnectorField[];
  hasMore?: boolean;
  nextCursor?: string;
  rowCount: number;
}

export interface HealthResult {
  ok: boolean;
  latencyMs: number;
  message?: string;
  details?: Record<string, unknown>;
}

export interface SchemaEvolutionResult {
  addedFields: ConnectorField[];
  removedFields: string[];
  changedTypes: Array<{ field: string; from: string; to: string }>;
}

export interface WebhookEvent {
  type: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface ConnectorMetadata {
  id: string;
  name: string;
  description: string;
  category: "crm" | "marketing" | "ecommerce" | "database" | "analytics" | "finance" | "productivity" | "file" | "custom";
  logoUrl?: string;
  color: string;
  authType: "api_key" | "oauth2" | "basic" | "service_account" | "connection_string" | "none";
  version: string;
  supportsWebhooks: boolean;
  supportsIncremental: boolean;
  supportsSchemaDiscovery: boolean;
  docsUrl?: string;
  requiredCredentials: Array<{
    key: string;
    label: string;
    type: "text" | "password" | "url" | "textarea" | "select";
    placeholder?: string;
    helpText?: string;
    options?: Array<{ value: string; label: string }>;
    required: boolean;
  }>;
}

// ── Main SDK interface ────────────────────────────────────────────────────────

export interface ConnectorSDK {
  metadata: ConnectorMetadata;

  /** Verify credentials are valid. Returns null on success, error string on failure. */
  authenticate(creds: Record<string, string>): Promise<string | null>;

  /** Deeper credential validation — checks permissions, quotas, etc. */
  validate(creds: Record<string, string>): Promise<{ ok: boolean; warnings: string[]; errors: string[] }>;

  /** List all syncable objects (tables, endpoints, streams). */
  discoverObjects(creds: Record<string, string>): Promise<ConnectorObject[]>;

  /** Return the full schema for a specific object. */
  discoverSchema(objectId: string, creds: Record<string, string>): Promise<ConnectorField[]>;

  /** Extract records from the source. */
  extract(objectId: string, creds: Record<string, string>, opts: ExtractOptions, log: LogFn): Promise<ExtractResult>;

  /** Transform records before loading. Default: pass-through. */
  transform(rows: Record<string, unknown>[], objectId: string): Promise<Record<string, unknown>[]>;

  /** Health check — quick round-trip to verify the source is reachable. */
  health(creds: Record<string, string>): Promise<HealthResult>;

  /** Check if extracted schema differs from a stored schema. */
  schemaEvolution(objectId: string, creds: Record<string, string>, existingSchema: ConnectorField[]): Promise<SchemaEvolutionResult>;

  /** Parse an inbound webhook payload. Returns null if not a supported event. */
  parseWebhook(headers: Record<string, string>, body: unknown): Promise<WebhookEvent | null>;

  /** Return the objects that support incremental sync and their cursor fields. */
  incrementalObjects(): ConnectorObject[];

  /** Build the next-run schedule hint (cron expression or interval string). */
  suggestedSchedule(): string;

  /** Return connector-level metadata: rate limits, quotas, etc. */
  connectorMetadata(): ConnectorMetadata;
}

// ── Base implementation ───────────────────────────────────────────────────────

export abstract class BaseConnector implements ConnectorSDK {
  abstract metadata: ConnectorMetadata;

  abstract authenticate(creds: Record<string, string>): Promise<string | null>;

  async validate(creds: Record<string, string>): Promise<{ ok: boolean; warnings: string[]; errors: string[] }> {
    const authError = await this.authenticate(creds);
    if (authError) return { ok: false, warnings: [], errors: [authError] };
    return { ok: true, warnings: [], errors: [] };
  }

  abstract discoverObjects(creds: Record<string, string>): Promise<ConnectorObject[]>;

  abstract discoverSchema(objectId: string, creds: Record<string, string>): Promise<ConnectorField[]>;

  abstract extract(objectId: string, creds: Record<string, string>, opts: ExtractOptions, log: LogFn): Promise<ExtractResult>;

  async transform(rows: Record<string, unknown>[], _objectId: string): Promise<Record<string, unknown>[]> {
    // Default: pass-through (flatten nested objects, stringify arrays)
    return rows.map(row => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        if (v === null || v === undefined) {
          out[k] = null;
        } else if (Array.isArray(v)) {
          out[k] = JSON.stringify(v);
        } else if (typeof v === "object") {
          out[k] = JSON.stringify(v);
        } else {
          out[k] = v;
        }
      }
      return out;
    });
  }

  async health(creds: Record<string, string>): Promise<HealthResult> {
    const start = Date.now();
    const error = await this.authenticate(creds);
    return {
      ok: !error,
      latencyMs: Date.now() - start,
      message: error ?? "Connection healthy",
    };
  }

  async schemaEvolution(objectId: string, creds: Record<string, string>, existingSchema: ConnectorField[]): Promise<SchemaEvolutionResult> {
    const current = await this.discoverSchema(objectId, creds);
    const existingNames = new Set(existingSchema.map(f => f.name));
    const currentNames = new Set(current.map(f => f.name));

    const addedFields = current.filter(f => !existingNames.has(f.name));
    const removedFields = existingSchema.map(f => f.name).filter(n => !currentNames.has(n));
    const changedTypes = current
      .filter(f => existingNames.has(f.name))
      .map(f => ({ field: f.name, from: existingSchema.find(e => e.name === f.name)?.type ?? "?", to: f.type }))
      .filter(c => c.from !== c.to);

    return { addedFields, removedFields, changedTypes };
  }

  async parseWebhook(_headers: Record<string, string>, _body: unknown): Promise<WebhookEvent | null> {
    return null; // override in connectors that support webhooks
  }

  incrementalObjects(): ConnectorObject[] {
    // Subclass discoverObjects() is async; this is a sync capability hint
    return [];
  }

  suggestedSchedule(): string {
    return "every_hour";
  }

  connectorMetadata(): ConnectorMetadata {
    return this.metadata;
  }
}

// ── Registry ──────────────────────────────────────────────────────────────────

type ConnectorConstructor = new () => BaseConnector;

const REGISTRY = new Map<string, BaseConnector>();

export function registerConnector(id: string, connector: BaseConnector): void {
  REGISTRY.set(id, connector);
}

export function getConnector(id: string): BaseConnector | null {
  return REGISTRY.get(id) ?? null;
}

export function listConnectors(): Array<ConnectorMetadata & { id: string }> {
  return Array.from(REGISTRY.entries()).map(([id, c]) => ({ ...c.metadata, id }));
}

export function isConnectorRegistered(id: string): boolean {
  return REGISTRY.has(id);
}
