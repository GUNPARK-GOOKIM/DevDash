import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ConnectionConfig, TableItem, objectKey, isViewObject } from '../types';
import {
  Table, Plus, Search, Server, FolderGit2, CheckCircle2, Home, Trash2,
  AlertTriangle, Share2, ChevronRight, ChevronDown, Eye, Layers, Box,
} from 'lucide-react';

interface SidebarProps {
  connections: ConnectionConfig[];
  activeConnection: ConnectionConfig | null;
  tables: TableItem[];
  onSelectConnection: (conn: ConnectionConfig) => void;
  onSelectTable: (tableName: string) => void;
  onOpenNewConnectionModal: () => void;
  onDisconnect?: () => void;
  onDeleteConnection?: (id: string) => void;
  onShareConnection?: (conn: ConnectionConfig) => void;
  currentProjectPath: string;
  /** Currently open browser object key (qualified name) for highlight */
  activeObjectKey?: string;
}

interface SchemaGroup {
  schema: string;
  tables: TableItem[];
  views: TableItem[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  connections,
  activeConnection,
  tables,
  onSelectConnection,
  onSelectTable,
  onOpenNewConnectionModal,
  onDisconnect,
  onDeleteConnection,
  onShareConnection,
  currentProjectPath,
  activeObjectKey,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<ConnectionConfig | null>(null);
  const [expandedSchemas, setExpandedSchemas] = useState<Record<string, boolean>>({});
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(searchTerm), 100);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Auto-expand all schemas when table list changes (first load / reconnect)
  useEffect(() => {
    const schemas = new Set(tables.map((t) => t.schema || 'main'));
    setExpandedSchemas((prev) => {
      const next = { ...prev };
      schemas.forEach((s) => {
        if (next[s] === undefined) next[s] = true;
      });
      return next;
    });
    setExpandedFolders((prev) => {
      const next = { ...prev };
      schemas.forEach((s) => {
        if (next[`${s}:tables`] === undefined) next[`${s}:tables`] = true;
        if (next[`${s}:views`] === undefined) next[`${s}:views`] = true;
      });
      return next;
    });
  }, [tables]);

  const isConnMatch = (name: string) => {
    if (!debouncedSearch) return true;
    return name.toLowerCase().includes(debouncedSearch.toLowerCase());
  };

