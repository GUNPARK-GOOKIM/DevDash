import React, { useState, useMemo, useCallback } from 'react';
import {
  Code2, Play, FileCode, Trash2, Search, ChevronRight, ChevronDown,
  Edit3, Copy, Plus, Zap, ToggleLeft, ToggleRight, Database,
  ArrowRight, Clock, AlertTriangle, CheckCircle2, Braces, Settings2, X,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────
type RoutineType = 'function' | 'procedure' | 'trigger';
type RoutineLanguage = 'plpgsql' | 'sql' | 'plpython3u' | 'plv8' | 'tsql' | 'mysql';

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
  language: RoutineLanguage;
  returnType?: string;
  parameters: RoutineParameter[];
  body: string;
  owner: string;
  created: string;
  modified: string;
  isStrict: boolean;
  volatility?: 'VOLATILE' | 'STABLE' | 'IMMUTABLE';
  securityDefiner?: boolean;
  triggerTable?: string;
  triggerEvent?: string;
  triggerTiming?: 'BEFORE' | 'AFTER' | 'INSTEAD OF';
}

interface ExecutionResult {
  success: boolean;
  output: string;
  executionTimeMs: number;
  returnValue?: string;
  notices?: string[];
}

interface RoutinesManagerProps {
  connectionId: string;
  dbType: string;
  onExecuteSql?: (sql: string) => void;
}

// ─── Routine Type Colors ────────────────────────────────────────────
const routineColors: Record<RoutineType, { bg: string; text: string; icon: React.ReactNode }> = {
  function: { bg: 'bg-indigo-500/15 border-indigo-500/30', text: 'text-indigo-400', icon: <Braces className="w-3 h-3" /> },
  procedure: { bg: 'bg-emerald-500/15 border-emerald-500/30', text: 'text-emerald-400', icon: <Code2 className="w-3 h-3" /> },
  trigger: { bg: 'bg-amber-500/15 border-amber-500/30', text: 'text-amber-400', icon: <Zap className="w-3 h-3" /> },
};

