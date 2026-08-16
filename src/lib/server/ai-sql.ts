/**
 * AI SQL Assistant — natural language → BigQuery SQL, for Query Studio.
 *
 * Powered by Groq's OpenAI-compatible chat completions API, called directly
 * via fetch (no SDK dependency — matches the rest of this codebase, which
 * only adds a package when a raw HTTP call genuinely isn't enough).
 *
 * Grounding, so the model can never hallucinate a table or column:
 *   1. buildSchemaContext() reads table/column names LIVE from BigQuery
 *      (INFORMATION_SCHEMA.COLUMNS) using this workspace's real credentials
 *      — the same resolveBqCreds() every other warehouse-facing route uses
 *      — rather than depending on the separate, manually-triggered Catalog
 *      feature. This means the AI Assistant works the moment a warehouse is
 *      connected and a flow has synced, with no extra step. Results are
 *      cached for 30s (same pattern as warehouse-monitor.ts) so repeated
 *      prompts don't re-hit BigQuery every time. Semantic Models are pulled
 *      from this app's own DB as before.
 *   2. Per-user table isolation matches warehouse-monitor.ts exactly: a
 *      shared BigQuery dataset can contain tables from other users' flows,
 *      so only tables this user's own flows actually wrote to are offered
 *      as context — never the whole dataset.
 *   3. The prompt sent to Groq lists exactly those tables/columns and
 *      instructs the model to use nothing else, and to say so explicitly
 *      (NO_ANSWER: ...) if the request can't be answered from them.
 *   4. generateSqlFromPrompt() re-validates the returned SQL against that
 *      same table list before ever handing it back to the API route — if
 *      the model referenced a table that isn't in the context it was
 *      given, generation is rejected, not silently trusted.
 *
 * The SQL this module returns is never executed here. It's handed back to
 * Query Studio for the user to review/edit, then run through the existing
 * POST /api/query/run exactly like hand-written SQL — this module has no
 * BigQuery execution path of its own.
 */

import { BigQuery } from "@google-cloud/bigquery";
import { getDb } from "./db";
import { resolveBqCreds } from "./bq-creds";
import { extractTableRefs } from "./sql-lineage";
import { validateReadOnlySql } from "./sql-safety";
import { namedCache } from "../perf/cache";
import { getAdapterAsync } from "./connectors";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";
const MAX_TABLES = 8;
const MAX_MODELS = 4;
const LOCAL_UID = "local";

// ── Schema context ──────────────────────────────────────────────────────────

export interface SchemaTable {
  fullName: string; // `project.dataset.table`
  columns: { name: string; type: string }[];
}

export interface SchemaModel {
  name: string;
  description: string | null;
  sqlQuery: string;
}

export interface SchemaContext {
  tables: SchemaTable[];
  models: SchemaModel[];
  warehouseConfigured: boolean;
}

const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "this", "that", "show", "what", "get",
  "list", "give", "find", "all", "per", "over", "top", "last", "each", "are",
  "was", "were", "into", "onto", "our", "you", "your", "please", "how", "many",
]);

function tokenize(text: string): string[] {
  return (
    text
      .toLowerCase()
      .match(/[a-z0-9]+/g)
      ?.filter((t) => t.length > 2 && !STOPWORDS.has(t)) ?? []
  );
}

// ── Live BigQuery introspection (replaces the Catalog dependency) ───────────

interface LiveTable {
  dataset: string;
  tableName: string; // bare, as returned by INFORMATION_SCHEMA
  columns: { name: string; type: string }[];
}

const liveSchemaCache = namedCache<LiveTable[]>("ai-sql-live-schema", { defaultTtlMs: 30_000, maxEntries: 500 });

/** All columns for every table in one dataset. Cached per project+dataset. */
async function fetchLiveDatasetTables(args: {
  projectId: string;
  dataset: string;
  credentials: Record<string, string>;
}): Promise<LiveTable[]> {
  const { projectId, dataset, credentials } = args;
  const cacheKey = `${projectId}:${dataset}`;

  return liveSchemaCache.getOrCompute(cacheKey, async () => {
    const bq = new BigQuery({ projectId, credentials });
    const query = `SELECT table_name, column_name, data_type
                    FROM \`${projectId}.${dataset}\`.INFORMATION_SCHEMA.COLUMNS
                    ORDER BY table_name, ordinal_position`;
    const [job] = await bq.createQueryJob({ query, defaultDataset: { datasetId: dataset, projectId } });
    const [rows] = await job.getQueryResults();

    const byTable = new Map<string, { name: string; type: string }[]>();
    for (const r of rows as { table_name: string; column_name: string; data_type: string }[]) {
      if (!byTable.has(r.table_name)) byTable.set(r.table_name, []);
      byTable.get(r.table_name)!.push({ name: r.column_name, type: r.data_type });
    }
    return [...byTable.entries()].map(([tableName, columns]) => ({ dataset, tableName, columns }));
  });
}

