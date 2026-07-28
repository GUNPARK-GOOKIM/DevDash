import React, { useState, useRef, useCallback } from 'react';
import { ConnectionConfig, DbKind } from '../types';
import {
  Plus, Search, Database, Upload, Star, Clock, Trash2,
  Server, ChevronRight, Zap, ArrowRight, FolderOpen,
  Edit3, Copy, ExternalLink, MoreHorizontal, Settings,
} from 'lucide-react';

interface WelcomePageProps {
  connections: ConnectionConfig[];
  onConnect: (conn: ConnectionConfig) => void;
  onNewConnection: () => void;
  onDeleteConnection: (id: string) => void;
  onDuplicateConnection: (conn: ConnectionConfig) => void;
  onImportConnections: (file: File) => void;
  onOpenSettings: () => void;
  recentConnectionIds: string[];
}

// DB type metadata: icon color, label, default port
const DB_META: Record<DbKind, { color: string; label: string; icon: string; port: number }> = {
  postgres:    { color: '#336791', label: 'PostgreSQL',   icon: '🐘', port: 5432 },
  mysql:       { color: '#4479A1', label: 'MySQL',        icon: '🐬', port: 3306 },
  mariadb:     { color: '#003545', label: 'MariaDB',      icon: '🦭', port: 3306 },
  sqlite:      { color: '#003B57', label: 'SQLite',       icon: '📦', port: 0 },
  mssql:       { color: '#CC2927', label: 'SQL Server',   icon: '🏢', port: 1433 },
  cockroachdb: { color: '#6933FF', label: 'CockroachDB',  icon: '🪳', port: 26257 },
  redshift:    { color: '#8C4FFF', label: 'Redshift',     icon: '🔴', port: 5439 },
  oracle:      { color: '#F80000', label: 'Oracle',       icon: '🔮', port: 1521 },
  snowflake:   { color: '#29B5E8', label: 'Snowflake',    icon: '❄️', port: 443 },
  redis:       { color: '#DC382D', label: 'Redis',        icon: '⚡', port: 6379 },
  mongodb:     { color: '#47A248', label: 'MongoDB',      icon: '🍃', port: 27017 },
  cassandra:   { color: '#1287B1', label: 'Cassandra',    icon: '👁', port: 9042 },
  clickhouse:  { color: '#FFCC01', label: 'ClickHouse',   icon: '🏠', port: 8123 },
  duckdb:      { color: '#FFF000', label: 'DuckDB',       icon: '🦆', port: 0 },
  bigquery:    { color: '#4285F4', label: 'BigQuery',     icon: '📊', port: 0 },
  turso:       { color: '#4FF8D2', label: 'Turso',        icon: '🚀', port: 0 },
};

// Featured quick-connect DB types shown as cards
const FEATURED_DBS: DbKind[] = ['postgres', 'mysql', 'sqlite', 'mongodb', 'redis', 'mssql', 'mariadb', 'duckdb'];

