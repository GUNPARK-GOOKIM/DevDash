import React from 'react';
import { Plus, PlugZap, Trash2, Shield, Circle } from 'lucide-react';
import { ConnectionConfig } from '../../types';
import { getEnvironmentMeta, readOnlyReason } from '../../utils/connectionEnv';

interface ConnectionsScreenProps {
  connections: ConnectionConfig[];
  activeId?: string;
  defaultName?: string | null;
  connectingId?: string | null;
  error?: string | null;
  onAdd: () => void;
  onConnect: (conn: ConnectionConfig) => void;
  onRemove: (conn: ConnectionConfig) => void;
}

export const ConnectionsScreen: React.FC<ConnectionsScreenProps> = ({
  connections,
  activeId,
  defaultName,
  connectingId,
  error,
  onAdd,
  onConnect,
  onRemove,
}) => {
  return (
    <div className="h-full overflow-y-auto px-3 py-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Connections</h2>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Shared catalog with Desktop and CLI. Passwords stay in the OS keyring.
          </p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold active:scale-95"
        >
          <Plus className="w-4 h-4" />
          Add
        </button>
      </div>

      {error && (
        <div className="text-xs text-rose-300 bg-rose-950/40 border border-rose-900/50 rounded-xl px-3 py-2">
          {error}
        </div>
      )}

      {connections.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-800 p-6 text-center text-slate-400 text-sm">
          No saved connections yet. Add one, or import a sync bundle from Desktop/CLI.
        </div>
      ) : (
        <div className="space-y-2">
          {connections.map((conn) => {
            const env = getEnvironmentMeta(conn.environment);
            const ro = readOnlyReason(conn);
            const active = activeId === conn.id;
            const busy = connectingId === conn.id;
            return (
              <div
                key={conn.id}
                className={`rounded-2xl border p-3 ${
                  active
                    ? 'border-indigo-500/40 bg-indigo-500/10'
                    : 'border-slate-800 bg-slate-900/60'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Circle
                        className={`w-2.5 h-2.5 fill-current ${
                          active ? 'text-emerald-400' : 'text-slate-600'
                        }`}
                      />
                      <span className="text-sm font-semibold text-slate-100 truncate">
                        {conn.name}
                      </span>
                      {defaultName === conn.name && (
                        <span className="text-[9px] uppercase tracking-wide text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded">
                          default
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 truncate">
                      {conn.db_type}
                      {conn.host ? ` · ${conn.host}:${conn.port}` : ''}
                      {conn.database ? ` / ${conn.database}` : ''}
                    </p>
                    <div className="flex items-center gap-1.5 mt-2">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded border ${env.badgeClass}`}
                      >
                        {env.short}
                      </span>
                      {ro && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-amber-300">
                          <Shield className="w-3 h-3" />
                          RO
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(conn)}
                    className="p-2 rounded-lg text-slate-500 active:bg-slate-800"
                    aria-label={`Remove ${conn.name}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onConnect(conn)}
                  className="mt-3 w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-800 text-slate-100 text-xs font-semibold active:scale-[0.99] disabled:opacity-60"
                >
                  <PlugZap className="w-4 h-4" />
                  {busy ? 'Connecting…' : active ? 'Reconnect' : 'Connect'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