/**
 * Live tables this specific user is allowed to see. A flow can override its
 * destination dataset (flows.dataset) independently of the workspace's
 * default BigQuery dataset — resolveBqCreds() only knows the default, so
 * relying on it alone misses tables synced into a flow-specific dataset.
 * Instead: for each of this user's flows, resolve its *effective* dataset
 * (flow override, else workspace default) and query INFORMATION_SCHEMA for
 * exactly those datasets, then filter to the bare table names those flows
 * actually wrote to — same per-user isolation invariant warehouse-monitor.ts
 * enforces (a shared BigQuery dataset must never leak another user's tables).
 */
async function getLiveWarehouseTables(
  userId: string,
  workspaceId: string
): Promise<{ ok: true; tables: LiveTable[]; projectId: string } | { ok: false; reason: "not_configured" | "warehouse_error"; error?: string }> {
  const creds = resolveBqCreds(userId, workspaceId);
  if (!creds) return { ok: false, reason: "not_configured" };

  const db = getDb();
  const userIds = userId === LOCAL_UID ? [LOCAL_UID] : [userId, LOCAL_UID];
  const placeholders = userIds.map(() => "?").join(",");
  const flowRows = db
    .prepare(`SELECT dataset, warehouse_table, source_id FROM flows WHERE user_id IN (${placeholders})`)
    .all(...userIds) as { dataset: string | null; warehouse_table: string | null; source_id: string }[];

  if (flowRows.length === 0) return { ok: true, tables: [], projectId: creds.projectId };

  // Group each flow's real destination table name(s) under its effective dataset.
  const allowedByDataset = new Map<string, Set<string>>();
  for (const f of flowRows) {
    const ds = (f.dataset?.trim() || creds.dataset).trim();
    if (!allowedByDataset.has(ds)) allowedByDataset.set(ds, new Set());
    const allowedNames = allowedByDataset.get(ds)!;

    if (f.warehouse_table) {
      allowedNames.add(f.warehouse_table.split(".").pop()!.toLowerCase()); // strip any dataset prefix a flow may have stored
    }

    // A multi-object connector (e.g. Instantly: campaigns/leads/analytics)
    // syncs several real tables per flow, but `warehouse_table` is a single
    // column and can only ever record one of them (whichever object last
    // self-healed it — see runner.ts). Add every table the connector itself
    // declares so all of them stay discoverable here regardless of what
    // warehouse_table happens to say — this is the same adapter.objects list
    // runner.ts uses to decide real per-object destination table names.
    try {
      const adapter = await getAdapterAsync(f.source_id);
      if (adapter?.objects?.length) {
        for (const obj of adapter.objects) allowedNames.add(obj.table.toLowerCase());
      }
    } catch { /* best-effort — a missing/broken adapter shouldn't break discovery for other flows */ }
  }

  const tables: LiveTable[] = [];
  let lastError: string | null = null;
  let anySucceeded = false;

  for (const [ds, allowedNames] of allowedByDataset) {
    try {
      const live = await fetchLiveDatasetTables({ projectId: creds.projectId, dataset: ds, credentials: creds.credentials });
      anySucceeded = true;
      for (const t of live) {
        if (allowedNames.has(t.tableName.toLowerCase())) tables.push(t);
      }
    } catch (e) {
      // Don't fail the whole request over one bad dataset (e.g. a flow with a
      // stale/typo'd override) — but if EVERY dataset fails, surface the error
      // rather than silently reporting "no tables found".
      lastError = e instanceof Error ? e.message : String(e);
    }
  }

  if (!anySucceeded && lastError) return { ok: false, reason: "warehouse_error", error: lastError };

  return { ok: true, tables, projectId: creds.projectId };
}