  const matchesSearch = (t: TableItem) => {
    if (!debouncedSearch) return true;
    const q = debouncedSearch.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      (t.schema || '').toLowerCase().includes(q) ||
      (t.qualified_name || '').toLowerCase().includes(q) ||
      (t.table_type || '').toLowerCase().includes(q)
    );
  };

  const schemaGroups: SchemaGroup[] = useMemo(() => {
    const map = new Map<string, SchemaGroup>();
    for (const t of tables) {
      if (!matchesSearch(t)) continue;
      const schema = t.schema || 'main';
      if (!map.has(schema)) {
        map.set(schema, { schema, tables: [], views: [] });
      }
      const g = map.get(schema)!;
      if (isViewObject(t)) g.views.push(t);
      else g.tables.push(t);
    }
    return Array.from(map.values()).sort((a, b) => a.schema.localeCompare(b.schema));
  }, [tables, debouncedSearch]);

  const tableCount = tables.filter((t) => !isViewObject(t)).length;
  const viewCount = tables.filter((t) => isViewObject(t)).length;
  const multiSchema = schemaGroups.length > 1;

  const handleConnClick = (conn: ConnectionConfig) => {
    if (activeConnection?.id === conn.id) return;
    setConnectingId(conn.id);
    Promise.resolve(onSelectConnection(conn)).finally(() => {
      setConnectingId(null);
    });
  };

  const toggleSchema = (schema: string) => {
    setExpandedSchemas((prev) => ({ ...prev, [schema]: !prev[schema] }));
  };

  const toggleFolder = (key: string) => {
    setExpandedFolders((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const renderObjectButton = (t: TableItem, kind: 'table' | 'view') => {
    const key = objectKey(t);
    const isActive = activeObjectKey === key;
    const Icon = kind === 'view' ? Eye : Table;
    return (
      <button
        key={key}
        onClick={() => onSelectTable(key)}
        className={`w-full flex items-center space-x-2 px-2 py-1 rounded text-[12px] font-sans transition-all text-left ${
          isActive
            ? 'bg-accent/15 text-accent font-medium'
            : 'text-text hover:text-text hover:bg-surface2'
        }`}
        title={key}
      >
        <Icon className={`w-3.5 h-3.5 shrink-0 ${kind === 'view' ? 'text-sky-400' : 'text-textMuted'}`} />
        <span className="truncate font-mono text-[12px]">{t.name}</span>
      </button>
    );
  };

  return (
    <aside className="w-64 glass-sidebar flex flex-col h-full z-10 select-none font-sans text-text">
      <div className="h-11 px-3 flex items-center justify-between bg-transparent border-b border-border shrink-0">
        <div className="flex items-center space-x-2">
          <img src="/logo.png" alt="DevDash" className="w-6 h-6 object-contain rounded-full" />
          <span className="font-bold text-[14px] text-text tracking-tight font-sans">DEVDASH</span>
        </div>
        <button
          onClick={onOpenNewConnectionModal}
          className="p-1 rounded hover:bg-surface2 text-textMuted hover:text-text transition-colors"
          title="New Connection"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="px-3 py-1.5 bg-transparent border-b border-border flex items-center space-x-1.5 text-[11px] text-textMuted shrink-0">
        <FolderGit2 className="w-3.5 h-3.5 text-accent shrink-0" />
        <span className="truncate font-sans text-[11px]" title={currentProjectPath}>
          {currentProjectPath.split('\\').pop() || currentProjectPath.split('/').pop() || 'workspace'}
        </span>
      </div>

      {/* Connections */}
      <div className="m-2 p-2 bento-card flex flex-col shrink-0">
        <div className="text-[10px] font-semibold text-textMuted uppercase tracking-wider mb-1.5 px-1 font-sans">
          Connections
        </div>
        <div className="space-y-0.5 max-h-40 overflow-y-auto">
          {connections.map((conn) => {
            const isSelected = activeConnection?.id === conn.id;
            const isConnecting = connectingId === conn.id;
            const matched = isConnMatch(conn.name);
            let dotColor = 'bg-gray-500';
            if (isSelected) dotColor = 'bg-success';
            else if (isConnecting) dotColor = 'bg-warning animate-pulse';

            return (
              <motion.div
                key={String(conn.id)}
                whileHover={{ x: 4 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className={`group w-full flex items-center justify-between px-2 py-1.5 rounded text-[13px] transition-all font-sans cursor-pointer ${
                  isSelected
                    ? 'bg-accent/15 text-accent font-medium'
                    : 'text-text hover:bg-surface2 hover:text-text'
                }`}
                style={{ opacity: matched ? 1 : 0.3 }}
                onClick={() => handleConnClick(conn)}
              >
                <div className="flex items-center space-x-2 truncate">
                  {isSelected ? (
                    <div className="relative flex h-2.5 w-2.5 items-center justify-center shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_8px_#10B981]" />
                    </div>
                  ) : (
                    <span className={`w-[5px] h-[5px] rounded-full ${dotColor} shrink-0`} />
                  )}
                  <Server className="w-3.5 h-3.5 text-accent shrink-0" />
                  <span className="truncate text-[13px]">{conn.name}</span>
                </div>
                <div className="flex items-center space-x-1">
                  {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-accent shrink-0" />}
                  {onShareConnection && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onShareConnection(conn);
                      }}
                      className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-accent/20 text-textMuted hover:text-accent transition-all shrink-0"
                      title={`Share ${conn.name} securely`}
                    >
                      <Share2 className="w-3 h-3" />
                    </button>
                  )}
                  {onDeleteConnection && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirm(conn);
                      }}
                      className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-error/20 text-textMuted hover:text-error transition-all shrink-0"
                      title={`Remove ${conn.name}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Schema Object Explorer */}
      <div className="flex-1 m-2 mt-0 p-2 bento-card flex flex-col min-h-0">
        <div className="mb-2 shrink-0">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-textMuted absolute left-2 top-2" />
            <input
              type="text"
              placeholder="Filter schemas, tables, views…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-base border border-border rounded px-2 pl-7 py-1 text-[13px] text-text placeholder-textMuted outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 font-sans"
            />
          </div>
          <div className="flex items-center space-x-2 mt-1.5 px-1 text-[10px] text-textMuted">
            <span className="flex items-center space-x-1">
              <Table className="w-3 h-3" />
              <span>{tableCount} tables</span>
            </span>
            <span className="flex items-center space-x-1">
              <Eye className="w-3 h-3 text-sky-400" />
              <span>{viewCount} views</span>
            </span>
            {multiSchema && (
              <span className="flex items-center space-x-1">
                <Layers className="w-3 h-3 text-accent" />
                <span>{schemaGroups.length} schemas</span>
              </span>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-0.5">
          {!activeConnection && (
            <div className="px-2 py-6 text-center text-[11px] text-textMuted">
              Connect to a database to browse objects
            </div>
          )}
          {activeConnection && tables.length === 0 && (
            <div className="px-2 py-6 text-center text-[11px] text-textMuted">
              No tables or views found
            </div>
          )}

          {schemaGroups.map((group) => {
            const schemaOpen = expandedSchemas[group.schema] !== false;
            const tablesKey = `${group.schema}:tables`;
            const viewsKey = `${group.schema}:views`;
            const tablesOpen = expandedFolders[tablesKey] !== false;
            const viewsOpen = expandedFolders[viewsKey] !== false;

            return (
              <div key={group.schema} className="mb-1">
                {/* Schema header — always show when multi-schema or non-main */}
                {(multiSchema || group.schema !== 'main') && (
                  <button
                    onClick={() => toggleSchema(group.schema)}
                    className="w-full flex items-center space-x-1 px-1 py-1 rounded text-[11px] font-semibold text-textMuted hover:bg-surface2/60 hover:text-text uppercase tracking-wider"
                  >
                    {schemaOpen ? (
                      <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <Box className="w-3.5 h-3.5 text-accent shrink-0" />
                    <span className="truncate font-mono normal-case tracking-normal text-[12px]">
                      {group.schema}
                    </span>
                    <span className="text-[10px] opacity-60 font-normal">
                      ({group.tables.length + group.views.length})
                    </span>
                  </button>
                )}

                <AnimatePresence initial={false}>
                  {schemaOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="overflow-hidden"
                    >
                      <div className={multiSchema || group.schema !== 'main' ? 'pl-2' : ''}>
                        {/* Tables folder */}
                        {group.tables.length > 0 && (
                          <div>
                            <button
                              onClick={() => toggleFolder(tablesKey)}
                              className="w-full flex items-center space-x-1 px-1 py-0.5 rounded text-[10px] font-semibold text-textMuted uppercase tracking-wider hover:text-text"
                            >
                              {tablesOpen ? (
                                <ChevronDown className="w-3 h-3" />
                              ) : (
                                <ChevronRight className="w-3 h-3" />
                              )}
                              <span>Tables ({group.tables.length})</span>
                            </button>
                            {tablesOpen && (
                              <div className="space-y-0.5 pl-1">
                                {group.tables.map((t) => renderObjectButton(t, 'table'))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Views folder */}
                        {group.views.length > 0 && (
                          <div className="mt-1">
                            <button
                              onClick={() => toggleFolder(viewsKey)}
                              className="w-full flex items-center space-x-1 px-1 py-0.5 rounded text-[10px] font-semibold text-textMuted uppercase tracking-wider hover:text-text"
                            >
                              {viewsOpen ? (
                                <ChevronDown className="w-3 h-3" />
                              ) : (
                                <ChevronRight className="w-3 h-3" />
                              )}
                              <span>Views ({group.views.length})</span>
                            </button>
                            {viewsOpen && (
                              <div className="space-y-0.5 pl-1">
                                {group.views.map((t) => renderObjectButton(t, 'view'))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>

      {onDisconnect && (
        <div className="m-2 mt-0 shrink-0">
          <button
            onClick={onDisconnect}
            className="w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-lg bg-surface2/40 hover:bg-surface2 text-textMuted hover:text-text text-[12px] font-medium transition-all border border-border/30 hover:border-border/60"
            title="Back to Connection Manager"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Connection Manager</span>
          </button>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-xl shadow-2xl w-[380px] overflow-hidden">
            <div className="px-5 pt-5 pb-3 flex items-start space-x-3">
              <div className="w-10 h-10 rounded-xl bg-error/15 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-error" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-text mb-1">Delete Connection</h3>
                <p className="text-xs text-textMuted leading-relaxed">
                  Remove <strong className="text-text">{deleteConfirm.name}</strong>? The database itself is not
                  affected.
                </p>
              </div>
            </div>
            <div className="mx-5 mb-4 px-3 py-2 rounded-lg bg-base border border-border/50 text-[11px] text-textMuted space-y-0.5">
              <div>
                <span className="text-text/60">Type:</span> {deleteConfirm.db_type}
              </div>
              <div>
                <span className="text-text/60">Host:</span> {deleteConfirm.host}:{deleteConfirm.port}
              </div>
              <div>
                <span className="text-text/60">Database:</span> {deleteConfirm.database}
              </div>
            </div>
            <div className="px-5 pb-5 flex items-center justify-end space-x-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 rounded-lg text-xs font-medium text-text bg-surface2 hover:bg-surface2/80"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDeleteConnection?.(deleteConfirm.id);
                  setDeleteConfirm(null);
                }}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-error hover:bg-error/90"
              >
                Delete Connection
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
