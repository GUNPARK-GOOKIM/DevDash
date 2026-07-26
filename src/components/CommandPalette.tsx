import React, { useState, useEffect } from 'react';
import { TableItem, ConnectionConfig, SavedQuery } from '../types';
import { Search, Table, Server, Bookmark, X } from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  tables: TableItem[];
  connections: ConnectionConfig[];
  savedQueries: SavedQuery[];
  onSelectTable: (tbl: string) => void;
  onSelectConnection: (conn: ConnectionConfig) => void;
  onSelectQuery: (q: SavedQuery) => void;
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
}) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else setQuery('');
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filteredTables = tables.filter((t) =>
    t.name.toLowerCase().includes(query.toLowerCase())
  );
  const filteredConnections = connections.filter((c) =>
    c.name.toLowerCase().includes(query.toLowerCase())
  );
  const filteredQueries = savedQueries.filter((q) =>
    q.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-start justify-center pt-24 z-50 animate-fadeIn">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl overflow-hidden glass-panel">
        {/* Search Input Header */}
        <div className="p-3 border-b border-slate-800 flex items-center space-x-3">
          <Search className="w-4 h-4 text-indigo-400" />
          <input
            type="text"
            autoFocus
            placeholder="Type a command or search tables, connections, queries... (Esc to close)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-sm text-slate-100 placeholder-slate-500 outline-none font-sans"
          />
          <button onClick={onClose} className="p-1 rounded text-slate-500 hover:text-slate-300">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Results List */}
        <div className="max-h-96 overflow-y-auto p-2 space-y-3 font-sans text-xs">
          {/* Tables Section */}
          {filteredTables.length > 0 && (
            <div>
              <div className="px-2 py-1 text-[10px] font-semibold uppercase text-slate-500 tracking-wider">
                Tables
              </div>
              {filteredTables.map((tbl) => (
                <button
                  key={tbl.name}
                  onClick={() => {
                    onSelectTable(tbl.name);
                    onClose();
                  }}
                  className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg hover:bg-indigo-600/20 hover:text-indigo-200 text-slate-300 transition-all font-mono"
                >
                  <Table className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span>{tbl.name}</span>
                </button>
              ))}
            </div>
          )}

          {/* Connections Section */}
          {filteredConnections.length > 0 && (
            <div>
              <div className="px-2 py-1 text-[10px] font-semibold uppercase text-slate-500 tracking-wider">
                Connections
              </div>
              {filteredConnections.map((conn) => (
                <button
                  key={String(conn.id)}
                  onClick={() => {
                    onSelectConnection(conn);
                    onClose();
                  }}
                  className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg hover:bg-indigo-600/20 hover:text-indigo-200 text-slate-300 transition-all"
                >
                  <Server className="w-4 h-4 text-purple-400 shrink-0" />
                  <span>{conn.name}</span>
                </button>
              ))}
            </div>
          )}

          {/* Saved Queries Section */}
          {filteredQueries.length > 0 && (
            <div>
              <div className="px-2 py-1 text-[10px] font-semibold uppercase text-slate-500 tracking-wider">
                Saved Queries
              </div>
              {filteredQueries.map((q) => (
                <button
                  key={q.id}
                  onClick={() => {
                    onSelectQuery(q);
                    onClose();
                  }}
                  className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg hover:bg-indigo-600/20 hover:text-indigo-200 text-slate-300 transition-all"
                >
                  <Bookmark className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{q.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
