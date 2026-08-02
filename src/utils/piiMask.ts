export type PiiMaskType = 'FULL' | 'PARTIAL_EMAIL' | 'LAST_FOUR' | 'HASH_SHA256';

export interface PiiMaskRuleLike {
  fieldPattern: string;
  maskType: PiiMaskType;
  enabled: boolean;
}

/** Apply a single PII mask rule to a display/export value. Sync-safe (no async crypto). */
export function applyPiiMask(colName: string, val: unknown, rules?: PiiMaskRuleLike[]): unknown {
  if (val === null || val === undefined || !rules?.length) return val;
  const lower = colName.toLowerCase();
  const rule = rules.find((r) => r.enabled && lower.includes(r.fieldPattern.toLowerCase()));
  if (!rule) return val;
  const s = String(val);
  switch (rule.maskType) {
    case 'FULL':
      return '••••••••';
    case 'LAST_FOUR':
      return s.length <= 4 ? '••••' : `${'•'.repeat(Math.max(0, s.length - 4))}${s.slice(-4)}`;
    case 'PARTIAL_EMAIL': {
      const at = s.indexOf('@');
      if (at <= 1) return '•••@•••';
      return `${s[0]}***${s[at - 1] || ''}@${s.slice(at + 1)}`;
    }
    case 'HASH_SHA256': {
      // Sync fingerprint for grid/export (not a cryptographic SHA-256; avoids async Web Crypto).
      // Stable across renders so sorted/filtered grids stay consistent.
      let h = 5381;
      for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
      return `[fp:${(h >>> 0).toString(16).padStart(8, '0')}:${s.length}]`;
    }
    default:
      return val;
  }
}

/** Return a shallow-cloned row with enabled PII rules applied to matching columns. */
export function maskRowRecord(
  row: Record<string, unknown>,
  columnNames: string[],
  rules?: PiiMaskRuleLike[]
): Record<string, unknown> {
  if (!rules?.length) return row;
  const out: Record<string, unknown> = { ...row };
  for (const col of columnNames) {
    out[col] = applyPiiMask(col, row[col], rules);
  }
  return out;
}
