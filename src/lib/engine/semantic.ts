/**
 * Semantic Engine
 *
 * Universal column classification. Given a column name, declared type, and
 * sample values, classifies the column into a semantic class + role.
 * Works identically for every connector, CSV upload, or API schema —
 * NO connector-specific logic anywhere.
 */

import type { SchemaField } from "@/services/schema.service";

// ── Semantic classes ──────────────────────────────────────────────────────────

export type SemanticClass =
  | "date" | "timestamp"
  | "currency" | "revenue" | "amount"
  | "count" | "percentage" | "rate"
  | "country" | "city" | "region" | "location" | "latitude" | "longitude"
  | "email" | "phone" | "url"
  | "status" | "category" | "tag"
  | "campaign" | "lead" | "customer" | "order" | "invoice" | "product" | "sku"
  | "reply" | "click" | "open" | "bounce" | "unsubscribe"
  | "purchase" | "refund" | "warehouse" | "inventory" | "shipment"
  | "device" | "browser" | "language" | "platform"
  | "workspace" | "team" | "session" | "duration" | "transaction"
  | "identifier" | "name" | "description"
  | "json" | "array" | "boolean"
  | "number" | "text" | "unknown"
  // ── v2 additions (universal intelligence catalog) ──────────────────────────
  | "spend" | "impression" | "ctr" | "roas" | "cpc" | "cpm" | "conversion"
  | "profit" | "margin" | "discount" | "tax" | "quantity"
  | "subscription" | "opportunity" | "deal_stage" | "traffic" | "pageview"
  | "user" | "channel" | "os" | "referrer" | "utm";

/** Role determines how the column is used in dashboards */
export type SemanticRole = "metric" | "dimension" | "time" | "identifier" | "detail";

export interface ClassifiedColumn {
  name: string;
  declaredType: string;
  semanticClass: SemanticClass;
  role: SemanticRole;
  /** Human label, e.g. "total_price" → "Total Price" */
  label: string;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
}

// ── Name-pattern rules (checked in order — first match wins) ─────────────────

