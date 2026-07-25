import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/server/auth-utils";

export const dynamic = "force-dynamic";

// Dismiss is client-side state only for now (no persistent store for dismissals)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, dismissed: id });
}
