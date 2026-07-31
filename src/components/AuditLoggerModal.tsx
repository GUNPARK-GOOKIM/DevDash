import React, { useState, useEffect } from 'react';
import { Shield, X, Download, Search, Clock, Terminal, User, AlertCircle, FileCheck } from 'lucide-react';
import { getAuditLog } from '../services/tauriBridge';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  user: string;
  connectionName: string;
  actionType: string;
  sql: string;
  affectedRows: number;
  status: string;
  clientIp: string;
}

interface AuditLoggerModalProps {
  isOpen: boolean;
  onClose: () => void;
  logs?: AuditLogEntry[];
}

export const AuditLoggerModal: React.FC<AuditLoggerModalProps> = ({
  isOpen,
  onClose,
  logs: externalLogs,
}) => {
  const [filter, setFilter] = useState('');
  const [logs, setLogs] = useState<AuditLogEntry[]>(externalLogs || []);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (externalLogs) {
      setLogs(externalLogs);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const entries = await getAuditLog(500);
        if (cancelled) return;
        setLogs(
          entries.map((e) => ({
            id: e.id,
            timestamp: e.timestamp,
            user: e.user,
            connectionName: e.connection_name,
            actionType: e.action_type,
            sql: e.sql,
            affectedRows: e.affected_rows,
            status: e.status,
            clientIp: e.client_ip,
          }))
        );
        setLoadError(null);
      } catch (err: any) {
        if (!cancelled) {
          setLoadError(String(err?.message || err));
          setLogs([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, externalLogs]);

  if (!isOpen) return null;

  const filteredLogs = logs.filter(
    (l) =>
      l.sql.toLowerCase().includes(filter.toLowerCase()) ||
      l.user.toLowerCase().includes(filter.toLowerCase()) ||
      l.actionType.toLowerCase().includes(filter.toLowerCase())
  );

  const exportAuditReport = () => {
    const json = JSON.stringify(logs, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_trail_${Date.now()}.json`;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-fadeIn select-none font-sans">
      <div className="bg-surface border border-border rounded-xl shadow-2xl w-[740px] h-[520px] max-w-[95vw] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between bg-surface/90">
          <div className="flex items-center space-x-2 text-emerald-400 font-semibold text-sm">
            <Shield className="w-4 h-4" />
            <span className="text-text">Local Audit Trail (JSONL)</span>
          </div>
          <button onClick={onClose} className="p-1 rounded text-textMuted hover:text-text hover:bg-surface2 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filter bar */}
        <div className="p-3 border-b border-border bg-surface2/30 flex items-center justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-textMuted" />
            <input
              type="text"
              placeholder="Search audit trail by user, SQL, or action..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full bg-surface2 border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-text outline-none focus:border-accent"
            />
          </div>
          <button
            onClick={exportAuditReport}
            className="px-3 py-1.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-semibold hover:bg-emerald-500/25 transition-colors flex items-center space-x-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export JSON</span>
          </button>
        </div>

        {/* Logs Table */}
        <div className="flex-1 overflow-auto p-4 bg-base">
          {loadError && (
            <div className="mb-3 p-2 rounded border border-warning/30 bg-warning/10 text-warning text-xs">
              {loadError}
            </div>
          )}
          {filteredLogs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-textMuted text-xs text-center px-6">
              No audit entries yet. Queries and staged commits are appended to a local JSONL file under the app config directory.
              This is not a certified SOC2/HIPAA control.
            </div>
          ) : (
            <table className="w-full border-collapse text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-border text-textMuted text-[10px] uppercase tracking-wider bg-surface2/20">
                  <th className="p-2">Timestamp</th>
                  <th className="p-2">User</th>
                  <th className="p-2">Action</th>
                  <th className="p-2">Executed Statement</th>
                  <th className="p-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="border-b border-border/30 hover:bg-surface2/20 transition-colors">
                    <td className="p-2 text-textMuted text-[10px] whitespace-nowrap">{log.timestamp}</td>
                    <td className="p-2 text-text font-medium">{log.user}</td>
                    <td className="p-2">
                      <span className="px-1.5 py-0.5 rounded bg-surface2 border border-border text-[9px] font-bold text-accent">
                        {log.actionType}
                      </span>
                    </td>
                    <td className="p-2 text-purple-300 max-w-xs truncate" title={log.sql}>
                      {log.sql}
                    </td>
                    <td className="p-2 text-right whitespace-nowrap">
                      {log.status === 'SUCCESS' && <span className="text-emerald-400 text-[10px] font-bold">✓ SUCCESS</span>}
                      {log.status === 'BLOCKED_SAFE_MODE' && <span className="text-amber-400 text-[10px] font-bold">🛡 BLOCKED</span>}
                      {log.status === 'FAILED' && <span className="text-red-400 text-[10px] font-bold">✕ FAILED</span>}
                      {log.status !== 'SUCCESS' && log.status !== 'BLOCKED_SAFE_MODE' && log.status !== 'FAILED' && (
                        <span className="text-textMuted text-[10px] font-bold">{log.status}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 bg-surface border-t border-border flex items-center justify-between text-[10px] text-textMuted font-mono">
          <span>Local append-only JSONL (not tamper-proof / not compliance certified)</span>
          <span>Total Recorded Events: {logs.length}</span>
        </div>
      </div>
    </div>
  );
};
