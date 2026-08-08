import React from 'react';
import { ChevronRight, Table2, Columns3, Eye } from 'lucide-react';
import { ColumnItem, ConnectionConfig, TableItem, objectKey } from '../../types';

interface SchemaScreenProps {
  connection: ConnectionConfig | null;
  tables: TableItem[];
  selectedTable: TableItem | null;
  columns: ColumnItem[];
  previewRows: unknown[][];
  previewCols: string[];
  loading?: boolean;
  onSelectTable: (t: TableItem) => void;
  onPreview: (t: TableItem) => void;
  onBack: () => void;
}

export const SchemaScreen: React.FC<SchemaScreenProps> = ({
  connection,
  tables,
  selectedTable,
  columns,
  previewRows,
  previewCols,
  loading,
  onSelectTable,
  onPreview,
  onBack,
}) => {
  if (!connection) {
    return (
      <EmptyState text="Connect to a database first. Schema exploration runs locally through the shared Rust engine." />
    );
  }

  if (selectedTable) {
    return (
      <div className="h-full overflow-y-auto px-3 py-3 space-y-3">
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-indigo-400 font-medium"
        >
          ← Tables
        </button>
        <div>
          <h2 className="text-base font-semibold">{objectKey(selectedTable)}</h2>
          <p className="text-[11px] text-slate-400">{selectedTable.table_type || 'TABLE'}</p>
        </div>
        <button
          type="button"
          onClick={() => onPreview(selectedTable)}
          className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold"
        >
          <Eye className="w-4 h-4" />
          Preview 50 rows
        </button>
        <div className="space-y-1.5">
          {columns.map((c) => (
            <div
              key={c.name}
              className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-2.5"
            >
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-100 truncate flex items-center gap-1.5">
                  <Columns3 className="w-3.5 h-3.5 text-slate-500" />
                  {c.name}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">{c.data_type}</div>
              </div>
              <div className="flex gap-1 shrink-0">
                {c.is_primary_key && <Pill>PK</Pill>}
                {c.is_foreign_key && <Pill>FK</Pill>}
                {!c.is_nullable && <Pill>NN</Pill>}
              </div>
            </div>
          ))}
        </div>
        {previewCols.length > 0 && (
          <div className="rounded-xl border border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-[10px]">
                <thead className="bg-slate-900">
                  <tr>
                    {previewCols.map((c) => (
                      <th key={c} className="px-2 py-1.5 text-left text-slate-400 font-medium">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => (
                    <tr key={i} className="border-t border-slate-800/80">
                      {(row as unknown[]).map((cell, j) => (
                        <td key={j} className="px-2 py-1.5 text-slate-200 whitespace-nowrap max-w-[160px] truncate">
                          {cell === null || cell === undefined ? 'NULL' : String(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-3 py-3 space-y-2">
      <h2 className="text-base font-semibold">Schema</h2>
      <p className="text-[11px] text-slate-400 pb-1">
        {tables.length} objects on {connection.name}
        {loading ? ' · loading…' : ''}
      </p>
      {tables.map((t) => (
        <button
          key={objectKey(t)}
          type="button"
          onClick={() => onSelectTable(t)}
          className="w-full flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-3 text-left active:scale-[0.99]"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Table2 className="w-4 h-4 text-indigo-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-semibold truncate">{objectKey(t)}</div>
              <div className="text-[10px] text-slate-400">{t.table_type}</div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
        </button>
      ))}
    </div>
  );
};

const Pill: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
    {children}
  </span>
);

const EmptyState: React.FC<{ text: string }> = ({ text }) => (
  <div className="h-full flex items-center justify-center px-6 text-center text-sm text-slate-400">
    {text}
  </div>
);
