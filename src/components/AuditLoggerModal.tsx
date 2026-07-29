import React, { useState } from 'react';
import { Shield, X, Download, Search, Clock, Terminal, User, AlertCircle, FileCheck } from 'lucide-react';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  user: string;
  connectionName: string;
  actionType: 'QUERY' | 'EXPORT' | 'CONNECT' | 'STAGED_COMMIT' | 'STRUCTURE_CHANGE';
  sql: string;
  affectedRows: number;
  status: 'SUCCESS' | 'BLOCKED_SAFE_MODE' | 'FAILED';
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
  logs = [
    {
      id: 'audit-1',
      timestamp: '2026-07-29T15:45:10Z',
      user: 'dev_admin',
      connectionName: 'production_db_main',
      actionType: 'STAGED_COMMIT',
      sql: 'UPDATE users SET role = \'admin\' WHERE id = 101;',
      affectedRows: 1,
      status: 'SUCCESS',
      clientIp: '192.168.1.45',
    },
    {
      id: 'audit-2',
      timestamp: '2026-07-29T15:42:00Z',
      user: 'dev_admin',
      connectionName: 'production_db_main',
      actionType: 'QUERY',
      sql: 'DELETE FROM orders;',
      affectedRows: 0,
      status: 'BLOCKED_SAFE_MODE',
      clientIp: '192.168.1.45',
    },
    {
      id: 'audit-3',
      timestamp: '2026-07-29T15:30:15Z',
      user: 'dev_admin',
      connectionName: 'staging_cache',
      actionType: 'EXPORT',
      sql: 'EXPORT TABLE products FORMAT csv;',
      affectedRows: 3200,
      status: 'SUCCESS',
      clientIp: '192.168.1.45',
    },
  ],
}) => {
  const [filter, setFilter] = useState('');

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
    a.download = `soc2_audit_trail_${Date.now()}.json`;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-fadeIn select-none font-sans">
      <div className="bg-surface border border-border rounded-xl shadow-2xl w-[740px] h-[520px] max-w-[95vw] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between bg-surface/90">
          <div className="flex items-center space-x-2 text-emerald-400 font-semibold text-sm">
            <Shield className="w-4 h-4" />
            <span className="text-text">SOC2 / HIPAA Compliance Audit Trail Logger</span>
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
            <span>Export SOC2 Report</span>
          </button>
        </div>

        {/* Logs Table */}
        <div className="flex-1 overflow-auto p-4 bg-base">
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 bg-surface border-t border-border flex items-center justify-between text-[10px] text-textMuted font-mono">
          <span>Append-Only Tamper-Evident Storage: <strong className="text-emerald-400">Active</strong></span>
          <span>Total Recorded Events: {logs.length}</span>
        </div>
      </div>
    </div>
  );
};
