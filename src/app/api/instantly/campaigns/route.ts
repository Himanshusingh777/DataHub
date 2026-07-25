/**
 * /api/instantly/campaigns
 *
 * Server-side proxy for the Instantly API.
 * The API key is resolved from the authenticated user's encrypted credential
 * vault — never from the client (no `key` query param accepted).
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getUserId } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { decrypt } from "@/lib/server/crypto";

function getInstantlyKey(userId: string): string | null {
  try {
    const db = getDb();
    const row = db
      .prepare("SELECT data FROM credentials WHERE user_id = ? AND service = 'instantly'")
      .get(userId) as { data: string } | undefined;
    if (!row) return null;
    const creds = JSON.parse(decrypt(row.data)) as Record<string, string>;
    return creds.api_key ?? null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  const key = getInstantlyKey(userId);

  if (!key) {
    // Return empty — caller falls back to demo data
    return NextResponse.json({ items: [], demo: true });
  }

  try {
    // Try Instantly v2 first (Bearer token)
    const v2Res = await fetch("https://api.instantly.ai/api/v2/campaigns?limit=100", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (v2Res.ok) {
      const data = await v2Res.json();
      return NextResponse.json(data, { status: 200 });
    }

    // Fallback: v1
    const v1Res = await fetch(
      `https://api.instantly.ai/api/v1/campaign/list?api_key=${key}&limit=100&skip=0`
    );
    const data = await v1Res.json();
    return NextResponse.json(data, { status: v1Res.status });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
