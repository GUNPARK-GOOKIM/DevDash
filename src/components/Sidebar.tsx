import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ConnectionConfig, TableItem } from '../types';
import { Database, Table, Plus, Search, Server, FolderGit2, CheckCircle2, Home, LogOut, Trash2, AlertTriangle, X } from 'lucide-react';

interface SidebarProps {
  connections: ConnectionConfig[];
  activeConnection: ConnectionConfig | null;
  tables: TableItem[];
  onSelectConnection: (conn: ConnectionConfig) => void;
  onSelectTable: (tableName: string) => void;
  onOpenNewConnectionModal: () => void;
  onDisconnect?: () => void;
  onDeleteConnection?: (id: string) => void;
  currentProjectPath: string;
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
  currentProjectPath,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<ConnectionConfig | null>(null);

  // UX5: 100ms Debounce for real-time filter search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 100);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const isConnMatch = (name: string) => {
    if (!debouncedSearch) return true;
    return name.toLowerCase().includes(debouncedSearch.toLowerCase());
  };

  const isTableMatch = (name: string) => {
    if (!debouncedSearch) return true;
    return name.toLowerCase().includes(debouncedSearch.toLowerCase());
  };

  // Reconnect: show brief connecting state, then invoke real parent handler
  const handleConnClick = (conn: ConnectionConfig) => {
    if (activeConnection?.id === conn.id) return;
    setConnectingId(conn.id);
    Promise.resolve(onSelectConnection(conn)).finally(() => {
      setConnectingId(null);
    });
  };

  return (
    <aside className="w-60 glass-sidebar flex flex-col h-full z-10 select-none font-sans text-text">
      {/* TablePlus style compact header with DevDash Logo */}
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

      {/* Project Folder Indicator */}
      <div className="px-3 py-1.5 bg-transparent border-b border-border flex items-center space-x-1.5 text-[11px] text-textMuted shrink-0">
        <FolderGit2 className="w-3.5 h-3.5 text-accent shrink-0" />
        <span className="truncate font-sans text-[11px]" title={currentProjectPath}>
          {currentProjectPath.split('\\').pop() || currentProjectPath.split('/').pop() || 'workspace'}
        </span>
      </div>

      {/* Connection Picker inside Bento Card */}
      <div className="m-2 p-2 bento-card flex flex-col shrink-0">
        <div className="text-[10px] font-semibold text-textMuted uppercase tracking-wider mb-1.5 px-1 font-sans">
          Connections
        </div>
        <div className="space-y-0.5 max-h-40 overflow-y-auto">
          {connections.map((conn) => {
            const isSelected = activeConnection?.id === conn.id;
            const isConnecting = connectingId === conn.id;
            const matched = isConnMatch(conn.name);

            // UX6: status color dot mapping
            let dotColor = 'bg-gray-500';
            if (isSelected) {
              dotColor = 'bg-success';
            } else if (isConnecting) {
              dotColor = 'bg-warning animate-pulse';
            }

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
                  {/* Status dot with live pulse ring when selected */}
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

      {/* Search and Tables List inside Bento Card */}
      <div className="flex-1 m-2 mt-0 p-2 bento-card flex flex-col min-h-0">
        {/* Table Quick Filter */}
        <div className="mb-2 shrink-0">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-textMuted absolute left-2 top-2" />
            <input
              type="text"
              placeholder="Filter items..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-base border border-border rounded px-2 pl-7 py-1 text-[13px] text-text placeholder-textMuted outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 font-sans"
            />
          </div>
        </div>

        {/* Tables Explorer */}
        <div className="flex-1 overflow-y-auto px-0.5">
          <div className="px-1 py-1 text-[10px] font-semibold text-textMuted uppercase tracking-wider font-sans mb-1">
            Tables ({tables.length})
          </div>
          <div className="space-y-0.5">
            {tables.map((tbl) => {
              const matched = isTableMatch(tbl.name);
              return (
                <button
                  key={tbl.name}
                  onClick={() => onSelectTable(tbl.name)}
                  className="w-full flex items-center space-x-2 px-2 py-1 rounded text-[13px] font-sans text-text hover:text-text hover:bg-surface2 transition-all text-left"
                  style={{ opacity: matched ? 1 : 0.3 }}
                >
                  <Table className="w-3.5 h-3.5 text-textMuted shrink-0" />
                  <span className="truncate">{tbl.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Back to Home / Disconnect */}
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

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-xl shadow-2xl w-[380px] overflow-hidden">
            {/* Header */}
            <div className="px-5 pt-5 pb-3 flex items-start space-x-3">
              <div className="w-10 h-10 rounded-xl bg-error/15 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-error" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-text mb-1">Delete Connection</h3>
                <p className="text-xs text-textMuted leading-relaxed">
                  Are you sure you want to remove <strong className="text-text">{deleteConfirm.name}</strong>?
                  This will delete the saved connection details. Your actual database will <strong className="text-text">not</strong> be affected.
                </p>
              </div>
            </div>

            {/* Connection details */}
            <div className="mx-5 mb-4 px-3 py-2 rounded-lg bg-base border border-border/50 text-[11px] text-textMuted space-y-0.5">
              <div><span className="text-text/60">Type:</span> {deleteConfirm.db_type}</div>
              <div><span className="text-text/60">Host:</span> {deleteConfirm.host}:{deleteConfirm.port}</div>
              <div><span className="text-text/60">Database:</span> {deleteConfirm.database}</div>
            </div>

            {/* Actions */}
            <div className="px-5 pb-5 flex items-center justify-end space-x-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 rounded-lg text-xs font-medium text-text bg-surface2 hover:bg-surface2/80 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDeleteConnection?.(deleteConfirm.id);
                  setDeleteConfirm(null);
                }}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-error hover:bg-error/90 transition-colors"
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
