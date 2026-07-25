import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") ?? "";
  const id  = req.nextUrl.searchParams.get("id")  ?? "ffd66ea9-f121-48f3-8318-bd801b8551b7";

  const h = { Authorization: `Bearer ${key}` };
  const results: Record<string, any> = {};

  // Test multiple URL formats
  const urls = [
    `https://api.instantly.ai/api/v2/analytics/campaign/count?id=${id}`,
    `https://api.instantly.ai/api/v2/analytics/campaign/count?campaign_id=${id}`,
    `https://api.instantly.ai/api/v2/campaigns/${id}/analytics`,
    `https://api.instantly.ai/api/v2/campaign/analytics/overview?campaign_id=${id}`,
    `https://api.instantly.ai/api/v2/analytics/overview?campaign_id=${id}`,
  ];

  for (const url of urls) {
    try {
      const r = await fetch(url, { headers: h });
      const text = await r.text();
      let data;
      try { data = JSON.parse(text); } catch { data = text; }
      results[url.replace("https://api.instantly.ai", "")] = { status: r.status, data };
    } catch (e) {
      results[url.replace("https://api.instantly.ai", "")] = { error: String(e) };
    }
  }

  return NextResponse.json(results);
}