export const WelcomePage: React.FC<WelcomePageProps> = ({
  connections,
  onConnect,
  onNewConnection,
  onDeleteConnection,
  onDuplicateConnection,
  onImportConnections,
  onOpenSettings,
  recentConnectionIds,
}) => {
  const [search, setSearch] = useState('');
  const [hoveredConn, setHoveredConn] = useState<string | null>(null);
  const [contextMenuConn, setContextMenuConn] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter connections by search
  const filtered = connections.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.db_type.toLowerCase().includes(search.toLowerCase()) ||
    c.host.toLowerCase().includes(search.toLowerCase()) ||
    c.database.toLowerCase().includes(search.toLowerCase())
  );

  // Recent connections (last 5)
  const recentConns = recentConnectionIds
    .map(id => connections.find(c => c.id === id))
    .filter(Boolean)
    .slice(0, 5) as ConnectionConfig[];

  // Starred / favorite connections
  const starredConns = connections.filter(c => (c as any).starred);

  // File drop handler
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.json') || file.name.endsWith('.devdash'))) {
      onImportConnections(file);
    }
  }, [onImportConnections]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onImportConnections(file);
  };

  return (
    <div
      className="flex-1 flex flex-col h-screen w-full relative overflow-hidden"
      style={{ background: 'var(--color-base, #0F0F10)' }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {dragOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-accent/10 backdrop-blur-sm border-2 border-dashed border-accent rounded-xl m-4 transition-all">
          <div className="text-center">
            <Upload className="w-12 h-12 text-accent mx-auto mb-3 animate-bounce" />
            <p className="text-accent text-lg font-semibold">Drop connection file to import</p>
            <p className="text-textMuted text-sm mt-1">.json or .devdash files supported</p>
          </div>
        </div>
      )}

      {/* Background gradient orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full opacity-[0.03]"
          style={{ background: 'radial-gradient(circle, #6366F1 0%, transparent 70%)' }} />
        <div className="absolute -bottom-48 -left-24 w-[500px] h-[500px] rounded-full opacity-[0.025]"
          style={{ background: 'radial-gradient(circle, #8B5CF6 0%, transparent 70%)' }} />
        <div className="absolute top-1/3 right-1/4 w-64 h-64 rounded-full opacity-[0.02]"
          style={{ background: 'radial-gradient(circle, #06B6D4 0%, transparent 70%)' }} />
      </div>

      {/* Top bar */}
      <header className="h-12 px-6 flex items-center justify-between shrink-0 relative z-10 border-b border-border/30">
        <div className="flex items-center space-x-3">
          <img src="/logo.png" alt="DevDash" className="h-7 w-auto object-contain rounded" />
          <span className="text-[15px] font-bold tracking-tight text-text">DevDash</span>
          <span className="text-[10px] font-medium text-textMuted bg-surface2/50 px-2 py-0.5 rounded-full">v1.0</span>
        </div>
        <button
          onClick={onOpenSettings}
          className="text-textMuted hover:text-text transition-colors p-2 rounded-lg hover:bg-surface2/50"
          title="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </header>

      {/* Main content — scrollable */}
      <div className="flex-1 overflow-y-auto px-6 py-8 relative z-10">
        <div className="max-w-4xl mx-auto">

          {/* Hero Section */}
          <div className="text-center mb-10">
            <img src="/logo.png" alt="DevDash Logo" className="h-24 w-auto mx-auto mb-5 object-contain filter drop-shadow-xl" />
            <h1 className="text-[28px] font-bold text-text tracking-tight mb-2">
              Welcome to DevDash
            </h1>
            <p className="text-textMuted text-sm max-w-md mx-auto leading-relaxed">
              Connect to your databases, manage schemas, and write queries — all in one place.
              <br />Get started by connecting to an existing database or creating a new connection.
            </p>
          </div>

          {/* Quick Actions Row */}
          <div className="flex items-center justify-center gap-3 mb-10">
            <button
              onClick={onNewConnection}
              className="group flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-accent text-white font-semibold text-sm hover:bg-accent/90 transition-all shadow-lg shadow-accent/25 hover:shadow-accent/40 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Plus className="w-4 h-4" />
              <span>New Connection</span>
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="group flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-surface2/80 text-text font-medium text-sm hover:bg-surface2 transition-all border border-border/50 hover:border-border"
            >
              <Upload className="w-4 h-4 text-textMuted group-hover:text-accent transition-colors" />
              <span>Import</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.devdash"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          {/* Quick Connect Cards — DB types */}
          <div className="mb-10">
            <h2 className="text-[11px] font-semibold text-textMuted uppercase tracking-widest mb-3 px-1">
              Quick Connect
            </h2>
            <div className="grid grid-cols-4 gap-2.5">
              {FEATURED_DBS.map(dbType => {
                const meta = DB_META[dbType];
                return (
                  <button
                    key={dbType}
                    onClick={onNewConnection}
                    className="group relative flex items-center space-x-3 px-4 py-3.5 rounded-xl bg-surface/80 border border-border/50 hover:border-border hover:bg-surface2/60 transition-all cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
                  >
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-lg shrink-0 transition-transform group-hover:scale-110"
                      style={{ background: `${meta.color}20` }}
                    >
                      {meta.icon}
                    </div>
                    <div className="text-left min-w-0">
                      <div className="text-[13px] font-semibold text-text truncate">{meta.label}</div>
                      <div className="text-[10px] text-textMuted">
                        {meta.port > 0 ? `Port ${meta.port}` : 'Local'}
                      </div>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-textMuted/0 group-hover:text-textMuted/60 absolute right-3 top-1/2 -translate-y-1/2 transition-all group-hover:translate-x-0.5" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Saved Connections Section */}
          {connections.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center justify-between mb-3 px-1">
                <h2 className="text-[11px] font-semibold text-textMuted uppercase tracking-widest flex items-center space-x-2">
                  <Server className="w-3.5 h-3.5" />
                  <span>Saved Connections ({connections.length})</span>
                </h2>
                {/* Search */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-textMuted" />
                  <input
                    type="text"
                    placeholder="Filter connections..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-52 h-7 pl-8 pr-3 text-xs bg-surface2/60 border border-border/50 rounded-lg text-text placeholder:text-textMuted/50 focus:outline-none focus:border-accent/40 transition-colors"
                  />
                </div>
              </div>

              {/* Connection list */}
              <div className="space-y-1.5">
                {filtered.length === 0 && search && (
                  <div className="text-center py-8 text-textMuted text-sm">
                    No connections matching "<span className="text-text font-medium">{search}</span>"
                  </div>
                )}
                {filtered.map(conn => {
                  const meta = DB_META[conn.db_type] || DB_META.postgres;
                  const isHovered = hoveredConn === conn.id;
                  const isRecent = recentConnectionIds.includes(conn.id);
                  return (
                    <div
                      key={conn.id}
                      className="group relative flex items-center px-4 py-3 rounded-xl bg-surface/60 border border-border/30 hover:border-border/60 hover:bg-surface2/40 transition-all cursor-pointer"
                      onMouseEnter={() => setHoveredConn(conn.id)}
                      onMouseLeave={() => { setHoveredConn(null); setContextMenuConn(null); }}
                      onClick={() => onConnect(conn)}
                    >
                      {/* DB icon */}
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-base shrink-0 mr-3.5"
                        style={{ background: `${meta.color}18` }}
                      >
                        {meta.icon}
                      </div>

                      {/* Connection info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="text-[13px] font-semibold text-text truncate">{conn.name}</span>
                          {isRecent && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-accent/15 text-accent font-medium">Recent</span>
                          )}
                        </div>
                        <div className="flex items-center space-x-1.5 text-[11px] text-textMuted mt-0.5">
                          <span>{meta.label}</span>
                          <span className="text-textMuted/30">•</span>
                          <span className="truncate">{conn.host}{conn.port > 0 ? `:${conn.port}` : ''}</span>
                          <span className="text-textMuted/30">•</span>
                          <span className="font-medium text-text/60">{conn.database}</span>
                        </div>
                      </div>

                      {/* Status dot */}
                      <div className="flex items-center space-x-2 ml-2">
                        {conn.is_read_only && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-warning/15 text-warning font-medium">Read Only</span>
                        )}
                        <div className={`w-2 h-2 rounded-full shrink-0 ${conn.is_connected ? 'bg-success shadow-sm shadow-success/50' : 'bg-textMuted/30'}`} />
                      </div>

                      {/* Hover actions */}
                      <div className={`flex items-center space-x-1 ml-2 transition-opacity ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onConnect(conn);
                          }}
                          className="px-2.5 py-1 text-[11px] font-semibold text-white bg-accent rounded-lg hover:bg-accent/80 transition-colors"
                        >
                          Connect
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setContextMenuConn(contextMenuConn === conn.id ? null : conn.id);
                          }}
                          className="p-1 rounded-lg hover:bg-surface2 text-textMuted hover:text-text transition-colors"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Context dropdown */}
                      {contextMenuConn === conn.id && (
                        <div
                          className="absolute right-4 top-full mt-1 w-44 bg-surface border border-border rounded-xl shadow-2xl shadow-black/40 py-1.5 z-50"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => { onDuplicateConnection(conn); setContextMenuConn(null); }}
                            className="w-full flex items-center space-x-2.5 px-3 py-2 text-xs text-text hover:bg-surface2 transition-colors"
                          >
                            <Copy className="w-3.5 h-3.5 text-textMuted" />
                            <span>Duplicate</span>
                          </button>
                          <button
                            onClick={() => { onDeleteConnection(conn.id); setContextMenuConn(null); }}
                            className="w-full flex items-center space-x-2.5 px-3 py-2 text-xs text-error hover:bg-error/10 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty state when no connections at all */}
          {connections.length === 0 && (
            <div className="text-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-surface2/60 flex items-center justify-center mx-auto mb-5 border border-border/50">
                <Database className="w-8 h-8 text-textMuted/50" />
              </div>
              <h3 className="text-lg font-semibold text-text mb-2">No connections yet</h3>
              <p className="text-textMuted text-sm max-w-sm mx-auto mb-6">
                Create your first database connection to get started.
                You can also drag and drop a connection file here.
              </p>
              <button
                onClick={onNewConnection}
                className="inline-flex items-center space-x-2 px-6 py-3 rounded-xl bg-accent text-white font-semibold text-sm hover:bg-accent/90 transition-all shadow-lg shadow-accent/25"
              >
                <Plus className="w-4 h-4" />
                <span>Create First Connection</span>
              </button>
            </div>
          )}

          {/* Recent Connections */}
          {recentConns.length > 0 && (
            <div className="mb-8">
              <h2 className="text-[11px] font-semibold text-textMuted uppercase tracking-widest mb-3 px-1 flex items-center space-x-2">
                <Clock className="w-3.5 h-3.5" />
                <span>Recently Used</span>
              </h2>
              <div className="flex flex-wrap gap-2">
                {recentConns.map(conn => {
                  const meta = DB_META[conn.db_type] || DB_META.postgres;
                  return (
                    <button
                      key={`recent-${conn.id}`}
                      onClick={() => onConnect(conn)}
                      className="group flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-surface/60 border border-border/30 hover:border-accent/30 hover:bg-accent/5 transition-all"
                    >
                      <span className="text-base">{meta.icon}</span>
                      <span className="text-[12px] font-medium text-text group-hover:text-accent transition-colors">{conn.name}</span>
                      <ChevronRight className="w-3 h-3 text-textMuted/40 group-hover:text-accent/60 transition-colors" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Footer tips */}
          <div className="mt-12 pt-6 border-t border-border/20">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="p-4 rounded-xl bg-surface/40 border border-border/20">
                <div className="text-lg mb-2">🔒</div>
                <p className="text-[11px] text-textMuted leading-relaxed">
                  <span className="text-text font-semibold block mb-0.5">Encrypted Storage</span>
                  Credentials stored locally with AES-256 encryption
                </p>
              </div>
              <div className="p-4 rounded-xl bg-surface/40 border border-border/20">
                <div className="text-lg mb-2">⚡</div>
                <p className="text-[11px] text-textMuted leading-relaxed">
                  <span className="text-text font-semibold block mb-0.5">Zero Latency</span>
                  Native Rust backend — sub-2ms query execution
                </p>
              </div>
              <div className="p-4 rounded-xl bg-surface/40 border border-border/20">
                <div className="text-lg mb-2">🤖</div>
                <p className="text-[11px] text-textMuted leading-relaxed">
                  <span className="text-text font-semibold block mb-0.5">AI Powered</span>
                  Natural language to SQL with local or cloud LLMs
                </p>
              </div>
            </div>
          </div>

          {/* Keyboard shortcut hint */}
          <div className="text-center mt-8 pb-6">
            <p className="text-[11px] text-textMuted/50">
              Press <kbd className="px-1.5 py-0.5 rounded bg-surface2/60 text-textMuted text-[10px] font-mono border border-border/30">Ctrl+N</kbd> to create a new connection
              {' · '}
              <kbd className="px-1.5 py-0.5 rounded bg-surface2/60 text-textMuted text-[10px] font-mono border border-border/30">Ctrl+,</kbd> for settings
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
