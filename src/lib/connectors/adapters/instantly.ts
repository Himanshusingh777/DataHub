/**
 * Instantly Connector Adapter
 *
 * Extracts Campaigns, Campaign Analytics, and Leads from Instantly.ai API v1/v2.
 * Auth: API key (Settings → API Keys)
 */

import {
  BaseConnector,
  type ConnectorMetadata,
  type ConnectorObject,
  type ConnectorField,
  type ExtractOptions,
  type ExtractResult,
  type HealthResult,
  type LogFn,
} from "../sdk";

const BASE = "https://api.instantly.ai/api/v1";

const INSTANTLY_OBJECTS: ConnectorObject[] = [
  { id: "campaigns",  name: "Campaigns",          table: "instantly_campaigns",  supportsIncremental: false, keyFields: ["id"] },
  { id: "leads",      name: "Leads",              table: "instantly_leads",      supportsIncremental: true,  cursorField: "timestamp", keyFields: ["id"] },
  { id: "analytics",  name: "Campaign Analytics", table: "instantly_analytics",  supportsIncremental: false, keyFields: ["campaign_id"] },
];

const SCHEMAS: Record<string, ConnectorField[]> = {
  campaigns: [
    { name: "id",              type: "STRING",    mode: "REQUIRED" },
    { name: "name",            type: "STRING",    mode: "NULLABLE" },
    { name: "status",          type: "STRING",    mode: "NULLABLE" },
    { name: "created_at",      type: "TIMESTAMP", mode: "NULLABLE" },
    { name: "updated_at",      type: "TIMESTAMP", mode: "NULLABLE" },
    { name: "email_list_json", type: "STRING",    mode: "NULLABLE" },
    { name: "from_name",       type: "STRING",    mode: "NULLABLE" },
    { name: "reply_to",        type: "STRING",    mode: "NULLABLE" },
    { name: "daily_limit",     type: "INTEGER",   mode: "NULLABLE" },
    { name: "open_tracking",   type: "BOOLEAN",   mode: "NULLABLE" },
    { name: "link_tracking",   type: "BOOLEAN",   mode: "NULLABLE" },
    { name: "stop_on_reply",   type: "BOOLEAN",   mode: "NULLABLE" },
    { name: "timezone",        type: "STRING",    mode: "NULLABLE" },
  ],
  leads: [
    { name: "id",           type: "STRING",    mode: "REQUIRED" },
    { name: "email",        type: "STRING",    mode: "NULLABLE" },
    { name: "first_name",   type: "STRING",    mode: "NULLABLE" },
    { name: "last_name",    type: "STRING",    mode: "NULLABLE" },
    { name: "company_name", type: "STRING",    mode: "NULLABLE" },
    { name: "campaign_id",  type: "STRING",    mode: "NULLABLE" },
    { name: "status",       type: "STRING",    mode: "NULLABLE" },
    { name: "timestamp",    type: "TIMESTAMP", mode: "NULLABLE" },
    { name: "payload_json", type: "STRING",    mode: "NULLABLE" },
  ],
  analytics: [
    { name: "campaign_id",      type: "STRING",  mode: "REQUIRED" },
    { name: "campaign_name",    type: "STRING",  mode: "NULLABLE" },
    { name: "leads_count",      type: "INTEGER", mode: "NULLABLE" },
    { name: "contacted_count",  type: "INTEGER", mode: "NULLABLE" },
    { name: "emails_sent",      type: "INTEGER", mode: "NULLABLE" },
    { name: "emails_opened",    type: "INTEGER", mode: "NULLABLE" },
    { name: "emails_replied",   type: "INTEGER", mode: "NULLABLE" },
    { name: "emails_bounced",   type: "INTEGER", mode: "NULLABLE" },
    { name: "emails_unsubscribed", type: "INTEGER", mode: "NULLABLE" },
    { name: "open_rate",        type: "FLOAT",   mode: "NULLABLE" },
    { name: "reply_rate",       type: "FLOAT",   mode: "NULLABLE" },
    { name: "bounce_rate",      type: "FLOAT",   mode: "NULLABLE" },
  ],
};

