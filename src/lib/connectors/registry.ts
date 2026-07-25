/**
 * CrossTecch Connector Registry
 *
 * All production connectors are registered here. Import this module on the
 * server side to initialize the registry. Every registered connector is
 * automatically available in the flow wizard, connector health dashboard,
 * and SDK API endpoints.
 */

import { registerConnector, getConnector, listConnectors, isConnectorRegistered } from "./sdk";

// Production connectors
import { instantlyConnector }    from "./adapters/instantly";
import { postgresqlConnector }   from "./adapters/postgresql";
import { shopifyConnector }      from "./adapters/shopify";
import { hubspotConnector }      from "./adapters/hubspot";
import { googleSheetsConnector } from "./adapters/google-sheets";
import { stripeConnector }       from "./adapters/stripe";

let initialized = false;

export function initRegistry(): void {
  if (initialized) return;
  initialized = true;

  // SDK-based connectors (full 13-method interface)
  registerConnector("instantly",    instantlyConnector);
  registerConnector("postgresql",    postgresqlConnector);
  registerConnector("shopify",       shopifyConnector);
  registerConnector("hubspot",       hubspotConnector);
  registerConnector("google-sheets", googleSheetsConnector);
  registerConnector("stripe",        stripeConnector);

  console.log(`[registry] ${listConnectors().length} connectors registered.`);
}

export { getConnector, listConnectors, isConnectorRegistered };

// Connector capability matrix — used by the connector list page
export interface ConnectorCapability {
  id: string;
  name: string;
  category: string;
  color: string;
  version: string;
  supportsWebhooks: boolean;
  supportsIncremental: boolean;
  supportsSchemaDiscovery: boolean;
  authType: string;
  objectCount?: number;
  status: "production" | "beta" | "coming_soon";
}

export const CONNECTOR_CATALOG: ConnectorCapability[] = [
  // Production
  { id: "instantly",     name: "Instantly",      category: "marketing",    color: "#6366F1", version: "2.0.0", supportsWebhooks: false, supportsIncremental: true,  supportsSchemaDiscovery: true,  authType: "api_key",           objectCount: 3,  status: "production" },
  { id: "csv",           name: "CSV Upload",     category: "file",         color: "#10B981", version: "1.0.0", supportsWebhooks: false, supportsIncremental: false, supportsSchemaDiscovery: true,  authType: "none",              objectCount: 1,  status: "production" },
  { id: "postgresql",    name: "PostgreSQL",     category: "database",     color: "#336791", version: "1.0.0", supportsWebhooks: false, supportsIncremental: true,  supportsSchemaDiscovery: true,  authType: "connection_string", objectCount: null, status: "production" },
  { id: "shopify",       name: "Shopify",        category: "ecommerce",    color: "#96BF48", version: "1.0.0", supportsWebhooks: true,  supportsIncremental: true,  supportsSchemaDiscovery: true,  authType: "api_key",           objectCount: 5,  status: "production" },
  { id: "hubspot",       name: "HubSpot",        category: "crm",          color: "#FF7A59", version: "1.0.0", supportsWebhooks: true,  supportsIncremental: true,  supportsSchemaDiscovery: true,  authType: "api_key",           objectCount: 5,  status: "production" },
  { id: "google-sheets", name: "Google Sheets",  category: "productivity", color: "#34A853", version: "1.0.0", supportsWebhooks: false, supportsIncremental: false, supportsSchemaDiscovery: true,  authType: "service_account",   objectCount: null, status: "production" },
  { id: "stripe",        name: "Stripe",         category: "finance",      color: "#635BFF", version: "1.0.0", supportsWebhooks: true,  supportsIncremental: true,  supportsSchemaDiscovery: true,  authType: "api_key",           objectCount: 6,  status: "production" },
  // Beta
  { id: "salesforce",    name: "Salesforce",     category: "crm",          color: "#00A1E0", version: "0.9.0", supportsWebhooks: true,  supportsIncremental: true,  supportsSchemaDiscovery: true,  authType: "oauth2",            objectCount: 20, status: "beta" },
  { id: "mysql",         name: "MySQL",          category: "database",     color: "#4479A1", version: "0.9.0", supportsWebhooks: false, supportsIncremental: true,  supportsSchemaDiscovery: true,  authType: "connection_string", objectCount: null, status: "beta" },
  { id: "ga4",           name: "Google Analytics 4", category: "analytics",color: "#F9AB00", version: "0.9.0", supportsWebhooks: false, supportsIncremental: true,  supportsSchemaDiscovery: true,  authType: "service_account",   objectCount: 8,  status: "beta" },
  // Coming soon
  { id: "bigquery-src",  name: "BigQuery (source)", category: "database",  color: "#4285F4", version: "0.1.0", supportsWebhooks: false, supportsIncremental: true,  supportsSchemaDiscovery: true,  authType: "service_account",   objectCount: null, status: "coming_soon" },
  { id: "zendesk",       name: "Zendesk",        category: "crm",          color: "#03363D", version: "0.1.0", supportsWebhooks: true,  supportsIncremental: true,  supportsSchemaDiscovery: true,  authType: "api_key",           objectCount: 6,  status: "coming_soon" },
  { id: "intercom",      name: "Intercom",        category: "crm",         color: "#1F8EFF", version: "0.1.0", supportsWebhooks: true,  supportsIncremental: true,  supportsSchemaDiscovery: true,  authType: "api_key",           objectCount: 4,  status: "coming_soon" },
  { id: "notion",        name: "Notion",          category: "productivity", color: "#000000", version: "0.1.0", supportsWebhooks: false, supportsIncremental: false, supportsSchemaDiscovery: true,  authType: "api_key",           objectCount: 3,  status: "coming_soon" },
  { id: "slack",         name: "Slack",           category: "productivity", color: "#4A154B", version: "0.1.0", supportsWebhooks: true,  supportsIncremental: true,  supportsSchemaDiscovery: true,  authType: "oauth2",            objectCount: 4,  status: "coming_soon" },
];
