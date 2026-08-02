import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Code2, Play, Search, Copy, Plus, Zap, RefreshCw, AlertCircle,
  Braces, CheckCircle2, XCircle,
} from 'lucide-react';
import { runSqlQuery } from '../services/tauriBridge';

type RoutineType = 'function' | 'procedure' | 'trigger';

interface RoutineParameter {
  name: string;
  dataType: string;
  mode: 'IN' | 'OUT' | 'INOUT' | 'VARIADIC';
  default?: string;
}

interface RoutineDefinition {
  name: string;
  schema: string;
  type: RoutineType;
  language: string;
  returnType?: string;
  parameters: RoutineParameter[];
  body: string;
  owner: string;
  triggerTable?: string;
  triggerEvent?: string;
  triggerTiming?: string;
}

interface ExecutionResult {
  success: boolean;
  output: string;
  executionTimeMs: number;
  error?: string;
}

interface RoutinesManagerProps {
  connectionId: string;
  dbType: string;
  onExecuteSql?: (sql: string) => void;
}

const routineColors: Record<RoutineType, { bg: string; text: string; icon: React.ReactNode }> = {
  function: { bg: 'bg-indigo-500/15 border-indigo-500/30', text: 'text-indigo-400', icon: <Braces className="w-3 h-3" /> },
  procedure: { bg: 'bg-emerald-500/15 border-emerald-500/30', text: 'text-emerald-400', icon: <Code2 className="w-3 h-3" /> },
  trigger: { bg: 'bg-amber-500/15 border-amber-500/30', text: 'text-amber-400', icon: <Zap className="w-3 h-3" /> },
};

function parsePgArgs(args: string): RoutineParameter[] {
  if (!args?.trim()) return [];
  // e.g. "p_id integer, OUT p_msg text DEFAULT NULL"
  return args.split(',').map((part) => {
    const tokens = part.trim().split(/\s+/);
    let mode: RoutineParameter['mode'] = 'IN';
    let start = 0;
    if (tokens[0] && ['IN', 'OUT', 'INOUT', 'VARIADIC'].includes(tokens[0].toUpperCase())) {
      mode = tokens[0].toUpperCase() as RoutineParameter['mode'];
      start = 1;
    }
    const name = tokens[start] || 'arg';
    const dataType = tokens.slice(start + 1).join(' ').replace(/DEFAULT.*/i, '').trim() || 'unknown';
    const defMatch = part.match(/DEFAULT\s+(.+)$/i);
    return { name, dataType, mode, default: defMatch?.[1]?.trim() };
  });
}

function col(columns: { name: string }[], name: string, row: any[]): unknown {
  const idx = columns.findIndex((c) => c.name.toLowerCase() === name.toLowerCase());
  return idx >= 0 ? row[idx] : undefined;
}

