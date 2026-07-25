/**
 * Table-reference extraction for SQL-based lineage (src/app/api/lineage).
 *
 * This is regex-based FROM/JOIN scanning, not a full SQL parser — there's
 * no SQL-AST library in this project's dependencies, and a real parser is
 * out of scope for what lineage needs here (which table names appear in a
 * query, not full semantic analysis). It correctly handles the common real
 * cases: backtick-quoted BigQuery refs (`project.dataset.table`), bare
 * dataset.table, comma-joins, multiple FROM/JOIN clauses, and strips
 * trailing commas/parens so `FROM a, b` and `FROM (SELECT ...)` don't
 * produce garbage matches.
 */

const TABLE_REF_RE = /\b(?:FROM|JOIN)\s+`?([a-zA-Z0-9_][a-zA-Z0-9_.\-]*)`?/gi;

/** Every table/dataset.table/project.dataset.table reference found in `sql`, lowercased. */
export function extractTableRefs(sql: string): string[] {
  const refs = new Set<string>();
  for (const match of sql.matchAll(TABLE_REF_RE)) {
    const ref = match[1]?.replace(/[,)]+$/, "").trim().toLowerCase();
    if (ref) refs.add(ref);
  }
  return [...refs];
}

/**
 * True if `refs` (from extractTableRefs) contains a reference to
 * `tableName` — matching the bare name, or any `...dataset.tableName` /
 * `...project.dataset.tableName` qualified form.
 */
export function referencesTable(refs: string[], tableName: string): boolean {
  const needle = tableName.toLowerCase();
  return refs.some((ref) => ref === needle || ref.endsWith(`.${needle}`));
}
