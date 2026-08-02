import React, { useCallback, useEffect, useState } from 'react';
import { GitBranch, Play, Check, RotateCcw, AlertTriangle } from 'lucide-react';
import {
  beginTransaction,
  commitTransaction,
  rollbackTransaction,
  getTransactionStatus,
  TxStatus,
  isTauriAvailable,
} from '../services/tauriBridge';

interface TransactionBarProps {
  connectionId: string | null;
  connectionName?: string;
  onStatusChange?: (active: boolean) => void;
}

export const TransactionBar: React.FC<TransactionBarProps> = ({
  connectionId,
  connectionName,
  onStatusChange,
}) => {
  const [status, setStatus] = useState<TxStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!connectionId || !isTauriAvailable()) {
      setStatus(null);
      return;
    }
    try {
      const s = await getTransactionStatus(connectionId);
      setStatus(s);
      onStatusChange?.(s.active);
    } catch {
      /* ignore */
    }
  }, [connectionId, onStatusChange]);

  useEffect(() => {
    refresh();
    if (!connectionId) return;
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, [connectionId, refresh]);

  if (!connectionId) return null;

  const run = async (fn: () => Promise<TxStatus>) => {
    setBusy(true);
    setError(null);
    try {
      const s = await fn();
      setStatus(s);
      onStatusChange?.(s.active);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const active = status?.active;

  return (
    <div
      className={`h-8 px-3 flex items-center justify-between text-[11px] border-b shrink-0 ${
        active
          ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
          : 'bg-surface/50 border-border text-textMuted'
      }`}
    >
      <div className="flex items-center space-x-2">
        <GitBranch className={`w-3.5 h-3.5 ${active ? 'text-amber-400' : 'text-textMuted'}`} />
        <span className="font-medium">
          {active ? (
            <>
              Transaction open on <strong className="text-text">{connectionName || connectionId}</strong>
              {' · '}
              {status?.statement_count ?? 0} stmt · {status?.duration_ms ?? 0}ms
            </>
          ) : (
            <>
              Auto-commit · {connectionName || 'connection'}
            </>
          )}
        </span>
        {error && (
          <span className="flex items-center space-x-1 text-rose-300">
            <AlertTriangle className="w-3 h-3" />
            <span className="truncate max-w-[200px]">{error}</span>
          </span>
        )}
      </div>
      <div className="flex items-center space-x-1.5">
        {!active ? (
          <button
            disabled={busy || !isTauriAvailable()}
            onClick={() => run(() => beginTransaction(connectionId))}
            className="px-2 py-0.5 rounded border border-border hover:bg-surface2 text-text flex items-center space-x-1 disabled:opacity-40"
            title="BEGIN transaction"
          >
            <Play className="w-3 h-3" />
            <span>Begin</span>
          </button>
        ) : (
          <>
            <button
              disabled={busy}
              onClick={() => run(() => commitTransaction(connectionId))}
              className="px-2 py-0.5 rounded bg-emerald-600/80 hover:bg-emerald-600 text-white flex items-center space-x-1 disabled:opacity-40"
            >
              <Check className="w-3 h-3" />
              <span>Commit</span>
            </button>
            <button
              disabled={busy}
              onClick={() => run(() => rollbackTransaction(connectionId))}
              className="px-2 py-0.5 rounded bg-rose-700/80 hover:bg-rose-700 text-white flex items-center space-x-1 disabled:opacity-40"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Rollback</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
};