const NAME_RULES: [RegExp, SemanticClass][] = [
  // ── v2 high-specificity rules (must precede the generic money/rate rules) ──
  [/(^|_)roas($|_)|return_on_ad|return_on_spend/i, "roas"],
  [/(^|_)ctr($|_)|click_?through/i, "ctr"],
  [/(^|_)cpc($|_)|cost_per_click/i, "cpc"],
  [/(^|_)cpm($|_)|cost_per_(mille|thousand)/i, "cpm"],
  [/(^|_)(ad_?spend|spend|spent|budget_spent)($|_)/i, "spend"],
  [/impression/i, "impression"],
  [/(^|_)(gross_?profit|net_?profit|profit|earnings)($|_)/i, "profit"],
  [/margin/i, "margin"],
  [/discount|coupon/i, "discount"],
  [/(^|_)(tax|vat|gst)($|_)/i, "tax"],
  [/conversion|converted|cvr($|_)/i, "conversion"],
  [/subscription|plan_?name|billing_?cycle|mrr|arr/i, "subscription"],
  [/opportunit(y|ies)|pipeline_?value/i, "opportunity"],
  [/(deal|opp)_?stage|sales_?stage/i, "deal_stage"],
  [/page_?views?|screen_?views?/i, "pageview"],
  [/(^|_)(traffic|visits?|visitors?)($|_)/i, "traffic"],
  [/(^|_)(user|users|user_?id|account_?id)($|_)/i, "user"],
  [/(^|_)(utm_\w+)($|_)|^utm_/i, "utm"],
  [/referrer|referer|referral/i, "referrer"],
  [/(^|_)(os|operating_?system)($|_)/i, "os"],
  [/(^|_)(qty|quantity|units?)($|_)/i, "quantity"],
  // ── original v1 rules (unchanged) ─────────────────────────────────────────
  [/(^|_)(lat|latitude)($|_)/i, "latitude"],
  [/(^|_)(lng|lon|longitude)($|_)/i, "longitude"],
  [/revenue|gmv|turnover/i, "revenue"],
  [/(total|sub)?_?(price|amount|cost|spend|budget|fee|charge)/i, "amount"],
  [/currency/i, "currency"],
  [/_rate$|rate_|percent|pct|ratio/i, "percentage"],
  [/(^|_)(count|qty|quantity|num_|total_\w+s$)/i, "count"],
  [/unsubscribe/i, "unsubscribe"],
  [/bounce/i, "bounce"],
  [/(^|_)open(ed|s)?($|_)/i, "open"],
  [/click/i, "click"],
  [/repl(y|ies|ied)/i, "reply"],
  [/refund/i, "refund"],
  [/purchase/i, "purchase"],
  [/invoice/i, "invoice"],
  [/order/i, "order"],
  [/campaign/i, "campaign"],
  [/(^|_)lead/i, "lead"],
  [/customer|client|buyer/i, "customer"],
  [/(^|_)sku($|_)/i, "sku"],
  [/product|item_name|catalog/i, "product"],
  [/warehouse/i, "warehouse"],
  [/inventory|stock/i, "inventory"],
  [/shipment|shipping|tracking/i, "shipment"],
  [/email|e_mail/i, "email"],
  [/phone|mobile|tel($|_)/i, "phone"],
  [/(^|_)url|link|website|domain/i, "url"],
  [/country/i, "country"],
  [/(^|_)city($|_)/i, "city"],
  [/region|state|province/i, "region"],
  [/address|location/i, "location"],
  [/status|state$|health/i, "status"],
  [/category|type$|kind|group/i, "category"],
  [/(^|_)tags?($|_)/i, "tag"],
  [/device/i, "device"],
  [/browser/i, "browser"],
  [/language|locale/i, "language"],
  [/platform|source$|channel|medium/i, "platform"],
  [/workspace|tenant/i, "workspace"],
  [/team|department/i, "team"],
  [/session/i, "session"],
  [/duration|elapsed|runtime|latency/i, "duration"],
  [/transaction|txn/i, "transaction"],
  [/(^|_)(id|uuid|guid|key)$|_id$/i, "identifier"],
  [/(^|_)name$|title/i, "name"],
  [/description|notes?$|body|message/i, "description"],
  [/(created|updated|deleted|sent|occurred|replied|opened|synced|started|ended|completed)_?(at|on|date|time)|timestamp|_ts$|^date$|_date$/i, "timestamp"],
];

// ── Value-based detection (used when name is ambiguous) ──────────────────────

const RE_ISO_DATE  = /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/;
const RE_EMAIL     = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RE_URL       = /^https?:\/\//;
const RE_PHONE     = /^\+?[\d\s\-()]{7,16}$/;
const RE_CURRENCY  = /^[$€£₹]\s?[\d,.]+$|^[\d,.]+\s?(USD|EUR|GBP|INR)$/i;
const RE_PCT       = /^[\d.]+\s?%$/;

function classifyByValues(samples: unknown[]): SemanticClass | null {
  const vals = samples.filter((v) => v !== null && v !== undefined && v !== "").slice(0, 20);
  if (!vals.length) return null;
  const strs = vals.map(String);
  const all = (re: RegExp) => strs.every((s) => re.test(s.trim()));
  if (all(RE_ISO_DATE)) return "timestamp";
  if (all(RE_EMAIL)) return "email";
  if (all(RE_URL)) return "url";
  if (all(RE_CURRENCY)) return "currency";
  if (all(RE_PCT)) return "percentage";
  if (all(RE_PHONE) && strs.some((s) => s.includes("+") || s.length >= 10)) return "phone";
  if (vals.every((v) => typeof v === "boolean" || ["true","false","yes","no"].includes(String(v).toLowerCase()))) return "boolean";
  if (vals.every((v) => !isNaN(Number(v)))) {
    // Low-cardinality numbers are still metrics; all numbers → number
    return "number";
  }
  // Low cardinality strings → category/status
  const unique = new Set(strs.map((s) => s.toLowerCase()));
  if (unique.size <= Math.max(2, strs.length * 0.4) && [...unique].every((s) => s.length < 32)) return "category";
  return null;
}

