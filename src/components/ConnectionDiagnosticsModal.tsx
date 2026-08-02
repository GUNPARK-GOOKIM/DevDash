import React, { useEffect, useState } from 'react';
import { Activity, X, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import { ConnectionDiagnostics, diagnoseConnection, isTauriAvailable } from '../services/tauriBridge';

interface ConnectionDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectionId: string;
  connectionName: string;
}

export const ConnectionDiagnosticsModal: React.FC<ConnectionDiagnosticsModalProps> = ({
  isOpen,
  onClose,
  connectionId,
  connectionName,
}) => {
  const [data, setData] = useState<ConnectionDiagnostics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!connectionId) return;
    setLoading(true);
    setError(null);
    try {
      if (!isTauriAvailable()) {
        throw new Error('Diagnostics require the native Tauri desktop app');
      }
      const d = await diagnoseConnection(connectionId);
      setData(d);
    } catch (err) {
      setError(String(err));
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, connectionId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
      <div className="bg-surface border border-border rounded-xl shadow-2xl w-[560px] max-w-[95vw] max-h-[85vh] flex flex-col overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
          <div className="flex items-center space-x-2 text-accent">
            <Activity className="w-4 h-4" />
            <span className="text-sm font-semibold text-text">
              Connection Diagnostics · {connectionName}
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={run}
              disabled={loading}
              className="p-1.5 rounded hover:bg-surface2 text-textMuted"
              title="Re-run"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={onClose} className="p-1 rounded text-textMuted hover:text-text">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-4 bg-base">
          {error && (
            <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg p-3">
              {error}
            </div>
          )}
          {loading && !data && (
            <div className="text-center text-textMuted text-xs py-12">Running diagnostics…</div>
          )}
          {data && (
            <>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <Info label="Status" value={data.success ? 'Healthy' : 'Failed'} ok={data.success} />
                <Info label="Latency" value={`${data.latency_ms} ms`} />
                <Info label="Server" value={data.server_version || '—'} wide />
                <Info label="Database" value={data.current_database || '—'} />
                <Info label="User" value={data.current_user || '—'} />
                <Info
                  label="Superuser"
                  value={
                    data.is_superuser == null ? '—' : data.is_superuser ? 'yes' : 'no'
                  }
                />
                <Info
                  label="Connections"
                  value={
                    data.active_connections != null
                      ? `${data.active_connections}${
                          data.max_connections != null ? ` / ${data.max_connections}` : ''
                        }`
                      : '—'
                  }
                />
                <Info label="DB size" value={data.database_size_pretty || '—'} />
                <Info label="Encoding" value={data.encoding || '—'} />
                <Info
                  label="Uptime"
                  value={
                    data.uptime_seconds != null
                      ? formatUptime(data.uptime_seconds)
                      : '—'
                  }
                />
              </div>

              <div>
                <div className="text-[10px] font-semibold uppercase text-textMuted mb-2">
                  Checks
                </div>
                <div className="space-y-1.5">
                  {data.checks.map((c) => (
                    <div
                      key={c.name}
                      className="flex items-start space-x-2 text-xs p-2 rounded-lg border border-border bg-surface"
                    >
                      {c.ok ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <div className="font-medium text-text">{c.name}</div>
                        <div className="text-textMuted font-mono text-[11px]">{c.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const Info: React.FC<{ label: string; value: string; ok?: boolean; wide?: boolean }> = ({
  label,
  value,
  ok,
  wide,
}) => (
  <div
    className={`p-3 rounded-lg border border-border bg-surface ${wide ? 'col-span-2' : ''}`}
  >
    <div className="text-[10px] uppercase text-textMuted font-semibold">{label}</div>
    <div
      className={`text-xs font-mono mt-0.5 break-all ${
        ok === true ? 'text-emerald-400' : ok === false ? 'text-rose-400' : 'text-text'
      }`}
    >
      {value}
    </div>
  </div>
);

function formatUptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
