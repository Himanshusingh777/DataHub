import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/server/auth-utils";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Re-derive recommendations fresh (delegates to the GET route logic)
  const base = req.nextUrl.clone();
  base.pathname = "/api/ai-ops/recommendations";
  const res = await fetch(base.toString(), {
    headers: { cookie: req.headers.get("cookie") ?? "" },
  });
  const data = await res.json();
  return NextResponse.json(data);
}
