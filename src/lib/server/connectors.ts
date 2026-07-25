/**
 * Universal Connector Adapter Registry (server-side).
 *
 * Every connector implements the same interface:
 *   authenticate → discoverObjects → extract → transform → (shared load)
 *
 * Adding a new connector = one adapter object: auth check, base URL,
 * object definitions, extract + transform functions. The ETL route,
 * warehouse load, verification, logging, run history, dashboard and
 * insights all come for free.
 */

import type { Logger, BQField } from "./etl";

export interface AdapterObjectDef {
  id: string;
  table: string;           // destination table name
  description: string;
}

export interface ExtractResult {
  rows: Record<string, unknown>[];
  schema?: BQField[];       // optional fixed schema; inferred when omitted
}

export interface ConnectorAdapter {
  id: string;
  name: string;
  /** Verify credentials against the real API. Returns error string or null. */
  authenticate(creds: Record<string, string>): Promise<string | null>;
  /** Objects this connector can sync */
  objects: AdapterObjectDef[];
  /** Extract + transform one object into warehouse-ready rows */
  extract(
    objectId: string,
    creds: Record<string, string>,
    params: { startDate?: string; endDate?: string },
    log: Logger
  ): Promise<ExtractResult>;
}

// ── Instantly adapter ────────────────────────────────────────────────────────

function mapStatus(s: unknown): string {
  if (typeof s === "number") {
    const m: Record<number, string> = { 0: "draft", 1: "active", 2: "paused", 3: "completed", 4: "stopped" };
    return m[s] ?? "draft";
  }
  return String(s ?? "draft").toLowerCase();
}


const CAMPAIGN_SCHEMA: BQField[] = [
  { name: "campaign_id", type: "STRING",    mode: "NULLABLE" },
  { name: "name",        type: "STRING",    mode: "NULLABLE" },
  { name: "status",      type: "STRING",    mode: "NULLABLE" },
  { name: "total_leads", type: "INT64",     mode: "NULLABLE" },
  { name: "contacted",   type: "INT64",     mode: "NULLABLE" },
  { name: "opened",      type: "INT64",     mode: "NULLABLE" },
  { name: "replied",     type: "INT64",     mode: "NULLABLE" },
  { name: "bounced",     type: "INT64",     mode: "NULLABLE" },
  { name: "open_rate",   type: "FLOAT64",   mode: "NULLABLE" },
  { name: "reply_rate",  type: "FLOAT64",   mode: "NULLABLE" },
  { name: "range_start", type: "STRING",    mode: "NULLABLE" },
  { name: "range_end",   type: "STRING",    mode: "NULLABLE" },
  { name: "synced_at",   type: "STRING",    mode: "NULLABLE" },
];

export const instantlyAdapter: ConnectorAdapter = {
  id: "instantly",
  name: "Instantly",
  objects: [
    { id: "campaigns", table: "instantly_campaigns", description: "Campaigns with engagement analytics" },
  ],

  async authenticate(creds) {
    const key = creds.api_key;
    if (!key) return "Instantly API key missing";
    const r = await fetch("https://api.instantly.ai/api/v2/campaigns?limit=1", {
      headers: { Authorization: `Bearer ${key}` },
    }).catch(() => null);
    if (r?.ok) return null;
    const r1 = await fetch(`https://api.instantly.ai/api/v1/campaign/list?api_key=${key}&limit=1&skip=0`).catch(() => null);
    return r1?.ok ? null : "Instantly rejected the API key";
  },

  async extract(objectId, creds, { startDate, endDate }, log) {
    const key = creds.api_key;
    const n = (v: unknown) => { const x = Number(v); return isNaN(x) ? 0 : x; };

    // ── Step 1: Campaign list — GET /api/v2/campaigns ─────────────────────────
    // v2 returns paginated list; fetch up to 100 (default limit)
    const campResp = await fetch("https://api.instantly.ai/api/v2/campaigns?limit=100", {
      headers: { Authorization: `Bearer ${key}` },
    }).catch(() => null);
    if (!campResp?.ok) throw new Error(`Instantly campaign list failed (HTTP ${campResp?.status ?? "network error"})`);
    const campRaw = await campResp.json();
    // v2 response: array OR { items: [...] }
    const campList: any[] = Array.isArray(campRaw) ? campRaw : (campRaw?.items ?? campRaw?.data ?? []);
    if (!campList.length) throw new Error("No campaigns found in Instantly account");
    log("success", `Fetched ${campList.length} campaigns.`);

    // ── Step 2: Analytics — GET /api/v2/campaigns/analytics (single call, all campaigns) ──
    // Correct v2 endpoint: GET with query params, returns array keyed by campaign_id
    // Fields: contacted_count, open_count, reply_count_unique, leads_count, bounced_count
    const analyticsUrl = new URL("https://api.instantly.ai/api/v2/campaigns/analytics");
    if (startDate) analyticsUrl.searchParams.set("start_date", startDate.slice(0, 10)); // YYYY-MM-DD
    if (endDate)   analyticsUrl.searchParams.set("end_date",   endDate.slice(0, 10));
    // exclude_total_leads_count defaults to false — leads_count is included by default

    const analyticsResp = await fetch(analyticsUrl.toString(), {
      headers: { Authorization: `Bearer ${key}` },
    }).catch(() => null);

    // Build campaign_id → analytics map
    const analyticsMap: Record<string, any> = {};
    if (analyticsResp?.ok) {
      const analyticsData = await analyticsResp.json();
      const analyticsArr: any[] = Array.isArray(analyticsData) ? analyticsData : (analyticsData?.items ?? []);
      for (const a of analyticsArr) {
        const cid = a.campaign_id ?? a.id;
        if (cid) analyticsMap[cid] = a;
      }
      log("success", `Analytics received for ${analyticsArr.length} campaigns.`);
    } else {
      log("warn", `Analytics endpoint returned ${analyticsResp?.status ?? "error"} — contacted/replied will be 0.`);
    }

    // ── Step 3: Transform → warehouse rows ────────────────────────────────────
    const now = new Date().toISOString();
    const rows = campList.map((c: any) => {
      const cid = c.id ?? c.campaign_id ?? "";
      const a = analyticsMap[cid] ?? {};
      // v2 analytics field names (from official docs):
      //   contacted_count, open_count, reply_count_unique, leads_count, bounced_count
      // total_leads: from analytics OR from campaign list object (c.leads_count / c.total_leads)
      const contacted = n(a.contacted_count);
      const opened    = n(a.open_count_unique ?? a.open_count);
      const replied   = n(a.reply_count_unique ?? a.reply_count);
      const total     = n(a.leads_count ?? a.total_leads ?? a.lead_count ?? c.leads_count ?? c.total_leads ?? c.lead_count);
      const bounced   = n(a.bounced_count);
      return {
        campaign_id: String(cid),
        name:        String(c.name ?? a.campaign_name ?? ""),
        status:      mapStatus(c.status ?? a.campaign_status),
        total_leads: total,
        contacted,
        opened,
        replied,
        bounced,
        open_rate:   contacted > 0 ? Math.round((opened  / contacted) * 10000) / 100 : 0,
        reply_rate:  contacted > 0 ? Math.round((replied / contacted) * 10000) / 100 : 0,
        range_start: startDate ?? "",
        range_end:   endDate   ?? "",
        synced_at:   now,
      };
    });
    log("debug", `${rows.length} rows prepared.`);

    return { rows, schema: CAMPAIGN_SCHEMA };
  },
};

