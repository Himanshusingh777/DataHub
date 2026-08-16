/**
 * Shared read-only SQL guard.
 *
 * Extracted from the identical inline check that existed separately in
 * api/models/route.ts, api/models/[id]/route.ts, api/models/preview/route.ts,
 * and api/dashboard/query/route.ts — this is the single copy new callers
 * (the AI SQL Assistant) should use. The four existing call sites are left
 * as-is; only new code is required to go through this module.
 *
 * Only SELECT / WITH statements are permitted. Everything else — DDL, DML,
 * scripting statements — is rejected by keyword, not by a full parser
 * (there's no SQL-AST dependency in this project).
 */

const FORBIDDEN = /\b(insert|update|delete|drop|create|alter|merge|truncate|grant|revoke|call|begin|commit|export)\b/i;

export type SqlSafetyResult = { ok: true } | { ok: false; error: string };

export function validateReadOnlySql(sql: string): SqlSafetyResult {
  const stripped = sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim();

  if (!stripped) return { ok: false, error: "No SQL was generated." };
  if (!/^(select|with)\b/i.test(stripped)) {
    return { ok: false, error: "Only SELECT / WITH queries are permitted." };
  }
  if (FORBIDDEN.test(stripped)) {
    return { ok: false, error: "Write / DDL statements are not allowed." };
  }
  return { ok: true };
}
