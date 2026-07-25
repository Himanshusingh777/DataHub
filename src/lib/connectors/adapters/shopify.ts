/**
 * Shopify Connector Adapter
 *
 * Extracts Orders, Products, Customers, Inventory, and Collections
 * from the Shopify REST Admin API v2024-01.
 *
 * Auth: Shopify Private App access token (shop domain + admin_api_access_token)
 * Rate limits: 2 req/s (leaky bucket). We add 600ms delay between paginated calls.
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
  type WebhookEvent,
} from "../sdk";

const API_VERSION = "2024-01";

const SHOPIFY_OBJECTS: ConnectorObject[] = [
  { id: "orders",     name: "Orders",     table: "shopify_orders",     supportsIncremental: true,  cursorField: "updated_at", keyFields: ["id"] },
  { id: "products",   name: "Products",   table: "shopify_products",   supportsIncremental: true,  cursorField: "updated_at", keyFields: ["id"] },
  { id: "customers",  name: "Customers",  table: "shopify_customers",  supportsIncremental: true,  cursorField: "updated_at", keyFields: ["id"] },
  { id: "inventory",  name: "Inventory",  table: "shopify_inventory",  supportsIncremental: false, keyFields: ["inventory_item_id", "location_id"] },
  { id: "collections",name: "Collections",table: "shopify_collections",supportsIncremental: false, keyFields: ["id"] },
];

const SHOPIFY_SCHEMA: Record<string, ConnectorField[]> = {
  orders: [
    { name: "id",              type: "INTEGER",   mode: "REQUIRED" },
    { name: "email",           type: "STRING",    mode: "NULLABLE" },
    { name: "created_at",      type: "TIMESTAMP", mode: "NULLABLE" },
    { name: "updated_at",      type: "TIMESTAMP", mode: "NULLABLE" },
    { name: "closed_at",       type: "TIMESTAMP", mode: "NULLABLE" },
    { name: "number",          type: "INTEGER",   mode: "NULLABLE" },
    { name: "note",            type: "STRING",    mode: "NULLABLE" },
    { name: "token",           type: "STRING",    mode: "NULLABLE" },
    { name: "gateway",         type: "STRING",    mode: "NULLABLE" },
    { name: "total_price",     type: "FLOAT",     mode: "NULLABLE" },
    { name: "subtotal_price",  type: "FLOAT",     mode: "NULLABLE" },
    { name: "total_tax",       type: "FLOAT",     mode: "NULLABLE" },
    { name: "currency",        type: "STRING",    mode: "NULLABLE" },
    { name: "financial_status",type: "STRING",    mode: "NULLABLE" },
    { name: "fulfillment_status",type:"STRING",   mode: "NULLABLE" },
    { name: "customer_id",     type: "INTEGER",   mode: "NULLABLE" },
    { name: "line_items_json", type: "STRING",    mode: "NULLABLE" },
    { name: "shipping_address_json", type: "STRING", mode: "NULLABLE" },
    { name: "tags",            type: "STRING",    mode: "NULLABLE" },
    { name: "source_name",     type: "STRING",    mode: "NULLABLE" },
  ],
  products: [
    { name: "id",           type: "INTEGER",   mode: "REQUIRED" },
    { name: "title",        type: "STRING",    mode: "NULLABLE" },
    { name: "body_html",    type: "STRING",    mode: "NULLABLE" },
    { name: "vendor",       type: "STRING",    mode: "NULLABLE" },
    { name: "product_type", type: "STRING",    mode: "NULLABLE" },
    { name: "created_at",   type: "TIMESTAMP", mode: "NULLABLE" },
    { name: "updated_at",   type: "TIMESTAMP", mode: "NULLABLE" },
    { name: "published_at", type: "TIMESTAMP", mode: "NULLABLE" },
    { name: "handle",       type: "STRING",    mode: "NULLABLE" },
    { name: "status",       type: "STRING",    mode: "NULLABLE" },
    { name: "tags",         type: "STRING",    mode: "NULLABLE" },
    { name: "variants_json",type: "STRING",    mode: "NULLABLE" },
    { name: "images_json",  type: "STRING",    mode: "NULLABLE" },
  ],
  customers: [
    { name: "id",                  type: "INTEGER",   mode: "REQUIRED" },
    { name: "email",               type: "STRING",    mode: "NULLABLE" },
    { name: "first_name",          type: "STRING",    mode: "NULLABLE" },
    { name: "last_name",           type: "STRING",    mode: "NULLABLE" },
    { name: "phone",               type: "STRING",    mode: "NULLABLE" },
    { name: "created_at",          type: "TIMESTAMP", mode: "NULLABLE" },
    { name: "updated_at",          type: "TIMESTAMP", mode: "NULLABLE" },
    { name: "orders_count",        type: "INTEGER",   mode: "NULLABLE" },
    { name: "state",               type: "STRING",    mode: "NULLABLE" },
    { name: "total_spent",         type: "FLOAT",     mode: "NULLABLE" },
    { name: "verified_email",      type: "BOOLEAN",   mode: "NULLABLE" },
    { name: "tax_exempt",          type: "BOOLEAN",   mode: "NULLABLE" },
    { name: "tags",                type: "STRING",    mode: "NULLABLE" },
    { name: "currency",            type: "STRING",    mode: "NULLABLE" },
    { name: "accepts_marketing",   type: "BOOLEAN",   mode: "NULLABLE" },
    { name: "default_address_json",type: "STRING",    mode: "NULLABLE" },
  ],
  inventory: [
    { name: "inventory_item_id", type: "INTEGER", mode: "REQUIRED" },
    { name: "location_id",       type: "INTEGER", mode: "REQUIRED" },
    { name: "available",         type: "INTEGER", mode: "NULLABLE" },
    { name: "updated_at",        type: "TIMESTAMP",mode:"NULLABLE" },
  ],
  collections: [
    { name: "id",           type: "INTEGER",   mode: "REQUIRED" },
    { name: "handle",       type: "STRING",    mode: "NULLABLE" },
    { name: "title",        type: "STRING",    mode: "NULLABLE" },
    { name: "updated_at",   type: "TIMESTAMP", mode: "NULLABLE" },
    { name: "body_html",    type: "STRING",    mode: "NULLABLE" },
    { name: "published_at", type: "TIMESTAMP", mode: "NULLABLE" },
    { name: "sort_order",   type: "STRING",    mode: "NULLABLE" },
    { name: "template_suffix",type:"STRING",   mode: "NULLABLE" },
    { name: "published_scope",type:"STRING",   mode: "NULLABLE" },
    { name: "image_json",   type: "STRING",    mode: "NULLABLE" },
  ],
};

type ShopifyRecord = Record<string, unknown>;

export class ShopifyConnector extends BaseConnector {
  metadata: ConnectorMetadata = {
    id: "shopify",
    name: "Shopify",
    description: "Sync Orders, Products, Customers, Inventory, and Collections from your Shopify store.",
    category: "ecommerce",
    color: "#96BF48",
    authType: "api_key",
    version: "1.0.0",
    supportsWebhooks: true,
    supportsIncremental: true,
    supportsSchemaDiscovery: true,
    docsUrl: "https://docs.crosstecch.io/connectors/shopify",
    requiredCredentials: [
      {
        key: "shop_domain",
        label: "Shop Domain",
        type: "text",
        placeholder: "your-store.myshopify.com",
        helpText: "Your Shopify store's myshopify.com domain.",
        required: true,
      },
      {
        key: "access_token",
        label: "Admin API Access Token",
        type: "password",
        placeholder: "shpat_xxxxxxxxxxxxxxxxxxxxxxxx",
        helpText: "Create a Private App in your Shopify admin and copy the Admin API access token.",
        required: true,
      },
    ],
  };

  private url(domain: string, resource: string): string {
    return `https://${domain}/admin/api/${API_VERSION}/${resource}.json`;
  }

  private async get(domain: string, token: string, resource: string, params: Record<string, string> = {}): Promise<unknown> {
    const url = new URL(this.url(domain, resource));
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url.toString(), {
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) throw new Error(`Shopify API error ${res.status}: ${await res.text()}`);
    return res.json();
  }

  async authenticate(creds: Record<string, string>): Promise<string | null> {
    try {
      await this.get(creds.shop_domain, creds.access_token, "shop");
      return null;
    } catch (e: unknown) {
      return `Shopify auth failed: ${(e as Error).message}`;
    }
  }

  async discoverObjects(_creds: Record<string, string>): Promise<ConnectorObject[]> {
    return SHOPIFY_OBJECTS;
  }

  async discoverSchema(objectId: string, _creds: Record<string, string>): Promise<ConnectorField[]> {
    return SHOPIFY_SCHEMA[objectId] ?? [];
  }

  private flattenShopifyRecord(obj: ShopifyRecord, objectId: string): ShopifyRecord {
    const flat: ShopifyRecord = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === null || v === undefined) {
        flat[k] = null;
      } else if (Array.isArray(v)) {
        // Line items, images, variants etc → JSON string
        flat[`${k}_json`] = JSON.stringify(v);
      } else if (typeof v === "object") {
        flat[`${k}_json`] = JSON.stringify(v);
      } else {
        flat[k] = v;
      }
    }
    return flat;
  }

  async extract(objectId: string, creds: Record<string, string>, opts: ExtractOptions, log: LogFn): Promise<ExtractResult> {
    const { shop_domain, access_token } = creds;
    const limit = 250;
    let pageInfo: string | undefined;
    const allRows: ShopifyRecord[] = [];

    log("info", `Extracting Shopify ${objectId}…`);

    if (objectId === "inventory") {
      // Inventory levels require a different endpoint
      const data = await this.get(shop_domain, access_token, "inventory_levels", { limit: "250" }) as { inventory_levels: ShopifyRecord[] };
      const rows = (data.inventory_levels ?? []).map(r => this.flattenShopifyRecord(r, objectId));
      log("success", `Extracted ${rows.length} inventory records.`);
      return { rows, schema: SHOPIFY_SCHEMA[objectId]!, rowCount: rows.length };
    }

    if (objectId === "collections") {
      const data = await this.get(shop_domain, access_token, "custom_collections", { limit: "250" }) as { custom_collections: ShopifyRecord[] };
      const rows = (data.custom_collections ?? []).map(r => this.flattenShopifyRecord(r, objectId));
      log("success", `Extracted ${rows.length} collections.`);
      return { rows, schema: SHOPIFY_SCHEMA[objectId]!, rowCount: rows.length };
    }

    // Standard paginated objects (orders, products, customers)
    do {
      const params: Record<string, string> = { limit: String(limit) };
      if (opts.startDate) params.updated_at_min = opts.startDate;
      if (pageInfo) params.page_info = pageInfo;

      const data = await this.get(shop_domain, access_token, objectId, pageInfo ? { limit: String(limit), page_info: pageInfo } : params) as Record<string, ShopifyRecord[]>;
      const key = objectId as string;
      const batch = (data[key] ?? []).map((r: ShopifyRecord) => this.flattenShopifyRecord(r, objectId));
      allRows.push(...batch);
      log("info", `Page fetched: ${batch.length} ${objectId} (total so far: ${allRows.length})`);

      // Shopify cursor-based pagination via Link header — simplified (no link header in JSON)
      pageInfo = undefined; // real impl: parse Link header from response
      if (batch.length < limit) break;

      // Rate limit: 2 req/s
      await new Promise(r => setTimeout(r, 600));
    } while (pageInfo);

    log("success", `Extracted ${allRows.length.toLocaleString()} ${objectId} from Shopify.`);
    return {
      rows: allRows,
      schema: SHOPIFY_SCHEMA[objectId] ?? [],
      rowCount: allRows.length,
    };
  }

  async health(creds: Record<string, string>): Promise<HealthResult> {
    const start = Date.now();
    try {
      const data = await this.get(creds.shop_domain, creds.access_token, "shop") as { shop: { name: string; plan_name: string } };
      return {
        ok: true,
        latencyMs: Date.now() - start,
        message: "Connection healthy",
        details: { shopName: data.shop?.name, plan: data.shop?.plan_name },
      };
    } catch (e: unknown) {
      return { ok: false, latencyMs: Date.now() - start, message: String(e) };
    }
  }

  async parseWebhook(headers: Record<string, string>, body: unknown): Promise<WebhookEvent | null> {
    const topic = headers["x-shopify-topic"];
    if (!topic) return null;
    return {
      type: `shopify.${topic.replace("/", ".")}`,
      payload: body as Record<string, unknown>,
      timestamp: new Date().toISOString(),
    };
  }

  incrementalObjects() { return SHOPIFY_OBJECTS.filter(o => o.supportsIncremental); }
  suggestedSchedule() { return "every_hour"; }
}

export const shopifyConnector = new ShopifyConnector();
