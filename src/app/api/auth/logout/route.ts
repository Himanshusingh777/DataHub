import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { destroySession, SESSION_COOKIE } from "@/lib/server/auth";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) { try { destroySession(token); } catch { /* ignore */ } }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", expires: new Date(0) });
  return res;
}
