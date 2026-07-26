import React from 'react';
import { TableItem, ColumnItem } from '../types';
import { Network, X, Key, Table as TableIcon } from 'lucide-react';

interface ErDiagramModalProps {
  isOpen: boolean;
  onClose: () => void;
  tables: TableItem[];
  columns: ColumnItem[];
}

export const ErDiagramModal: React.FC<ErDiagramModalProps> = ({
  isOpen,
  onClose,
  tables,
  columns,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-fadeIn select-none">
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-[900px] h-[600px] max-w-[95vw] max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center space-x-2 text-indigo-400">
            <Network className="w-5 h-5" />
            <h3 className="text-sm font-semibold text-slate-100">Database Schema ER Diagram Map</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Canvas Diagram Node View */}
        <div className="flex-1 bg-slate-950 p-6 overflow-auto relative font-sans">
          <div className="grid grid-cols-3 gap-6">
            {tables.map((table, idx) => (
              <div
                key={table.name}
                className="bg-slate-900/90 border border-indigo-500/30 rounded-xl shadow-lg overflow-hidden flex flex-col hover:border-indigo-500 transition-all"
              >
                {/* Node Table Title Bar */}
                <div className="bg-indigo-950/60 px-3 py-2 border-b border-indigo-900/40 flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-indigo-200">
                    <TableIcon className="w-4 h-4 text-indigo-400" />
                    <span className="font-mono text-xs font-semibold">{table.name}</span>
                  </div>
                  <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono">
                    {table.table_type}
                  </span>
                </div>

                {/* Node Columns List */}
                <div className="p-2.5 space-y-1 font-mono text-[11px]">
                  {columns.map((col) => (
                    <div
                      key={col.name}
                      className="flex items-center justify-between px-2 py-1 rounded bg-slate-950/60 border border-slate-800/40"
                    >
                      <div className="flex items-center space-x-1.5">
                        {col.is_primary_key ? (
                          <Key className="w-3 h-3 text-amber-400 shrink-0" />
                        ) : (
                          <span className="w-3 text-center text-slate-600">•</span>
                        )}
                        <span className="text-slate-200">{col.name}</span>
                      </div>
                      <span className="text-[10px] text-slate-500">{col.data_type}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>{tables.length} tables in active schema</span>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs transition-colors"
          >
            Close Diagram
          </button>
        </div>
      </div>
    </div>
  );
};
