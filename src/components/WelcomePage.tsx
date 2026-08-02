import React, { useState, useRef, useCallback } from 'react';
import { motion, useMotionValue, useTransform, useSpring, AnimatePresence, Variants } from 'framer-motion';
import { ConnectionConfig, DbKind } from '../types';
import {
  Plus, Search, Database, Upload, Star, Clock, Trash2,
  Server, ChevronRight, Zap, ArrowRight, FolderOpen,
  Edit3, Copy, ExternalLink, MoreHorizontal, Settings,
  Users, Layers, Sparkles, Shield, AlertTriangle
} from 'lucide-react';

interface WelcomePageProps {
  connections: ConnectionConfig[];
  onConnect: (conn: ConnectionConfig) => void;
  onNewConnection: (kind?: DbKind) => void;
  onDeleteConnection: (id: string) => void;
  onDuplicateConnection: (conn: ConnectionConfig) => void;
  onImportConnections: (file: File) => void;
  onOpenSettings: () => void;
  recentConnectionIds: string[];
}

// DB type metadata: icon color, label, icon emoji, default port, category
const DB_META: Record<DbKind, { color: string; label: string; icon: string; port: number; category: 'relational' | 'nosql' | 'caching' | 'timeseries' }> = {
  postgres:    { color: '#336791', label: 'PostgreSQL',   icon: '🐘', port: 5432,  category: 'relational' },
  mysql:       { color: '#00758F', label: 'MySQL',        icon: '🐬', port: 3306,  category: 'relational' },
  mariadb:     { color: '#003545', label: 'MariaDB',      icon: '🦭', port: 3306,  category: 'relational' },
  sqlite:      { color: '#003B57', label: 'SQLite',       icon: '📦', port: 0,     category: 'relational' },
  mssql:       { color: '#CC2927', label: 'SQL Server',   icon: '🏢', port: 1433,  category: 'relational' },
  cockroachdb: { color: '#6933FF', label: 'CockroachDB',  icon: '🪳', port: 26257, category: 'relational' },
  redshift:    { color: '#8C4FFF', label: 'Redshift',     icon: '🔴', port: 5439,  category: 'relational' },
  oracle:      { color: '#F80000', label: 'Oracle',       icon: '🔮', port: 1521,  category: 'relational' },
  snowflake:   { color: '#29B5E8', label: 'Snowflake',    icon: '❄️', port: 443,   category: 'relational' },
  redis:       { color: '#DC382D', label: 'Redis',        icon: '⚡', port: 6379,  category: 'caching' },
  mongodb:     { color: '#47A248', label: 'MongoDB',      icon: '🍃', port: 27017, category: 'nosql' },
  cassandra:   { color: '#1287B1', label: 'Cassandra',    icon: '👁', port: 9042,  category: 'nosql' },
  clickhouse:  { color: '#FFCC01', label: 'ClickHouse',   icon: '🏠', port: 8123,  category: 'timeseries' },
  duckdb:      { color: '#FFF000', label: 'DuckDB',       icon: '🦆', port: 0,     category: 'relational' },
  bigquery:    { color: '#4285F4', label: 'BigQuery',     icon: '📊', port: 0,     category: 'relational' },
  turso:       { color: '#4FF8D2', label: 'Turso',        icon: '🚀', port: 0,     category: 'relational' },
};

const ALL_DBS: DbKind[] = [
  'postgres', 'mysql', 'sqlite', 'mariadb', 'cockroachdb', 'redshift',
  'mssql', 'oracle', 'snowflake', 'duckdb', 'bigquery', 'turso',
  'redis', 'mongodb', 'cassandra', 'clickhouse'
];

const NATIVE_DBS: DbKind[] = ['postgres', 'mysql', 'sqlite', 'mariadb', 'cockroachdb', 'redshift', 'duckdb', 'turso', 'redis'];
const RELATIONAL_DBS: DbKind[] = ['postgres', 'mysql', 'sqlite', 'mariadb', 'cockroachdb', 'redshift', 'mssql', 'oracle', 'snowflake', 'duckdb', 'bigquery', 'turso'];
const NOSQL_CACHE_DBS: DbKind[] = ['redis', 'mongodb', 'cassandra', 'clickhouse'];

