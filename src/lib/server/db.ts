/**
 * Postgres database layer (Vercel migration — replaces better-sqlite3).
 *
 * getDb() returns the same `.prepare(sql).get/all/run(...)` shape the app's
 * 260 call sites already use, backed by a pg.Pool instead of a local SQLite
 * file. Every call site now returns a Promise — the only required change at
 * each site is adding `await`. `?` placeholders are translated to `$1, $2,
 * ...` automatically so no call site needs its SQL string rewritten.
 *
 * Requires POSTGRES_URL (pooled connection string — Vercel Postgres/Neon/
 * Supabase all inject this name) in the environment.
 */

import { Pool, type PoolClient, types } from "pg";

// pg parses PostgreSQL bigint (OID 20, what COUNT()/SUM(int) return) and
// numeric (OID 1700, what AVG() returns) as JS strings by default — a
// precision-safety default that would otherwise silently turn every
// COUNT/SUM/AVG result in this app into a string instead of a number. Every
// value here (row counts, byte sizes, averages) is well within
// Number.MAX_SAFE_INTEGER, so parsing as a number is the right call.
types.setTypeParser(20, (val) => parseInt(val, 10));
types.setTypeParser(1700, (val) => parseFloat(val));

let _pool: Pool | null = null;

function getPool(): Pool {
  if (_pool) return _pool;
  const connectionString = process.env.POSTGRES_URL;
  if (!connectionString) {
    throw new Error("POSTGRES_URL is not set — cannot connect to the database.");
  }
  _pool = new Pool({ connectionString, max: 5 });
  return _pool;
}

type QueryFn = (sql: string, params: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;

/** SQLite used `?` positional placeholders everywhere; Postgres wants $1, $2, ... */
function toPositional(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

interface Stmt<T = any> {
  get(...params: unknown[]): Promise<T | undefined>;
  all(...params: unknown[]): Promise<T[]>;
  run(...params: unknown[]): Promise<{ changes: number; lastInsertRowid?: number }>;
}

function prepareOn(query: QueryFn, sql: string): Stmt {
  const pgSql = toPositional(sql);
  return {
    async get(...params: unknown[]) {
      const { rows } = await query(pgSql, params);
      return rows[0];
    },
    async all(...params: unknown[]) {
      const { rows } = await query(pgSql, params);
      return rows;
    },
    async run(...params: unknown[]) {
      const r = await query(pgSql, params);
      return { changes: r.rowCount ?? 0 };
    },
  };
}

interface Tx {
  prepare(sql: string): Stmt;
}

interface Db {
  prepare(sql: string): Stmt;
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
}

export function getDb(): Db {
  const pool = getPool();
  return {
    prepare: (sql: string) => prepareOn((s, p) => pool.query(s, p), sql),
    exec: async (sql: string) => {
      await pool.query(sql);
    },
    transaction: async <T,>(fn: (tx: Tx) => Promise<T>): Promise<T> => {
      const client: PoolClient = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn({ prepare: (sql: string) => prepareOn((s, p) => client.query(s, p), sql) });
        await client.query("COMMIT");
        return result;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    },
  };
}

// ── Schedule helpers ─────────────────────────────────────────────────────────

export const SCHEDULE_INTERVALS_MIN: Record<string, number | null> = {
  // Canonical values (used internally)
  every_15m:  15,
  every_hour: 60,
  every_6h:   360,
  daily:      1440,
  weekly:     10080,
  manual:     null,
  // Wizard aliases (every_day, every_week, etc.)
  every_15min: 15,
  every_30min: 30,
  every_3h:   180,
  every_12h:  720,
  every_day:  1440,
  every_week: 10080,
};

export function computeNextRun(scheduleValue: string, from = Date.now()): number | null {
  const min = SCHEDULE_INTERVALS_MIN[scheduleValue];
  if (min === null || min === undefined) return null;
  return from + min * 60_000;
}

// ── Multi-workspace default ───────────────────────────────────────────────────
// Every pre-existing row (and every new row for the single-tenant "local"
// user) lives in this implicit workspace, so multi-workspace support is
// purely additive: nothing has to be migrated for the app to keep working
// exactly as it did before this table existed.
export const DEFAULT_WORKSPACE_ID = "default";
