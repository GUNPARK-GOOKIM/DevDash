import React, { useState } from 'react';
import { ColumnItem } from '../types';
import { Key, Layers, Plus, Trash2, Code2, Check, Copy } from 'lucide-react';

interface StructureViewProps {
  tableName: string;
  columns: ColumnItem[];
  onAddColumn?: (colName: string, type: string) => void;
  onDropColumn?: (colName: string) => void;
}

export const StructureView: React.FC<StructureViewProps> = ({
  tableName,
  columns,
  onAddColumn,
  onDropColumn,
}) => {
  const [newColName, setNewColName] = useState('');
  const [newColType, setNewColType] = useState('VARCHAR(255)');
  const [showAddModal, setShowAddModal] = useState(false);
  const [copiedDdl, setCopiedDdl] = useState(false);
  const [showDdlModal, setShowDdlModal] = useState(false);

  const generateDdl = () => {
    const colDefs = columns.map((col) => {
      const pk = col.is_primary_key ? ' PRIMARY KEY' : '';
      const nullability = col.is_nullable ? '' : ' NOT NULL';
      return `  ${col.name} ${col.data_type}${pk}${nullability}`;
    });
    return `CREATE TABLE ${tableName} (\n${colDefs.join(',\n')}\n);`;
  };

  const handleCopyDdl = () => {
    const ddl = generateDdl();
    navigator.clipboard.writeText(ddl);
    setCopiedDdl(true);
    setTimeout(() => setCopiedDdl(false), 2000);
  };

  return (
    <div className="flex flex-col h-full bg-base text-text font-sans text-xs select-none p-4 space-y-4 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-3 shrink-0">
        <div className="flex items-center space-x-2 text-accent">
          <Layers className="w-5 h-5" />
          <h2 className="text-base font-semibold text-text">
            Structure: <strong className="font-mono text-accent">{tableName}</strong>
          </h2>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowDdlModal(true)}
            className="px-3 py-1.5 rounded border border-white/10 bg-surface hover:bg-surface2 text-text font-medium text-xs flex items-center space-x-1.5 transition-all outline-none"
          >
            <Code2 className="w-4 h-4 text-accent" />
            <span>Generate DDL</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="px-3 py-1.5 rounded bg-accent hover:bg-accentHover text-white font-medium text-xs flex items-center space-x-1.5 shadow transition-all outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add Column</span>
          </button>
        </div>
      </div>

      {/* Schema Structure Grid inside Bento-like card */}
      <div className="border border-border rounded-lg overflow-hidden bg-surface2/25 shadow-lg">
        <table className="w-full border-collapse text-left font-mono text-xs">
          <thead className="bg-surface border-b border-border text-textMuted font-semibold">
            <tr>
              <th className="w-10 px-3 py-2 text-center text-textMuted/60 font-sans text-[11px] uppercase tracking-[0.06em]">#</th>
              <th className="px-4 py-2 font-sans text-[11px] uppercase tracking-[0.06em]">Column Name</th>
              <th className="px-4 py-2 font-sans text-[11px] uppercase tracking-[0.06em]">Data Type</th>
              <th className="px-4 py-2 text-center font-sans text-[11px] uppercase tracking-[0.06em]">Nullable</th>
              <th className="px-4 py-2 text-center font-sans text-[11px] uppercase tracking-[0.06em]">Key Type</th>
              <th className="px-4 py-2 text-right font-sans text-[11px] uppercase tracking-[0.06em]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {columns.map((col, idx) => (
              <tr key={col.name} className="hover:bg-[rgba(255,255,255,0.04)] transition-colors">
                <td className="w-10 px-3 py-2.5 text-center text-textMuted text-[11px] font-sans">{idx + 1}</td>
                <td className="px-4 py-2.5 font-semibold text-text font-sans text-[13px]">{col.name}</td>
                <td className="px-4 py-2.5 text-accent font-mono text-[13px] font-normal">{col.data_type}</td>
                <td className="px-4 py-2.5 text-center">
                  {col.is_nullable ? (
                    <span className="px-2 py-0.5 rounded text-[10px] bg-surface border border-border text-textMuted font-sans font-medium">
                      YES
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] bg-warning/15 text-warning border border-warning/25 font-sans font-medium">
                      NO
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-center">
                  {col.is_primary_key ? (
                    <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] bg-accent/20 text-accent border border-accent/30 font-sans font-semibold">
                      <Key className="w-3 h-3 text-accent" />
                      <span>PRIMARY KEY</span>
                    </span>
                  ) : (
                    <span className="text-textMuted/40">-</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {!col.is_primary_key && onDropColumn && (
                    <button
                      onClick={() => onDropColumn(col.name)}
                      className="p-1 rounded text-textMuted hover:text-error hover:bg-surface2 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                      title="Drop Column"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* DDL SQL Viewer Modal */}
      {showDdlModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#141416] border border-white/10 rounded-xl p-5 w-full max-w-lg shadow-2xl space-y-4 text-text font-sans">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <h3 className="text-sm font-semibold text-text flex items-center space-x-2 text-accent">
                <Code2 className="w-4 h-4" />
                <span>CREATE TABLE DDL — {tableName}</span>
              </h3>
              <button
                onClick={handleCopyDdl}
                className="px-2.5 py-1 rounded bg-accent hover:bg-accentHover text-white text-xs font-medium flex items-center space-x-1 transition-all"
              >
                {copiedDdl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedDdl ? 'Copied DDL!' : 'Copy SQL'}</span>
              </button>
            </div>

            <pre className="p-3 bg-[#0F0F10] border border-white/10 rounded-lg text-accent font-mono text-xs overflow-x-auto select-all">
              {generateDdl()}
            </pre>

            <div className="flex justify-end">
              <button
                onClick={() => setShowDdlModal(false)}
                className="px-4 py-1.5 rounded bg-surface2 text-text hover:bg-surface2/80 text-xs font-medium transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Column Modal Dialog */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-surface border border-border rounded-xl p-5 w-96 shadow-2xl space-y-4">
            <h3 className="text-sm font-semibold text-text flex items-center space-x-2 text-accent">
              <Plus className="w-4 h-4" />
              <span>Add New Column to {tableName}</span>
            </h3>

            <div className="space-y-3 font-sans">
              <div>
                <label className="text-[11px] text-textMuted block mb-1">Column Name:</label>
                <input
                  type="text"
                  placeholder="e.g. status"
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                  className="w-full bg-base border border-border rounded px-3 py-1.5 text-text outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 font-mono text-xs"
                />
              </div>

              <div>
                <label className="text-[11px] text-textMuted block mb-1">Data Type:</label>
                <input
                  type="text"
                  placeholder="e.g. VARCHAR(255) or INT"
                  value={newColType}
                  onChange={(e) => setNewColType(e.target.value)}
                  className="w-full bg-base border border-border rounded px-3 py-1.5 text-text outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 font-mono text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-3 py-1.5 rounded border border-[rgba(255,255,255,0.12)] bg-transparent hover:bg-[rgba(255,255,255,0.06)] text-textMuted hover:text-text transition-colors text-xs font-sans outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (newColName.trim() && onAddColumn) {
                    onAddColumn(newColName, newColType);
                    setShowAddModal(false);
                    setNewColName('');
                  }
                }}
                className="px-4 py-1.5 rounded bg-accent text-white text-xs font-medium hover:bg-accentHover shadow transition-all font-sans outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2"
              >
                Add Column
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
