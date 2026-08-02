import React, { useEffect, useMemo, useState } from 'react';
import { TableItem, ConnectionConfig, SavedQuery, objectKey } from '../types';
import { Search, Table, Server, Bookmark, X, Command } from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  tables: TableItem[];
  connections: ConnectionConfig[];
  savedQueries: SavedQuery[];
  onSelectTable: (tbl: string) => void;
  onSelectConnection: (conn: ConnectionConfig) => void;
  onSelectQuery: (q: SavedQuery) => void;
  commands?: { id: string; label: string; action: () => void }[];
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  tables,
  connections,
  savedQueries,
  onSelectTable,
  onSelectConnection,
  onSelectQuery,
  commands = [],
}) => {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const q = query.toLowerCase().trim();

  const filteredTables = useMemo(
    () =>
      tables.filter(
        (t) =>
          !q ||
          t.name.toLowerCase().includes(q) ||
          (t.schema || '').toLowerCase().includes(q) ||
          objectKey(t).toLowerCase().includes(q) ||
          (t.table_type || '').toLowerCase().includes(q)
      ),
    [tables, q]
  );
  const filteredConnections = useMemo(
    () => connections.filter((c) => !q || c.name.toLowerCase().includes(q)),
    [connections, q]
  );
  const filteredQueries = useMemo(
    () => savedQueries.filter((sq) => !q || sq.name.toLowerCase().includes(q)),
    [savedQueries, q]
  );
  const filteredCommands = useMemo(
    () => commands.filter((c) => !q || c.label.toLowerCase().includes(q)),
    [commands, q]
  );

  type FlatItem =
    | { kind: 'table'; name: string }
    | { kind: 'connection'; conn: ConnectionConfig }
    | { kind: 'query'; query: SavedQuery }
    | { kind: 'command'; id: string; label: string; action: () => void };

  const flatItems: FlatItem[] = useMemo(() => {
    const items: FlatItem[] = [];
    filteredCommands.forEach((c) => items.push({ kind: 'command', ...c }));
    filteredTables.forEach((t) => items.push({ kind: 'table', name: objectKey(t) }));
    filteredConnections.forEach((c) => items.push({ kind: 'connection', conn: c }));
    filteredQueries.forEach((sq) => items.push({ kind: 'query', query: sq }));
    return items;
  }, [filteredCommands, filteredTables, filteredConnections, filteredQueries]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!isOpen) return null;

  const activate = (item: FlatItem) => {
    if (item.kind === 'table') onSelectTable(item.name);
    else if (item.kind === 'connection') onSelectConnection(item.conn);
    else if (item.kind === 'query') onSelectQuery(item.query);
    else item.action();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-start justify-center pt-24 z-50 animate-fadeIn">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl overflow-hidden glass-panel">
        <div className="p-3 border-b border-slate-800 flex items-center space-x-3">
          <Search className="w-4 h-4 text-indigo-400" />
          <input
            type="text"
            autoFocus
            placeholder="Search tables, connections, queries, commands… (Esc)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIndex((i) => Math.min(flatItems.length - 1, i + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIndex((i) => Math.max(0, i - 1));
              } else if (e.key === 'Enter' && flatItems[activeIndex]) {
                e.preventDefault();
                activate(flatItems[activeIndex]);
              }
            }}
            className="w-full bg-transparent text-sm text-slate-100 placeholder-slate-500 outline-none font-sans"
          />
          <kbd className="hidden sm:flex items-center space-x-0.5 text-[10px] text-slate-500 border border-slate-700 rounded px-1.5 py-0.5">
            <Command className="w-3 h-3" />
            <span>P</span>
          </kbd>
          <button onClick={onClose} className="p-1 rounded text-slate-500 hover:text-slate-300">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto p-2 space-y-3 font-sans text-xs">
          {flatItems.length === 0 && (
            <div className="px-3 py-6 text-center text-slate-500">No matches</div>
          )}

          {filteredCommands.length > 0 && (
            <div>
              <div className="px-2 py-1 text-[10px] font-semibold uppercase text-slate-500 tracking-wider">
                Commands
              </div>
              {filteredCommands.map((cmd) => {
                const idx = flatItems.findIndex((i) => i.kind === 'command' && i.id === cmd.id);
                return (
                  <button
                    key={cmd.id}
                    onClick={() => activate({ kind: 'command', ...cmd })}
                    className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-slate-300 transition-all ${
                      idx === activeIndex ? 'bg-indigo-600/20 text-indigo-200' : 'hover:bg-indigo-600/20'
                    }`}
                  >
                    <Command className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span>{cmd.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {filteredTables.length > 0 && (
            <div>
              <div className="px-2 py-1 text-[10px] font-semibold uppercase text-slate-500 tracking-wider">
                Tables
              </div>
              {filteredTables.map((tbl) => {
                const key = objectKey(tbl);
                const idx = flatItems.findIndex((i) => i.kind === 'table' && i.name === key);
                return (
                  <button
                    key={key}
                    onClick={() => activate({ kind: 'table', name: key })}
                    className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-slate-300 transition-all font-mono ${
                      idx === activeIndex ? 'bg-indigo-600/20 text-indigo-200' : 'hover:bg-indigo-600/20'
                    }`}
                  >
                    <Table className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span className="truncate">{key}</span>
                    {(tbl.table_type || '').toUpperCase().includes('VIEW') && (
                      <span className="text-[9px] text-sky-400 ml-auto">VIEW</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {filteredConnections.length > 0 && (
            <div>
              <div className="px-2 py-1 text-[10px] font-semibold uppercase text-slate-500 tracking-wider">
                Connections
              </div>
              {filteredConnections.map((conn) => {
                const idx = flatItems.findIndex(
                  (i) => i.kind === 'connection' && i.conn.id === conn.id
                );
                return (
                  <button
                    key={String(conn.id)}
                    onClick={() => activate({ kind: 'connection', conn })}
                    className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-slate-300 transition-all ${
                      idx === activeIndex ? 'bg-indigo-600/20 text-indigo-200' : 'hover:bg-indigo-600/20'
                    }`}
                  >
                    <Server className="w-4 h-4 text-purple-400 shrink-0" />
                    <span>{conn.name}</span>
                  </button>
                );
              })}
            </div>
          )}

          {filteredQueries.length > 0 && (
            <div>
              <div className="px-2 py-1 text-[10px] font-semibold uppercase text-slate-500 tracking-wider">
                Saved Queries
              </div>
              {filteredQueries.map((sq) => {
                const idx = flatItems.findIndex((i) => i.kind === 'query' && i.query.id === sq.id);
                return (
                  <button
                    key={sq.id}
                    onClick={() => activate({ kind: 'query', query: sq })}
                    className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-slate-300 transition-all ${
                      idx === activeIndex ? 'bg-indigo-600/20 text-indigo-200' : 'hover:bg-indigo-600/20'
                    }`}
                  >
                    <Bookmark className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{sq.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
