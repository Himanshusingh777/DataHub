/**
 * GET /api/instantly/analytics
 *
 * Reads the Instantly API key from the server-side encrypted vault.
 * API keys are NEVER accepted via query param or request body from the client.
 *
 * Optional query params (non-sensitive):
 *   start_date=YYYY-MM-DD
 *   end_date=YYYY-MM-DD
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getUserId } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { decrypt } from "@/lib/server/crypto";

export const dynamic = "force-dynamic";

function mapStatus(s: unknown): string {
  if (typeof s === "number") {
    const m: Record<number, string> = { 0: "draft", 1: "active", 2: "paused", 3: "completed", 4: "stopped" };
    return m[s] ?? "draft";
  }
  return String(s ?? "draft").toLowerCase();
}

// Instantly v1 API expects MM-DD-YYYY dates (ISO YYYY-MM-DD gets ignored)
function toV1Date(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[2]}-${m[3]}-${m[1]}` : iso;
}

export async function GET(req: NextRequest) {
  const startDate = req.nextUrl.searchParams.get("start_date") ?? "";
  const endDate   = req.nextUrl.searchParams.get("end_date")   ?? "";

  // Read API key from server-side vault — never from query params
  const userId = await getUserId(req);
  let key = "";
  try {
    const row = await getDb()
      .prepare("SELECT data FROM credentials WHERE user_id = ? AND service = 'instantly'")
      .get(userId) as { data: string } | undefined;
    if (row) {
      const creds = JSON.parse(decrypt(row.data)) as Record<string, string>;
      key = creds.api_key ?? "";
    }
  } catch { /* vault not ready */ }

  if (!key) {
    return NextResponse.json(
      { error: "Instantly API key not configured — add it in Settings → Integrations.", notConfigured: true },
      { status: 404 }
    );
  }

  const v2H  = { Authorization: `Bearer ${key}` };
  const dateQ = [
    startDate ? `start_date=${toV1Date(startDate)}` : "",
    endDate   ? `end_date=${toV1Date(endDate)}`     : "",
  ].filter(Boolean).join("&");

  // ── Step 1: get campaigns ────────────────────────────────────────────────────
  let campaigns: any[] = [];
  let isV2 = false;

  // Try v2 first
  const campV2 = await fetch("https://api.instantly.ai/api/v2/campaigns?limit=100", { headers: v2H }).catch(() => null);
  if (campV2?.ok) {
    const raw = await campV2.json();
    campaigns = Array.isArray(raw) ? raw : (raw?.items ?? raw?.campaigns ?? []);
    campaigns = campaigns.map((c: any) => ({
      ...c,
      // v2 uses campaign_name, normalize to name
      name: c.name ?? c.campaign_name ?? "Unnamed",
      status: mapStatus(c.status),
    }));
    isV2 = true;
  } else {
    // Try v1
    const campV1 = await fetch(`https://api.instantly.ai/api/v1/campaign/list?api_key=${key}&limit=100&skip=0`).catch(() => null);
    if (campV1?.ok) {
      const raw = await campV1.json();
      campaigns = Array.isArray(raw) ? raw : [];
    }
  }

  // ── Step 2: get analytics ────────────────────────────────────────────────────
  const analyticsMap: Record<string, any> = {};

  // V1 analytics per-campaign, batch 15 at a time to avoid rate limits.
  // "summary" ignores dates (always all-time). For date filtering use the
  // "count" endpoint which returns daily rows we aggregate ourselves.
  const useDates = Boolean(startDate || endDate);
  const toFetch = campaigns.slice(0, 100);
  for (let i = 0; i < toFetch.length; i += 15) {
    await Promise.allSettled(
      toFetch.slice(i, i + 15).map(async (c: any) => {
        const cid = c.id ?? c.campaign_id;
        if (!cid) return;
        try {
          if (useDates) {
            // Date-filtered daily counts
            const url = `https://api.instantly.ai/api/v1/analytics/campaign/count?api_key=${key}&campaign_id=${cid}&${dateQ}`;
            const r = await fetch(url);
            if (r.ok) {
              const d = await r.json();
              // Response may be an array of daily rows or a totals object
              const rows: any[] = Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : [d]);
              const sum = (...keys: string[]) =>
                rows.reduce((s, row) => {
                  if (!row || typeof row !== "object") return s;
                  for (const k of keys) {
                    const v = Number(row[k]);
                    if (!isNaN(v) && v > 0) return s + v;
                  }
                  return s;
                }, 0);
              analyticsMap[cid] = {
                contacted:         sum("sent", "emails_sent", "sent_count", "contacted"),
                leads_who_read:    sum("unique_opened", "opened", "opens", "leads_who_read"),
                leads_who_replied: sum("replies", "unique_replies", "replied", "leads_who_replied"),
                total_leads:       sum("new_leads_contacted", "total_leads", "leads"),
                bounced:           sum("bounced", "bounces"),
              };
              return;
            }
          }
          // Fallback / no dates: all-time summary
          const url = `https://api.instantly.ai/api/v1/analytics/campaign/summary?api_key=${key}&campaign_id=${cid}`;
          const r = await fetch(url);
          if (r.ok) analyticsMap[cid] = await r.json();
        } catch { /* skip */ }
      })
    );
  }

  // ── Step 3: merge ────────────────────────────────────────────────────────────
  const merged = campaigns.map((c: any) => {
    const stats = analyticsMap[c.id ?? c.campaign_id] ?? {};
    return { ...c, ...stats, status: c.status };
  });

  // ── Step 4: bucket chart data ─────────────────────────────────────────────────
  const bucketMap: Record<string, number> = {};
  merged.forEach((c: any) => {
    const sent = Number(c.contacted ?? c.new_sent_count ?? c.emails_sent_count ?? c.sent_count ?? 0) || 0;
    if (!sent) return;
    const match = (c.name ?? "").match(/\(?(IBK|IBN|WB|Shivaami|SHV|SHIP)\s*[\d_]*/i);
    const bucket = match ? match[0].replace(/[()]/g, "").replace(/[\s_]\d+$/, "").trim().toUpperCase() : "Other";
    bucketMap[bucket] = (bucketMap[bucket] ?? 0) + sent;
  });

  const accountStats = Object.entries(bucketMap)
    .map(([name, sent]) => ({ name, sent }))
    .sort((a, b) => b.sent - a.sent);

  return NextResponse.json({ campaigns: merged, accounts: [], accountStats });
}
