import React, { useState, useEffect } from 'react';
import { ConnectionConfig, TableItem } from '../types';
import { Database, Table, Plus, Search, Server, FolderGit2, CheckCircle2 } from 'lucide-react';

interface SidebarProps {
  connections: ConnectionConfig[];
  activeConnection: ConnectionConfig | null;
  tables: TableItem[];
  onSelectConnection: (conn: ConnectionConfig) => void;
  onSelectTable: (tableName: string) => void;
  onOpenNewConnectionModal: () => void;
  currentProjectPath: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  connections,
  activeConnection,
  tables,
  onSelectConnection,
  onSelectTable,
  onOpenNewConnectionModal,
  currentProjectPath,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [connectingId, setConnectingId] = useState<string | null>(null);

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

  // UX6: Reconnection handler with pulsing yellow state
  const handleConnClick = (conn: ConnectionConfig) => {
    if (activeConnection?.id === conn.id) return;
    setConnectingId(conn.id);
    setTimeout(() => {
      onSelectConnection(conn);
      setConnectingId(null);
    }, 1200); // 1.2s pulse yellow attempt simulation
  };

  return (
    <aside className="w-60 glass-sidebar flex flex-col h-full z-10 select-none font-sans text-text">
      {/* TablePlus style compact header */}
      <div className="h-10 px-3 flex items-center justify-between bg-transparent border-b border-border shrink-0">
        <div className="flex items-center space-x-2">
          <Database className="w-4 h-4 text-accent" />
          <span className="font-semibold text-[13px] text-text tracking-tight">DevDash</span>
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
              <button
                key={String(conn.id)}
                onClick={() => handleConnClick(conn)}
                className={`w-full flex items-center justify-between px-2 py-1 rounded text-[13px] transition-all font-sans ${
                  isSelected
                    ? 'bg-accent/15 text-accent font-medium'
                    : 'text-text hover:bg-surface2 hover:text-text'
                }`}
                style={{ opacity: matched ? 1 : 0.3 }}
              >
                <div className="flex items-center space-x-2 truncate">
                  {/* 3px status dot */}
                  <span className={`w-[3px] h-[3px] rounded-full ${dotColor} shrink-0`} />
                  <Server className="w-3.5 h-3.5 text-accent shrink-0" />
                  <span className="truncate text-[13px]">{conn.name}</span>
                </div>
                {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-accent shrink-0 ml-1" />}
              </button>
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
    </aside>
  );
};
