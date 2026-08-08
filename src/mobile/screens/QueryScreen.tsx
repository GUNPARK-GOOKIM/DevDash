import React from 'react';
import { Play, Square, Shield } from 'lucide-react';
import { ConnectionConfig } from '../../types';
import { QueryResultPayload } from '../../services/tauriBridge';

interface QueryScreenProps {
  connection: ConnectionConfig | null;
  sql: string;
  onSqlChange: (sql: string) => void;
  onRun: () => void;
  onCancel: () => void;
  loading: boolean;
  readOnly?: boolean;
  result: QueryResultPayload | null;
  error?: string | null;
}

export const QueryScreen: React.FC<QueryScreenProps> = ({
  connection,
  sql,
  onSqlChange,
  onRun,
  onCancel,
  loading,
  readOnly,
  result,
  error,
}) => {
  if (!connection) {
    return (
      <div className="h-full flex items-center justify-center px-6 text-center text-sm text-slate-400">
        Connect first. Queries run in the same Rust engine as Desktop and CLI.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="px-3 pt-3 pb-2 shrink-0 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Query</h2>
          {readOnly && (
            <span className="inline-flex items-center gap-1 text-[10px] text-amber-300">
              <Shield className="w-3 h-3" />
              read-only
            </span>
          )}
        </div>
        <textarea
          value={sql}
          onChange={(e) => onSqlChange(e.target.value)}
          placeholder="SELECT * FROM …"
          spellCheck={false}
          className="w-full h-32 rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-indigo-500/50"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onRun}
            disabled={loading || !sql.trim()}
            className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold disabled:opacity-50"
          >
            <Play className="w-4 h-4" />
            {loading ? 'Running…' : 'Run'}
          </button>
          {loading && (
            <button
              type="button"
              onClick={onCancel}
              className="px-3 rounded-xl bg-slate-800 text-slate-200"
            >
              <Square className="w-4 h-4" />
            </button>
          )}
        </div>
        {error && (
          <div className="text-xs text-rose-300 bg-rose-950/40 border border-rose-900/50 rounded-xl px-3 py-2 whitespace-pre-wrap">
            {error}
          </div>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-auto px-3 pb-3">
        {result && (
          <div className="rounded-xl border border-slate-800 overflow-hidden">
            <div className="px-3 py-1.5 text-[10px] text-slate-400 bg-slate-900 border-b border-slate-800">
              {result.rows.length} rows · {result.execution_time_ms} ms
              {result.affected_rows ? ` · ${result.affected_rows} affected` : ''}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-[10px]">
                <thead>
                  <tr>
                    {result.columns.map((c) => (
                      <th
                        key={c.name}
                        className="px-2 py-1.5 text-left text-slate-400 font-medium whitespace-nowrap"
                      >
                        {c.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={i} className="border-t border-slate-800/80">
                      {row.map((cell, j) => (
                        <td
                          key={j}
                          className="px-2 py-1.5 text-slate-200 whitespace-nowrap max-w-[180px] truncate"
                        >
                          {cell === null || cell === undefined ? 'NULL' : String(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