// ── Role mapping ──────────────────────────────────────────────────────────────

const METRIC_CLASSES: SemanticClass[] = [
  "currency","revenue","amount","count","percentage","rate","number","duration",
  "reply","click","open","bounce","unsubscribe",
  // v2
  "spend","impression","ctr","roas","cpc","cpm","conversion",
  "profit","margin","discount","tax","quantity","traffic","pageview","session",
];
const TIME_CLASSES: SemanticClass[]      = ["date","timestamp"];
const ID_CLASSES: SemanticClass[]        = ["identifier"];
const DIMENSION_CLASSES: SemanticClass[] = [
  "country","city","region","location","status","category","tag","campaign",
  "device","browser","language","platform","workspace","team","currency",
  "product","sku","warehouse","boolean","name",
  // v2
  "subscription","opportunity","deal_stage","channel","os","referrer","utm","user",
];

/** Classes that are numeric by definition — always a metric regardless of declared type. */
const ALWAYS_METRIC: SemanticClass[] = [
  "revenue","amount","spend","profit","margin","discount","tax",
  "roas","ctr","cpc","cpm","impression","conversion","quantity",
  "traffic","pageview","percentage","rate","count",
];

function roleFor(cls: SemanticClass, declaredType: string): SemanticRole {
  if (TIME_CLASSES.includes(cls)) return "time";
  if (ID_CLASSES.includes(cls)) return "identifier";
  if (ALWAYS_METRIC.includes(cls)) return "metric";
  if (METRIC_CLASSES.includes(cls) && ["number","integer","float"].includes(declaredType)) return "metric";
  if (METRIC_CLASSES.includes(cls) && cls !== "number") {
    // e.g. reply/click classes that are numeric event counts
    return declaredType === "number" ? "metric" : "dimension";
  }
  if (DIMENSION_CLASSES.includes(cls)) return "dimension";
  if (cls === "number") return "metric";
  return "detail";
}

// ── Public API ────────────────────────────────────────────────────────────────

