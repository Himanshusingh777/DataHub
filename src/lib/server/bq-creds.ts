/**
 * Workspace-scoped BigQuery credential resolution.
 *
 * Resolution order for a given (workspaceId, userId):
 *   1. Workspace-level credential  — WHERE workspace_id = ? AND service = 'bigquery'
 *   2. User's own credential       — WHERE user_id = ? AND service = 'bigquery'
 *
 * There is intentionally no third "any credential in the vault" fallback —
 * that used to return ANY tenant's BigQuery credential to a workspace that
 * had none configured, which is a cross-tenant data-exposure bug. A
 * workspace/user with no BigQuery credential of their own must get `null`
 * (fail closed), never someone else's.
 *
 * The dataset returned is:
 *   - The workspace's own dataset_id  (if set in the workspaces table)  — preferred
 *   - The dataset stored in the credential blob                          — fallback
 */

import { getDb } from "./db";
import { decrypt } from "./crypto";

export interface BqCreds {
  projectId: string;
  dataset: string;        // resolved dataset — may come from workspace or credential
  credentials: Record<string, string>;
  location: string;
}

/**
 * Resolve BigQuery credentials for a workspace + user pair.
 * Returns null if no BQ credentials are configured anywhere.
 */
export function resolveBqCreds(
  userId: string,
  workspaceId?: string
): BqCreds | null {
  const db = getDb();

  // 1. Workspace-level credential
  let row: { data: string } | undefined;
  if (workspaceId && workspaceId !== "default") {
    row = db
      .prepare("SELECT data FROM credentials WHERE workspace_id = ? AND service = 'bigquery' LIMIT 1")
      .get(workspaceId) as { data: string } | undefined;
  }

  // 2. User's own credential
  if (!row) {
    row = db
      .prepare("SELECT data FROM credentials WHERE user_id = ? AND service = 'bigquery'")
      .get(userId) as { data: string } | undefined;
  }

  if (!row) return null;

  try {
    const creds = JSON.parse(decrypt(row.data)) as Record<string, string>;
    if (!creds.project_id || !creds.service_json) return null;

    // Prefer workspace dataset_id from the workspaces table if set
    let dataset = (creds.dataset ?? "").trim();
    if (workspaceId && workspaceId !== "default") {
      const ws = db
        .prepare("SELECT dataset_id FROM workspaces WHERE id = ?")
        .get(workspaceId) as { dataset_id: string | null } | undefined;
      if (ws?.dataset_id) dataset = ws.dataset_id;
    }

    // Final fallback: use the known default dataset
    if (!dataset) dataset = process.env.BIGQUERY_DEFAULT_DATASET ?? "crosstecch_data";

    return {
      projectId: creds.project_id.trim(),
      dataset,
      credentials: JSON.parse(creds.service_json),
      location: (creds.location ?? process.env.BIGQUERY_DEFAULT_LOCATION ?? "US").trim(),
    };
  } catch {
    return null;
  }
}

/**
 * Resolve BQ creds given a flow row (which may carry its own `dataset` override).
 * Flow dataset > workspace dataset > credential dataset.
 */
export function resolveBqCredsForFlow(
  userId: string,
  workspaceId: string,
  flowDataset?: string | null
): BqCreds | null {
  const base = resolveBqCreds(userId, workspaceId);
  if (!base) return null;
  if (flowDataset) return { ...base, dataset: flowDataset };
  return base;
}
