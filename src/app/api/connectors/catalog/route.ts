import { NextResponse } from "next/server";
import { CONNECTOR_CATALOG } from "@/lib/connectors/registry";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ catalog: CONNECTOR_CATALOG });
}
