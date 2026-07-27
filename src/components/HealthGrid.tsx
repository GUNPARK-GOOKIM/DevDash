import React, { useState, useMemo, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { AlertTriangle, Clock } from 'lucide-react';

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

// Mock data generators
const generateCpuData = () => {
  const now = new Date();
  return Array.from({ length: 60 }, (_, i) => {
    const t = new Date(now.getTime() - (59 - i) * 60000);
    return {
      time: `${t.getHours().toString().padStart(2, '0')}:${t.getMinutes().toString().padStart(2, '0')}`,
      value: Math.max(5, Math.min(95, 30 + Math.random() * 40 + (i > 45 ? 20 : 0))),
    };
  });
};

const slowQueries = [
  { sql: "SELECT user_id, email, (SELECT count(*) FROM orders WHERE orders.user_id = users.id) a order_count FROM users WHERE orders.created_at < NOW() - INTERVAL '1 year' LIMIT 100;", duration: 850, calls: 16 },
  { sql: "SELECT user_id, email, (SELECT count(*) FROM orders WHERE orders.user_id = users.id) a order_count FROM users WHERE created_at < NOW() - INTERVAL '1 year' LIMIT 100;", duration: 720, calls: 2 },
  { sql: "SELECT user_id, email, (SELECT count(*) FROM orders WHERE orders.user_id = users.id) a order_count FROM users WHERE created_at < NOW() - INTERVAL '1 year' LIMIT 100;", duration: 650, calls: 8 },
  { sql: "SELECT user_id, email, (SELECT count(*) FROM orders WHERE orders.user_id = users.id) a order_count FROM users WHERE created_at < NOW() - INTERVAL '1 year' LIMIT 100;", duration: 600, calls: 3 },
];

export const HealthGrid: React.FC<HealthGridProps> = ({ connectionId, dbType }) => {
  const [cpuData, setCpuData] = useState(generateCpuData);
  const [activeConns, setActiveConns] = useState(280);
  const [maxConns] = useState(1000);
  const [ramPercent, setRamPercent] = useState(77);
  const [cacheHitRate, setCacheHitRate] = useState(76);
  const [expandedQuery, setExpandedQuery] = useState<number | null>(null);
  const [tableLocks, setTableLocks] = useState<{ table: string; lockType: string; duration: string }[]>([]);

  const isSupported = dbType === 'postgres' || dbType === 'mysql';

  // Auto refresh every 5 seconds
  useEffect(() => {
    if (!isSupported) return;
    const interval = setInterval(() => {
      setCpuData(generateCpuData());
      setActiveConns(prev => Math.max(200, Math.min(900, prev + Math.floor(Math.random() * 40 - 20))));
      setRamPercent(prev => Math.max(40, Math.min(95, prev + Math.floor(Math.random() * 6 - 3))));
      setCacheHitRate(prev => Math.max(60, Math.min(99, prev + Math.floor(Math.random() * 4 - 2))));
    }, 5000);
    return () => clearInterval(interval);
  }, [isSupported]);

  if (!isSupported) {
    return (
      <div className="flex items-center justify-center h-full text-textMuted">
        <div className="text-center space-y-2">
          <AlertTriangle className="w-10 h-10 mx-auto text-warning/50" />
          <p className="text-sm">Health Grid is not supported for {dbType.toUpperCase()} connections.</p>
          <p className="text-xs text-textMuted">Available for PostgreSQL and MySQL only.</p>
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

  // Cache hit sparkline data
  const sparkData = Array.from({ length: 12 }, (_, i) => ({
    v: Math.max(60, Math.min(99, cacheHitRate + Math.floor(Math.random() * 10 - 5))),
  }));

  return (
    <div className="h-full overflow-auto p-4">
      <div className="flex items-center space-x-2 mb-4">
        <h2 className="text-sm font-semibold text-text">Health Grid</h2>
        <span className="text-[10px] bg-surface2 text-textMuted px-1.5 py-0.5 rounded">⟳ 5s</span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {/* Card 1: CPU Load */}
        <div className="bento-card p-4">
          <h3 className="text-xs font-medium text-textMuted mb-1">System CPU Load ({dbType === 'postgres' ? 'PostgreSQL' : 'MySQL'})</h3>
          <p className="text-[10px] text-textMuted mb-2">Last-hour usage</p>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cpuData}>
                <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#6B6B70' }} interval={14} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#6B6B70' }} width={30} />
                <Tooltip
                  contentStyle={{ background: '#1A1A1C', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, fontSize: 11 }}
                  labelStyle={{ color: '#E8E8EA' }}
                />
                <Line type="monotone" dataKey="value" stroke="#6366F1" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Card 2: Active Connections */}
        <div className="bento-card p-4 flex flex-col items-center justify-center relative">
          <h3 className="text-xs font-medium text-textMuted mb-3">Active Connections</h3>
          <CircularGauge value={activeConns} max={maxConns} label={`${activeConns} / ${maxConns}`} colorStops={connGaugeColors} />
        </div>

        {/* Card 3: RAM Utilization */}
        <div className="bento-card p-4 flex flex-col items-center justify-center relative">
          <h3 className="text-xs font-medium text-textMuted mb-3">RAM Utilization</h3>
          <CircularGauge value={ramPercent} max={100} label="" unit="memory" colorStops={connGaugeColors} />
        </div>

        {/* Card 4: Table Locks */}
        <div className="bento-card p-4">
          <div className="flex items-center space-x-2 mb-2">
            <h3 className="text-xs font-medium text-textMuted">Table Locks</h3>
            {tableLocks.length > 0 && (
              <span className="flex items-center space-x-1 text-[10px] bg-warning/20 text-warning px-1.5 py-0.5 rounded">
                <AlertTriangle className="w-3 h-3" />
                <span>{tableLocks.length}</span>
              </span>
            )}
          </div>
          {tableLocks.length === 0 ? (
            <div className="flex items-center justify-center h-28 text-textMuted text-xs">
              No active locks detected
            </div>
          ) : (
            <div className="space-y-1">
              {tableLocks.map((lock, i) => (
                <div key={i} className="flex items-center justify-between text-xs bg-surface/50 rounded px-2 py-1.5">
                  <span className="text-text font-medium">{lock.table}</span>
                  <span className="text-warning">{lock.lockType}</span>
                  <span className="text-textMuted">{lock.duration}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Card 5: Slowest Queries */}
        <div className="bento-card p-4 col-span-1">
          <h3 className="text-xs font-medium text-textMuted mb-2">Slowest Queries (Last 24h)</h3>
          <div className="space-y-1 overflow-auto max-h-40">
            <div className="grid grid-cols-[1fr_60px_40px] text-[10px] text-textMuted font-medium px-1 mb-1">
              <span>Query</span>
              <span>Duration</span>
              <span>Call...</span>
            </div>
            {slowQueries.map((q, i) => (
              <div key={i}>
                <button
                  onClick={() => setExpandedQuery(expandedQuery === i ? null : i)}
                  className="w-full grid grid-cols-[1fr_60px_40px] items-center text-[11px] px-1 py-1 hover:bg-surface/50 rounded transition-colors text-left"
                >
                  <span className="text-text truncate font-mono text-[10px]">
                    {expandedQuery === i ? '' : '● '}
                    {q.sql.slice(0, 80)}...
                  </span>
                  <span className={`${durationColor(q.duration)} font-medium`}>{q.duration}ms</span>
                  <span className="text-textMuted">{q.calls}</span>
                </button>
                {expandedQuery === i && (
                  <div className="bg-surface rounded p-2 mt-1 mb-1 text-[10px] font-mono text-text/80 whitespace-pre-wrap break-all">
                    {q.sql}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Card 6: Buffer Pool Cache Hit Rate */}
        <div className="bento-card p-4 flex flex-col items-center justify-center relative">
          <h3 className="text-xs font-medium text-textMuted mb-3">Buffer Pool Cache Hit Rate</h3>
          <CircularGauge value={cacheHitRate} max={100} label="" colorStops={connGaugeColors} />
          <div className="w-full h-8 mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparkData}>
                <Line type="monotone" dataKey="v" stroke="#6366F1" strokeWidth={1} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
