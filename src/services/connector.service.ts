/**
 * ConnectorService
 *
 * Encapsulates all business logic for connector operations.
 * UI components never talk directly to connector state — they call this service.
 * Every method is a pure function or returns a Promise that can be swapped for
 * a real API call without changing any UI code.
 *
 * Extension point: replace the simulated delays with real fetch() calls.
 */

import type { ConnectorDef, ConnectorHealth } from "@/lib/connectors-data";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ConnectResult =
  | { success: true; accountId: string; accountLabel: string }
  | { success: false; error: string };

export type TestResult =
  | { ok: true; latencyMs: number; message: string }
  | { ok: false; error: string };

export type DisconnectResult = { success: true } | { success: false; error: string };

export interface ConnectorHealthStatus {
  health: ConnectorHealth;
  latencyMs: number;
  lastChecked: string;
  message: string;
}

// ── Demo account labels per connector ─────────────────────────────────────────

const DEMO_ACCOUNTS: Record<string, string> = {
  shopify:          "mystore.myshopify.com",
  stripe:           "acct_demo_crossteech",
  hubspot:          "CrossTecch HQ (Portal 12345)",
  salesforce:       "CrossTecch Prod (SF-US-1)",
  google_analytics: "UA-Demo-Property (Web)",
  facebook_ads:     "CrossTecch Ads Account",
  postgresql:       "prod-db.internal:5432",
  mysql:            "mysql-prod.internal:3306",
  mongodb:          "cluster0.mongodb.net",
  snowflake:        "CROSSTECCH.snowflakecomputing.com",
  bigquery:         "crosstecch-prod (GCP)",
  instantly:        "workspace@crosstecch.io",
  default:          "demo-account@crosstecch.io",
};

// ── Service ───────────────────────────────────────────────────────────────────

export const ConnectorService = {
  /**
   * Simulate OAuth / API-key authentication for a connector.
   * In production: open OAuth popup or validate API key against real endpoint.
   */
  async connect(connectorId: string): Promise<ConnectResult> {
    // Simulate network latency (1.8–2.8s)
    await delay(1800 + Math.random() * 1000);

    // 95% success rate in demo
    if (Math.random() < 0.05) {
      return { success: false, error: "Authentication timed out. Check your credentials and try again." };
    }

    const accountLabel =
      DEMO_ACCOUNTS[connectorId] ?? DEMO_ACCOUNTS["default"]!;
    const accountId = `acc_demo_${connectorId}_${Date.now()}`;

    return { success: true, accountId, accountLabel };
  },

  /**
   * Test the connection health for an already-connected connector.
   * In production: GET /api/connectors/{id}/test
   */
  async testConnection(connectorId: string): Promise<TestResult> {
    await delay(600 + Math.random() * 800);
    const latencyMs = Math.round(40 + Math.random() * 120);
    return {
      ok: true,
      latencyMs,
      message: `Connection healthy — responded in ${latencyMs}ms`,
    };
  },

  /**
   * Disconnect and revoke tokens for a connector.
   * In production: DELETE /api/connectors/{id}/connection
   */
  async disconnect(_connectorId: string): Promise<DisconnectResult> {
    await delay(400 + Math.random() * 400);
    return { success: true };
  },

  /**
   * Poll connector health metrics.
   * In production: GET /api/connectors/{id}/health
   */
  async getHealth(_connectorId: string): Promise<ConnectorHealthStatus> {
    await delay(300 + Math.random() * 300);
    const latencyMs = Math.round(30 + Math.random() * 90);
    return {
      health: "healthy",
      latencyMs,
      lastChecked: new Date().toISOString(),
      message: `API responding normally (${latencyMs}ms avg)`,
    };
  },

  /**
   * Discover schema for a specific object.
   * In production: GET /api/connectors/{id}/schema/{objectId}
   */
  async discoverSchema(
    connectorId: string,
    objectId: string
  ): Promise<{ columns: string[]; rowCount: number }> {
    await delay(800 + Math.random() * 600);
    return {
      columns: ["id", "created_at", "updated_at"],
      rowCount: Math.floor(1000 + Math.random() * 50000),
    };
  },

  /**
   * Fetch sample records for preview.
   * In production: GET /api/connectors/{id}/preview/{objectId}?limit=10
   */
  async getSampleRecords(
    _connectorId: string,
    _objectId: string
  ): Promise<Record<string, unknown>[]> {
    await delay(600 + Math.random() * 400);
    return [];
  },

  /** Format a connector's display name for logging / events */
  getDisplayName(connector: ConnectorDef): string {
    return connector.name;
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
