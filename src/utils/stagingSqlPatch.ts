/**
 * Build a reviewable SQL patch from staged grid changes (does not execute).
 */
import type { StagedChange, StagedCellEdit } from '../types';

export type PatchDialect = 'postgres' | 'mysql' | 'sqlite';

function quoteIdent(name: string, dialect: PatchDialect): string {
  if (dialect === 'mysql') return `\`${name.replace(/`/g, '``')}\``;
  return `"${name.replace(/"/g, '""')}"`;
}

function quoteTable(name: string, dialect: PatchDialect): string {
  return name
    .split('.')
    .map((p) => quoteIdent(p, dialect))
    .join('.');
}

function sqlLiteral(val: unknown): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number' && Number.isFinite(val)) return String(val);
  if (typeof val === 'bigint') return String(val);
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  return `'${String(val).replace(/'/g, "''")}'`;
}

function quotePk(pk: string | number, dialect: PatchDialect, pkColumn: string): string {
  if (typeof pk === 'string' && pk.startsWith('{') && pk.endsWith('}')) {
    try {
      const obj = JSON.parse(pk) as Record<string, unknown>;
      return Object.entries(obj)
        .map(([k, v]) => `${quoteIdent(k, dialect)} = ${sqlLiteral(v)}`)
        .join(' AND ');
    } catch {
      /* fall through */
    }
  }
  return `${quoteIdent(pkColumn, dialect)} = ${sqlLiteral(pk)}`;
}

export interface BuildStagingPatchOptions {
  stagedChanges: StagedChange[];
  stagedEdits: StagedCellEdit[];
  pkColumn: string;
  dialect: PatchDialect;
  /** Only include checked changes (default true). */
  checkedOnly?: boolean;
  message?: string;
  connectionName?: string;
}

/** Generate a SQL script from checked staged changes. */
export function buildStagingSqlPatch(opts: BuildStagingPatchOptions): string {
  const {
    stagedChanges,
    stagedEdits,
    pkColumn,
    dialect,
    checkedOnly = true,
    message,
    connectionName,
  } = opts;

  const changes = checkedOnly
    ? stagedChanges.filter((c) => c.checked)
    : stagedChanges;

  const lines: string[] = [
    '-- DevDash staged-edit SQL patch',
    `-- Generated: ${new Date().toISOString()}`,
  ];
  if (connectionName) lines.push(`-- Connection: ${connectionName}`);
  if (message) lines.push(`-- Message: ${message.replace(/\n/g, ' ')}`);
  lines.push('-- Review carefully before applying.');
  lines.push('BEGIN;');
  lines.push('');

  if (changes.length === 0) {
    lines.push('-- (no checked staged changes)');
    lines.push('ROLLBACK;');
    return lines.join('\n') + '\n';
  }

  const tables = [...new Set(changes.map((c) => c.tableName))];
  for (const tableName of tables) {
    const tableChanges = changes.filter((c) => c.tableName === tableName);
    const qt = quoteTable(tableName, dialect);
    lines.push(`-- Table: ${tableName}`);

    // UPDATEs — group by row
    const updates = tableChanges.filter((c) => c.changeType === 'update');
    if (updates.length > 0) {
      const rowMap = new Map<
        string | number,
        { pk: string | number; sets: Map<string, unknown> }
      >();
      for (const c of updates) {
        const matchingEdit = stagedEdits.find(
          (e) => e.rowId === c.rowId && e.columnName === c.columnName
        );
        const entry = rowMap.get(c.rowId) || {
          pk: c.rowId,
          sets: new Map<string, unknown>(),
        };
        const col = c.columnName || c.identifier;
        entry.sets.set(
          col,
          matchingEdit?.newValue ?? c.newValues?.[col] ?? null
        );
        rowMap.set(c.rowId, entry);
      }
      for (const r of rowMap.values()) {
        const setClause = [...r.sets.entries()]
          .map(([col, val]) => `${quoteIdent(col, dialect)} = ${sqlLiteral(val)}`)
          .join(', ');
        lines.push(
          `UPDATE ${qt} SET ${setClause} WHERE ${quotePk(r.pk, dialect, pkColumn)};`
        );
      }
    }

    // INSERTs
    const inserts = tableChanges.filter((c) => c.changeType === 'insert');
    for (const c of inserts) {
      const vals: Record<string, unknown> = { ...(c.newValues || {}) };
      for (const e of stagedEdits) {
        if (e.rowId === c.rowId) vals[e.columnName] = e.newValue;
      }
      const cols = Object.keys(vals).filter(
        (k) => vals[k] !== '' && vals[k] !== undefined
      );
      if (cols.length === 0) {
        lines.push(`-- skipped empty INSERT for ${tableName}`);
        continue;
      }
      const colList = cols.map((k) => quoteIdent(k, dialect)).join(', ');
      const valList = cols.map((k) => sqlLiteral(vals[k])).join(', ');
      lines.push(`INSERT INTO ${qt} (${colList}) VALUES (${valList});`);
    }

    // DELETEs
    const deletes = tableChanges.filter((c) => c.changeType === 'delete');
    for (const c of deletes) {
      lines.push(
        `DELETE FROM ${qt} WHERE ${quotePk(c.rowId, dialect, pkColumn)};`
      );
    }
    lines.push('');
  }

  lines.push('-- Change COMMIT to ROLLBACK to discard after review.');
  lines.push('COMMIT;');
  lines.push('');
  return lines.join('\n');
}

export function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/sql;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
