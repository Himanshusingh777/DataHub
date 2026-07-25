/**
 * Stripe Connector Adapter
 *
 * Extracts Charges, Customers, Subscriptions, Invoices, Payment Intents,
 * and Refunds from the Stripe API.
 *
 * Auth: Stripe Restricted Key (sk_live_... or rk_live_...)
 * Rate limit: 100 reads/s. We add 50ms delay between paginated pages.
 * Incremental sync: uses `created` timestamp as cursor (Stripe supports gt filter).
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

type StripeRecord = Record<string, unknown>;

const STRIPE_OBJECTS: ConnectorObject[] = [
  { id: "charges",          name: "Charges",          table: "stripe_charges",          supportsIncremental: true, cursorField: "created", keyFields: ["id"] },
  { id: "customers",        name: "Customers",        table: "stripe_customers",        supportsIncremental: true, cursorField: "created", keyFields: ["id"] },
  { id: "subscriptions",    name: "Subscriptions",    table: "stripe_subscriptions",    supportsIncremental: true, cursorField: "created", keyFields: ["id"] },
  { id: "invoices",         name: "Invoices",         table: "stripe_invoices",         supportsIncremental: true, cursorField: "created", keyFields: ["id"] },
  { id: "payment_intents",  name: "Payment Intents",  table: "stripe_payment_intents",  supportsIncremental: true, cursorField: "created", keyFields: ["id"] },
  { id: "refunds",          name: "Refunds",          table: "stripe_refunds",          supportsIncremental: true, cursorField: "created", keyFields: ["id"] },
];

const STRIPE_SCHEMA: Record<string, ConnectorField[]> = {
  charges: [
    { name: "id",              type: "STRING",    mode: "REQUIRED" },
    { name: "amount",          type: "INTEGER",   mode: "NULLABLE" },
    { name: "amount_captured", type: "INTEGER",   mode: "NULLABLE" },
    { name: "amount_refunded", type: "INTEGER",   mode: "NULLABLE" },
    { name: "currency",        type: "STRING",    mode: "NULLABLE" },
    { name: "customer",        type: "STRING",    mode: "NULLABLE" },
    { name: "description",     type: "STRING",    mode: "NULLABLE" },
    { name: "paid",            type: "BOOLEAN",   mode: "NULLABLE" },
    { name: "refunded",        type: "BOOLEAN",   mode: "NULLABLE" },
    { name: "status",          type: "STRING",    mode: "NULLABLE" },
    { name: "created",         type: "INTEGER",   mode: "NULLABLE" },
    { name: "payment_method",  type: "STRING",    mode: "NULLABLE" },
    { name: "receipt_email",   type: "STRING",    mode: "NULLABLE" },
    { name: "metadata_json",   type: "STRING",    mode: "NULLABLE" },
    { name: "outcome_json",    type: "STRING",    mode: "NULLABLE" },
  ],
  customers: [
    { name: "id",           type: "STRING",    mode: "REQUIRED" },
    { name: "email",        type: "STRING",    mode: "NULLABLE" },
    { name: "name",         type: "STRING",    mode: "NULLABLE" },
    { name: "phone",        type: "STRING",    mode: "NULLABLE" },
    { name: "description",  type: "STRING",    mode: "NULLABLE" },
    { name: "currency",     type: "STRING",    mode: "NULLABLE" },
    { name: "created",      type: "INTEGER",   mode: "NULLABLE" },
    { name: "delinquent",   type: "BOOLEAN",   mode: "NULLABLE" },
    { name: "balance",      type: "INTEGER",   mode: "NULLABLE" },
    { name: "metadata_json",type: "STRING",    mode: "NULLABLE" },
  ],
  subscriptions: [
    { name: "id",                  type: "STRING",    mode: "REQUIRED" },
    { name: "customer",            type: "STRING",    mode: "NULLABLE" },
    { name: "status",              type: "STRING",    mode: "NULLABLE" },
    { name: "current_period_start",type: "INTEGER",   mode: "NULLABLE" },
    { name: "current_period_end",  type: "INTEGER",   mode: "NULLABLE" },
    { name: "created",             type: "INTEGER",   mode: "NULLABLE" },
    { name: "canceled_at",         type: "INTEGER",   mode: "NULLABLE" },
    { name: "trial_start",         type: "INTEGER",   mode: "NULLABLE" },
    { name: "trial_end",           type: "INTEGER",   mode: "NULLABLE" },
    { name: "plan_id",             type: "STRING",    mode: "NULLABLE" },
    { name: "plan_amount",         type: "INTEGER",   mode: "NULLABLE" },
    { name: "plan_currency",       type: "STRING",    mode: "NULLABLE" },
    { name: "plan_interval",       type: "STRING",    mode: "NULLABLE" },
    { name: "items_json",          type: "STRING",    mode: "NULLABLE" },
    { name: "metadata_json",       type: "STRING",    mode: "NULLABLE" },
  ],
  invoices: [
    { name: "id",              type: "STRING",    mode: "REQUIRED" },
    { name: "customer",        type: "STRING",    mode: "NULLABLE" },
    { name: "subscription",    type: "STRING",    mode: "NULLABLE" },
    { name: "amount_due",      type: "INTEGER",   mode: "NULLABLE" },
    { name: "amount_paid",     type: "INTEGER",   mode: "NULLABLE" },
    { name: "amount_remaining",type: "INTEGER",   mode: "NULLABLE" },
    { name: "currency",        type: "STRING",    mode: "NULLABLE" },
    { name: "status",          type: "STRING",    mode: "NULLABLE" },
    { name: "created",         type: "INTEGER",   mode: "NULLABLE" },
    { name: "due_date",        type: "INTEGER",   mode: "NULLABLE" },
    { name: "paid",            type: "BOOLEAN",   mode: "NULLABLE" },
    { name: "period_start",    type: "INTEGER",   mode: "NULLABLE" },
    { name: "period_end",      type: "INTEGER",   mode: "NULLABLE" },
    { name: "lines_json",      type: "STRING",    mode: "NULLABLE" },
  ],
  payment_intents: [
    { name: "id",              type: "STRING",    mode: "REQUIRED" },
    { name: "amount",          type: "INTEGER",   mode: "NULLABLE" },
    { name: "currency",        type: "STRING",    mode: "NULLABLE" },
    { name: "customer",        type: "STRING",    mode: "NULLABLE" },
    { name: "description",     type: "STRING",    mode: "NULLABLE" },
    { name: "status",          type: "STRING",    mode: "NULLABLE" },
    { name: "created",         type: "INTEGER",   mode: "NULLABLE" },
    { name: "payment_method",  type: "STRING",    mode: "NULLABLE" },
    { name: "receipt_email",   type: "STRING",    mode: "NULLABLE" },
    { name: "metadata_json",   type: "STRING",    mode: "NULLABLE" },
  ],
  refunds: [
    { name: "id",           type: "STRING",    mode: "REQUIRED" },
    { name: "charge",       type: "STRING",    mode: "NULLABLE" },
    { name: "amount",       type: "INTEGER",   mode: "NULLABLE" },
    { name: "currency",     type: "STRING",    mode: "NULLABLE" },
    { name: "reason",       type: "STRING",    mode: "NULLABLE" },
    { name: "status",       type: "STRING",    mode: "NULLABLE" },
    { name: "created",      type: "INTEGER",   mode: "NULLABLE" },
    { name: "metadata_json",type: "STRING",    mode: "NULLABLE" },
  ],
};

export class StripeConnector extends BaseConnector {
  metadata: ConnectorMetadata = {
    id: "stripe",
    name: "Stripe",
    description: "Sync Charges, Customers, Subscriptions, Invoices, and Refunds from your Stripe account.",
    category: "finance",
    color: "#635BFF",
    authType: "api_key",
    version: "1.0.0",
    supportsWebhooks: true,
    supportsIncremental: true,
    supportsSchemaDiscovery: true,
    docsUrl: "https://docs.crosstecch.io/connectors/stripe",
    requiredCredentials: [
      {
        key: "secret_key",
        label: "Secret Key",
        type: "password",
        placeholder: "sk_live_xxxxxxxxxxxxxxxxxxxxxxxx",
        helpText: "Use a Restricted Key with read-only permissions for security. Never use your main secret key.",
        required: true,
      },
    ],
  };

  private async stripeGet(key: string, path: string, params: Record<string, string> = {}): Promise<StripeRecord> {
    const url = new URL(`https://api.stripe.com/v1${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${key}`,
        "Stripe-Version": "2024-04-10",
      },
    });
    if (!res.ok) throw new Error(`Stripe API ${res.status}: ${await res.text()}`);
    return res.json();
  }

  private flattenStripeRecord(obj: StripeRecord): StripeRecord {
    const flat: StripeRecord = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === null || v === undefined) {
        flat[k] = null;
      } else if (k === "metadata") {
        flat["metadata_json"] = JSON.stringify(v);
      } else if (k === "lines" && typeof v === "object") {
        flat["lines_json"] = JSON.stringify((v as { data?: unknown }).data ?? v);
      } else if (k === "items" && typeof v === "object") {
        flat["items_json"] = JSON.stringify((v as { data?: unknown }).data ?? v);
      } else if (k === "outcome") {
        flat["outcome_json"] = JSON.stringify(v);
      } else if (typeof v === "object" && !Array.isArray(v)) {
        // Nested object — extract id if it exists, otherwise stringify
        flat[k] = (v as Record<string, unknown>).id ?? JSON.stringify(v);
      } else if (Array.isArray(v)) {
        flat[k] = JSON.stringify(v);
      } else {
        flat[k] = v;
      }
    }
    // Extract nested plan for subscriptions
    if (obj.plan && typeof obj.plan === "object") {
      const plan = obj.plan as Record<string, unknown>;
      flat["plan_id"] = plan.id;
      flat["plan_amount"] = plan.amount;
      flat["plan_currency"] = plan.currency;
      flat["plan_interval"] = plan.interval;
    }
    return flat;
  }

  async authenticate(creds: Record<string, string>): Promise<string | null> {
    try {
      await this.stripeGet(creds.secret_key, "/customers", { limit: "1" });
      return null;
    } catch (e: unknown) {
      return `Stripe auth failed: ${(e as Error).message}`;
    }
  }

  async discoverObjects(_creds: Record<string, string>): Promise<ConnectorObject[]> {
    return STRIPE_OBJECTS;
  }

  async discoverSchema(objectId: string, _creds: Record<string, string>): Promise<ConnectorField[]> {
    return STRIPE_SCHEMA[objectId] ?? [];
  }

  async extract(objectId: string, creds: Record<string, string>, opts: ExtractOptions, log: LogFn): Promise<ExtractResult> {
    const { secret_key } = creds;
    const limit = 100;
    let startingAfter: string | undefined;
    const allRows: StripeRecord[] = [];
    const endpoint = objectId === "payment_intents" ? "/payment_intents" : `/${objectId}`;

    log("info", `Extracting Stripe ${objectId}…`);

    do {
      const params: Record<string, string> = { limit: String(limit) };
      if (startingAfter) params.starting_after = startingAfter;
      if (opts.startDate) {
        // Stripe uses Unix timestamps
        const ts = Math.floor(new Date(opts.startDate).getTime() / 1000);
        params["created[gt]"] = String(ts);
        log("info", `Incremental: fetching ${objectId} created after ${opts.startDate}`);
      }

      const data = await this.stripeGet(secret_key, endpoint, params) as {
        data: StripeRecord[];
        has_more: boolean;
      };
      const batch = (data.data ?? []).map(r => this.flattenStripeRecord(r));
      allRows.push(...batch);

      if (batch.length > 0) {
        startingAfter = String(batch[batch.length - 1]!.id ?? "");
      }

      log("info", `Page: ${batch.length} ${objectId} (total: ${allRows.length})`);
      if (!data.has_more) break;
      await new Promise(r => setTimeout(r, 50)); // rate limit
    } while (startingAfter);

    log("success", `Extracted ${allRows.length.toLocaleString()} ${objectId} from Stripe.`);
    return {
      rows: allRows,
      schema: STRIPE_SCHEMA[objectId] ?? [],
      rowCount: allRows.length,
    };
  }

  async health(creds: Record<string, string>): Promise<HealthResult> {
    const start = Date.now();
    try {
      const data = await this.stripeGet(creds.secret_key, "/customers", { limit: "1" }) as { data: unknown[] };
      return { ok: true, latencyMs: Date.now() - start, message: "Connection healthy" };
    } catch (e: unknown) {
      return { ok: false, latencyMs: Date.now() - start, message: String(e) };
    }
  }

  async parseWebhook(_headers: Record<string, string>, body: unknown): Promise<WebhookEvent | null> {
    const event = body as Record<string, unknown>;
    if (!event?.type) return null;
    return {
      type: `stripe.${String(event.type)}`,
      payload: event,
      timestamp: new Date(Number(event.created) * 1000).toISOString(),
    };
  }

  incrementalObjects() { return STRIPE_OBJECTS; }
  suggestedSchedule() { return "every_hour"; }
}

export const stripeConnector = new StripeConnector();
