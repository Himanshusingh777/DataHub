/**
 * Incremental Sync — checkpoint / watermark persistence.
 *
 * A flow running in incremental mode only pulls records newer than the last
 * successful checkpoint (the "watermark"), instead of re-extracting the whole
 * source object on every run. This module owns exactly that bookkeeping;
 * extraction still goes through the existing `ConnectorAdapter.extract()`
 * contract (its `startDate` param IS the watermark), and loading goes through
 * `loadToBigQueryIncremental()` in etl.ts (MERGE/UPSERT + automatic schema
 * evolution), added alongside — not instead of — the original full-refresh
 * `loadToBigQuery()`.
 */

import { getDb } from "./db";

export interface Checkpoint {
  flowId: string;
  cursorField: string | null;
  cursorValue: string | null;
  watermarkAt: number | null;
  rowsSince: number;
}

export function getCheckpoint(flowId: string): Checkpoint | null {
  const row = getDb()
    .prepare("SELECT flow_id, cursor_field, cursor_value, watermark_at, rows_since FROM sync_state WHERE flow_id = ?")
    .get(flowId) as
    | { flow_id: string; cursor_field: string | null; cursor_value: string | null; watermark_at: number | null; rows_since: number }
    | undefined;
  if (!row) return null;
  return {
    flowId: row.flow_id,
    cursorField: row.cursor_field,
    cursorValue: row.cursor_value,
    watermarkAt: row.watermark_at,
    rowsSince: row.rows_since,
  };
}

export function setCheckpoint(args: {
  flowId: string;
  cursorField: string;
  cursorValue: string;
  rowsThisRun: number;
}): void {
  const db = getDb();
  const now = Date.now();
  db.prepare(`
    INSERT INTO sync_state (flow_id, cursor_field, cursor_value, watermark_at, rows_since, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(flow_id) DO UPDATE SET
      cursor_field = excluded.cursor_field,
      cursor_value = excluded.cursor_value,
      watermark_at = excluded.watermark_at,
      rows_since   = sync_state.rows_since + excluded.rows_since,
      updated_at   = excluded.updated_at
  `).run(args.flowId, args.cursorField, args.cursorValue, now, args.rowsThisRun, now);
}

export function clearCheckpoint(flowId: string): void {
  getDb().prepare("DELETE FROM sync_state WHERE flow_id = ?").run(flowId);
}

/**
 * Candidate date/timestamp fields to use as the incremental cursor, in
 * preference order. Universal — no connector-specific field names beyond the
 * common "when was this record touched" vocabulary every source tends to use.
 */
const CURSOR_CANDIDATES = ["synced_at", "updated_at", "modified_at", "created_at", "range_end", "date"];

/**
 * Scan a batch of extracted rows and return the field + max value to use as
 * the next watermark. Returns null when no row carries a parseable date in
 * any candidate field — the caller should fall back to full refresh.
 */
export function computeWatermark(rows: Record<string, unknown>[]): { field: string; value: string } | null {
  if (!rows.length) return null;
  const sampleKeys = Object.keys(rows[0]);

  for (const field of CURSOR_CANDIDATES) {
    if (!sampleKeys.includes(field)) continue;
    let max: string | null = null;
    let maxTime = -Infinity;
    for (const r of rows) {
      const raw = r[field];
      if (raw === null || raw === undefined || raw === "") continue;
      const t = new Date(String(raw)).getTime();
      if (!isNaN(t) && t > maxTime) { maxTime = t; max = String(raw); }
    }
    if (max) return { field, value: max };
  }
  return null;
}

/** Is this flow configured to run incrementally? Column added via safe migration in db.ts. */
export function isIncrementalFlow(flow: { sync_mode?: string | null }): boolean {
  return flow.sync_mode === "incremental";
}