// ─── Main Component ─────────────────────────────────────────────────
export const RoutinesManager: React.FC<RoutinesManagerProps> = ({ connectionId, dbType, onExecuteSql }) => {
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedRoutine, setSelectedRoutine] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'definition' | 'execute' | 'dependencies'>('definition');
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [lastResult, setLastResult] = useState<ExecutionResult | null>(null);

  // ─── Demo Routines ────────────────────────────────────────────
  const [routines] = useState<RoutineDefinition[]>([
    {
      name: 'calculate_order_total',
      schema: 'public',
      type: 'function',
      language: 'plpgsql',
      returnType: 'NUMERIC(12,2)',
      parameters: [
        { name: 'p_order_id', dataType: 'INTEGER', mode: 'IN' },
        { name: 'p_include_tax', dataType: 'BOOLEAN', mode: 'IN', default: 'true' },
      ],
      body: `DECLARE
  v_subtotal NUMERIC(12,2);
  v_tax_rate NUMERIC(4,2) := 0.08;
  v_total NUMERIC(12,2);
BEGIN
  SELECT COALESCE(SUM(quantity * unit_price), 0)
  INTO v_subtotal
  FROM order_items
  WHERE order_id = p_order_id;

  IF p_include_tax THEN
    v_total := v_subtotal * (1 + v_tax_rate);
  ELSE
    v_total := v_subtotal;
  END IF;

  RETURN v_total;
END;`,
      owner: 'app_user',
      created: '2026-03-15T10:30:00Z',
      modified: '2026-07-20T14:22:00Z',
      isStrict: false,
      volatility: 'STABLE',
      securityDefiner: false,
    },
    {
      name: 'upsert_user_profile',
      schema: 'public',
      type: 'procedure',
      language: 'plpgsql',
      parameters: [
        { name: 'p_user_id', dataType: 'INTEGER', mode: 'IN' },
        { name: 'p_email', dataType: 'VARCHAR(255)', mode: 'IN' },
        { name: 'p_display_name', dataType: 'VARCHAR(100)', mode: 'IN' },
        { name: 'p_result_msg', dataType: 'TEXT', mode: 'OUT' },
      ],
      body: `BEGIN
  INSERT INTO user_profiles (user_id, email, display_name, updated_at)
  VALUES (p_user_id, p_email, p_display_name, NOW())
  ON CONFLICT (user_id)
  DO UPDATE SET
    email = EXCLUDED.email,
    display_name = EXCLUDED.display_name,
    updated_at = NOW();

  p_result_msg := 'Profile upserted successfully for user ' || p_user_id;
  COMMIT;
END;`,
      owner: 'app_user',
      created: '2026-04-01T09:00:00Z',
      modified: '2026-07-28T11:15:00Z',
      isStrict: true,
    },
    {
      name: 'trg_audit_user_changes',
      schema: 'public',
      type: 'trigger',
      language: 'plpgsql',
      returnType: 'TRIGGER',
      parameters: [],
      body: `BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (table_name, operation, row_id, new_data, created_at)
    VALUES ('users', 'INSERT', NEW.id, row_to_json(NEW), NOW());
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (table_name, operation, row_id, old_data, new_data, created_at)
    VALUES ('users', 'UPDATE', OLD.id, row_to_json(OLD), row_to_json(NEW), NOW());
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (table_name, operation, row_id, old_data, created_at)
    VALUES ('users', 'DELETE', OLD.id, row_to_json(OLD), NOW());
  END IF;
  RETURN NEW;
END;`,
      owner: 'postgres',
      created: '2026-02-10T16:00:00Z',
      modified: '2026-06-15T08:30:00Z',
      isStrict: false,
      triggerTable: 'users',
      triggerEvent: 'INSERT OR UPDATE OR DELETE',
      triggerTiming: 'AFTER',
    },
    {
      name: 'get_user_orders_summary',
      schema: 'public',
      type: 'function',
      language: 'sql',
      returnType: 'TABLE(user_email VARCHAR, total_orders BIGINT, total_spent NUMERIC)',
      parameters: [
        { name: 'p_min_orders', dataType: 'INTEGER', mode: 'IN', default: '1' },
      ],
      body: `SELECT u.email, COUNT(o.id), SUM(o.total_amount)
FROM users u
JOIN orders o ON o.user_id = u.id
GROUP BY u.email
HAVING COUNT(o.id) >= p_min_orders
ORDER BY SUM(o.total_amount) DESC;`,
      owner: 'app_user',
      created: '2026-05-22T12:00:00Z',
      modified: '2026-07-10T09:45:00Z',
      isStrict: false,
      volatility: 'STABLE',
    },
  ]);

  const filteredRoutines = useMemo(() => {
    if (!searchFilter) return routines;
    return routines.filter(r =>
      r.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
      r.type.toLowerCase().includes(searchFilter.toLowerCase())
    );
  }, [routines, searchFilter]);

  const selected = useMemo(() => routines.find(r => r.name === selectedRoutine), [routines, selectedRoutine]);

  const generateCallSql = useCallback(() => {
    if (!selected) return '';
    const inParams = selected.parameters.filter(p => p.mode === 'IN' || p.mode === 'INOUT');
    const args = inParams.map(p => {
      const val = paramValues[p.name];
      if (val !== undefined && val !== '') return val;
      if (p.default) return p.default;
      return p.dataType.toLowerCase().includes('int') ? '0' : "''";
    }).join(', ');

    if (selected.type === 'procedure') return `CALL ${selected.schema}.${selected.name}(${args});`;
    return `SELECT * FROM ${selected.schema}.${selected.name}(${args});`;
  }, [selected, paramValues]);

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
  }, []);

  const handleExecute = useCallback(() => {
    setLastResult({
      success: true,
      output: selected?.type === 'function'
        ? `Returned: 1,247.50\n(1 row, execution time: 2.4ms)`
        : `CALL completed successfully.\nOUT: Profile upserted successfully for user 101`,
      executionTimeMs: selected?.type === 'function' ? 2.4 : 5.1,
      returnValue: selected?.type === 'function' ? '1247.50' : undefined,
      notices: ['NOTICE: Profile record created/updated'],
    });
  }, [selected]);

  // ─── Group by type ────────────────────────────────────────────
  const groupedRoutines = useMemo(() => {
    const groups: Record<RoutineType, RoutineDefinition[]> = { function: [], procedure: [], trigger: [] };
    filteredRoutines.forEach(r => groups[r.type].push(r));
    return groups;
  }, [filteredRoutines]);

  return (
    <div className="flex flex-col h-full bg-base text-text font-sans select-none">
      {/* Header */}
      <div className="h-10 bg-surface border-b border-border flex items-center px-4 justify-between shrink-0">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 rounded-lg bg-purple-500/20 flex items-center justify-center">
            <Code2 className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <h2 className="text-sm font-semibold text-text">Stored Routines & Triggers</h2>
          <span className="text-[10px] text-textMuted bg-surface2 px-2 py-0.5 rounded-full">
            {routines.filter(r => r.type === 'function').length} fn · {routines.filter(r => r.type === 'procedure').length} proc · {routines.filter(r => r.type === 'trigger').length} trg
          </span>
        </div>
        <button className="px-2.5 py-1 bg-accent/15 text-accent border border-accent/30 rounded-lg text-[11px] font-medium hover:bg-accent/25 transition-colors flex items-center space-x-1">
          <Plus className="w-3 h-3" />
          <span>New Routine</span>
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel: Routine List */}
        <div className="w-[280px] border-r border-border flex flex-col bg-surface/30 shrink-0">
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-textMuted" />
              <input
                type="text"
                placeholder="Filter routines…"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full bg-surface2 border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-text placeholder:text-textMuted/50 outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all"
              />
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            {(['function', 'procedure', 'trigger'] as RoutineType[]).map(type => {
              const items = groupedRoutines[type];
              if (items.length === 0) return null;
              const colors = routineColors[type];
              return (
                <div key={type}>
                  <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-textMuted bg-surface2/30 border-b border-border/20">
                    {type}s ({items.length})
                  </div>
                  {items.map(r => (
                    <button
                      key={r.name}
                      onClick={() => { setSelectedRoutine(r.name); setActiveSection('definition'); setLastResult(null); }}
                      className={`w-full px-3 py-2 text-left border-b border-border/20 transition-colors ${
                        selectedRoutine === r.name ? 'bg-accent/10 border-l-2 border-l-accent' : 'hover:bg-surface2/40'
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
                        {r.returnType && (
                          <span className="text-[9px] text-textMuted font-mono truncate max-w-[120px]">→ {r.returnType}</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Panel: Detail View */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selected ? (
            <>
              {/* Routine Header */}
              <div className="px-4 py-3 border-b border-border bg-surface/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className={routineColors[selected.type].text}>{routineColors[selected.type].icon}</span>
                    <span className="text-sm font-semibold font-mono text-text">{selected.schema}.{selected.name}</span>
                    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${routineColors[selected.type].bg} ${routineColors[selected.type].text}`}>
                      {selected.type}
                    </span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <button onClick={() => copyToClipboard(selected.body)} className="p-1.5 rounded-md hover:bg-surface2 text-textMuted hover:text-text transition-colors" title="Copy Body">
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button className="p-1.5 rounded-md hover:bg-surface2 text-textMuted hover:text-text transition-colors" title="Edit">
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button className="p-1.5 rounded-md hover:bg-red-500/20 text-textMuted hover:text-red-400 transition-colors" title="Drop">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Meta info */}
                <div className="flex items-center space-x-4 mt-2 text-[10px] text-textMuted">
                  <span>Language: <span className="text-text font-mono">{selected.language}</span></span>
                  {selected.returnType && <span>Returns: <span className="text-text font-mono">{selected.returnType}</span></span>}
                  {selected.volatility && <span>Volatility: <span className="text-text">{selected.volatility}</span></span>}
                  <span>Owner: <span className="text-text">{selected.owner}</span></span>
                  {selected.securityDefiner && <span className="text-amber-400 font-bold">SECURITY DEFINER</span>}
                </div>

                {/* Trigger meta */}
                {selected.type === 'trigger' && (
                  <div className="flex items-center space-x-3 mt-1.5 text-[10px]">
                    <span className="text-textMuted">Table: <span className="text-amber-400 font-mono">{selected.triggerTable}</span></span>
                    <span className="text-textMuted">Event: <span className="text-text">{selected.triggerEvent}</span></span>
                    <span className="text-textMuted">Timing: <span className="text-text">{selected.triggerTiming}</span></span>
                  </div>
                )}

                {/* Section Tabs */}
                <div className="flex items-center space-x-1 mt-3">
                  {(['definition', 'execute', 'dependencies'] as const).map(section => (
                    <button
                      key={section}
                      onClick={() => setActiveSection(section)}
                      className={`px-3 py-1 rounded-md text-[11px] font-medium transition-colors ${
                        activeSection === section ? 'bg-accent/15 text-accent' : 'text-textMuted hover:text-text hover:bg-surface2/50'
                      }`}
                    >
                      {section.charAt(0).toUpperCase() + section.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Section Content */}
              <div className="flex-1 overflow-auto">
                {activeSection === 'definition' && (
                  <div className="p-4 space-y-4">
                    {/* Parameters */}
                    {selected.parameters.length > 0 && (
                      <div className="bg-surface border border-border rounded-xl p-4">
                        <h4 className="text-[10px] font-semibold text-textMuted uppercase tracking-wider mb-3">Parameters</h4>
                        <div className="space-y-1.5">
                          {selected.parameters.map((p) => (
                            <div key={p.name} className="flex items-center space-x-3 text-xs">
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                p.mode === 'IN' ? 'bg-emerald-500/15 text-emerald-400' :
                                p.mode === 'OUT' ? 'bg-sky-500/15 text-sky-400' :
                                'bg-amber-500/15 text-amber-400'
                              }`}>{p.mode}</span>
                              <span className="font-mono text-text font-medium">{p.name}</span>
                              <span className="text-textMuted font-mono">{p.dataType}</span>
                              {p.default && <span className="text-textMuted">= <span className="text-purple-400">{p.default}</span></span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Body */}
                    <div className="bg-surface border border-border rounded-xl overflow-hidden">
                      <div className="px-4 py-2 bg-surface2/30 border-b border-border/50 flex items-center justify-between">
                        <span className="text-[10px] font-semibold text-textMuted uppercase tracking-wider">Function Body</span>
                        <button onClick={() => copyToClipboard(selected.body)} className="p-1 rounded hover:bg-surface2 text-textMuted hover:text-text transition-colors" title="Copy">
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                      <pre className="p-4 font-mono text-xs text-text overflow-auto leading-relaxed whitespace-pre-wrap">
                        {selected.body}
                      </pre>
                    </div>
                  </div>
                )}

                {activeSection === 'execute' && (
                  <div className="p-4 space-y-4">
                    {/* Parameter Inputs */}
                    {selected.parameters.filter(p => p.mode === 'IN' || p.mode === 'INOUT').length > 0 && (
                      <div className="bg-surface border border-border rounded-xl p-4">
                        <h4 className="text-[10px] font-semibold text-textMuted uppercase tracking-wider mb-3">Input Parameters</h4>
                        <div className="space-y-2">
                          {selected.parameters.filter(p => p.mode === 'IN' || p.mode === 'INOUT').map(p => (
                            <div key={p.name} className="flex items-center space-x-3">
                              <label className="text-xs font-mono text-text min-w-[160px]">{p.name} <span className="text-textMuted">({p.dataType})</span></label>
                              <input
                                type="text"
                                value={paramValues[p.name] || ''}
                                onChange={(e) => setParamValues(prev => ({ ...prev, [p.name]: e.target.value }))}
                                placeholder={p.default || `Enter ${p.dataType}`}
                                className="flex-1 bg-surface2 border border-border rounded-lg px-3 py-1.5 text-xs font-mono text-text placeholder:text-textMuted/40 outline-none focus:border-accent/50 transition-all"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Generated SQL */}
                    <div className="bg-surface border border-border rounded-xl overflow-hidden">
                      <div className="px-4 py-2 bg-surface2/30 border-b border-border/50 flex items-center justify-between">
                        <span className="text-[10px] font-semibold text-textMuted uppercase tracking-wider">Generated SQL</span>
                        <div className="flex items-center space-x-1.5">
                          <button onClick={() => copyToClipboard(generateCallSql())} className="p-1 rounded hover:bg-surface2 text-textMuted hover:text-text transition-colors">
                            <Copy className="w-3 h-3" />
                          </button>
                          <button
                            onClick={handleExecute}
                            className="px-2.5 py-1 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-lg text-[11px] font-medium hover:bg-emerald-500/25 transition-colors flex items-center space-x-1"
                          >
                            <Play className="w-3 h-3" />
                            <span>Execute</span>
                          </button>
                        </div>
                      </div>
                      <pre className="p-4 font-mono text-xs text-indigo-400 overflow-auto">{generateCallSql()}</pre>
                    </div>

                    {/* Execution Result */}
                    {lastResult && (
                      <div className={`border rounded-xl overflow-hidden ${lastResult.success ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-red-500/5 border-red-500/30'}`}>
                        <div className={`px-4 py-2 border-b ${lastResult.success ? 'border-emerald-500/20' : 'border-red-500/20'} flex items-center space-x-2`}>
                          {lastResult.success ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <AlertTriangle className="w-3.5 h-3.5 text-red-400" />}
                          <span className={`text-xs font-semibold ${lastResult.success ? 'text-emerald-400' : 'text-red-400'}`}>
                            {lastResult.success ? 'Execution Successful' : 'Execution Failed'}
                          </span>
                          <span className="text-[10px] text-textMuted ml-auto font-mono">{lastResult.executionTimeMs}ms</span>
                        </div>
                        <pre className="p-4 font-mono text-xs text-text whitespace-pre-wrap">{lastResult.output}</pre>
                        {lastResult.notices && lastResult.notices.length > 0 && (
                          <div className="px-4 pb-3 space-y-1">
                            {lastResult.notices.map((n, i) => (
                              <div key={i} className="text-[10px] text-amber-400 font-mono">{n}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {activeSection === 'dependencies' && (
                  <div className="p-4 space-y-4">
                    <div className="bg-surface border border-border rounded-xl p-4">
                      <h4 className="text-[10px] font-semibold text-textMuted uppercase tracking-wider mb-3">Referenced Tables</h4>
                      <div className="space-y-1.5">
                        {selected.body.match(/(?:FROM|JOIN|INTO|UPDATE)\s+(\w+)/gi)?.map((match, idx) => {
                          const tableName = match.replace(/(?:FROM|JOIN|INTO|UPDATE)\s+/i, '');
                          return (
                            <div key={idx} className="flex items-center space-x-2 text-xs">
                              <Database className="w-3 h-3 text-accent" />
                              <span className="font-mono text-text">{tableName}</span>
                            </div>
                          );
                        }) || <span className="text-xs text-textMuted">No table references detected</span>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-textMuted">
              <div className="text-center space-y-2">
                <Code2 className="w-10 h-10 mx-auto opacity-20" />
                <p className="text-sm">Select a routine to inspect</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
