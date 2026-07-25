/**
 * Google Sheets Connector Adapter
 *
 * Syncs one or more sheets from a Google Spreadsheet using the
 * Google Sheets API v4. Each sheet becomes one warehouse table.
 *
 * Auth: Service account JSON (same credential type as BigQuery)
 * or OAuth2 access token for personal use.
 */

import { GoogleAuth } from "google-auth-library";
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

type SheetsRecord = Record<string, unknown>;

async function getGoogleAuthToken(serviceJson: string): Promise<string> {
  const auth = new GoogleAuth({
    credentials: JSON.parse(serviceJson),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error("Google Sheets auth returned no access token");
  return token.token;
}

export class GoogleSheetsConnector extends BaseConnector {
  metadata: ConnectorMetadata = {
    id: "google-sheets",
    name: "Google Sheets",
    description: "Sync data from Google Spreadsheets. Each sheet becomes a separate warehouse table.",
    category: "productivity",
    color: "#34A853",
    authType: "service_account",
    version: "1.0.0",
    supportsWebhooks: false,
    supportsIncremental: false,
    supportsSchemaDiscovery: true,
    docsUrl: "https://docs.crosstecch.io/connectors/google-sheets",
    requiredCredentials: [
      {
        key: "spreadsheet_id",
        label: "Spreadsheet ID",
        type: "text",
        placeholder: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms",
        helpText: "The ID from the spreadsheet URL: https://docs.google.com/spreadsheets/d/[SPREADSHEET_ID]/",
        required: true,
      },
      {
        key: "service_json",
        label: "Service Account JSON",
        type: "textarea",
        placeholder: '{"type": "service_account", "project_id": "..."}',
        helpText: "Create a service account in Google Cloud Console, share the spreadsheet with its email, and paste the JSON key here.",
        required: true,
      },
    ],
  };

  private async apiGet(token: string, path: string): Promise<SheetsRecord> {
    const res = await fetch(`https://sheets.googleapis.com/v4${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Sheets API ${res.status}: ${await res.text()}`);
    return res.json() as Promise<SheetsRecord>;
  }

  async authenticate(creds: Record<string, string>): Promise<string | null> {
    try {
      const token = await getGoogleAuthToken(creds.service_json);
      await this.apiGet(token, `/spreadsheets/${creds.spreadsheet_id}?fields=spreadsheetId`);
      return null;
    } catch (e: unknown) {
      return `Google Sheets auth failed: ${(e as Error).message}`;
    }
  }

  async discoverObjects(creds: Record<string, string>): Promise<ConnectorObject[]> {
    const token = await getGoogleAuthToken(creds.service_json);
    const data = await this.apiGet(token, `/spreadsheets/${creds.spreadsheet_id}?fields=sheets.properties`) as {
      sheets: Array<{ properties: { sheetId: number; title: string; gridProperties: { rowCount: number; columnCount: number } } }>;
    };

    return (data.sheets ?? []).map(s => ({
      id: s.properties.title,
      name: s.properties.title,
      table: `gsheets_${s.properties.title.toLowerCase().replace(/[^a-z0-9]/g, "_")}`,
      description: `Sheet: ${s.properties.title}`,
      supportsIncremental: false,
      estimatedRows: s.properties.gridProperties.rowCount,
    }));
  }

  async discoverSchema(objectId: string, creds: Record<string, string>): Promise<ConnectorField[]> {
    const token = await getGoogleAuthToken(creds.service_json);
    // Read just the header row
    const range = encodeURIComponent(`${objectId}!1:1`);
    const data = await this.apiGet(token, `/spreadsheets/${creds.spreadsheet_id}/values/${range}`) as {
      values: string[][];
    };
    const headers = data.values?.[0] ?? [];
    return headers.map(h => ({
      name: h.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase() || "column",
      type: "STRING" as const,
      mode: "NULLABLE" as const,
    }));
  }

  async extract(objectId: string, creds: Record<string, string>, opts: ExtractOptions, log: LogFn): Promise<ExtractResult> {
    const token = await getGoogleAuthToken(creds.service_json);
    log("info", `Extracting Google Sheet: ${objectId}…`);

    const range = encodeURIComponent(objectId);
    const data = await this.apiGet(token, `/spreadsheets/${creds.spreadsheet_id}/values/${range}`) as {
      values: string[][];
    };

    const values = data.values ?? [];
    if (values.length === 0) {
      log("warn", "Sheet is empty.");
      return { rows: [], schema: [], rowCount: 0 };
    }

    const headers = (values[0] ?? []).map(h =>
      (h || "column").replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase()
    );

    const rows: SheetsRecord[] = values.slice(1).map(row => {
      const obj: SheetsRecord = {};
      headers.forEach((h, i) => { obj[h] = row[i] ?? null; });
      return obj;
    });

    const schema: ConnectorField[] = headers.map(h => ({
      name: h,
      type: "STRING" as const,
      mode: "NULLABLE" as const,
    }));

    log("success", `Extracted ${rows.length.toLocaleString()} rows from sheet "${objectId}".`);
    return { rows, schema, rowCount: rows.length };
  }

  async health(creds: Record<string, string>): Promise<HealthResult> {
    const start = Date.now();
    try {
      const token = await getGoogleAuthToken(creds.service_json);
      const data = await this.apiGet(token, `/spreadsheets/${creds.spreadsheet_id}?fields=spreadsheetId,properties.title`) as {
        properties: { title: string };
      };
      return {
        ok: true,
        latencyMs: Date.now() - start,
        message: "Connection healthy",
        details: { title: data.properties?.title },
      };
    } catch (e: unknown) {
      return { ok: false, latencyMs: Date.now() - start, message: String(e) };
    }
  }

  suggestedSchedule() { return "every_hour"; }
}

export const googleSheetsConnector = new GoogleSheetsConnector();
