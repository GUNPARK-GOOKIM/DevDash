import React, { useState, useMemo, useCallback } from 'react';
import {
  Database, Key, Hash, List, Layers, Clock, Search, RefreshCw, Trash2,
  Plus, ChevronRight, ChevronDown, FileJson, Copy, Eye, Edit3, X,
  Braces, Type, ToggleLeft, AlertCircle,
} from 'lucide-react';

// ─── Redis Key Types ────────────────────────────────────────────────
type RedisKeyType = 'string' | 'hash' | 'list' | 'set' | 'zset' | 'stream' | 'json';

interface RedisKeyEntry {
  key: string;
  type: RedisKeyType;
  ttl: number; // -1 = no expiry, -2 = key doesn't exist, positive = seconds
  size: number; // memory bytes
  value?: any;
}

// ─── MongoDB Document Types ─────────────────────────────────────────
interface MongoDocument {
  _id: string;
  data: Record<string, any>;
}

interface MongoCollection {
  name: string;
  documentCount: number;
  avgDocSize: number;
  indexes: string[];
}

// ─── BSON Tree Node ─────────────────────────────────────────────────
interface BsonTreeNodeProps {
  keyName: string;
  value: any;
  depth: number;
  isLast: boolean;
}

const BsonTreeNode: React.FC<BsonTreeNodeProps> = ({ keyName, value, depth, isLast }) => {
  const [expanded, setExpanded] = useState(depth < 2);

  const valueType = useMemo(() => {
    if (value === null || value === undefined) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }, [value]);

  const isExpandable = valueType === 'object' || valueType === 'array';
  const indent = depth * 16;

  const typeColor: Record<string, string> = {
    string: 'text-emerald-400',
    number: 'text-amber-400',
    boolean: 'text-sky-400',
    null: 'text-red-400',
    object: 'text-purple-400',
    array: 'text-indigo-400',
  };

  const renderValue = () => {
    if (valueType === 'string') return <span className={typeColor.string}>"{String(value).length > 80 ? String(value).slice(0, 80) + '…' : value}"</span>;
    if (valueType === 'number') return <span className={typeColor.number}>{value}</span>;
    if (valueType === 'boolean') return <span className={typeColor.boolean}>{String(value)}</span>;
    if (valueType === 'null') return <span className={typeColor.null}>null</span>;
    if (valueType === 'array') return <span className="text-textMuted text-[10px]">Array[{value.length}]</span>;
    if (valueType === 'object') return <span className="text-textMuted text-[10px]">{`{${Object.keys(value).length} keys}`}</span>;
    return <span className="text-textMuted">{String(value)}</span>;
  };

  return (
    <div>
      <div
        className="flex items-center py-0.5 hover:bg-surface2/30 rounded px-1 group cursor-pointer"
        style={{ paddingLeft: indent }}
        onClick={() => isExpandable && setExpanded(!expanded)}
      >
        {isExpandable ? (
          expanded ? <ChevronDown className="w-3 h-3 text-textMuted shrink-0 mr-1" /> : <ChevronRight className="w-3 h-3 text-textMuted shrink-0 mr-1" />
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <span className="text-purple-300 font-medium mr-1.5">{keyName}</span>
        <span className="text-textMuted mr-1.5">:</span>
        {(!isExpandable || !expanded) && renderValue()}
        <span className={`ml-auto text-[9px] px-1.5 py-0.5 rounded-full font-mono opacity-0 group-hover:opacity-100 transition-opacity ${typeColor[valueType] || 'text-textMuted'} bg-surface2/60`}>
          {valueType}
        </span>
      </div>
      {isExpandable && expanded && (
        <div>
          {valueType === 'array'
            ? (value as any[]).map((item, idx) => (
                <BsonTreeNode key={idx} keyName={`[${idx}]`} value={item} depth={depth + 1} isLast={idx === value.length - 1} />
              ))
            : Object.entries(value as Record<string, any>).map(([k, v], idx, arr) => (
                <BsonTreeNode key={k} keyName={k} value={v} depth={depth + 1} isLast={idx === arr.length - 1} />
              ))
          }
        </div>
      )}
    </div>
  );
};

// ─── Redis Type Badge ───────────────────────────────────────────────
const redisTypeBadge = (type: RedisKeyType) => {
  const colors: Record<RedisKeyType, string> = {
    string: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    hash: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    list: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
    set: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    zset: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
    stream: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
    json: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  };
  const icons: Record<RedisKeyType, React.ReactNode> = {
    string: <Type className="w-2.5 h-2.5" />,
    hash: <Hash className="w-2.5 h-2.5" />,
    list: <List className="w-2.5 h-2.5" />,
    set: <Layers className="w-2.5 h-2.5" />,
    zset: <Layers className="w-2.5 h-2.5" />,
    stream: <RefreshCw className="w-2.5 h-2.5" />,
    json: <Braces className="w-2.5 h-2.5" />,
  };
  return (
    <span className={`inline-flex items-center space-x-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${colors[type]}`}>
      {icons[type]}
      <span>{type}</span>
    </span>
  );
};

// ─── TTL Display ────────────────────────────────────────────────────
const TtlBadge: React.FC<{ ttl: number }> = ({ ttl }) => {
  if (ttl === -1) return <span className="text-[10px] text-textMuted">No Expiry</span>;
  if (ttl === -2) return <span className="text-[10px] text-red-400">Expired</span>;
  const hours = Math.floor(ttl / 3600);
  const mins = Math.floor((ttl % 3600) / 60);
  const secs = ttl % 60;
  const formatted = hours > 0 ? `${hours}h ${mins}m ${secs}s` : mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  const urgency = ttl < 60 ? 'text-red-400' : ttl < 600 ? 'text-amber-400' : 'text-emerald-400';
  return (
    <span className={`inline-flex items-center space-x-1 text-[10px] font-mono ${urgency}`}>
      <Clock className="w-2.5 h-2.5" />
      <span>{formatted}</span>
    </span>
  );
};

// ─── Main NoSQL Inspector Props ─────────────────────────────────────
interface NoSqlInspectorProps {
  dbType: 'redis' | 'mongodb';
  connectionId: string;
  onRunCommand?: (command: string) => void;
}

export const NoSqlInspector: React.FC<NoSqlInspectorProps> = ({ dbType, connectionId, onRunCommand }) => {
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'keys' | 'info' | 'cli'>('keys');

  // ─── Demo Redis Keys ──────────────────────────────────────────
  const [redisKeys] = useState<RedisKeyEntry[]>([
    { key: 'session:user:1001', type: 'string', ttl: 3600, size: 256, value: '{"user_id":1001,"role":"admin","last_login":"2026-07-29T10:00:00Z"}' },
    { key: 'cache:products:all', type: 'hash', ttl: 1800, size: 4096, value: { 'product:1': '{"name":"Widget","price":29.99}', 'product:2': '{"name":"Gadget","price":49.99}', 'product:3': '{"name":"Doohickey","price":9.99}' } },
    { key: 'queue:email:pending', type: 'list', ttl: -1, size: 1024, value: ['mail:1001', 'mail:1002', 'mail:1003', 'mail:1004'] },
    { key: 'tags:active', type: 'set', ttl: -1, size: 512, value: ['javascript', 'typescript', 'rust', 'python', 'go'] },
    { key: 'leaderboard:global', type: 'zset', ttl: 7200, size: 2048, value: { 'player:alpha': 9500, 'player:beta': 8200, 'player:gamma': 7100 } },
    { key: 'events:stream:orders', type: 'stream', ttl: -1, size: 8192, value: '3 entries' },
    { key: 'config:app:settings', type: 'json', ttl: -1, size: 320, value: { theme: 'dark', maxRetries: 3, enableCache: true, apiVersion: 'v2' } },
    { key: 'rate:limit:api:192.168.1.1', type: 'string', ttl: 45, size: 8, value: '47' },
  ]);

  // ─── Demo MongoDB Collections ─────────────────────────────────
  const [mongoCollections] = useState<MongoCollection[]>([
    { name: 'users', documentCount: 15420, avgDocSize: 512, indexes: ['_id', 'email_1', 'created_at_-1'] },
    { name: 'orders', documentCount: 89340, avgDocSize: 1024, indexes: ['_id', 'user_id_1', 'status_1_created_at_-1'] },
    { name: 'products', documentCount: 3200, avgDocSize: 768, indexes: ['_id', 'sku_1', 'category_1'] },
    { name: 'sessions', documentCount: 45000, avgDocSize: 256, indexes: ['_id', 'token_1', 'expires_at_1'] },
    { name: 'audit_logs', documentCount: 1250000, avgDocSize: 384, indexes: ['_id', 'timestamp_-1', 'actor_id_1'] },
  ]);

  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);

  const [mongoDocuments] = useState<MongoDocument[]>([
    { _id: '66a8f1c2e4b0a1234567890a', data: { email: 'alice@example.com', name: 'Alice Chen', role: 'admin', profile: { avatar: 'https://cdn.example.com/a.png', bio: 'Full-stack developer', social: { github: 'alicechen', twitter: '@alice_dev' } }, tags: ['typescript', 'rust', 'react'], loginHistory: [{ date: '2026-07-28', ip: '192.168.1.10' }, { date: '2026-07-27', ip: '10.0.0.5' }], created_at: '2026-01-15T08:30:00Z' } },
    { _id: '66a8f1c2e4b0a1234567890b', data: { email: 'bob@example.com', name: 'Bob Park', role: 'editor', profile: { avatar: null, bio: 'Backend engineer', social: { github: 'bobpark' } }, tags: ['python', 'go'], loginHistory: [{ date: '2026-07-29', ip: '172.16.0.2' }], created_at: '2026-02-20T14:00:00Z' } },
    { _id: '66a8f1c2e4b0a1234567890c', data: { email: 'carol@example.com', name: 'Carol Wu', role: 'viewer', profile: { avatar: 'https://cdn.example.com/c.png', bio: null, social: {} }, tags: [], loginHistory: [], created_at: '2026-06-01T09:15:00Z' } },
  ]);

  // ─── Filtered Keys ────────────────────────────────────────────
  const filteredRedisKeys = useMemo(() => {
    if (!searchFilter) return redisKeys;
    return redisKeys.filter(k => k.key.toLowerCase().includes(searchFilter.toLowerCase()));
  }, [redisKeys, searchFilter]);

  const filteredMongoCollections = useMemo(() => {
    if (!searchFilter) return mongoCollections;
    return mongoCollections.filter(c => c.name.toLowerCase().includes(searchFilter.toLowerCase()));
  }, [mongoCollections, searchFilter]);

  const selectedRedisKey = useMemo(() => redisKeys.find(k => k.key === selectedKey), [redisKeys, selectedKey]);

  const totalMemory = useMemo(() => redisKeys.reduce((sum, k) => sum + k.size, 0), [redisKeys]);

  // ─── Copy to Clipboard ────────────────────────────────────────
  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // REDIS VIEWPORT
  // ═══════════════════════════════════════════════════════════════
  if (dbType === 'redis') {
    return (
      <div className="flex flex-col h-full bg-base text-text font-sans select-none">
        {/* Header */}
        <div className="h-10 bg-surface border-b border-border flex items-center px-4 justify-between shrink-0">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 rounded-lg bg-red-500/20 flex items-center justify-center">
              <Database className="w-3.5 h-3.5 text-red-400" />
            </div>
            <h2 className="text-sm font-semibold text-text">Redis Key Browser</h2>
            <span className="text-[10px] text-textMuted bg-surface2 px-2 py-0.5 rounded-full">{redisKeys.length} keys</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-[10px] text-textMuted font-mono">Memory: {(totalMemory / 1024).toFixed(1)} KB</span>
            <button className="p-1.5 rounded-md hover:bg-surface2 text-textMuted hover:text-text transition-colors" title="Refresh Keys">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left: Key List */}
          <div className="w-[320px] border-r border-border flex flex-col bg-surface/30 shrink-0">
            {/* Search */}
            <div className="p-2 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-textMuted" />
                <input
                  type="text"
                  placeholder="Filter keys (e.g. session:*)"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="w-full bg-surface2 border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-text placeholder:text-textMuted/50 outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all"
                />
              </div>
            </div>

            {/* Key List */}
            <div className="flex-1 overflow-auto">
              {filteredRedisKeys.map((entry) => (
                <button
                  key={entry.key}
                  onClick={() => setSelectedKey(entry.key)}
                  className={`w-full px-3 py-2 text-left flex items-center space-x-2.5 border-b border-border/30 transition-colors ${
                    selectedKey === entry.key ? 'bg-accent/10 border-l-2 border-l-accent' : 'hover:bg-surface2/40'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <Key className="w-3 h-3 text-textMuted shrink-0" />
                      <span className="text-[11px] font-mono text-text truncate">{entry.key}</span>
                    </div>
                    <div className="flex items-center space-x-2 mt-1">
                      {redisTypeBadge(entry.type)}
                      <TtlBadge ttl={entry.ttl} />
                    </div>
                  </div>
                  <span className="text-[9px] text-textMuted font-mono shrink-0">{entry.size}B</span>
                </button>
              ))}
            </div>
          </div>

          {/* Right: Key Detail */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {selectedRedisKey ? (
              <>
                {/* Key Header */}
                <div className="px-4 py-3 border-b border-border bg-surface/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Key className="w-4 h-4 text-accent" />
                      <span className="text-sm font-mono font-semibold text-text">{selectedRedisKey.key}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button onClick={() => copyToClipboard(JSON.stringify(selectedRedisKey.value, null, 2))} className="p-1.5 rounded-md hover:bg-surface2 text-textMuted hover:text-text transition-colors" title="Copy Value">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button className="p-1.5 rounded-md hover:bg-surface2 text-textMuted hover:text-text transition-colors" title="Edit Value">
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button className="p-1.5 rounded-md hover:bg-red-500/20 text-textMuted hover:text-red-400 transition-colors" title="Delete Key">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4 mt-2">
                    {redisTypeBadge(selectedRedisKey.type)}
                    <TtlBadge ttl={selectedRedisKey.ttl} />
                    <span className="text-[10px] text-textMuted font-mono">Size: {selectedRedisKey.size} bytes</span>
                  </div>
                </div>

                {/* Value Display */}
                <div className="flex-1 overflow-auto p-4">
                  <div className="bg-surface border border-border rounded-xl p-4">
                    <h4 className="text-[10px] font-semibold text-textMuted uppercase tracking-wider mb-3">Value Inspector</h4>
                    {selectedRedisKey.type === 'string' ? (
                      <div className="font-mono text-xs text-emerald-400 bg-surface2/50 rounded-lg p-3 whitespace-pre-wrap break-all">
                        {String(selectedRedisKey.value)}
                      </div>
                    ) : selectedRedisKey.type === 'hash' ? (
                      <div className="space-y-1">
                        {Object.entries(selectedRedisKey.value as Record<string, string>).map(([field, val]) => (
                          <div key={field} className="flex items-start py-1.5 border-b border-border/20 last:border-0">
                            <span className="text-amber-400 font-mono text-xs font-medium min-w-[140px] shrink-0">{field}</span>
                            <span className="text-emerald-400 font-mono text-xs break-all">{val}</span>
                          </div>
                        ))}
                      </div>
                    ) : selectedRedisKey.type === 'list' ? (
                      <div className="space-y-1">
                        {(selectedRedisKey.value as string[]).map((item, idx) => (
                          <div key={idx} className="flex items-center py-1.5 border-b border-border/20 last:border-0">
                            <span className="text-sky-400 font-mono text-[10px] font-bold min-w-[40px] shrink-0">[{idx}]</span>
                            <span className="text-text font-mono text-xs">{item}</span>
                          </div>
                        ))}
                      </div>
                    ) : selectedRedisKey.type === 'set' ? (
                      <div className="flex flex-wrap gap-2">
                        {(selectedRedisKey.value as string[]).map((member) => (
                          <span key={member} className="px-2.5 py-1 bg-purple-500/15 text-purple-400 border border-purple-500/30 rounded-lg text-xs font-mono">
                            {member}
                          </span>
                        ))}
                      </div>
                    ) : selectedRedisKey.type === 'zset' ? (
                      <div className="space-y-1">
                        {Object.entries(selectedRedisKey.value as Record<string, number>)
                          .sort(([, a], [, b]) => b - a)
                          .map(([member, score]) => (
                          <div key={member} className="flex items-center justify-between py-1.5 border-b border-border/20 last:border-0">
                            <span className="text-pink-400 font-mono text-xs">{member}</span>
                            <div className="flex items-center space-x-2">
                              <div className="h-1.5 bg-pink-500/30 rounded-full" style={{ width: `${Math.min((score / 10000) * 100, 100)}px` }}>
                                <div className="h-full bg-pink-500 rounded-full" style={{ width: `${(score / 10000) * 100}%` }} />
                              </div>
                              <span className="text-amber-400 font-mono text-xs font-bold min-w-[50px] text-right">{score}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : selectedRedisKey.type === 'json' ? (
                      <div className="font-mono text-xs">
                        <BsonTreeNode keyName="root" value={selectedRedisKey.value} depth={0} isLast={true} />
                      </div>
                    ) : (
                      <div className="font-mono text-xs text-textMuted">{String(selectedRedisKey.value)}</div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-textMuted">
                <div className="text-center space-y-2">
                  <Key className="w-10 h-10 mx-auto opacity-20" />
                  <p className="text-sm">Select a key to inspect its value</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // MONGODB VIEWPORT
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col h-full bg-base text-text font-sans select-none">
      {/* Header */}
      <div className="h-10 bg-surface border-b border-border flex items-center px-4 justify-between shrink-0">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 rounded-lg bg-emerald-500/20 flex items-center justify-center">
            <Database className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <h2 className="text-sm font-semibold text-text">MongoDB Document Browser</h2>
          <span className="text-[10px] text-textMuted bg-surface2 px-2 py-0.5 rounded-full">{mongoCollections.length} collections</span>
        </div>
        <button className="p-1.5 rounded-md hover:bg-surface2 text-textMuted hover:text-text transition-colors">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Collection List */}
        <div className="w-[260px] border-r border-border flex flex-col bg-surface/30 shrink-0">
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-textMuted" />
              <input
                type="text"
                placeholder="Filter collections…"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full bg-surface2 border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-text placeholder:text-textMuted/50 outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all"
              />
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            {filteredMongoCollections.map((col) => (
              <button
                key={col.name}
                onClick={() => setSelectedCollection(col.name)}
                className={`w-full px-3 py-2.5 text-left border-b border-border/30 transition-colors ${
                  selectedCollection === col.name ? 'bg-accent/10 border-l-2 border-l-accent' : 'hover:bg-surface2/40'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Layers className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="text-[12px] font-medium text-text">{col.name}</span>
                </div>
                <div className="flex items-center space-x-3 mt-1 pl-5">
                  <span className="text-[10px] text-textMuted font-mono">{col.documentCount.toLocaleString()} docs</span>
                  <span className="text-[10px] text-textMuted font-mono">~{col.avgDocSize}B avg</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right: Document Browser */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedCollection ? (
            <>
              {/* Collection Header */}
              <div className="px-4 py-3 border-b border-border bg-surface/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Layers className="w-4 h-4 text-emerald-400" />
                    <span className="text-sm font-semibold text-text">{selectedCollection}</span>
                    <span className="text-[10px] text-textMuted bg-surface2 px-2 py-0.5 rounded-full">
                      {mongoCollections.find(c => c.name === selectedCollection)?.documentCount.toLocaleString()} documents
                    </span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <button className="px-2.5 py-1 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-lg text-[11px] font-medium hover:bg-emerald-500/25 transition-colors flex items-center space-x-1">
                      <Plus className="w-3 h-3" />
                      <span>Insert</span>
                    </button>
                  </div>
                </div>

                {/* Indexes */}
                <div className="flex items-center space-x-2 mt-2">
                  <span className="text-[10px] text-textMuted">Indexes:</span>
                  {mongoCollections.find(c => c.name === selectedCollection)?.indexes.map(idx => (
                    <span key={idx} className="text-[9px] font-mono px-1.5 py-0.5 bg-surface2 border border-border rounded text-textMuted">
                      {idx}
                    </span>
                  ))}
                </div>
              </div>

              {/* Documents */}
              <div className="flex-1 overflow-auto p-3 space-y-3">
                {mongoDocuments.map((doc) => (
                  <div key={doc._id} className="bg-surface border border-border rounded-xl overflow-hidden group">
                    {/* Doc Header */}
                    <div className="px-4 py-2 bg-surface2/30 border-b border-border/50 flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <FileJson className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-[10px] font-mono text-textMuted">_id:</span>
                        <span className="text-[11px] font-mono text-amber-400">{doc._id}</span>
                      </div>
                      <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => copyToClipboard(JSON.stringify(doc.data, null, 2))} className="p-1 rounded hover:bg-surface2 text-textMuted hover:text-text transition-colors" title="Copy Document">
                          <Copy className="w-3 h-3" />
                        </button>
                        <button className="p-1 rounded hover:bg-surface2 text-textMuted hover:text-text transition-colors" title="Edit Document">
                          <Edit3 className="w-3 h-3" />
                        </button>
                        <button className="p-1 rounded hover:bg-red-500/20 text-textMuted hover:text-red-400 transition-colors" title="Delete Document">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* Doc Body (BSON Tree) */}
                    <div className="px-4 py-2 font-mono text-xs">
                      {Object.entries(doc.data).map(([key, val], idx, arr) => (
                        <BsonTreeNode key={key} keyName={key} value={val} depth={0} isLast={idx === arr.length - 1} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-textMuted">
              <div className="text-center space-y-2">
                <Layers className="w-10 h-10 mx-auto opacity-20" />
                <p className="text-sm">Select a collection to browse documents</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
