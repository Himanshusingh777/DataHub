import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/auth";

export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  return NextResponse.json({ ok: true, user });
}
