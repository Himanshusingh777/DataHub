/**
 * PostgreSQL Connector Adapter
 *
 * Extracts data from a PostgreSQL database using a connection string.
 * Supports table discovery, schema introspection, full refresh, and
 * incremental sync via a configurable cursor column (updated_at by default).
 *
 * Dependencies: pg (node-postgres) — must be installed in production.
 * Install: npm install pg @types/pg
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

// pg is loaded dynamically so the module doesn't crash if pg isn't installed yet
async function getPg() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Client } = require(/* webpackIgnore: true */ "pg");
    return Client;
  } catch {
    throw new Error("pg (node-postgres) is not installed. Run: npm install pg");
  }
}

const PG_TO_BQ: Record<string, ConnectorField["type"]> = {
  "character varying": "STRING",
  varchar: "STRING",
  text: "STRING",
  char: "STRING",
  uuid: "STRING",
  json: "STRING",
  jsonb: "STRING",
  integer: "INTEGER",
  int: "INTEGER",
  int4: "INTEGER",
  int8: "INTEGER",
  bigint: "INTEGER",
  smallint: "INTEGER",
  serial: "INTEGER",
  bigserial: "INTEGER",
  numeric: "FLOAT",
  decimal: "FLOAT",
  float4: "FLOAT",
  float8: "FLOAT",
  double: "FLOAT",
  real: "FLOAT",
  boolean: "BOOLEAN",
  bool: "BOOLEAN",
  timestamp: "TIMESTAMP",
  "timestamp without time zone": "TIMESTAMP",
  "timestamp with time zone": "TIMESTAMP",
  timestamptz: "TIMESTAMP",
  date: "DATE",
  bytea: "BYTES",
};

export class PostgreSQLConnector extends BaseConnector {
  metadata: ConnectorMetadata = {
    id: "postgresql",
    name: "PostgreSQL",
    description: "Extract data from any PostgreSQL database. Supports tables, views, and custom SQL queries.",
    category: "database",
    color: "#336791",
    authType: "connection_string",
    version: "1.0.0",
    supportsWebhooks: false,
    supportsIncremental: true,
    supportsSchemaDiscovery: true,
    docsUrl: "https://docs.crosstecch.io/connectors/postgresql",
    requiredCredentials: [
      {
        key: "connection_string",
        label: "Connection String",
        type: "password",
        placeholder: "postgresql://user:password@host:5432/database",
        helpText: "Full PostgreSQL connection URI. The password is encrypted at rest.",
        required: true,
      },
      {
        key: "schema",
        label: "Schema",
        type: "text",
        placeholder: "public",
        helpText: "PostgreSQL schema to sync from. Defaults to 'public'.",
        required: false,
      },
    ],
  };

  async authenticate(creds: Record<string, string>): Promise<string | null> {
    const PgClient = await getPg();
    const client = new PgClient({ connectionString: creds.connection_string });
    try {
      await client.connect();
      await client.query("SELECT 1");
      return null;
    } catch (e: unknown) {
      return `PostgreSQL connection failed: ${(e as Error).message}`;
    } finally {
      try { await client.end(); } catch { /* ignore */ }
    }
  }

  async discoverObjects(creds: Record<string, string>): Promise<ConnectorObject[]> {
    const PgClient = await getPg();
    const client = new PgClient({ connectionString: creds.connection_string });
    const schema = creds.schema || "public";
    try {
      await client.connect();
      const res = await client.query(`
        SELECT
          t.table_name,
          t.table_type,
          (SELECT reltuples::bigint FROM pg_class WHERE relname = t.table_name) AS estimated_rows
        FROM information_schema.tables t
        WHERE t.table_schema = $1
          AND t.table_type IN ('BASE TABLE', 'VIEW')
        ORDER BY t.table_name
      `, [schema]);

      return res.rows.map((row: Record<string, unknown>) => {
        const name = String(row.table_name);
        return {
          id: name,
          name: name,
          table: name,
          description: `${row.table_type === "VIEW" ? "View" : "Table"}: ${schema}.${name}`,
          supportsIncremental: true,
          cursorField: "updated_at",
          estimatedRows: parseInt(String(row.estimated_rows ?? 0), 10) || undefined,
        };
      });
    } finally {
      try { await client.end(); } catch { /* ignore */ }
    }
  }

  async discoverSchema(objectId: string, creds: Record<string, string>): Promise<ConnectorField[]> {
    const PgClient = await getPg();
    const client = new PgClient({ connectionString: creds.connection_string });
    const schema = creds.schema || "public";
    try {
      await client.connect();
      const res = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2
        ORDER BY ordinal_position
      `, [schema, objectId]);

      return res.rows.map((col: Record<string, string>) => ({
        name: col.column_name,
        type: PG_TO_BQ[col.data_type.toLowerCase()] ?? "STRING",
        mode: col.is_nullable === "YES" ? "NULLABLE" : "REQUIRED",
      })) as ConnectorField[];
    } finally {
      try { await client.end(); } catch { /* ignore */ }
    }
  }

  async extract(objectId: string, creds: Record<string, string>, opts: ExtractOptions, log: LogFn): Promise<ExtractResult> {
    const PgClient = await getPg();
    const client = new PgClient({ connectionString: creds.connection_string });
    const schema = creds.schema || "public";
    const pageSize = opts.pageSize ?? 50_000;

    try {
      await client.connect();
      log("info", `Extracting ${schema}.${objectId}…`);

      let query: string;
      const params: unknown[] = [];

      if (opts.startDate) {
        // Incremental: try updated_at, then created_at
        query = `
          SELECT * FROM "${schema}"."${objectId}"
          WHERE (updated_at >= $1 OR created_at >= $1)
          ORDER BY COALESCE(updated_at, created_at) ASC
          LIMIT ${pageSize}
        `;
        params.push(opts.startDate);
        log("info", `Incremental mode: extracting rows since ${opts.startDate}`);
      } else {
        query = `SELECT * FROM "${schema}"."${objectId}" LIMIT ${pageSize}`;
      }

      const res = await client.query(query, params);
      log("success", `Extracted ${res.rows.length.toLocaleString()} rows from ${objectId}.`);

      const schemaFields = await this.discoverSchema(objectId, creds);

      return {
        rows: res.rows,
        schema: schemaFields,
        rowCount: res.rows.length,
        hasMore: res.rows.length === pageSize,
      };
    } finally {
      try { await client.end(); } catch { /* ignore */ }
    }
  }

  async health(creds: Record<string, string>): Promise<HealthResult> {
    const start = Date.now();
    const PgClient = await getPg();
    const client = new PgClient({ connectionString: creds.connection_string });
    try {
      await client.connect();
      const res = await client.query("SELECT version(), pg_database_size(current_database()) AS db_bytes");
      const latencyMs = Date.now() - start;
      return {
        ok: true,
        latencyMs,
        message: "Connection healthy",
        details: {
          version: res.rows[0]?.version,
          databaseSizeBytes: res.rows[0]?.db_bytes,
        },
      };
    } catch (e: unknown) {
      return { ok: false, latencyMs: Date.now() - start, message: String(e) };
    } finally {
      try { await client.end(); } catch { /* ignore */ }
    }
  }

  suggestedSchedule() { return "every_6h"; }
}

export const postgresqlConnector = new PostgreSQLConnector();
