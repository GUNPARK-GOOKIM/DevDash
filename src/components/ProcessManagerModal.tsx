import React, { useState } from 'react';
import { Activity, X, Trash2, RefreshCw, AlertCircle } from 'lucide-react';

export interface ProcessItem {
  pid: number;
  user: string;
  database: string;
  clientAddr: string;
  state: 'active' | 'idle' | 'idle in transaction';
  query: string;
  durationMs: number;
}

interface ProcessManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  dbType: string;
  onKillProcess: (pid: number) => void;
}

export const ProcessManagerModal: React.FC<ProcessManagerModalProps> = ({
  isOpen,
  onClose,
  dbType,
  onKillProcess,
}) => {
  const [processes, setProcesses] = useState<ProcessItem[]>([
    {
      pid: 10482,
      user: 'postgres',
      database: 'devdash_demo',
      clientAddr: '127.0.0.1',
      state: 'active',
      query: 'SELECT * FROM users ORDER BY created_at DESC;',
      durationMs: 14,
    },
    {
      pid: 10495,
      user: 'analytics_worker',
      database: 'prod_app',
      clientAddr: '192.168.1.120',
      state: 'idle',
      query: 'SELECT COUNT(*) FROM audit_logs;',
      durationMs: 0,
    },
    {
      pid: 10512,
      user: 'admin',
      database: 'devdash_demo',
      clientAddr: '127.0.0.1',
      state: 'active',
      query: 'UPDATE users SET role = \'admin\' WHERE id = 42;',
      durationMs: 45,
    },
  ]);

  if (!isOpen) return null;

  const handleKill = (pid: number) => {
    onKillProcess(pid);
    setProcesses(processes.filter((p) => p.pid !== pid));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-fadeIn select-none font-sans">
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-[850px] h-[520px] max-w-[95vw] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center space-x-2 text-indigo-400">
            <Activity className="w-5 h-5" />
            <h3 className="text-sm font-semibold text-slate-100">
              Database Process Activity Manager ({dbType.toUpperCase()})
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Process List Table */}
        <div className="flex-1 overflow-auto bg-slate-950 p-4">
          <table className="w-full border-collapse text-left font-mono text-xs">
            <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 font-medium">
              <tr>
                <th className="px-3 py-2 w-16 text-center">PID</th>
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Database</th>
                <th className="px-3 py-2">Client IP</th>
                <th className="px-3 py-2 text-center">State</th>
                <th className="px-3 py-2">Active Query</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {processes.map((proc) => (
                <tr key={proc.pid} className="hover:bg-slate-900/50 transition-colors">
                  <td className="px-3 py-2.5 text-center font-bold text-indigo-300">{proc.pid}</td>
                  <td className="px-3 py-2.5 text-slate-200">{proc.user}</td>
                  <td className="px-3 py-2.5 text-slate-400">{proc.database}</td>
                  <td className="px-3 py-2.5 text-slate-500">{proc.clientAddr}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-sans font-semibold uppercase ${
                        proc.state === 'active'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {proc.state}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-300 max-w-xs truncate">{proc.query}</td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      onClick={() => handleKill(proc.pid)}
                      className="px-2 py-1 rounded bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-900/50 text-[11px] font-sans flex items-center space-x-1 ml-auto transition-colors"
                      title="Kill connection process"
                    >
                      <Trash2 className="w-3 h-3 text-rose-400" />
                      <span>Kill PID</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>{processes.length} active server processes</span>
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
