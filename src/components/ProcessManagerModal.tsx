import React, { useCallback, useEffect, useState } from 'react';
import { Activity, X, Trash2, RefreshCw, AlertCircle } from 'lucide-react';
import {
  cancelBackendQuery,
  listDatabaseProcesses,
  DatabaseProcessItem,
} from '../services/tauriBridge';

interface ProcessManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectionId: string;
  dbType: string;
}

export const ProcessManagerModal: React.FC<ProcessManagerModalProps> = ({
  isOpen,
  onClose,
  connectionId,
  dbType,
}) => {
  const [processes, setProcesses] = useState<DatabaseProcessItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [killing, setKilling] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    if (!connectionId) {
      setError('No active connection');
      setProcesses([]);
      return;
    }
    const kind = dbType.toLowerCase();
    if (kind === 'sqlite') {
      setProcesses([]);
      setError('SQLite is embedded in-process and has no multi-session process list.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await listDatabaseProcesses(connectionId, dbType);
      setProcesses(list);
    } catch (err) {
      setError(String(err));
      setProcesses([]);
    } finally {
      setLoading(false);
    }
  }, [connectionId, dbType]);

  useEffect(() => {
    if (isOpen) {
      refresh();
    }
  }, [isOpen, refresh]);

  if (!isOpen) return null;

  const handleKill = async (pid: number) => {
    if (!connectionId) return;
    setKilling(pid);
    try {
      await cancelBackendQuery(connectionId, pid, dbType);
      setProcesses((prev) => prev.filter((p) => p.pid !== pid));
    } catch (err) {
      setError(`Failed to kill PID ${pid}: ${String(err)}`);
    } finally {
      setKilling(null);
    }
  };

  const stateClass = (state: string) => {
    const s = state.toLowerCase();
    if (s === 'active' || s === 'query' || s === 'executing') {
      return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
    }
    if (s.includes('idle in transaction')) {
      return 'bg-amber-500/20 text-amber-300 border border-amber-500/30';
    }
    return 'bg-slate-800 text-slate-400 border border-slate-700';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-fadeIn select-none font-sans">
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-[900px] h-[540px] max-w-[95vw] overflow-hidden flex flex-col">
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center space-x-2 text-indigo-400">
            <Activity className="w-5 h-5" />
            <h3 className="text-sm font-semibold text-slate-100">
              Database Process Activity ({dbType.toUpperCase()})
            </h3>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={refresh}
              disabled={loading}
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors disabled:opacity-40"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-slate-950 p-4">
          {error && (
            <div className="mb-3 flex items-start space-x-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {loading && processes.length === 0 ? (
            <div className="text-center text-slate-500 text-xs py-16">Loading processes…</div>
          ) : processes.length === 0 && !error ? (
            <div className="text-center text-slate-500 text-xs py-16">No active server processes found.</div>
          ) : processes.length > 0 ? (
            <table className="w-full border-collapse text-left font-mono text-xs">
              <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 font-medium sticky top-0">
                <tr>
                  <th className="px-3 py-2 w-16 text-center">PID</th>
                  <th className="px-3 py-2">User</th>
                  <th className="px-3 py-2">Database</th>
                  <th className="px-3 py-2">Client</th>
                  <th className="px-3 py-2 text-center">State</th>
                  <th className="px-3 py-2">Query</th>
                  <th className="px-3 py-2 text-right">Duration</th>
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {processes.map((proc) => (
                  <tr key={proc.pid} className="hover:bg-slate-900/50 transition-colors">
                    <td className="px-3 py-2.5 text-center font-bold text-indigo-300">{proc.pid}</td>
                    <td className="px-3 py-2.5 text-slate-200">{proc.user || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-400">{proc.database || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-500">{proc.clientAddr || '—'}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-sans font-semibold uppercase ${stateClass(proc.state)}`}>
                        {proc.state || 'unknown'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-300 max-w-xs truncate" title={proc.query}>
                      {proc.query || '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-400">
                      {proc.durationMs > 0 ? `${Math.round(proc.durationMs)}ms` : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        onClick={() => handleKill(proc.pid)}
                        disabled={killing === proc.pid}
                        className="px-2 py-1 rounded bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-900/50 text-[11px] font-sans flex items-center space-x-1 ml-auto transition-colors disabled:opacity-40"
                        title="Cancel / kill this backend process"
                      >
                        <Trash2 className="w-3 h-3 text-rose-400" />
                        <span>{killing === proc.pid ? 'Killing…' : 'Kill'}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>

        <div className="px-5 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>
            {processes.length} process{processes.length === 1 ? '' : 'es'}
            {loading ? ' · refreshing…' : ''}
          </span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