interface ModelRow {
  name: string;
  description: string | null;
  sql_query: string;
}

/**
 * Pull this user's live warehouse tables + this workspace's semantic
 * models, score each against the prompt's keywords, and keep only the most
 * relevant ones (capped at MAX_TABLES/MAX_MODELS) — this is the "smart
 * context" step: never send the whole schema to the model.
 */
export async function buildSchemaContext(
  workspaceId: string,
  userId: string,
  prompt: string
): Promise<{ ok: true; context: SchemaContext } | { ok: false; code: "not_configured" | "warehouse_error"; error?: string }> {
  const live = await getLiveWarehouseTables(userId, workspaceId);
  if (!live.ok) return { ok: false, code: live.reason, error: live.error };

  const promptTokens = tokenize(prompt);

  const scoredTables = live.tables
    .filter((t) => t.columns.length > 0)
    .map((t) => {
      const table: SchemaTable = {
        fullName: `${live.projectId}.${t.dataset}.${t.tableName}`,
        columns: t.columns,
      };
      const haystack = [t.tableName, ...t.columns.map((c) => c.name)].join(" ").toLowerCase();
      const score = promptTokens.reduce(
        (acc, tok) => acc + (haystack.includes(tok) ? (t.tableName.toLowerCase().includes(tok) ? 3 : 1) : 0),
        0
      );
      return { score, table };
    });

  scoredTables.sort((a, b) => b.score - a.score);
  const anyMatched = scoredTables.some((t) => t.score > 0);
  const relevantTables = (anyMatched ? scoredTables.filter((t) => t.score > 0) : scoredTables).slice(0, MAX_TABLES);

  const db = getDb();
  const modelRows = db
    .prepare(
      `SELECT name, description, sql_query FROM models
       WHERE workspace_id = ? AND status != 'archived'
       ORDER BY updated_at DESC LIMIT 30`
    )
    .all(workspaceId) as ModelRow[];

  const scoredModels = modelRows.map((m) => {
    const haystack = `${m.name} ${m.description ?? ""}`.toLowerCase();
    const score = promptTokens.reduce((acc, tok) => acc + (haystack.includes(tok) ? 2 : 0), 0);
    return { score, model: { name: m.name, description: m.description, sqlQuery: m.sql_query } as SchemaModel };
  });
  scoredModels.sort((a, b) => b.score - a.score);
  const relevantModels = scoredModels.filter((m) => m.score > 0).slice(0, MAX_MODELS);

  return {
    ok: true,
    context: {
      tables: relevantTables.map((t) => t.table),
      models: relevantModels.map((m) => m.model),
      warehouseConfigured: true,
    },
  };
}

export function schemaContextIsEmpty(ctx: SchemaContext): boolean {
  return ctx.tables.length === 0;
}

// ── Prompt construction ──────────────────────────────────────────────────────

function buildMessages(ctx: SchemaContext, userPrompt: string): { system: string; user: string } {
  const tablesBlock = ctx.tables
    .map((t) => {
      const cols = t.columns.map((c) => `    - ${c.name} (${c.type})`).join("\n");
      return `Table: \`${t.fullName}\`\n  Columns:\n${cols}`;
    })
    .join("\n\n");

  const modelsBlock = ctx.models.length
    ? ctx.models
        .map((m) => `Semantic Model "${m.name}"${m.description ? ` — ${m.description}` : ""}\n  SQL:\n  ${m.sqlQuery.split("\n").join("\n  ")}`)
        .join("\n\n")
    : "(none relevant to this request)";

  const system = `You are a SQL generator for a Google BigQuery data warehouse. You write ONLY Google BigQuery Standard SQL.

STRICT RULES:
- Output ONLY the SQL query itself. No explanation, no markdown code fences, no commentary — just the raw SQL text.
- You may ONLY use the tables and columns listed below. Never invent a table or column name that is not listed here, even if it seems like it should exist.
- Always reference tables using their exact fully-qualified name in backticks, exactly as given, e.g. \`project.dataset.table\`.
- Column types are given exactly as BigQuery reports them. If a column that looks numeric or date-like is typed STRING, use SAFE_CAST / SAFE.PARSE_DATE rather than assuming it's already numeric/date.
- A "Semantic Model" below is not a live table — if its logic is useful, inline its SQL as a CTE (WITH clause) using its own SQL text; never write "FROM <model name>" as if it were a table.
- Only SELECT or WITH statements are allowed. Never write INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, MERGE, TRUNCATE, GRANT, REVOKE, or any other write/DDL/DML statement, under any circumstances.
- If the request cannot be answered using only the tables/columns below, respond with exactly this and nothing else: NO_ANSWER: <one short sentence explaining what's missing>

AVAILABLE TABLES (this is the complete list — nothing else exists):
${tablesBlock || "(none)"}

RELEVANT SEMANTIC MODELS:
${modelsBlock}`;

  const user = `Request: ${userPrompt}\n\nWrite the BigQuery SQL for this request, following every rule above exactly.`;

  return { system, user };
}

