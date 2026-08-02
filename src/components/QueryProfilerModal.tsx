import React, { useState } from 'react';
import { Cpu, X, Play, RefreshCw } from 'lucide-react';
import { profileSqlQuery, QueryProfile, isTauriAvailable } from '../services/tauriBridge';

interface QueryProfilerModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectionId: string;
  initialSql: string;
}

export const QueryProfilerModal: React.FC<QueryProfilerModalProps> = ({
  isOpen,
  onClose,
  connectionId,
  initialSql,
}) => {
  const [sql, setSql] = useState(initialSql);
  const [profile, setProfile] = useState<QueryProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setSql(initialSql);
      setProfile(null);
      setError(null);
    }
  }, [isOpen, initialSql]);

  if (!isOpen) return null;

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!isTauriAvailable()) throw new Error('Profiling requires the native app');
      const p = await profileSqlQuery(connectionId, sql);
      setProfile(p);
    } catch (err) {
      setError(String(err));
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
      <div className="bg-surface border border-border rounded-xl shadow-2xl w-[720px] max-w-[95vw] h-[580px] flex flex-col overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
          <div className="flex items-center space-x-2 text-accent">
            <Cpu className="w-4 h-4" />
            <span className="text-sm font-semibold text-text">Query Profiler</span>
          </div>
          <button onClick={onClose} className="p-1 rounded text-textMuted hover:text-text">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 border-b border-border space-y-2">
          <textarea
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            rows={3}
            className="w-full bg-base border border-border rounded-lg p-2 text-xs font-mono text-text resize-none focus:border-accent/50 outline-none"
            placeholder="SELECT …"
          />
          <div className="flex justify-end">
            <button
              onClick={run}
              disabled={loading || !sql.trim()}
              className="px-3 py-1.5 rounded bg-accent hover:bg-accentHover text-white text-xs font-semibold flex items-center space-x-1.5 disabled:opacity-40"
            >
              {loading ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              <span>{loading ? 'Profiling…' : 'Profile (EXPLAIN)'}</span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 bg-base space-y-3">
          {error && (
            <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg p-3">
              {error}
            </div>
          )}
          {profile && (
            <>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <Stat label="Total" value={`${profile.total_time_ms.toFixed(2)} ms`} />
                <Stat
                  label="Planning"
                  value={
                    profile.planning_time_ms != null
                      ? `${profile.planning_time_ms.toFixed(2)} ms`
                      : '—'
                  }
                />
                <Stat
                  label="Execution"
                  value={
                    profile.execution_time_ms != null
                      ? `${profile.execution_time_ms.toFixed(2)} ms`
                      : '—'
                  }
                />
              </div>
              <div className="text-[11px] text-textMuted">{profile.summary}</div>
              {profile.nodes.length > 0 && (
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="px-3 py-1.5 bg-surface text-[10px] uppercase font-semibold text-textMuted">
                    Plan nodes
                  </div>
                  <div className="divide-y divide-border/40 max-h-48 overflow-auto">
                    {profile.nodes.map((n, i) => (
                      <div key={i} className="px-3 py-1.5 text-[11px] font-mono flex justify-between">
                        <span className="text-text truncate">{n.detail}</span>
                        <span className="text-textMuted shrink-0 ml-2">
                          {n.actual_ms != null
                            ? `${n.actual_ms.toFixed(2)}ms`
                            : n.cost != null
                              ? `cost ${n.cost.toFixed(1)}`
                              : ''}
                          {n.rows != null ? ` · ${n.rows} rows` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <pre className="text-[10px] font-mono text-accent/90 bg-surface border border-border rounded-lg p-3 overflow-auto max-h-40 whitespace-pre-wrap">
                {profile.plan_text}
              </pre>
            </>
          )}
          {!profile && !error && !loading && (
            <div className="text-center text-textMuted text-xs py-16">
              Run EXPLAIN / EXPLAIN ANALYZE against the active connection
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="p-2.5 rounded-lg border border-border bg-surface">
    <div className="text-[10px] uppercase text-textMuted font-semibold">{label}</div>
    <div className="text-sm font-mono text-accent mt-0.5">{value}</div>
  </div>
);