export const RoutinesManager: React.FC<RoutinesManagerProps> = ({
  connectionId,
  dbType,
  onExecuteSql,
}) => {
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'definition' | 'execute'>('definition');
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [lastResult, setLastResult] = useState<ExecutionResult | null>(null);
  const [routines, setRoutines] = useState<RoutineDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);

  const loadRoutines = useCallback(async () => {
    if (!connectionId) {
      setError('No active connection');
      setRoutines([]);
      return;
    }
    const kind = dbType.toLowerCase();
    if (kind === 'sqlite') {
      setRoutines([]);
      setError('SQLite does not support stored procedures / functions. Use triggers via CREATE TRIGGER in the SQL console.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const collected: RoutineDefinition[] = [];

      if (kind === 'postgres' || kind === 'postgresql' || kind === 'cockroachdb' || kind === 'redshift') {
        const fnSql = `
          SELECT
            n.nspname AS schema_name,
            p.proname AS name,
            CASE p.prokind WHEN 'p' THEN 'procedure' WHEN 'f' THEN 'function' WHEN 'a' THEN 'function' ELSE 'function' END AS routine_type,
            l.lanname AS language,
            COALESCE(pg_get_function_result(p.oid), '') AS return_type,
            COALESCE(pg_get_function_arguments(p.oid), '') AS args,
            COALESCE(pg_get_functiondef(p.oid), '') AS body,
            COALESCE(pg_get_userbyid(p.proowner), '') AS owner
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          JOIN pg_language l ON l.oid = p.prolang
          WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
            AND p.prokind IN ('f', 'p', 'a', 'w')
          ORDER BY n.nspname, p.proname
          LIMIT 500;
        `;
        try {
          const res = await runSqlQuery(connectionId, fnSql);
          for (const row of res.rows) {
            const schema = String(col(res.columns, 'schema_name', row) ?? 'public');
            const name = String(col(res.columns, 'name', row) ?? '');
            const type = String(col(res.columns, 'routine_type', row) ?? 'function') as RoutineType;
            const language = String(col(res.columns, 'language', row) ?? 'sql');
            const returnType = String(col(res.columns, 'return_type', row) || '');
            const args = String(col(res.columns, 'args', row) || '');
            const body = String(col(res.columns, 'body', row) || '');
            const owner = String(col(res.columns, 'owner', row) || '');
            collected.push({
              name,
              schema,
              type: type === 'procedure' ? 'procedure' : 'function',
              language,
              returnType: returnType || undefined,
              parameters: parsePgArgs(args),
              body,
              owner,
            });
          }
        } catch (e) {
          // Cockroach/Redshift may lack prokind — try information_schema
          console.warn('pg_proc query failed, trying information_schema', e);
        }

        const trgSql = `
          SELECT
            trigger_schema AS schema_name,
            trigger_name AS name,
            event_object_table AS trigger_table,
            action_timing AS timing,
            string_agg(event_manipulation, ' OR ') AS events,
            action_statement AS body
          FROM information_schema.triggers
          WHERE trigger_schema NOT IN ('pg_catalog', 'information_schema')
          GROUP BY trigger_schema, trigger_name, event_object_table, action_timing, action_statement
          ORDER BY trigger_name
          LIMIT 200;
        `;
        try {
          const trg = await runSqlQuery(connectionId, trgSql);
          for (const row of trg.rows) {
            collected.push({
              name: String(col(trg.columns, 'name', row) ?? ''),
              schema: String(col(trg.columns, 'schema_name', row) ?? 'public'),
              type: 'trigger',
              language: 'plpgsql',
              parameters: [],
              body: String(col(trg.columns, 'body', row) || ''),
              owner: '',
              triggerTable: String(col(trg.columns, 'trigger_table', row) || ''),
              triggerEvent: String(col(trg.columns, 'events', row) || ''),
              triggerTiming: String(col(trg.columns, 'timing', row) || ''),
            });
          }
        } catch {
          /* optional */
        }
      } else if (kind === 'mysql' || kind === 'mariadb') {
        const sql = `
          SELECT
            ROUTINE_SCHEMA AS schema_name,
            ROUTINE_NAME AS name,
            LOWER(ROUTINE_TYPE) AS routine_type,
            COALESCE(EXTERNAL_LANGUAGE, 'SQL') AS language,
            COALESCE(DTD_IDENTIFIER, '') AS return_type,
            COALESCE(ROUTINE_DEFINITION, '') AS body,
            COALESCE(DEFINER, '') AS owner
          FROM information_schema.ROUTINES
          WHERE ROUTINE_SCHEMA = DATABASE()
          ORDER BY ROUTINE_NAME
          LIMIT 500;
        `;
        const res = await runSqlQuery(connectionId, sql);
        for (const row of res.rows) {
          const rtype = String(col(res.columns, 'routine_type', row) || 'function');
          collected.push({
            name: String(col(res.columns, 'name', row) ?? ''),
            schema: String(col(res.columns, 'schema_name', row) ?? ''),
            type: rtype.includes('proc') ? 'procedure' : 'function',
            language: String(col(res.columns, 'language', row) || 'sql'),
            returnType: String(col(res.columns, 'return_type', row) || '') || undefined,
            parameters: [],
            body: String(col(res.columns, 'body', row) || ''),
            owner: String(col(res.columns, 'owner', row) || ''),
          });
        }

        try {
          const trg = await runSqlQuery(
            connectionId,
            `SELECT TRIGGER_SCHEMA AS schema_name, TRIGGER_NAME AS name, EVENT_OBJECT_TABLE AS trigger_table,
                    ACTION_TIMING AS timing, EVENT_MANIPULATION AS events, ACTION_STATEMENT AS body
             FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE() LIMIT 200;`
          );
          for (const row of trg.rows) {
            collected.push({
              name: String(col(trg.columns, 'name', row) ?? ''),
              schema: String(col(trg.columns, 'schema_name', row) ?? ''),
              type: 'trigger',
              language: 'sql',
              parameters: [],
              body: String(col(trg.columns, 'body', row) || ''),
              owner: '',
              triggerTable: String(col(trg.columns, 'trigger_table', row) || ''),
              triggerEvent: String(col(trg.columns, 'events', row) || ''),
              triggerTiming: String(col(trg.columns, 'timing', row) || ''),
            });
          }
        } catch {
          /* optional */
        }
      } else {
        setError(`Routines introspection is not supported for engine "${dbType}".`);
      }

      setRoutines(collected);
      setSelectedKey((prev) => {
        if (prev && collected.some((r) => `${r.schema}.${r.name}:${r.type}` === prev)) {
          return prev;
        }
        if (collected.length > 0) {
          return `${collected[0].schema}.${collected[0].name}:${collected[0].type}`;
        }
        return null;
      });
    } catch (err) {
      setError(String(err));
      setRoutines([]);
    } finally {
      setLoading(false);
    }
  }, [connectionId, dbType]);

  useEffect(() => {
    loadRoutines();
  }, [loadRoutines]);

  const filteredRoutines = useMemo(() => {
    if (!searchFilter) return routines;
    const q = searchFilter.toLowerCase();
    return routines.filter(
      (r) => r.name.toLowerCase().includes(q) || r.type.toLowerCase().includes(q) || r.schema.toLowerCase().includes(q)
    );
  }, [routines, searchFilter]);

  const selected = useMemo(
    () => routines.find((r) => `${r.schema}.${r.name}:${r.type}` === selectedKey),
    [routines, selectedKey]
  );

  const generateCallSql = useCallback(() => {
    if (!selected || selected.type === 'trigger') return '';
    const inParams = selected.parameters.filter((p) => p.mode === 'IN' || p.mode === 'INOUT');
    const args = inParams
      .map((p) => {
        const val = paramValues[p.name];
        if (val !== undefined && val !== '') return val;
        if (p.default) return p.default;
        return p.dataType.toLowerCase().includes('int') || p.dataType.toLowerCase().includes('numeric')
          ? '0'
          : "''";
      })
      .join(', ');

    const fq = `${selected.schema}.${selected.name}`;
    if (selected.type === 'procedure') return `CALL ${fq}(${args});`;
    return `SELECT * FROM ${fq}(${args});`;
  }, [selected, paramValues]);

  const handleExecute = useCallback(async () => {
    if (!selected || selected.type === 'trigger') return;
    const sql = generateCallSql();
    if (onExecuteSql) {
      onExecuteSql(sql);
      setLastResult({
        success: true,
        output: `Dispatched to SQL console:\n${sql}`,
        executionTimeMs: 0,
      });
      return;
    }
    setExecuting(true);
    try {
      const res = await runSqlQuery(connectionId, sql);
      const preview = res.rows
        .slice(0, 20)
        .map((r) => r.map((c) => (c === null ? 'NULL' : String(c))).join(' | '))
        .join('\n');
      setLastResult({
        success: true,
        output: preview || `(${res.affected_rows} rows affected)`,
        executionTimeMs: res.execution_time_ms,
      });
    } catch (err) {
      setLastResult({
        success: false,
        output: '',
        executionTimeMs: 0,
        error: String(err),
      });
    } finally {
      setExecuting(false);
    }
  }, [selected, generateCallSql, onExecuteSql, connectionId]);

  const groupedRoutines = useMemo(() => {
    const groups: Record<RoutineType, RoutineDefinition[]> = { function: [], procedure: [], trigger: [] };
    filteredRoutines.forEach((r) => groups[r.type].push(r));
    return groups;
  }, [filteredRoutines]);

  const keyOf = (r: RoutineDefinition) => `${r.schema}.${r.name}:${r.type}`;

  return (
    <div className="flex flex-col h-full bg-base text-text font-sans select-none">
      <div className="h-10 bg-surface border-b border-border flex items-center px-4 justify-between shrink-0">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 rounded-lg bg-purple-500/20 flex items-center justify-center">
            <Code2 className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <h2 className="text-sm font-semibold text-text">Stored Routines & Triggers</h2>
          <span className="text-[10px] text-textMuted bg-surface2 px-2 py-0.5 rounded-full">
            {routines.filter((r) => r.type === 'function').length} fn ·{' '}
            {routines.filter((r) => r.type === 'procedure').length} proc ·{' '}
            {routines.filter((r) => r.type === 'trigger').length} trg
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={loadRoutines}
            disabled={loading}
            className="px-2.5 py-1 bg-surface2 border border-border rounded-lg text-[11px] text-textMuted hover:text-text flex items-center space-x-1"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => onExecuteSql?.('-- Create a new function/procedure here\n')}
            className="px-2.5 py-1 bg-accent/15 text-accent border border-accent/30 rounded-lg text-[11px] font-medium hover:bg-accent/25 transition-colors flex items-center space-x-1"
          >
            <Plus className="w-3 h-3" />
            <span>New in Console</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/30 text-xs text-amber-300 flex items-start space-x-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="w-[280px] border-r border-border flex flex-col bg-surface/30 shrink-0">
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-textMuted" />
              <input
                type="text"
                placeholder="Filter routines…"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full bg-surface2 border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-text placeholder:text-textMuted/50 outline-none focus:border-accent/50"
              />
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            {loading && routines.length === 0 && (
              <div className="p-4 text-xs text-textMuted text-center">Loading catalog…</div>
            )}
            {!loading && routines.length === 0 && !error && (
              <div className="p-4 text-xs text-textMuted text-center">No routines found in this database.</div>
            )}
            {(['function', 'procedure', 'trigger'] as RoutineType[]).map((type) => {
              const items = groupedRoutines[type];
              if (items.length === 0) return null;
              const colors = routineColors[type];
              return (
                <div key={type}>
                  <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-textMuted bg-surface2/30 border-b border-border/20">
                    {type}s ({items.length})
                  </div>
                  {items.map((r) => (
                    <button
                      key={keyOf(r)}
                      onClick={() => {
                        setSelectedKey(keyOf(r));
                        setActiveSection('definition');
                        setLastResult(null);
                        setParamValues({});
                      }}
                      className={`w-full px-3 py-2 text-left border-b border-border/20 transition-colors ${
                        selectedKey === keyOf(r) ? 'bg-accent/10 border-l-2 border-l-accent' : 'hover:bg-surface2/40'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <span className={colors.text}>{colors.icon}</span>
                        <span className="text-[11px] font-mono font-medium text-text truncate">{r.name}</span>
                      </div>
                      <div className="flex items-center space-x-2 mt-0.5 pl-5">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded border ${colors.bg} ${colors.text} font-bold uppercase`}>
                          {r.language}
                        </span>
                        <span className="text-[9px] text-textMuted font-mono truncate">{r.schema}</span>
                      </div>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          {selected ? (
            <>
              <div className="px-4 py-3 border-b border-border bg-surface/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className={routineColors[selected.type].text}>{routineColors[selected.type].icon}</span>
                    <span className="text-sm font-semibold font-mono text-text">
                      {selected.schema}.{selected.name}
                    </span>
                    <span
                      className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${routineColors[selected.type].bg} ${routineColors[selected.type].text}`}
                    >
                      {selected.type}
                    </span>
                  </div>
                  <button
                    onClick={() => navigator.clipboard.writeText(selected.body || generateCallSql())}
                    className="p-1.5 rounded-md hover:bg-surface2 text-textMuted hover:text-text"
                    title="Copy"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center space-x-4 mt-2 text-[10px] text-textMuted">
                  <span>
                    Language: <span className="text-text font-mono">{selected.language}</span>
                  </span>
                  {selected.returnType && (
                    <span>
                      Returns: <span className="text-text font-mono">{selected.returnType}</span>
                    </span>
                  )}
                  {selected.owner && (
                    <span>
                      Owner: <span className="text-text">{selected.owner}</span>
                    </span>
                  )}
                </div>
                {selected.type === 'trigger' && (
                  <div className="flex items-center space-x-3 mt-1.5 text-[10px]">
                    <span className="text-textMuted">
                      Table: <span className="text-amber-400 font-mono">{selected.triggerTable}</span>
                    </span>
                    <span className="text-textMuted">
                      Event: <span className="text-text">{selected.triggerEvent}</span>
                    </span>
                    <span className="text-textMuted">
                      Timing: <span className="text-text">{selected.triggerTiming}</span>
                    </span>
                  </div>
                )}
                <div className="flex items-center space-x-1 mt-3">
                  {(['definition', 'execute'] as const).map((sec) => (
                    <button
                      key={sec}
                      onClick={() => setActiveSection(sec)}
                      disabled={sec === 'execute' && selected.type === 'trigger'}
                      className={`px-2.5 py-1 rounded text-[11px] capitalize ${
                        activeSection === sec
                          ? 'bg-accent/20 text-accent'
                          : 'text-textMuted hover:text-text disabled:opacity-30'
                      }`}
                    >
                      {sec}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-auto p-4">
                {activeSection === 'definition' && (
                  <pre className="bg-surface2/40 border border-border rounded-lg p-3 text-[11px] font-mono text-text whitespace-pre-wrap overflow-auto max-h-full">
                    {selected.body || '-- Definition not available from catalog'}
                  </pre>
                )}
                {activeSection === 'execute' && selected.type !== 'trigger' && (
                  <div className="space-y-3">
                    {selected.parameters
                      .filter((p) => p.mode === 'IN' || p.mode === 'INOUT')
                      .map((p) => (
                        <div key={p.name} className="flex items-center space-x-2">
                          <label className="w-32 text-[11px] font-mono text-textMuted truncate" title={p.name}>
                            {p.name}
                          </label>
                          <span className="text-[10px] text-textMuted w-24 truncate">{p.dataType}</span>
                          <input
                            value={paramValues[p.name] ?? ''}
                            onChange={(e) =>
                              setParamValues((prev) => ({ ...prev, [p.name]: e.target.value }))
                            }
                            placeholder={p.default || `Enter ${p.name}`}
                            className="flex-1 bg-surface2 border border-border rounded-lg px-3 py-1.5 text-xs font-mono text-text outline-none focus:border-accent/50"
                          />
                        </div>
                      ))}
                    <pre className="bg-surface2/40 border border-border rounded-lg p-2 text-[11px] font-mono text-accent">
                      {generateCallSql()}
                    </pre>
                    <button
                      onClick={handleExecute}
                      disabled={executing}
                      className="px-3 py-1.5 bg-accent hover:bg-accentHover text-white rounded text-xs font-semibold flex items-center space-x-1.5"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>{executing ? 'Running…' : 'Execute'}</span>
                    </button>
                    {lastResult && (
                      <div
                        className={`p-3 rounded-lg border text-xs font-mono whitespace-pre-wrap ${
                          lastResult.success
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                            : 'bg-red-500/10 border-red-500/30 text-red-300'
                        }`}
                      >
                        <div className="flex items-center space-x-1 mb-1">
                          {lastResult.success ? (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5" />
                          )}
                          <span>
                            {lastResult.success
                              ? `OK · ${lastResult.executionTimeMs}ms`
                              : lastResult.error}
                          </span>
                        </div>
                        {lastResult.output}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-textMuted">
              Select a routine to inspect its definition
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
