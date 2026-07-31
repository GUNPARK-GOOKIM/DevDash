import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { getLiveDatabaseMetrics, DatabaseLiveMetrics, isTauriAvailable } from '../services/tauriBridge';

interface HealthGridProps {
  connectionId: string;
  dbType: string;
}

// Circular gauge component
const CircularGauge: React.FC<{ 
  value: number; 
  max: number; 
  label: string; 
  unit?: string;
  colorStops?: { threshold: number; color: string }[];
}> = ({ value, max, label, unit = '', colorStops }) => {
  const percentage = Math.min((value / max) * 100, 100);
  const color = colorStops 
    ? (colorStops.find(s => percentage <= s.threshold) || colorStops[colorStops.length - 1]).color 
    : '#6366F1';

  const radius = 60;
  const stroke = 10;
  const normalizedRadius = radius - stroke / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <svg height={radius * 2} width={radius * 2} className="-rotate-90">
        <circle
          stroke="rgba(255,255,255,0.06)"
          fill="transparent"
          strokeWidth={stroke}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
        <circle
          stroke={color}
          fill="transparent"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          style={{ strokeDashoffset, transition: 'stroke-dashoffset 0.5s ease' }}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center" style={{ width: radius * 2, height: radius * 2 }}>
        <span className="text-2xl font-bold text-text">{typeof value === 'number' && max > 0 ? `${Math.round(percentage)}%` : `${value}`}</span>
        {unit && <span className="text-[10px] text-textMuted">{unit}</span>}
      </div>
      <span className="text-xs text-textMuted mt-1">{label}</span>
    </div>
  );
};

function mapEngine(dbType: string): 'postgres' | 'mysql' | 'sqlite' | null {
  const t = dbType.toLowerCase();
  if (t === 'postgres' || t === 'postgresql' || t === 'cockroachdb' || t === 'redshift') return 'postgres';
  if (t === 'mysql' || t === 'mariadb') return 'mysql';
  if (t === 'sqlite') return 'sqlite';
  return null;
}

