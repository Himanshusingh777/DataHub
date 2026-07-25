import { NextRequest, NextResponse } from "next/server";
import { initRegistry, listConnectors } from "@/lib/connectors/registry";
import { getAuthContext } from "@/lib/server/auth-utils";
import { getDb } from "@/lib/server/db";
import { decrypt } from "@/lib/server/crypto";

export const dynamic = "force-dynamic";

interface HealthEntry {
  connectorId: string;
  ok: boolean;
  latencyMs: number;
  message: string;
  lastChecked: string;
}

export async function GET(req: NextRequest) {
  const { userId, workspaceId } = getAuthContext(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  initRegistry();
  const connectors = listConnectors();
  const db = getDb();
  const now = new Date().toISOString();

  const results: HealthEntry[] = await Promise.all(
    connectors.map(async (connector) => {
      const id = connector.metadata.id;
      try {
        // Load credentials — try user's own first, then shared/admin fallback
        let row = db.prepare(
          "SELECT data FROM credentials WHERE user_id = ? AND service = ? LIMIT 1"
        ).get(userId, id) as { data: string } | undefined;
        if (!row) {
          row = db.prepare(
            "SELECT data FROM credentials WHERE service = ? LIMIT 1"
          ).get(id) as { data: string } | undefined;
        }

        if (!row) {
          return { connectorId: id, ok: false, latencyMs: 0, message: "No credentials configured", lastChecked: now };
        }

        let creds: Record<string, string> = {};
        try {
          creds = JSON.parse(decrypt(row.data));
        } catch {
          return { connectorId: id, ok: false, latencyMs: 0, message: "Credential decryption failed", lastChecked: now };
        }

        const result = await connector.health(creds);
        return {
          connectorId: id,
          ok: result.ok,
          latencyMs: result.latencyMs,
          message: result.message ?? (result.ok ? "Healthy" : "Degraded"),
          lastChecked: now,
        };
      } catch (e: unknown) {
        return {
          connectorId: id,
          ok: false,
          latencyMs: 0,
          message: String(e),
          lastChecked: now,
        };
      }
    })
  );

  return NextResponse.json({ health: results });
}