const CATEGORY_DBS: Record<string, DbKind[]> = {
  all: ALL_DBS,
  relational: RELATIONAL_DBS,
  nosql_cache: NOSQL_CACHE_DBS,
  supported: NATIVE_DBS,
};

const CATEGORIES = [
  { id: 'all', label: '[ All Databases ]' },
  { id: 'relational', label: '[ Relational (SQL) ]' },
  { id: 'nosql_cache', label: '[ NoSQL & Caching ]' },
  { id: 'supported', label: '[ Native Engines ]' },
];

// Interactive Spotlight + 3D Tilt Card Component
const SpotlightTiltCard: React.FC<{
  dbType: DbKind;
  meta: typeof DB_META[DbKind];
  onConnect: () => void;
}> = ({ dbType, meta, onConnect }) => {
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [8, -8]), { damping: 25, stiffness: 200 });
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-8, 8]), { damping: 25, stiffness: 200 });

  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    x.set((mouseX / rect.width) - 0.5);
    y.set((mouseY / rect.height) - 0.5);
    setMousePosition({ x: mouseX, y: mouseY });
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
    setIsHovered(false);
  };

  return (
    <motion.div
      style={{
        perspective: 1000,
        rotateX,
        rotateY,
        transformStyle: 'preserve-3d',
      }}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      onClick={onConnect}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="relative group cursor-pointer rounded-2xl bg-surface2/40 border border-border/50 p-4 transition-colors duration-300 overflow-hidden shadow-lg"
    >
      {/* Soft brand border glow on hover */}
      <div
        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{
          boxShadow: `inset 0 0 0 1px ${meta.color}90, 0 0 24px ${meta.color}35`,
        }}
      />

      {/* Mouse Spotlight Radial Gradient */}
      {isHovered && (
        <div
          className="absolute pointer-events-none inset-0 transition-opacity duration-300"
          style={{
            background: `radial-gradient(240px circle at ${mousePosition.x}px ${mousePosition.y}px, ${meta.color}30, transparent 80%)`,
          }}
        />
      )}

      {/* Card Content */}
      <div className="relative z-10 flex items-center space-x-3.5">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 transition-transform group-hover:scale-110 shadow-md"
          style={{ background: `${meta.color}22`, border: `1px solid ${meta.color}44` }}
        >
          {meta.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-text group-hover:text-white transition-colors truncate">
            {meta.label}
          </div>
          <div className="text-[11px] text-textMuted/80 font-mono mt-0.5">
            {meta.port > 0 ? `Port ${meta.port}` : 'Local'}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

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
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [activeCategory, setActiveCategory] = useState('all');
  const [deleteConfirm, setDeleteConfirm] = useState<ConnectionConfig | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter connections by search
  const filteredConnections = connections.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.db_type.toLowerCase().includes(search.toLowerCase()) ||
    c.host.toLowerCase().includes(search.toLowerCase()) ||
    c.database.toLowerCase().includes(search.toLowerCase())
  );

  // Filter DB cards by active category
  const filteredDbCards = CATEGORY_DBS[activeCategory] || ALL_DBS;

  // Stagger container variants
  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.04,
      },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 14 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1.0] } },
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[#0B0B0C] text-text font-sans overflow-hidden select-none">
      {/* Top Navigation Bar */}
      <header className="h-11 px-4 flex items-center justify-between shrink-0 bg-[#0F0F11]/90 border-b border-border/40 backdrop-blur-md z-30">
        <div className="flex items-center space-x-2.5">
          <img src="/logo.png" alt="DevDash" className="w-6 h-6 object-contain rounded-full shadow-sm" />
          <span className="font-bold text-[14px] tracking-tight text-white font-sans">DevDash</span>
          <span className="text-[10px] font-semibold text-textMuted/70 bg-surface2/60 px-1.5 py-0.5 rounded border border-border/30 font-mono">v1.8</span>
        </div>
        <button
          onClick={onOpenSettings}
          className="text-textMuted hover:text-white transition-colors p-1.5 rounded-lg hover:bg-surface2/60"
          title="Preferences & Settings (Cmd+,)"
        >
          <Settings className="w-4 h-4" />
        </button>
      </header>

      {/* Main Container — Sidebar + Central Workspace */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="flex flex-1 h-[calc(100vh-44px)] overflow-hidden"
      >
        {/* === LEFT SIDEBAR === */}
        <motion.aside
          variants={itemVariants}
          className="w-72 bg-[#111113]/95 border-r border-border/40 flex flex-col h-full z-20 shrink-0 backdrop-blur-xl"
        >
          {/* Search Bar with Border Beam focus glow */}
          <div className="p-3 border-b border-border/30 shrink-0">
            <div className={`relative flex items-center rounded-xl transition-all duration-300 ${
              isSearchFocused
                ? 'border-indigo-500/80 shadow-[0_0_16px_rgba(99,102,241,0.35)] bg-surface'
                : 'border-neutral-800 bg-surface2/30 hover:border-neutral-700'
            } border px-3 py-1.5`}>
              <Search className="w-3.5 h-3.5 text-textMuted mr-2 shrink-0" />
              <input
                type="text"
                placeholder="Search Connections..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setIsSearchFocused(false)}
                className="w-full bg-transparent text-xs text-text placeholder-textMuted/60 outline-none"
              />
              <span className="text-[10px] text-textMuted/60 bg-neutral-900 border border-neutral-800 rounded px-1.5 py-0.5 font-mono shrink-0 ml-1">
                ⌘K
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="p-2 space-y-0.5 border-b border-border/30 shrink-0 text-xs">
            <motion.button
              whileHover={{ x: 4 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl bg-accent/15 text-accent font-medium"
            >
              <Database className="w-4 h-4 shrink-0" />
              <span>My Connections</span>
            </motion.button>

            <motion.button
              whileHover={{ x: 4 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-textMuted hover:text-text hover:bg-surface2/40 transition-colors"
            >
              <Users className="w-4 h-4 shrink-0" />
              <span>Shared Projects</span>
            </motion.button>

            <motion.button
              whileHover={{ x: 4 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-textMuted hover:text-text hover:bg-surface2/40 transition-colors"
            >
              <Clock className="w-4 h-4 shrink-0" />
              <span>Recent Queries</span>
            </motion.button>
          </div>

          {/* Saved Connections List */}
          <div className="flex-1 overflow-y-auto p-2 min-h-0">
            <div className="px-3 py-2 text-[10px] font-semibold text-textMuted uppercase tracking-wider font-mono">
              Saved Connections ({filteredConnections.length})
            </div>

            <div className="space-y-1">
              {filteredConnections.map((conn) => {
                const meta = DB_META[conn.db_type] || DB_META.postgres;
                return (
                  <motion.div
                    key={conn.id}
                    whileHover={{ x: 4 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    onClick={() => onConnect(conn)}
                    className="group relative flex items-center justify-between px-3 py-2.5 rounded-xl bg-surface/30 hover:bg-surface2/50 border border-transparent hover:border-border/40 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0"
                        style={{ background: `${meta.color}20` }}
                      >
                        {meta.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center space-x-1.5">
                          <span className="text-xs font-semibold text-text truncate group-hover:text-white">
                            {conn.name}
                          </span>
                        </div>
                        <div className="text-[10px] text-textMuted truncate font-mono mt-0.5">
                          {meta.label} • {conn.host}:{conn.port}
                        </div>
                      </div>
                    </div>

                    {/* Live Connection Pulse Ring */}
                    <div className="flex items-center space-x-1.5 ml-2">
                      <div className="relative flex h-2.5 w-2.5 items-center justify-center shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_8px_#10B981]" />
                      </div>

                      {/* Delete icon */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirm(conn);
                        }}
                        className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-error/20 text-textMuted hover:text-error transition-all"
                        title="Delete connection"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* New Connection Button at Bottom of Sidebar */}
          <div className="p-3 border-t border-border/30 shrink-0">
            <button
              onClick={() => onNewConnection()}
              className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-accent text-white font-semibold text-xs hover:bg-accent/90 transition-all shadow-lg shadow-accent/20"
            >
              <Plus className="w-4 h-4" />
              <span>New Connection</span>
            </button>
          </div>
        </motion.aside>

        {/* === CENTRAL WORKSPACE === */}
        <main className="flex-1 flex flex-col h-full overflow-y-auto relative bg-[#09090A]">
          {/* Central Hero Ambient Background Light Source */}
          <div className="absolute top-12 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-gradient-to-b from-indigo-500/15 via-purple-500/8 to-transparent blur-3xl pointer-events-none rounded-full" />

          {/* Central Content */}
          <div className="max-w-4xl w-full mx-auto px-8 py-12 relative z-10 flex flex-col items-center">

            {/* Central Hero Header */}
            <motion.div variants={itemVariants} className="text-center mb-10">
              <motion.img
                src="/logo.png"
                alt="DevDash Logo"
                className="w-24 h-24 mx-auto mb-4 object-contain filter drop-shadow-2xl"
                whileHover={{ scale: 1.05, rotate: 2 }}
                transition={{ type: 'spring', stiffness: 300 }}
              />
              <h1 className="text-3xl font-bold text-white tracking-tight mb-2 font-sans">
                DevDash Workspace
              </h1>
              <p className="text-textMuted text-sm max-w-md mx-auto leading-relaxed">
                Connect and manage your data ecosystem.
              </p>
            </motion.div>

            {/* Category Filter Bar (Framer Motion Animated Active Indicator) */}
            <motion.div variants={itemVariants} className="mb-10">
              <div className="flex items-center space-x-1 p-1.5 rounded-2xl bg-surface2/30 border border-border/40 backdrop-blur-md">
                {CATEGORIES.map((cat) => {
                  const isActive = activeCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setActiveCategory(cat.id)}
                      className={`relative px-4 py-1.5 rounded-xl text-xs font-mono transition-colors z-10 ${
                        isActive ? 'text-white font-semibold' : 'text-textMuted hover:text-text'
                      }`}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="activeCategoryPill"
                          className="absolute inset-0 rounded-xl bg-surface2/80 border border-border/80 shadow-inner shadow-white/5 backdrop-blur-md"
                          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                        />
                      )}
                      <span className="relative z-10">{cat.label}</span>
                    </button>
                  );
                })}
              </div>
            </motion.div>

            {/* Quick Connect Cards Grid (Spotlight + 3D Tilt) */}
            <motion.div
              variants={itemVariants}
              className="w-full grid grid-cols-4 gap-3.5 mb-10"
            >
              {filteredDbCards.map((dbType) => {
                const meta = DB_META[dbType];
                return (
                  <SpotlightTiltCard
                    key={dbType}
                    dbType={dbType}
                    meta={meta}
                    onConnect={() => onNewConnection(dbType)}
                  />
                );
              })}
            </motion.div>

            {/* Import file drop trigger */}
            <motion.div variants={itemVariants} className="w-full text-center pt-4 border-t border-border/20">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center space-x-2 text-xs text-textMuted hover:text-accent transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Import connection config file (.json or .devdash)</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.devdash"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onImportConnections(file);
                }}
              />
            </motion.div>

          </div>
        </main>
      </motion.div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md">
          <div className="bg-surface border border-border rounded-2xl shadow-2xl w-[400px] overflow-hidden p-6">
            <div className="flex items-start space-x-4 mb-4">
              <div className="w-10 h-10 rounded-xl bg-error/15 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-error" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-text mb-1">Delete Connection</h3>
                <p className="text-xs text-textMuted leading-relaxed">
                  Are you sure you want to remove <strong className="text-text">{deleteConfirm.name}</strong>?
                  This will delete the saved connection configuration.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2.5 pt-2 border-t border-border/40">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-text bg-surface2 hover:bg-surface2/80 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDeleteConnection(deleteConfirm.id);
                  setDeleteConfirm(null);
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-error hover:bg-error/90 transition-colors shadow-lg shadow-error/20"
              >
                Delete Connection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