export const HealthGrid: React.FC<HealthGridProps> = ({ connectionId, dbType }) => {
  const engine = mapEngine(dbType);
  const [metrics, setMetrics] = useState<DatabaseLiveMetrics | null>(null);
  const [history, setHistory] = useState<{ time: string; value: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedQuery, setExpandedQuery] = useState<number | null>(null);

  const fetchMetrics = async () => {
    if (!engine || !connectionId) return;
    if (!isTauriAvailable()) {
      setError('Live metrics require the native Tauri desktop app. No simulated telemetry is shown.');
      return;
    }
    setLoading(true);
    try {
      const data = await getLiveDatabaseMetrics(connectionId, engine);
      setMetrics(data);
      setError(null);
      const now = new Date();
      const label = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
      setHistory((prev) => {
        const next = [...prev, { time: label, value: Number(data.cache_hit_ratio.toFixed(1)) }];
        return next.slice(-60);
      });
    } catch (err: any) {
      setError(String(err?.message || err || 'Failed to fetch metrics'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!engine || !connectionId) return;
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, [connectionId, engine]);

  if (!engine) {
    return (
      <div className="flex items-center justify-center h-full text-textMuted">
        <div className="text-center space-y-2">
          <AlertTriangle className="w-10 h-10 mx-auto text-warning/50" />
          <p className="text-sm">Health Grid is not supported for {dbType.toUpperCase()} connections.</p>
          <p className="text-xs text-textMuted">Available for PostgreSQL, MySQL/MariaDB, and SQLite.</p>
        </div>
      </div>
    );
  }

  const connGaugeColors = [
    { threshold: 50, color: '#22C55E' },
    { threshold: 75, color: '#F59E0B' },
    { threshold: 100, color: '#EF4444' },
  ];

  const durationColor = (ms: number) => {
    if (ms < 100) return 'text-success';
    if (ms < 500) return 'text-warning';
    return 'text-error';
  };

  const activeConns = metrics?.active_connections ?? 0;
  const cacheHitRate = metrics?.cache_hit_ratio ?? 0;
  const slowQueries = metrics?.slow_queries ?? [];
  const tableSizes = metrics?.table_sizes ?? [];
  // Cap gauge to a sensible max for display; DB max_connections is not always available
  const maxConns = Math.max(activeConns * 2, 100);

  return (
    <div className="h-full overflow-auto p-4">
      <div className="flex items-center space-x-2 mb-4">
        <h2 className="text-sm font-semibold text-text">Health Grid</h2>
        <span className="text-[10px] bg-surface2 text-textMuted px-1.5 py-0.5 rounded">live · 5s</span>
        {metrics && (
          <span className="text-[10px] text-textMuted">
            round-trip {metrics.response_time_ms.toFixed(1)}ms
          </span>
        )}
        <button
          onClick={fetchMetrics}
          className="ml-auto p-1 rounded hover:bg-surface2 text-textMuted hover:text-text"
          title="Refresh metrics"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="mb-3 p-3 rounded-lg border border-warning/30 bg-warning/10 text-warning text-xs">
          {error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        {/* Card 1: Cache hit history (real samples over time) */}
        <div className="bento-card p-4">
          <h3 className="text-xs font-medium text-textMuted mb-1">
            Cache Hit Ratio Trend ({dbType})
          </h3>
          <p className="text-[10px] text-textMuted mb-2">Sampled every 5s from live metrics</p>
          <div className="h-32">
            {history.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-textMuted">Waiting for samples…</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history}>
                  <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#6B6B70' }} interval="preserveStartEnd" />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#6B6B70' }} width={30} />
                  <Tooltip
                    contentStyle={{ background: '#1A1A1C', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, fontSize: 11 }}
                    labelStyle={{ color: '#E8E8EA' }}
                  />
                  <Line type="monotone" dataKey="value" stroke="#6366F1" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Card 2: Active Connections */}
        <div className="bento-card p-4 flex flex-col items-center justify-center relative">
          <h3 className="text-xs font-medium text-textMuted mb-3">Active Connections</h3>
          <CircularGauge
            value={activeConns}
            max={maxConns}
            label={`${activeConns} active`}
            colorStops={connGaugeColors}
          />
        </div>

        {/* Card 3: Query latency / response */}
        <div className="bento-card p-4 flex flex-col items-center justify-center relative">
          <h3 className="text-xs font-medium text-textMuted mb-3">Metrics Query Latency</h3>
          <CircularGauge
            value={Math.min(metrics?.response_time_ms ?? 0, 500)}
            max={500}
            label={`${(metrics?.response_time_ms ?? 0).toFixed(1)}ms`}
            colorStops={connGaugeColors}
          />
        </div>

        {/* Card 4: Table sizes (real) */}
        <div className="bento-card p-4">
          <h3 className="text-xs font-medium text-textMuted mb-2">Largest Tables</h3>
          {tableSizes.length === 0 ? (
            <div className="flex items-center justify-center h-28 text-textMuted text-xs">
              No table size data available
            </div>
          ) : (
            <div className="space-y-1 max-h-36 overflow-auto">
              {tableSizes.map((t) => (
                <div key={t.table_name} className="flex items-center justify-between text-xs bg-surface/50 rounded px-2 py-1.5">
                  <span className="text-text font-medium font-mono truncate">{t.table_name}</span>
                  <span className="text-textMuted shrink-0 ml-2">{t.size_pretty}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Card 5: Slowest Queries */}
        <div className="bento-card p-4 col-span-1">
          <h3 className="text-xs font-medium text-textMuted mb-2">Slowest Queries</h3>
          {slowQueries.length === 0 ? (
            <div className="flex items-center justify-center h-28 text-textMuted text-xs text-center px-2">
              No slow-query data from this engine (requires pg_stat_statements / equivalent).
            </div>
          ) : (
            <div className="space-y-1 overflow-auto max-h-40">
              <div className="grid grid-cols-[1fr_60px_40px] text-[10px] text-textMuted font-medium px-1 mb-1">
                <span>Query</span>
                <span>Duration</span>
                <span>Calls</span>
              </div>
              {slowQueries.map((q, i) => (
                <div key={i}>
                  <button
                    onClick={() => setExpandedQuery(expandedQuery === i ? null : i)}
                    className="w-full grid grid-cols-[1fr_60px_40px] items-center text-[11px] px-1 py-1 hover:bg-surface/50 rounded transition-colors text-left"
                  >
                    <span className="text-text truncate font-mono text-[10px]">
                      {q.query.slice(0, 80)}
                      {q.query.length > 80 ? '…' : ''}
                    </span>
                    <span className={`${durationColor(q.duration_ms)} font-medium`}>
                      {Math.round(q.duration_ms)}ms
                    </span>
                    <span className="text-textMuted">{q.calls}</span>
                  </button>
                  {expandedQuery === i && (
                    <div className="bg-surface rounded p-2 mt-1 mb-1 text-[10px] font-mono text-text/80 whitespace-pre-wrap break-all">
                      {q.query}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Card 6: Buffer Pool Cache Hit Rate */}
        <div className="bento-card p-4 flex flex-col items-center justify-center relative">
          <h3 className="text-xs font-medium text-textMuted mb-3">Buffer / Cache Hit Rate</h3>
          <CircularGauge value={cacheHitRate} max={100} label="" unit="%" colorStops={connGaugeColors} />
          <p className="text-[10px] text-textMuted mt-2">
            QPS sample: {metrics?.queries_per_second?.toFixed(1) ?? '0.0'} (delta sampler not implemented)
          </p>
        </div>
      </div>
    </div>
  );
};
