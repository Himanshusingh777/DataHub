import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const OPENAPI_SPEC = {
  openapi: "3.1.0",
  info: {
    title: "CrossTecch Data Platform API",
    version: "1.0.0",
    description: "REST API for the CrossTecch unified data integration and warehouse analytics platform.",
    contact: { name: "CrossTecch Support", email: "support@crosstecch.io" },
    license: { name: "Commercial", url: "https://crosstecch.io/terms" },
  },
  servers: [{ url: "https://your-instance.crosstecch.io", description: "Production" }],
  security: [{ BearerAuth: [] }],
  components: {
    securitySchemes: {
      BearerAuth: { type: "http", scheme: "bearer", bearerFormat: "API Key (ct_live_...)" },
    },
    schemas: {
      Flow: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          sourceId: { type: "string" },
          destId: { type: "string" },
          status: { type: "string", enum: ["active", "paused", "error", "draft"] },
          schedule: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      ConnectorCapability: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          category: { type: "string" },
          status: { type: "string", enum: ["production", "beta", "coming_soon"] },
          supportsIncremental: { type: "boolean" },
          supportsWebhooks: { type: "boolean" },
        },
      },
      QueryResult: {
        type: "object",
        properties: {
          columns: { type: "array", items: { type: "string" } },
          rows: { type: "array", items: { type: "object" } },
          rowCount: { type: "integer" },
          durationMs: { type: "integer" },
          bytesProcessed: { type: "string" },
        },
      },
      Error: {
        type: "object",
        properties: {
          error: { type: "string" },
          code: { type: "string" },
        },
      },
    },
  },
  paths: {
    "/api/health": {
      get: {
        summary: "Platform health check",
        security: [],
        responses: {
          "200": { description: "Platform is healthy", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, status: { type: "string" } } } } } },
        },
      },
    },
    "/api/flows": {
      get: {
        summary: "List flows",
        description: "Returns all data flows for the authenticated user.",
        responses: {
          "200": { description: "Flows list", content: { "application/json": { schema: { type: "object", properties: { flows: { type: "array", items: { "$ref": "#/components/schemas/Flow" } } } } } } },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { "$ref": "#/components/schemas/Error" } } } },
        },
      },
      post: {
        summary: "Create a flow",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["sourceId", "destId"],
                properties: {
                  sourceId: { type: "string" },
                  destId: { type: "string" },
                  schedule: { type: "string", example: "every_hour" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Flow created" },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/api/connectors/catalog": {
      get: {
        summary: "List available connectors",
        security: [],
        responses: {
          "200": { description: "Connector catalog", content: { "application/json": { schema: { type: "object", properties: { catalog: { type: "array", items: { "$ref": "#/components/schemas/ConnectorCapability" } } } } } } },
        },
      },
    },
    "/api/connectors/health": {
      get: {
        summary: "Connector health status",
        description: "Returns health check results for all configured connectors.",
        responses: {
          "200": { description: "Health results" },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/api/catalog": {
      get: {
        summary: "List warehouse tables",
        parameters: [
          { name: "search", in: "query", schema: { type: "string" } },
          { name: "connector", in: "query", schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Table catalog" },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/api/catalog/refresh": {
      post: {
        summary: "Re-discover schema",
        description: "Triggers schema discovery on all connected data sources.",
        responses: {
          "200": { description: "Refresh results with upserted counts" },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/api/query/run": {
      post: {
        summary: "Run a SQL query",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["sql"],
                properties: { sql: { type: "string", example: "SELECT * FROM `project.dataset.table` LIMIT 100" } },
              },
            },
          },
        },
        responses: {
          "200": { description: "Query result", content: { "application/json": { schema: { type: "object", properties: { result: { "$ref": "#/components/schemas/QueryResult" } } } } } },
          "400": { description: "Forbidden SQL or invalid query" },
        },
      },
    },
    "/api/query/saved": {
      get: { summary: "List saved queries", responses: { "200": { description: "Saved queries" } } },
      post: {
        summary: "Save a query",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["name", "sql"], properties: { name: { type: "string" }, sql: { type: "string" }, description: { type: "string" } } } } } },
        responses: { "201": { description: "Query saved" } },
      },
    },
    "/api/environments": {
      get: { summary: "List environments", responses: { "200": { description: "Environments list" } } },
      post: {
        summary: "Create environment",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["name"], properties: { name: { type: "string" }, color: { type: "string" } } } } } },
        responses: { "201": { description: "Environment created" } },
      },
    },
    "/api/observability": {
      get: { summary: "Platform observability snapshot", description: "Returns queue, worker, connector, and warehouse metrics.", responses: { "200": { description: "Observability payload" } } },
    },
    "/api/ai-ops/recommendations": {
      get: { summary: "AI recommendations", description: "Auto-derived recommendations from platform telemetry.", responses: { "200": { description: "Recommendations list" } } },
    },
    "/api/ai-ops/insights": {
      get: { summary: "AI insights and KPIs", responses: { "200": { description: "Insights payload" } } },
    },
    "/api/keys": {
      get: { summary: "List API keys", responses: { "200": { description: "API keys (without secrets)" } } },
      post: {
        summary: "Create API key",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["name"], properties: { name: { type: "string" }, scopes: { type: "array", items: { type: "string", enum: ["read", "write", "admin"] } } } } } } },
        responses: { "200": { description: "Created key with plaintext (only shown once)" } },
      },
    },
    "/api/keys/{id}": {
      delete: {
        summary: "Revoke API key",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Key revoked" } },
      },
    },
  },
};

export async function GET() {
  return NextResponse.json(OPENAPI_SPEC, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="crosstecch-openapi.json"',
      "Access-Control-Allow-Origin": "*",
    },
  });
}
