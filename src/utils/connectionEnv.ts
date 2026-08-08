/**
 * Connection environment tags for DevDash safety UX.
 * Production defaults to server-enforced read-only unless explicitly overridden.
 */
import type { ConnectionConfig } from '../types';

export type ConnectionEnvironment = 'dev' | 'staging' | 'prod' | 'other';

export const CONNECTION_ENVIRONMENTS: {
  id: ConnectionEnvironment;
  label: string;
  short: string;
  description: string;
  /** Tailwind-ish class hints for badges */
  badgeClass: string;
  dotClass: string;
}[] = [
  {
    id: 'dev',
    label: 'Development',
    short: 'DEV',
    description: 'Local / sandbox. Writes allowed by default.',
    badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    dotClass: 'bg-emerald-400',
  },
  {
    id: 'staging',
    label: 'Staging',
    short: 'STG',
    description: 'Pre-production. Prefer caution; RO optional.',
    badgeClass: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    dotClass: 'bg-amber-400',
  },
  {
    id: 'prod',
    label: 'Production',
    short: 'PROD',
    description: 'Live data. Read-only unless you opt into writes.',
    badgeClass: 'bg-rose-500/15 text-rose-400 border-rose-500/40',
    dotClass: 'bg-rose-400',
  },
  {
    id: 'other',
    label: 'Other',
    short: 'OTH',
    description: 'Unclassified connection.',
    badgeClass: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
    dotClass: 'bg-slate-400',
  },
];

export function normalizeEnvironment(
  value: unknown
): ConnectionEnvironment {
  if (value === 'dev' || value === 'staging' || value === 'prod' || value === 'other') {
    return value;
  }
  // Legacy / missing → treat as dev (not prod) so we never force RO unexpectedly
  return 'dev';
}

export function getEnvironmentMeta(env?: ConnectionEnvironment | string | null) {
  const id = normalizeEnvironment(env);
  return CONNECTION_ENVIRONMENTS.find((e) => e.id === id)!;
}

/**
 * Effective read-only flag sent to the backend and used by UI gates.
 * Production is always RO unless `allow_writes_on_prod` is explicitly true.
 */
export function resolveReadOnlyFlag(conn: Pick<
  ConnectionConfig,
  'environment' | 'is_read_only' | 'allow_writes_on_prod'
>): boolean {
  const env = normalizeEnvironment(conn.environment);
  if (env === 'prod' && !conn.allow_writes_on_prod) {
    return true;
  }
  return !!conn.is_read_only;
}

/** Human-readable reason for RO status (status bar / tooltips). */
export function readOnlyReason(conn: Pick<
  ConnectionConfig,
  'environment' | 'is_read_only' | 'allow_writes_on_prod'
>): string | null {
  if (!resolveReadOnlyFlag(conn)) return null;
  const env = normalizeEnvironment(conn.environment);
  if (env === 'prod' && !conn.allow_writes_on_prod) {
    return 'Production connection — writes blocked (env protection)';
  }
  return 'Read-only connection';
}