// ── CSV adapter (rows arrive pre-parsed from the client) ─────────────────────

export const csvAdapter: ConnectorAdapter = {
  id: "csv",
  name: "CSV / Excel",
  objects: [{ id: "file", table: "csv_upload", description: "Uploaded file rows" }],
  async authenticate() { return null; }, // no auth needed
  async extract() {
    // CSV rows are supplied directly in the sync request body (pushed, not pulled)
    throw new Error("CSV extract is push-based — rows must be provided in the request");
  },
};

// ── SDK Bridge — wraps new BaseConnector adapters into ConnectorAdapter ────────

import { type BaseConnector } from "@/lib/connectors/sdk";

export function wrapSdkConnector(connector: BaseConnector): ConnectorAdapter {
  // We pre-populate objects from the SDK adapter's incrementalObjects() if available.
  // The runner needs adapter.objects to be non-empty to know what to extract.
  // We use a trick: store a reference to the connector and resolve objects lazily
  // via a getter so the list is available synchronously after the first discoverObjects call.
  const cachedObjects: AdapterObjectDef[] = [];

  // Try to get objects from incrementalObjects if it exists
  if (typeof (connector as unknown as { incrementalObjects?: () => { id: string; table?: string; name: string }[] }).incrementalObjects === "function") {
    const objs = (connector as unknown as { incrementalObjects: () => { id: string; table?: string; name: string }[] }).incrementalObjects();
    for (const o of objs) {
      cachedObjects.push({ id: o.id, table: o.table ?? `${connector.metadata.id}_${o.id}`, description: o.name });
    }
  }

  return {
    id: connector.metadata.id,
    name: connector.metadata.name,
    objects: cachedObjects,
    async authenticate(creds) {
      return connector.authenticate(creds);
    },
    async extract(objectId, creds, { startDate, endDate }, log) {
      const result = await connector.extract(objectId, creds, { startDate, endDate }, (level, msg) => {
        if (level === "error" || level === "warn" || level === "debug" || level === "info" || level === "success") {
          log(level as Parameters<Logger>[0], msg);
        }
      });
      return {
        rows: result.rows as Record<string, unknown>[],
        schema: result.schema?.map(f => ({
          name: f.name,
          type: f.type as "STRING" | "INT64" | "FLOAT64" | "BOOL" | "TIMESTAMP" | "DATE" | "BYTES",
          mode: f.mode ?? "NULLABLE",
        })),
      };
    },
  };
}

// ── Registry ─────────────────────────────────────────────────────────────────

// Lazy-loaded SDK connectors (avoids circular imports at module load time)
let sdkConnectorsLoaded = false;
const ADAPTERS: Record<string, ConnectorAdapter> = {
  instantly: instantlyAdapter,
  csv: csvAdapter,
};

async function ensureSdkConnectors(): Promise<void> {
  if (sdkConnectorsLoaded) return;
  sdkConnectorsLoaded = true;
  const { initRegistry, listConnectors, getConnector } = await import("@/lib/connectors/registry");
  initRegistry();
  // listConnectors() returns ConnectorMetadata (not instances) — use getConnector() to get instances
  for (const meta of listConnectors()) {
    const id = meta.id; // id is directly on ConnectorMetadata
    if (!ADAPTERS[id]) {
      const instance = getConnector(id);
      if (instance) {
        ADAPTERS[id] = wrapSdkConnector(instance);
      }
    }
  }
}

export async function getAdapterAsync(id: string): Promise<ConnectorAdapter | null> {
  await ensureSdkConnectors();
  return ADAPTERS[id] ?? null;
}

/** Synchronous lookup — includes only eagerly-registered adapters (instantly, csv).
 *  Prefer getAdapterAsync() for SDK connectors. */
export function getAdapter(id: string): ConnectorAdapter | null {
  return ADAPTERS[id] ?? null;
}

export async function listAdapters(): Promise<ConnectorAdapter[]> {
  await ensureSdkConnectors();
  return Object.values(ADAPTERS);
}