type InstantlyRecord = Record<string, unknown>;

export class InstantlyConnector extends BaseConnector {
  metadata: ConnectorMetadata = {
    id: "instantly",
    name: "Instantly",
    description: "Sync Campaigns, Leads, and Analytics from your Instantly.ai account.",
    category: "marketing",
    color: "#6366F1",
    authType: "api_key",
    version: "2.0.0",
    supportsWebhooks: false,
    supportsIncremental: true,
    supportsSchemaDiscovery: true,
    docsUrl: "https://docs.crosstecch.io/connectors/instantly",
    requiredCredentials: [
      {
        key: "api_key",
        label: "API Key",
        type: "password",
        placeholder: "inst_xxxxxxxxxxxxxxxx",
        helpText: "Find in Instantly → Settings → API Keys",
        required: true,
      },
    ],
  };

  /** Try v2 Bearer auth first, fall back to v1 api_key query param */
  private async get(apiKey: string, path: string, params: Record<string, string> = {}): Promise<InstantlyRecord> {
    // v2 path: /campaign/list → /campaigns, /lead/list → /leads
    const v2path = path
      .replace("/campaign/list", "/campaigns")
      .replace("/lead/list", "/leads")
      .replace("/analytics/campaign/summary", "/analytics/campaign/summary"); // same

    const v2url = new URL(`https://api.instantly.ai/api/v2${v2path}`);
    for (const [k, v] of Object.entries(params)) {
      if (k !== "skip" && k !== "api_key") v2url.searchParams.set(k, v);
    }
    const v2res = await fetch(v2url.toString(), {
      headers: { Authorization: `Bearer ${apiKey}` },
    }).catch(() => null);
    if (v2res?.ok) return v2res.json();

    // Fall back to v1
    const url = new URL(`${BASE}${path}`);
    url.searchParams.set("api_key", apiKey);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url.toString());
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Instantly API ${res.status}: ${text}`);
    }
    return res.json();
  }

  async authenticate(creds: Record<string, string>): Promise<string | null> {
    const key = creds.api_key;
    if (!key) return "Instantly API key missing";

    // Try v2 first (Bearer token) — newer API key format
    try {
      const r = await fetch("https://api.instantly.ai/api/v2/campaigns?limit=1", {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (r.ok) return null;
    } catch { /* fall through to v1 */ }

    // Fall back to v1 (api_key query param) — older key format
    try {
      const r = await fetch(`https://api.instantly.ai/api/v1/campaign/list?api_key=${key}&limit=1&skip=0`);
      if (r.ok) return null;
      const body = await r.json().catch(() => ({}));
      return `Instantly auth failed: ${JSON.stringify(body)}`;
    } catch (e: unknown) {
      return `Instantly auth failed: ${(e as Error).message}`;
    }
  }

  async discoverObjects(_creds: Record<string, string>): Promise<ConnectorObject[]> {
    return INSTANTLY_OBJECTS;
  }

  async discoverSchema(objectId: string, _creds: Record<string, string>): Promise<ConnectorField[]> {
    return SCHEMAS[objectId] ?? [];
  }

  async extract(objectId: string, creds: Record<string, string>, _opts: ExtractOptions, log: LogFn): Promise<ExtractResult> {
    const { api_key } = creds;
    log("info", `Extracting Instantly ${objectId}…`);

    if (objectId === "campaigns") {
      const data = await this.get(api_key, "/campaign/list", { limit: "100", skip: "0" }) as { campaigns?: InstantlyRecord[] };
      const rows = (data.campaigns ?? (Array.isArray(data) ? data as InstantlyRecord[] : [])).map(c => ({
        id:              String(c.id ?? c.campaign_id ?? ""),
        name:            c.name ?? null,
        status:          c.status ?? null,
        created_at:      c.created_at ?? null,
        updated_at:      c.updated_at ?? null,
        email_list_json: c.email_list ? JSON.stringify(c.email_list) : null,
        from_name:       c.from_name ?? null,
        reply_to:        c.reply_to ?? null,
        daily_limit:     c.daily_limit ?? null,
        open_tracking:   c.open_tracking ?? null,
        link_tracking:   c.link_tracking ?? null,
        stop_on_reply:   c.stop_on_reply ?? null,
        timezone:        c.timezone ?? null,
      }));
      log("success", `Extracted ${rows.length} campaigns.`);
      return { rows, schema: SCHEMAS.campaigns, rowCount: rows.length };
    }

    if (objectId === "analytics") {
      // Get all campaigns first, then analytics for each
      const data = await this.get(api_key, "/campaign/list", { limit: "100", skip: "0" }) as { campaigns?: InstantlyRecord[] };
      const campaigns = data.campaigns ?? (Array.isArray(data) ? data as InstantlyRecord[] : []);
      const rows: InstantlyRecord[] = [];

      for (const c of campaigns) {
        const cid = String(c.id ?? c.campaign_id ?? "");
        if (!cid) continue;
        try {
          const stats = await this.get(api_key, "/analytics/campaign/summary", { campaign_id: cid }) as InstantlyRecord;
          const sent    = Number(stats.emails_sent_count ?? 0);
          const opened  = Number(stats.open_count ?? 0);
          const replied = Number(stats.reply_count ?? 0);
          const bounced = Number(stats.bounced_count ?? 0);
          const unsub   = Number(stats.unsubscribed_count ?? 0);
          rows.push({
            campaign_id:           cid,
            campaign_name:         String(c.name ?? ""),
            leads_count:           stats.leads_count ?? null,
            contacted_count:       stats.contacted_count ?? null,
            emails_sent:           sent,
            emails_opened:         opened,
            emails_replied:        replied,
            emails_bounced:        bounced,
            emails_unsubscribed:   unsub,
            open_rate:             sent > 0 ? opened / sent : 0,
            reply_rate:            sent > 0 ? replied / sent : 0,
            bounce_rate:           sent > 0 ? bounced / sent : 0,
          });
        } catch { /* skip campaign on error */ }
        await new Promise(r => setTimeout(r, 100));
      }
      log("success", `Extracted analytics for ${rows.length} campaigns.`);
      return { rows, schema: SCHEMAS.analytics, rowCount: rows.length };
    }

    if (objectId === "leads") {
      // List leads — paginated
      const limit = 100;
      let skip = 0;
      const allRows: InstantlyRecord[] = [];
      do {
        const data = await this.get(api_key, "/lead/list", { limit: String(limit), skip: String(skip) }) as { leads?: InstantlyRecord[] };
        const batch = data.leads ?? (Array.isArray(data) ? data as InstantlyRecord[] : []);
        allRows.push(...batch.map(l => ({
          id:           String(l.id ?? l.lead_id ?? ""),
          email:        l.email ?? null,
          first_name:   l.first_name ?? null,
          last_name:    l.last_name ?? null,
          company_name: l.company_name ?? null,
          campaign_id:  l.campaign_id ?? null,
          status:       l.status ?? null,
          timestamp:    l.timestamp ?? null,
          payload_json: l.payload ? JSON.stringify(l.payload) : null,
        })));
        if (batch.length < limit) break;
        skip += limit;
        await new Promise(r => setTimeout(r, 100));
      } while (true);

      log("success", `Extracted ${allRows.length} leads.`);
      return { rows: allRows, schema: SCHEMAS.leads, rowCount: allRows.length };
    }

    throw new Error(`Unknown Instantly object: ${objectId}`);
  }

  async health(creds: Record<string, string>): Promise<HealthResult> {
    const start = Date.now();
    try {
      await this.get(creds.api_key, "/campaign/list", { limit: "1", skip: "0" });
      return { ok: true, latencyMs: Date.now() - start, message: "Connection healthy" };
    } catch (e: unknown) {
      return { ok: false, latencyMs: Date.now() - start, message: String(e) };
    }
  }

  incrementalObjects() { return INSTANTLY_OBJECTS.filter(o => o.supportsIncremental); }
  suggestedSchedule() { return "every_6h"; }
}

export const instantlyConnector = new InstantlyConnector();