function stripCodeFence(text: string): string {
  const fenced = text.match(/```(?:sql)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

// ── Groq call ────────────────────────────────────────────────────────────────

async function callGroq(system: string, user: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "AI SQL Assistant is not configured — GROQ_API_KEY is not set." };
  }
  const model = process.env.GROQ_MODEL?.trim() || DEFAULT_MODEL;

  let res: Response;
  try {
    res = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.1,
        max_tokens: 1024,
      }),
    });
  } catch (e) {
    return { ok: false, error: `Could not reach Groq: ${e instanceof Error ? e.message : String(e)}` };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, error: `Groq API error ${res.status}${body ? `: ${body.slice(0, 300)}` : ""}` };
  }

  const data = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null;
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) return { ok: false, error: "Groq returned an empty response." };
  return { ok: true, text };
}

// ── Anti-hallucination check ─────────────────────────────────────────────────

function isKnownTableRef(ref: string, knownFullNames: string[]): boolean {
  return knownFullNames.some((full) => full === ref || full.endsWith(`.${ref}`) || full.split(".").pop() === ref);
}

// ── Public entry point ───────────────────────────────────────────────────────

export type GenerateSqlResult =
  | { ok: true; sql: string; tablesUsed: string[] }
  | {
      ok: false;
      error: string;
      code: "not_configured" | "warehouse_error" | "no_schema" | "groq_error" | "invalid_sql" | "unknown_table" | "no_answer";
    };

export async function generateSqlFromPrompt(args: { workspaceId: string; userId: string; prompt: string }): Promise<GenerateSqlResult> {
  if (!process.env.GROQ_API_KEY) {
    return { ok: false, code: "not_configured", error: "AI SQL Assistant is not configured. Ask your admin to set GROQ_API_KEY." };
  }

  const built = await buildSchemaContext(args.workspaceId, args.userId, args.prompt);
  if (!built.ok) {
    if (built.code === "not_configured") {
      return { ok: false, code: "not_configured", error: "No BigQuery warehouse is connected for this workspace. Add a BigQuery credential in Settings → Integrations first." };
    }
    return { ok: false, code: "warehouse_error", error: `Could not read your warehouse schema: ${built.error}` };
  }

  const ctx = built.context;
  if (schemaContextIsEmpty(ctx)) {
    return {
      ok: false,
      code: "no_schema",
      error: "No tables were found for this workspace yet. Run a flow that syncs into BigQuery, then try again.",
    };
  }

  const { system, user } = buildMessages(ctx, args.prompt);
  const groqRes = await callGroq(system, user);
  if (!groqRes.ok) return { ok: false, code: "groq_error", error: groqRes.error };

  const raw = stripCodeFence(groqRes.text);

  if (/^NO_ANSWER/i.test(raw)) {
    return { ok: false, code: "no_answer", error: raw.replace(/^NO_ANSWER:?\s*/i, "").trim() || "The available schema can't answer this request." };
  }

  const safety = validateReadOnlySql(raw);
  if (!safety.ok) return { ok: false, code: "invalid_sql", error: safety.error };

  const knownFullNames = ctx.tables.map((t) => t.fullName.toLowerCase());
  const refs = extractTableRefs(raw);
  const unknown = refs.filter((ref) => !isKnownTableRef(ref, knownFullNames));
  if (unknown.length > 0) {
    return {
      ok: false,
      code: "unknown_table",
      error: `The generated SQL referenced a table that isn't in your warehouse: ${unknown.join(", ")}. Try rephrasing your request.`,
    };
  }

  return { ok: true, sql: raw, tablesUsed: [...new Set(refs)] };
}
