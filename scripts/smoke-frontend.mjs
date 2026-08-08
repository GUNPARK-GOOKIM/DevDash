/**
 * Lightweight frontend pure-logic smoke checks (no vitest required).
 * Run: node scripts/smoke-frontend.mjs
 */
import assert from 'node:assert/strict';

// --- mirror of src/utils/sqlSafety.ts ---
const WRITE_RE =
  /^(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|REPLACE|CALL|MERGE)\b/i;
function stripLeadingSqlNoise(sql) {
  return sql
    .replace(/^\s*--[^\n]*\n/gm, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .trim();
}
function batchContainsWrite(statements) {
  return statements.some((stmt) => WRITE_RE.test(stripLeadingSqlNoise(stmt)));
}

// --- mirror of piiMask HASH fingerprint ---
function applyHashFp(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return `[fp:${(h >>> 0).toString(16).padStart(8, '0')}:${s.length}]`;
}

assert.equal(batchContainsWrite(['SELECT 1']), false);
assert.equal(batchContainsWrite(['SELECT 1', 'DROP TABLE t']), true);
assert.equal(batchContainsWrite(['-- c\nINSERT INTO t VALUES (1)']), true);
assert.equal(applyHashFp('a'), applyHashFp('a'));
assert.notEqual(applyHashFp('a'), applyHashFp('b'));

// QR size gate (mirrors src/utils/qrShare.ts)
const QR_MAX_PAYLOAD_CHARS = 2200;
const canEncodeAsQr = (payload) => payload.length > 0 && payload.length <= QR_MAX_PAYLOAD_CHARS;
assert.equal(canEncodeAsQr('short'), true);
assert.equal(canEncodeAsQr(''), false);
assert.equal(canEncodeAsQr('x'.repeat(2201)), false);

// Connection environment RO resolution (mirrors src/utils/connectionEnv.ts)
const resolveReadOnlyFlag = (conn) => {
  const env = conn.environment || 'dev';
  if (env === 'prod' && !conn.allow_writes_on_prod) return true;
  return !!conn.is_read_only;
};
assert.equal(resolveReadOnlyFlag({ environment: 'prod' }), true);
assert.equal(resolveReadOnlyFlag({ environment: 'prod', allow_writes_on_prod: true }), false);
assert.equal(resolveReadOnlyFlag({ environment: 'prod', allow_writes_on_prod: true, is_read_only: true }), true);
assert.equal(resolveReadOnlyFlag({ environment: 'dev', is_read_only: false }), false);
assert.equal(resolveReadOnlyFlag({ environment: 'staging', is_read_only: true }), true);

// Staging SQL patch (mirrors core of stagingSqlPatch.ts)
const sqlLiteral = (val) => {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  return `'${String(val).replace(/'/g, "''")}'`;
};
assert.equal(sqlLiteral("O'Brien"), "'O''Brien'");
assert.equal(sqlLiteral(null), 'NULL');
const patchHasBegin = (s) => s.includes('BEGIN;') && s.includes('COMMIT;');
assert.equal(patchHasBegin('BEGIN;\nUPDATE t SET a = 1;\nCOMMIT;\n'), true);

console.log('smoke-frontend: ok');
