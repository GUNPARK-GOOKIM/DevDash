import React from 'react';
import { X, Server, Table, Plus, Share2, Download, CheckCircle2, ChevronRight } from 'lucide-react';
import { ConnectionConfig, TableItem } from '../../types';

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  connections: ConnectionConfig[];
  activeConnection: ConnectionConfig | null;
  tables: TableItem[];
  onSelectConnection: (conn: ConnectionConfig) => void;
  onSelectTable: (tableName: string) => void;
  onOpenNewConnectionModal: () => void;
  onShareConnection: (conn: ConnectionConfig) => void;
  onOpenImportShared: () => void;
}

export const MobileDrawer: React.FC<MobileDrawerProps> = ({
  isOpen,
  onClose,
  connections,
  activeConnection,
  tables,
  onSelectConnection,
  onSelectTable,
  onOpenNewConnectionModal,
  onShareConnection,
  onOpenImportShared,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="bg-slate-900 border-t border-slate-800 rounded-t-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-300 pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header handle */}
        <div className="flex flex-col items-center pt-2.5 pb-2 border-b border-slate-800 bg-slate-950/60">
          <div className="w-10 h-1 bg-slate-700 rounded-full mb-2" />
          <div className="w-full px-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              Database Workspace
            </h3>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Drawer Scrollable Content */}
        <div className="p-4 space-y-5 overflow-y-auto flex-1">
          {/* Quick Actions */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                onOpenNewConnectionModal();
                onClose();
              }}
              className="p-3 bg-indigo-600/10 border border-indigo-500/20 hover:bg-indigo-600/20 rounded-xl flex items-center space-x-2 text-indigo-400 text-xs font-medium transition-colors"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>New Connection</span>
            </button>

            <button
              onClick={() => {
                onOpenImportShared();
                onClose();
              }}
              className="p-3 bg-slate-800/60 border border-slate-700/60 hover:bg-slate-800 rounded-xl flex items-center space-x-2 text-slate-200 text-xs font-medium transition-colors"
            >
              <Download className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Import Shared</span>
            </button>
          </div>

          {/* Connection Profiles */}
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 px-1">
              Connections ({connections.length})
            </div>
            <div className="space-y-1.5">
              {connections.map((conn) => {
                const isSelected = activeConnection?.id === conn.id;
                return (
                  <div
                    key={conn.id}
                    onClick={() => {
                      onSelectConnection(conn);
                      onClose();
                    }}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-colors cursor-pointer active:scale-[0.99] ${
                      isSelected
                        ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300'
                        : 'bg-slate-950/40 border-slate-800/80 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center space-x-3 truncate">
                      <Server className="w-4 h-4 text-indigo-400 shrink-0" />
                      <div className="truncate">
                        <p className="text-xs font-semibold text-slate-200 truncate">{conn.name}</p>
                        <p className="text-[10px] text-slate-400">
                          {conn.db_type} &bull; {conn.database}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onShareConnection(conn);
                          onClose();
                        }}
                        className="p-1.5 rounded-lg bg-slate-800/80 text-slate-400 hover:text-indigo-400"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Table List */}
          {activeConnection && (
            <div>
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 px-1">
                Tables ({tables.length})
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                {tables.map((tbl) => (
                  <button
                    key={tbl.name}
                    onClick={() => {
                      onSelectTable(tbl.name);
                      onClose();
                    }}
                    className="w-full flex items-center justify-between p-2.5 rounded-lg bg-slate-950/30 hover:bg-slate-800/60 border border-slate-800/50 text-xs text-slate-200 text-left transition-colors"
                  >
                    <div className="flex items-center space-x-2.5 truncate">
                      <Table className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate font-medium">{tbl.name}</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
