import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { GitCompare, X, Copy, ArrowRight, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { ConnectionConfig } from '../types';
import {
  generateMigrationSql,
  getDatabaseTables,
  getTableColumns,
  isEngineSupported,
  applyMigrationSql,
  listMigrationRuns,
  EngineDialect,
  MigrationDiffResultPayload,
  MigrationRunRecord,
} from '../services/tauriBridge';

interface SchemaDiffModalProps {
  isOpen: boolean;
  onClose: () => void;
  connections: ConnectionConfig[];
  activeConnectionId?: string;
}

interface TableDiffSummary {
  tableName: string;
  result: MigrationDiffResultPayload;
  onlyInSource: boolean;
  onlyInTarget: boolean;
}

function mapDialect(dbType?: string): EngineDialect {
  const t = (dbType || 'postgres').toLowerCase();
  if (t === 'mysql' || t === 'mariadb') return 'mysql';
  if (t === 'sqlite') return 'sqlite';
  return 'postgres';
}

export const SchemaDiffModal: React.FC<SchemaDiffModalProps> = ({
  isOpen,
  onClose,
  connections,
  activeConnectionId,
}) => {
  const connected = useMemo(
    () => connections.filter((c) => c.is_connected && isEngineSupported(c.db_type)),
    [connections]
  );

  const [sourceId, setSourceId] = useState<string>('');
  const [targetId, setTargetId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diffs, setDiffs] = useState<TableDiffSummary[]>([]);
  const [tablesOnlySource, setTablesOnlySource] = useState<string[]>([]);
  const [tablesOnlyTarget, setTablesOnlyTarget] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyMsg, setApplyMsg] = useState<string | null>(null);
  const [history, setHistory] = useState<MigrationRunRecord[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    const preferred = activeConnectionId && connected.some((c) => c.id === activeConnectionId)
      ? activeConnectionId
      : connected[0]?.id || '';
    setSourceId(preferred);
    const other = connected.find((c) => c.id !== preferred)?.id || preferred;
    setTargetId(other);
    setDiffs([]);
    setTablesOnlySource([]);
    setTablesOnlyTarget([]);
    setError(null);
    setCopied(false);
  }, [isOpen, connected, activeConnectionId]);

  const sourceConn = connected.find((c) => c.id === sourceId);
  const targetConn = connected.find((c) => c.id === targetId);

  const runDiff = useCallback(async () => {
    if (!sourceConn || !targetConn) {
      setError('Select two connected databases (open each connection first).');
      return;
    }
    if (sourceConn.id === targetConn.id) {
      setError('Source and target are the same connection. Connect a second database to compare.');
      setDiffs([]);
      setTablesOnlySource([]);
      setTablesOnlyTarget([]);
      return;
    }
    if (mapDialect(sourceConn.db_type) !== mapDialect(targetConn.db_type)) {
      setError(
        `Engines differ (${sourceConn.db_type} vs ${targetConn.db_type}). DDL may need manual adjustment.`
      );
      // continue with target dialect
    } else {
      setError(null);
    }

    setLoading(true);
    setCopied(false);
    try {
      const engine = mapDialect(targetConn.db_type);
      const [sourceTables, targetTables] = await Promise.all([
        getDatabaseTables(sourceConn.id, sourceConn.db_type),
        getDatabaseTables(targetConn.id, targetConn.db_type),
      ]);

      const qname = (t: { name: string; qualified_name?: string; schema?: string }) =>
        t.qualified_name ||
        (t.schema && t.schema !== 'main' ? `${t.schema}.${t.name}` : t.name);

      const sourceNames = new Set(sourceTables.map((t) => qname(t).toLowerCase()));
      const targetNames = new Set(targetTables.map((t) => qname(t).toLowerCase()));

      const onlySource = sourceTables
        .filter((t) => !targetNames.has(qname(t).toLowerCase()))
        .map((t) => qname(t));
      const onlyTarget = targetTables
        .filter((t) => !sourceNames.has(qname(t).toLowerCase()))
        .map((t) => qname(t));

      setTablesOnlySource(onlySource);
      setTablesOnlyTarget(onlyTarget);

      const shared = sourceTables.filter((t) => targetNames.has(qname(t).toLowerCase()));
      const tableDiffs: TableDiffSummary[] = [];

      // Diff shared tables (snapshot = target/current prod, current = source/desired)
      for (const tbl of shared) {
        const srcKey = qname(tbl);
        const targetTbl =
          targetTables.find((t) => qname(t).toLowerCase() === srcKey.toLowerCase()) || tbl;
        const tgtKey = qname(targetTbl);
        // Use bare name for migration SQL table identifier when same schema
        const bareName = tbl.name;
        const [srcCols, tgtCols] = await Promise.all([
          getTableColumns(sourceConn.id, sourceConn.db_type, srcKey),
          getTableColumns(targetConn.id, targetConn.db_type, tgtKey),
        ]);

        const snapshot = {
          table_name: bareName,
          columns: tgtCols.map((c) => ({
            name: c.name,
            data_type: c.data_type,
            is_nullable: c.is_nullable,
            is_primary_key: c.is_primary_key,
          })),
        };
        const desired = {
          table_name: bareName,
          columns: srcCols.map((c) => ({
            name: c.name,
            data_type: c.data_type,
            is_nullable: c.is_nullable,
            is_primary_key: c.is_primary_key,
          })),
        };

        const result = await generateMigrationSql(snapshot, desired, engine);
        if (result.sql_statements.length > 0 || result.added_columns.length > 0 || result.removed_columns.length > 0) {
          tableDiffs.push({
            tableName: srcKey,
            result,
            onlyInSource: false,
            onlyInTarget: false,
          });
        }
      }

      setDiffs(tableDiffs);
      // Keep engine-mismatch advisory if set; only clear hard errors on empty success
      if (
        tableDiffs.length === 0 &&
        onlySource.length === 0 &&
        onlyTarget.length === 0 &&
        mapDialect(sourceConn.db_type) === mapDialect(targetConn.db_type)
      ) {
        setError(null);
      }
    } catch (err) {
      setError(String(err));
      setDiffs([]);
    } finally {
      setLoading(false);
    }
  }, [sourceConn, targetConn]);

  const generatedSql = useMemo(() => {
    if (!sourceConn || !targetConn) return '';
    const lines: string[] = [
      `-- Schema migration: ${sourceConn.name} (source) → ${targetConn.name} (target)`,
      `-- Generated by DevDash. Review carefully before applying.`,
      '',
    ];

    for (const name of tablesOnlySource) {
      lines.push(`-- Table exists only in source: ${name}`);
      lines.push(`-- TODO: CREATE TABLE ${name} (...); -- export DDL from Structure view`);
      lines.push('');
    }
    for (const name of tablesOnlyTarget) {
      lines.push(`-- Table exists only in target: ${name}`);
      lines.push(`-- DROP TABLE IF EXISTS ${name}; -- destructive; review first`);
      lines.push('');
    }
    for (const d of diffs) {
      lines.push(`-- Table: ${d.tableName}`);
      lines.push(...d.result.sql_statements);
      lines.push('');
    }
    if (diffs.length === 0 && tablesOnlySource.length === 0 && tablesOnlyTarget.length === 0) {
      lines.push('-- No differences detected (or run Compare first).');
    }
    return lines.join('\n');
  }, [sourceConn, targetConn, diffs, tablesOnlySource, tablesOnlyTarget]);

  const copySql = async () => {
    await navigator.clipboard.writeText(generatedSql);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await listMigrationRuns(20));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (isOpen) loadHistory();
  }, [isOpen, loadHistory]);

  const applyMigration = async (dryRun: boolean) => {
    if (!targetConn) {
      setApplyMsg('Select a connected target database.');
      return;
    }
    if (!generatedSql.trim() || generatedSql.includes('No differences')) {
      setApplyMsg('Generate a non-empty migration first.');
      return;
    }
    if (
      !dryRun &&
      !confirm(
        `Apply migration SQL to ${targetConn.name}? This runs inside a transaction and will ROLLBACK on error.`
      )
    ) {
      return;
    }
    setApplying(true);
    setApplyMsg(null);
    try {
      const res = await applyMigrationSql(
        targetConn.id,
        sourceConn?.name || 'source',
        targetConn.name,
        generatedSql,
        dryRun
      );
      if (res.success) {
        setApplyMsg(
          dryRun
            ? `Dry-run OK · ${res.statements_run} statement(s) would run · ${res.duration_ms.toFixed(0)}ms`
            : `Applied ${res.statements_run} statement(s) in ${res.duration_ms.toFixed(0)}ms · id ${res.run_id.slice(0, 8)}`
        );
      } else {
        setApplyMsg(`Failed after ${res.statements_run} stmt(s): ${res.error}`);
      }
      await loadHistory();
    } catch (err) {
      setApplyMsg(String(err));
    } finally {
      setApplying(false);
    }
  };

  if (!isOpen) return null;

  const colsAltered = diffs.reduce(
    (n, d) => n + d.result.added_columns.length + d.result.removed_columns.length,
    0
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-fadeIn select-none font-sans">
      <div className="bg-surface border border-border rounded-xl shadow-2xl w-[760px] h-[560px] max-w-[95vw] overflow-hidden flex flex-col">
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between bg-surface/90">
          <div className="flex items-center space-x-2 text-accent font-semibold text-sm">
            <GitCompare className="w-4 h-4" />
            <span className="text-text">Live Schema Diff & Migration Generator</span>
          </div>
          <button onClick={onClose} className="p-1 rounded text-textMuted hover:text-text hover:bg-surface2 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 bg-surface2/30 border-b border-border flex flex-wrap items-center justify-center gap-3 text-xs">
          <label className="flex items-center space-x-2">
            <span className="text-textMuted">Source</span>
            <select
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              className="bg-surface border border-border rounded px-2 py-1 text-emerald-400 font-mono max-w-[200px]"
            >
              {connected.length === 0 && <option value="">No connected DBs</option>}
              {connected.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.db_type})
                </option>
              ))}
            </select>
          </label>
          <ArrowRight className="w-4 h-4 text-textMuted" />
          <label className="flex items-center space-x-2">
            <span className="text-textMuted">Target</span>
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="bg-surface border border-border rounded px-2 py-1 text-amber-400 font-mono max-w-[200px]"
            >
              {connected.length === 0 && <option value="">No connected DBs</option>}
              {connected.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.db_type})
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={runDiff}
            disabled={loading || connected.length === 0}
            className="px-3 py-1.5 rounded bg-accent hover:bg-accentHover text-white text-xs font-semibold flex items-center space-x-1.5 disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Comparing…' : 'Compare'}</span>
          </button>
        </div>

        <div className="flex-1 p-5 overflow-auto space-y-4 bg-base">
          {error && (
            <div className="flex items-start space-x-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {connected.length < 1 && (
            <p className="text-xs text-textMuted">
              Connect at least one database (two recommended) before comparing schemas.
            </p>
          )}

          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400">
              <span className="text-[10px] uppercase font-bold block">Tables Only in Source</span>
              <strong className="text-base">{tablesOnlySource.length}</strong>
              <div className="text-[10px] text-textMuted font-mono mt-1 truncate">
                {tablesOnlySource.join(', ') || '—'}
              </div>
            </div>
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400">
              <span className="text-[10px] uppercase font-bold block">Columns Altered</span>
              <strong className="text-base">{colsAltered}</strong>
              <div className="text-[10px] text-textMuted font-mono mt-1 truncate">
                {diffs.map((d) => d.tableName).join(', ') || '—'}
              </div>
            </div>
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
              <span className="text-[10px] uppercase font-bold block">Tables Only in Target</span>
              <strong className="text-base">{tablesOnlyTarget.length}</strong>
              <div className="text-[10px] text-textMuted font-mono mt-1 truncate">
                {tablesOnlyTarget.join(', ') || '—'}
              </div>
            </div>
          </div>

          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-2 bg-surface2/30 border-b border-border flex items-center justify-between">
              <span className="text-[10px] font-semibold text-textMuted uppercase tracking-wider font-mono">
                Generated Migration DDL
              </span>
              <button
                onClick={copySql}
                className="px-2 py-1 bg-surface2 hover:bg-surface2/80 text-text text-[11px] rounded transition-colors flex items-center space-x-1"
              >
                {copied ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Copied' : 'Copy DDL'}</span>
              </button>
            </div>
            <pre className="p-4 font-mono text-xs text-accent whitespace-pre-wrap overflow-auto max-h-[220px]">
              {generatedSql || '-- Run Compare to generate migration SQL'}
            </pre>
          </div>
        </div>

        {applyMsg && (
          <div className="px-5 py-2 text-[11px] border-t border-border bg-surface2/40 text-text font-mono">
            {applyMsg}
          </div>
        )}

        {history.length > 0 && (
          <div className="px-5 py-2 border-t border-border max-h-24 overflow-auto bg-base">
            <div className="text-[10px] uppercase text-textMuted font-semibold mb-1">
              Recent migration runs
            </div>
            {history.slice(0, 5).map((h) => (
              <div key={h.id} className="text-[10px] font-mono text-textMuted flex justify-between">
                <span>
                  {h.dry_run ? 'DRY' : 'APPLY'} · {h.source_connection} → {h.target_connection} ·{' '}
                  {h.statements_run} stmt
                </span>
                <span className={h.success ? 'text-emerald-400' : 'text-rose-400'}>
                  {h.success ? 'ok' : 'fail'} · {new Date(h.created_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="px-5 py-3 bg-surface border-t border-border flex items-center justify-end space-x-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded text-xs text-textMuted hover:text-text">
            Close
          </button>
          <button
            onClick={copySql}
            className="px-3 py-1.5 rounded border border-border text-xs text-text hover:bg-surface2"
          >
            Copy SQL
          </button>
          <button
            disabled={applying}
            onClick={() => applyMigration(true)}
            className="px-3 py-1.5 rounded border border-accent/40 text-accent text-xs font-semibold disabled:opacity-40"
          >
            Dry-run
          </button>
          <button
            disabled={applying}
            onClick={() => applyMigration(false)}
            className="px-4 py-1.5 bg-accent hover:bg-accentHover text-white rounded text-xs font-semibold shadow disabled:opacity-40"
          >
            {applying ? 'Applying…' : 'Apply to Target'}
          </button>
        </div>
      </div>
    </div>
  );
};
