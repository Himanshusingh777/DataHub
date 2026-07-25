import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") ?? "";

  const results: Record<string, any> = {};

  // Test v1 endpoints
  const tests = [
    { name: "v1_campaign_list", url: `https://api.instantly.ai/api/v1/campaign/list?api_key=${key}&limit=3&skip=0` },
    { name: "v1_analytics_bulk", url: `https://api.instantly.ai/api/v1/analytics/campaign/summary?api_key=${key}` },
    { name: "v1_analytics_one", url: `https://api.instantly.ai/api/v1/analytics/campaign/summary?api_key=${key}&campaign_id=ffd66ea9-f121-48f3-8318-bd801b8551b7` },
    { name: "v1_analytics_count", url: `https://api.instantly.ai/api/v1/analytics/campaign/count?api_key=${key}&campaign_id=ffd66ea9-f121-48f3-8318-bd801b8551b7&start_date=06-01-2026&end_date=07-19-2026` },
    { name: "v2_campaigns", url: "https://api.instantly.ai/api/v2/campaigns?limit=3", bearer: true },
  ];

  for (const t of tests) {
    try {
      const headers: any = t.bearer ? { Authorization: `Bearer ${key}` } : {};
      const r = await fetch(t.url, { headers });
      const text = await r.text();
      let data;
      try { data = JSON.parse(text); } catch { data = text.slice(0, 200); }

      // For arrays, just show count + first item
      if (Array.isArray(data)) {
        results[t.name] = { status: r.status, count: data.length, first: data[0] };
      } else {
        results[t.name] = { status: r.status, data };
      }
    } catch (e) {
      results[t.name] = { error: String(e) };
    }
  }

  return NextResponse.json(results);
}
