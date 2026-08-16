/**
 * POST /api/bigquery/test
 *
 * Verifies BigQuery credentials for real:
 *   1. Initializes a BigQuery client from the Service Account JSON
 *   2. Runs a trivial query to prove auth works
 *   3. Ensures the dataset exists (creates it if missing)
 *
 * Body: { projectId: string, dataset: string, serviceJson: string }
 * Requires: npm install @google-cloud/bigquery
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { BigQuery } from "@google-cloud/bigquery";
import { getUserId } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { decrypt } from "@/lib/server/crypto";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { projectId?: string; dataset?: string; serviceJson?: string } = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }

  let projectId  = body.projectId?.trim();
  let dataset    = body.dataset?.trim();
  let bqLocation = process.env.BIGQUERY_DEFAULT_LOCATION ?? "US";
  let credentials: Record<string, string> | undefined;

  if (!projectId || !dataset || !body.serviceJson) {
    // Read from encrypted vault (Settings page path)
    const userId = await getUserId(req);
    const row = await getDb()
      .prepare("SELECT data FROM credentials WHERE user_id = ? AND service = 'bigquery'")
      .get(userId) as { data: string } | undefined;

    if (!row) {
      return NextResponse.json({ ok: false, error: "BigQuery credentials not found in vault — fill in the fields above and click Save first." }, { status: 404 });
    }
    try {
      const creds = JSON.parse(decrypt(row.data)) as Record<string, string>;
      projectId   = creds.project_id?.trim();
      dataset     = creds.dataset?.trim();
      bqLocation  = (creds.location ?? process.env.BIGQUERY_DEFAULT_LOCATION ?? "US").trim();
      credentials = JSON.parse(creds.service_json);
    } catch {
      return NextResponse.json({ ok: false, error: "Failed to read vault credentials." }, { status: 500 });
    }
  } else {
    try {
      credentials = JSON.parse(body.serviceJson!);
    } catch {
      return NextResponse.json({ ok: false, error: "Service Account JSON is not valid JSON" }, { status: 400 });
    }
  }

  if (!projectId || !dataset || !credentials) {
    return NextResponse.json({ ok: false, error: "projectId, dataset and serviceJson are required" }, { status: 400 });
  }
  if (!credentials.private_key || !credentials.client_email) {
    return NextResponse.json({ ok: false, error: "Service Account JSON is missing private_key / client_email" }, { status: 400 });
  }

  try {
    const bq = new BigQuery({ projectId, credentials });

    // 1. Prove auth works
    await bq.query("SELECT 1");

    // 2. Ensure dataset exists (create if missing)
    const ds = bq.dataset(dataset);
    const [exists] = await ds.exists();
    let created = false;
    if (!exists) {
      await bq.createDataset(dataset, { location: process.env.BIGQUERY_DEFAULT_LOCATION ?? "US" });
      created = true;
    }

    return NextResponse.json({
      ok: true,
      projectId,
      dataset,
      datasetCreated: created,
      serviceAccount: credentials.client_email,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Friendlier messages for common failures
    const friendly = /invalid_grant|PEM|DECODER/i.test(msg)
      ? "Service Account key is invalid or revoked — download a fresh JSON key from GCP Console."
      : /Permission|denied|403/i.test(msg)
      ? "Permission denied — give the service account the 'BigQuery Data Editor' and 'BigQuery Job User' roles."
      : /Not found|404/i.test(msg)
      ? "Project not found — check the Project ID."
      : msg;
    return NextResponse.json({ ok: false, error: friendly }, { status: 500 });
  }
}
