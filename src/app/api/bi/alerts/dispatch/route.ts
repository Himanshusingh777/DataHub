// Removed — BI alert dispatch deleted
import { NextResponse } from "next/server";
export async function POST() {
  return NextResponse.json({ error: "BI features removed" }, { status: 404 });
}
