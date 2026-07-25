/**
 * HubSpot Connector Adapter
 *
 * Extracts Contacts, Companies, Deals, Tickets, and Engagements
 * from the HubSpot CRM API v3.
 *
 * Auth: HubSpot Private App access token (Bearer)
 * Rate limit: 110 req/10s. We add 100ms delay between paginated calls.
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

const HUBSPOT_OBJECTS: ConnectorObject[] = [
  { id: "contacts",    name: "Contacts",    table: "hubspot_contacts",    supportsIncremental: true,  cursorField: "lastmodifieddate", keyFields: ["id"] },
  { id: "companies",   name: "Companies",   table: "hubspot_companies",   supportsIncremental: true,  cursorField: "hs_lastmodifieddate", keyFields: ["id"] },
  { id: "deals",       name: "Deals",       table: "hubspot_deals",       supportsIncremental: true,  cursorField: "hs_lastmodifieddate", keyFields: ["id"] },
  { id: "tickets",     name: "Tickets",     table: "hubspot_tickets",     supportsIncremental: true,  cursorField: "hs_lastmodifieddate", keyFields: ["id"] },
  { id: "engagements", name: "Engagements", table: "hubspot_engagements", supportsIncremental: true,  cursorField: "lastUpdated", keyFields: ["id"] },
];

// Standard CRM properties for each object type
const OBJECT_PROPERTIES: Record<string, string[]> = {
  contacts: [
    "email","firstname","lastname","phone","company","website","city","state","country",
    "createdate","lastmodifieddate","hs_lead_status","lifecyclestage","hubspot_owner_id",
    "jobtitle","industry","hs_email_open_count","hs_email_click_count","num_notes",
  ],
  companies: [
    "name","domain","city","state","country","industry","type","phone","website","description",
    "founded_year","num_employees","annualrevenue","createdate","hs_lastmodifieddate",
    "hubspot_owner_id","hs_lead_status","lifecyclestage",
  ],
  deals: [
    "dealname","amount","closedate","dealstage","pipeline","dealtype","description",
    "createdate","hs_lastmodifieddate","hubspot_owner_id","hs_deal_stage_probability",
    "hs_forecast_amount","hs_forecast_category",
  ],
  tickets: [
    "subject","content","hs_pipeline","hs_pipeline_stage","hs_ticket_priority","createdate",
    "hs_lastmodifieddate","hubspot_owner_id","closed_date","resolution",
  ],
  engagements: [],
};

function propertiesToSchema(objectId: string): ConnectorField[] {
  const props = OBJECT_PROPERTIES[objectId] ?? [];
  const schema: ConnectorField[] = [
    { name: "id", type: "STRING", mode: "REQUIRED" },
    ...props.map(p => ({
      name: p,
      type: (p.endsWith("date") || p.endsWith("Date")) ? "TIMESTAMP" as const
             : (p.includes("count") || p.includes("num_") || p === "founded_year" || p === "num_employees") ? "INTEGER" as const
             : (p === "amount" || p.includes("revenue") || p.includes("probability") || p.includes("forecast_amount")) ? "FLOAT" as const
             : "STRING" as const,
      mode: "NULLABLE" as const,
    })),
    { name: "associations_json", type: "STRING", mode: "NULLABLE" },
  ];
  return schema;
}

type HubSpotRecord = Record<string, unknown>;

export class HubSpotConnector extends BaseConnector {
  metadata: ConnectorMetadata = {
    id: "hubspot",
    name: "HubSpot",
    description: "Sync Contacts, Companies, Deals, Tickets, and Engagements from your HubSpot CRM.",
    category: "crm",
    color: "#FF7A59",
    authType: "api_key",
    version: "1.0.0",
    supportsWebhooks: true,
    supportsIncremental: true,
    supportsSchemaDiscovery: true,
    docsUrl: "https://docs.crosstecch.io/connectors/hubspot",
    requiredCredentials: [
      {
        key: "access_token",
        label: "Private App Access Token",
        type: "password",
        placeholder: "pat-na1-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        helpText: "Create a Private App in HubSpot Settings → Integrations → Private Apps.",
        required: true,
      },
    ],
  };

  private async get(token: string, path: string, params: Record<string, string> = {}): Promise<HubSpotRecord> {
    const url = new URL(`https://api.hubapi.com${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error(`HubSpot API ${res.status}: ${await res.text()}`);
    return res.json();
  }

  async authenticate(creds: Record<string, string>): Promise<string | null> {
    try {
      await this.get(creds.access_token, "/crm/v3/objects/contacts", { limit: "1" });
      return null;
    } catch (e: unknown) {
      return `HubSpot auth failed: ${(e as Error).message}`;
    }
  }

  async discoverObjects(_creds: Record<string, string>): Promise<ConnectorObject[]> {
    return HUBSPOT_OBJECTS;
  }

  async discoverSchema(objectId: string, _creds: Record<string, string>): Promise<ConnectorField[]> {
    return propertiesToSchema(objectId);
  }

  private flattenRecord(result: HubSpotRecord): HubSpotRecord {
    const props = (result.properties ?? {}) as Record<string, unknown>;
    return {
      id: result.id,
      ...props,
      associations_json: result.associations ? JSON.stringify(result.associations) : null,
    };
  }

  async extract(objectId: string, creds: Record<string, string>, opts: ExtractOptions, log: LogFn): Promise<ExtractResult> {
    const { access_token } = creds;
    const limit = 100;
    let after: string | undefined;
    const allRows: HubSpotRecord[] = [];
    const properties = OBJECT_PROPERTIES[objectId];

    log("info", `Extracting HubSpot ${objectId}…`);

    if (objectId === "engagements") {
      // Engagements use a different v1 endpoint
      const data = await this.get(access_token, "/engagements/v1/engagements/paged", { limit: "250", offset: "0" }) as {
        results: HubSpotRecord[];
        hasMore: boolean;
        offset: number;
      };
      const rows = (data.results ?? []).map(e => ({
        id: String((e.engagement as HubSpotRecord)?.id ?? ""),
        type: (e.engagement as HubSpotRecord)?.type,
        created_at: (e.engagement as HubSpotRecord)?.createdAt,
        updated_at: (e.engagement as HubSpotRecord)?.lastUpdated,
        body_json: JSON.stringify(e.metadata ?? {}),
        associations_json: JSON.stringify(e.associations ?? {}),
      }));
      log("success", `Extracted ${rows.length} engagements.`);
      return { rows, schema: propertiesToSchema(objectId), rowCount: rows.length };
    }

    do {
      const params: Record<string, string> = {
        limit: String(limit),
        properties: properties?.join(",") ?? "",
        associations: "contacts,companies,deals",
      };
      if (after) params.after = after;

      const data = await this.get(access_token, `/crm/v3/objects/${objectId}`, params) as {
        results: HubSpotRecord[];
        paging?: { next?: { after?: string } };
      };

      const batch = (data.results ?? []).map(r => this.flattenRecord(r));
      allRows.push(...batch);
      after = data.paging?.next?.after;

      log("info", `Page: ${batch.length} ${objectId} (total: ${allRows.length})`);
      await new Promise(r => setTimeout(r, 100)); // rate limit
    } while (after);

    log("success", `Extracted ${allRows.length.toLocaleString()} ${objectId} from HubSpot.`);
    return {
      rows: allRows,
      schema: propertiesToSchema(objectId),
      rowCount: allRows.length,
    };
  }

  async health(creds: Record<string, string>): Promise<HealthResult> {
    const start = Date.now();
    try {
      await this.get(creds.access_token, "/crm/v3/objects/contacts", { limit: "1" });
      return { ok: true, latencyMs: Date.now() - start, message: "Connection healthy" };
    } catch (e: unknown) {
      return { ok: false, latencyMs: Date.now() - start, message: String(e) };
    }
  }

  incrementalObjects() { return HUBSPOT_OBJECTS.filter(o => o.supportsIncremental); }
  suggestedSchedule() { return "every_hour"; }
}

export const hubspotConnector = new HubSpotConnector();
