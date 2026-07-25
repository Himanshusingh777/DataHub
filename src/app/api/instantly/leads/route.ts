/**
 * /api/instantly/leads
 * Server-side proxy — Instantly API key resolved from encrypted vault.
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
  const campaignId = req.nextUrl.searchParams.get("campaign_id") ?? undefined;

  if (!key) return NextResponse.json({ leads: [], demo: true });

  try {
    const v2Url = campaignId
      ? `https://api.instantly.ai/api/v2/leads?campaign_id=${campaignId}&limit=100`
      : `https://api.instantly.ai/api/v2/leads?limit=100`;

    const v2Res = await fetch(v2Url, {
      headers: { Authorization: `Bearer ${key}` },
    });

    if (v2Res.ok) {
      const data = await v2Res.json();
      return NextResponse.json(data, { status: 200 });
    }

    // Fall back to v1
    const v1Url = campaignId
      ? `https://api.instantly.ai/api/v1/lead/list?api_key=${key}&campaign_id=${campaignId}&limit=100&skip=0`
      : `https://api.instantly.ai/api/v1/lead/list?api_key=${key}&limit=100&skip=0`;

    const v1Res = await fetch(v1Url);
    const data = await v1Res.json();
    return NextResponse.json(data, { status: v1Res.status });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
