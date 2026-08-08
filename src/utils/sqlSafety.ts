/** Detect write/DDL starting keywords on a single statement (comments already stripped preferred). */
const WRITE_RE =
  /^(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|REPLACE|CALL|MERGE)\b/i;

/** Strip leading SQL comments for keyword detection. */
export function stripLeadingSqlNoise(sql: string): string {
  return sql
    .replace(/^\s*--[^\n]*\n/gm, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .trim();
}

/** True if any statement in the batch looks like a write/DDL. */
export function batchContainsWrite(statements: string[]): boolean {
  return statements.some((stmt) => WRITE_RE.test(stripLeadingSqlNoise(stmt)));
}
