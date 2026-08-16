/**
 * POST /api/connectors/auth
 *
 * Verifies credentials for any registered connector.
 * Body: { connectorId: string, creds: Record<string, string> }
 * Returns: { ok: true, mappedCreds } or { ok: false, error: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/server/auth";
import { getAdapterAsync } from "@/lib/server/connectors";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { userId } = await getAuthContext(req);
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  let body: { connectorId?: string; creds?: Record<string, string> };
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { connectorId, creds } = body;
  if (!connectorId || !creds) {
    return NextResponse.json({ ok: false, error: "connectorId and creds required" }, { status: 400 });
  }

  try {
    // getAdapterAsync loads both direct adapters (Instantly, CSV) and SDK-wrapped adapters
    const adapter = await getAdapterAsync(connectorId);
    if (!adapter) {
      return NextResponse.json({ ok: false, error: `Unknown connector: ${connectorId}` }, { status: 404 });
    }

    // Map wizard field names → adapter field names, keep both so vault has what the runner needs
    const mappedCreds = mapCredFields(connectorId, creds);

    const error = await adapter.authenticate(mappedCreds);
    if (error) {
      return NextResponse.json({ ok: false, error });
    }

    // Return mappedCreds so wizard saves the correct keys to the credential vault
    return NextResponse.json({ ok: true, mappedCreds });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

/**
 * Maps wizard UI field names → adapter/runner credential keys.
 * Saves both original and mapped keys so nothing is lost.
 */
function mapCredFields(connectorId: string, creds: Record<string, string>): Record<string, string> {
  const mapped = { ...creds };

  switch (connectorId) {
    case "instantly":
      // wizard: api_key → adapter: api_key (already correct)
      break;
    case "hubspot":
      // wizard: api_key → adapter: access_token
      if (mapped.api_key && !mapped.access_token) {
        mapped.access_token = mapped.api_key;
      }
      break;
    case "shopify":
      // wizard: admin_api_access_token → adapter: access_token
      if (mapped.admin_api_access_token && !mapped.access_token) {
        mapped.access_token = mapped.admin_api_access_token;
      }
      break;
    case "stripe":
      // wizard: api_key → adapter: api_key (already correct)
      break;
    case "google-sheets":
      // wizard: service_account_json, spreadsheet_id → adapter: same
      break;
    case "postgresql":
      // wizard fields match adapter fields
      break;
  }

  return mapped;
}