export function humanLabel(name: string): string {
  return name
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/**
 * Public role resolver — lets the statistical profiler re-derive a role after
 * it refines a column's semantic class, instead of keeping the name-based one.
 */
export function roleForClass(cls: SemanticClass, declaredType = "string"): SemanticRole {
  return roleFor(cls, declaredType);
}

/** Classify a single column */
export function classifyColumn(
  name: string,
  declaredType: string,
  samples: unknown[] = [],
  flags?: { isPrimaryKey?: boolean; isForeignKey?: boolean }
): ClassifiedColumn {
  let cls: SemanticClass | null = null;

  // Declared types that are unambiguous
  if (declaredType === "timestamp") cls = "timestamp";
  else if (declaredType === "boolean") cls = "boolean";
  else if (declaredType === "json") cls = "json";
  else if (declaredType === "array") cls = "array";
  else if (declaredType === "uuid") cls = "identifier";

  // Name rules
  if (!cls) {
    for (const [re, c] of NAME_RULES) {
      if (re.test(name)) { cls = c; break; }
    }
  }

  // Value-based fallback
  if (!cls) cls = classifyByValues(samples);
  if (!cls) cls = declaredType === "number" ? "number" : declaredType === "string" ? "text" : "unknown";

  // A "count/amount" name on a string column is likely still numeric data
  const role = flags?.isPrimaryKey || flags?.isForeignKey
    ? "identifier"
    : roleFor(cls, declaredType);

  return {
    name,
    declaredType,
    semanticClass: cls,
    role,
    label: humanLabel(name),
    isPrimaryKey: flags?.isPrimaryKey,
    isForeignKey: flags?.isForeignKey,
  };
}

/** Classify a whole schema (from SchemaService) with optional sample records */
export function classifySchema(
  fields: SchemaField[],
  records: Record<string, unknown>[] = []
): ClassifiedColumn[] {
  return fields.map((f) =>
    classifyColumn(
      f.name,
      f.type,
      records.map((r) => r[f.name]),
      { isPrimaryKey: f.isPrimaryKey, isForeignKey: f.isForeignKey }
    )
  );
}

// ── Concept vocabulary (shared by KPI / SQL / quality / viz engines) ─────────

/**
 * Business concepts the platform understands. A concept is a *group* of
 * semantic classes that answer the same business question. Downstream engines
 * ask "does this dataset have a REVENUE concept?" rather than naming columns.
 */
export type Concept =
  | "revenue" | "spend" | "profit" | "orders" | "customers" | "leads"
  | "campaigns" | "clicks" | "impressions" | "engagement" | "products"
  | "inventory" | "location" | "email" | "time" | "sessions" | "traffic"
  | "device" | "subscriptions" | "invoices" | "opportunities";

const CONCEPT_MAP: Record<Concept, SemanticClass[]> = {
  revenue:       ["revenue", "amount", "currency", "purchase", "transaction"],
  spend:         ["spend", "cpc", "cpm"],
  profit:        ["profit", "margin"],
  orders:        ["order", "quantity"],
  customers:     ["customer", "user"],
  leads:         ["lead"],
  campaigns:     ["campaign"],
  clicks:        ["click", "ctr"],
  impressions:   ["impression"],
  engagement:    ["open", "reply", "bounce", "unsubscribe", "conversion"],
  products:      ["product", "sku"],
  inventory:     ["inventory", "warehouse", "shipment"],
  location:      ["country", "city", "region", "location", "latitude", "longitude"],
  email:         ["email"],
  time:          ["date", "timestamp"],
  sessions:      ["session", "duration"],
  traffic:       ["traffic", "pageview", "referrer", "utm", "platform", "channel"],
  device:        ["device", "browser", "os", "language"],
  subscriptions: ["subscription"],
  invoices:      ["invoice", "tax", "discount"],
  opportunities: ["opportunity", "deal_stage"],
};

/** Which business concepts are present in a classified schema. */
export function detectConcepts(columns: ClassifiedColumn[]): Concept[] {
  const present = new Set(columns.map((c) => c.semanticClass));
  return (Object.keys(CONCEPT_MAP) as Concept[]).filter((concept) =>
    CONCEPT_MAP[concept].some((cls) => present.has(cls))
  );
}

/** All columns belonging to a concept. */
export function columnsForConcept(columns: ClassifiedColumn[], concept: Concept): ClassifiedColumn[] {
  const classes = CONCEPT_MAP[concept];
  return columns.filter((c) => classes.includes(c.semanticClass));
}

/** First column matching any of the given semantic classes. */
export function findColumn(
  columns: ClassifiedColumn[],
  ...classes: SemanticClass[]
): ClassifiedColumn | undefined {
  for (const cls of classes) {
    const hit = columns.find((c) => c.semanticClass === cls);
    if (hit) return hit;
  }
  return undefined;
}

/** True when the class represents money and should render with a currency format. */
export function isMonetary(cls: SemanticClass): boolean {
  return ["revenue", "amount", "currency", "spend", "profit", "discount", "tax", "cpc", "cpm"].includes(cls);
}

/** True when the class represents a ratio and should render as a percentage. */
export function isRatio(cls: SemanticClass): boolean {
  return ["percentage", "rate", "ctr", "margin", "conversion"].includes(cls);
}

/** Metrics where an increase is bad (bounce, unsubscribe, spend, cost). */
export function isInverseMetric(cls: SemanticClass): boolean {
  return ["bounce", "unsubscribe", "cpc", "cpm", "refund"].includes(cls);
}

/** Classify raw records with no schema at all (CSV / unknown API) */
export function classifyRecords(records: Record<string, unknown>[]): ClassifiedColumn[] {
  if (!records.length) return [];
  const names = Object.keys(records[0]);
  return names.map((name) => {
    const samples = records.map((r) => r[name]);
    const declared = samples.every((v) => v === null || v === undefined || !isNaN(Number(v))) ? "number"
      : samples.every((v) => typeof v === "boolean") ? "boolean"
      : "string";
    return classifyColumn(name, declared, samples);
  });
}
