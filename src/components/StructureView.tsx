import React, { useEffect, useState, useCallback } from 'react';
import { ColumnItem } from '../types';
import { Key, Layers, Plus, Trash2, Code2, Check, Copy, Link2, RefreshCw, AlertCircle } from 'lucide-react';
import {
  generateTableDdl,
  getTableIndexes,
  IndexInfoPayload,
  TableDdlPayload,
  isTauriAvailable,
} from '../services/tauriBridge';

interface StructureViewProps {
  tableName: string;
  columns: ColumnItem[];
  connectionId?: string;
  dbType?: string;
  onAddColumn?: (colName: string, type: string) => void;
  onDropColumn?: (colName: string) => void;
}

export const StructureView: React.FC<StructureViewProps> = ({
  tableName,
  columns,
  connectionId,
  dbType,
  onAddColumn,
  onDropColumn,
}) => {
  const [newColName, setNewColName] = useState('');
  const [newColType, setNewColType] = useState('VARCHAR(255)');
  const [showAddModal, setShowAddModal] = useState(false);
  const [copiedDdl, setCopiedDdl] = useState(false);
  const [showDdlModal, setShowDdlModal] = useState(false);
  const [ddl, setDdl] = useState<TableDdlPayload | null>(null);
  const [indexes, setIndexes] = useState<IndexInfoPayload[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);

  const loadMeta = useCallback(async () => {
    if (!connectionId || !dbType || !tableName || !isTauriAvailable()) {
      setIndexes([]);
      setDdl(null);
      return;
    }
    setLoadingMeta(true);
    setMetaError(null);
    try {
      const [idx, tableDdl] = await Promise.all([
        getTableIndexes(connectionId, tableName, dbType),
        generateTableDdl(connectionId, tableName, dbType),
      ]);
      setIndexes(idx);
      setDdl(tableDdl);
    } catch (err) {
      setMetaError(String(err));
      setIndexes([]);
      setDdl(null);
    } finally {
      setLoadingMeta(false);
    }
  }, [connectionId, dbType, tableName]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  const fallbackDdl = () => {
    const colDefs = columns.map((col) => {
      const pk = col.is_primary_key ? ' PRIMARY KEY' : '';
      const nullability = col.is_nullable || col.is_primary_key ? '' : ' NOT NULL';
      return `  ${col.name} ${col.data_type}${pk}${nullability}`;
    });
    return `CREATE TABLE ${tableName} (\n${colDefs.join(',\n')}\n);`;
  };

  const ddlText = ddl?.create_sql || fallbackDdl();

  const handleCopyDdl = () => {
    navigator.clipboard.writeText(ddlText);
    setCopiedDdl(true);
    setTimeout(() => setCopiedDdl(false), 2000);
  };

  return (
    <div className="flex flex-col h-full bg-base text-text font-sans text-xs select-none p-4 space-y-4 overflow-y-auto">
      <div className="flex items-center justify-between border-b border-border pb-3 shrink-0">
        <div className="flex items-center space-x-2 text-accent">
          <Layers className="w-5 h-5" />
          <h2 className="text-base font-semibold text-text">
            Structure: <strong className="font-mono text-accent">{tableName}</strong>
          </h2>
          {loadingMeta && <RefreshCw className="w-3.5 h-3.5 animate-spin text-textMuted" />}
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={loadMeta}
            className="px-2 py-1.5 rounded border border-white/10 bg-surface hover:bg-surface2 text-textMuted text-xs"
            title="Refresh indexes & DDL"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setShowDdlModal(true)}
            className="px-3 py-1.5 rounded border border-white/10 bg-surface hover:bg-surface2 text-text font-medium text-xs flex items-center space-x-1.5 transition-all"
          >
            <Code2 className="w-4 h-4 text-accent" />
            <span>Generate DDL</span>
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-3 py-1.5 rounded bg-accent hover:bg-accentHover text-white font-medium text-xs flex items-center space-x-1.5 shadow transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Add Column</span>
          </button>
        </div>
      </div>

      {metaError && (
        <div className="flex items-start space-x-2 text-amber-300 text-[11px] bg-amber-500/10 border border-amber-500/30 rounded-lg p-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>Catalog metadata: {metaError}</span>
        </div>
      )}

      <div className="border border-border rounded-lg overflow-hidden bg-surface2/25 shadow-lg">
        <table className="w-full border-collapse text-left font-mono text-xs">
          <thead className="bg-surface border-b border-border text-textMuted font-semibold">
            <tr>
              <th className="w-10 px-3 py-2 text-center font-sans text-[11px] uppercase tracking-[0.06em]">#</th>
              <th className="px-4 py-2 font-sans text-[11px] uppercase tracking-[0.06em]">Column</th>
              <th className="px-4 py-2 font-sans text-[11px] uppercase tracking-[0.06em]">Type</th>
              <th className="px-4 py-2 text-center font-sans text-[11px] uppercase tracking-[0.06em]">Null</th>
              <th className="px-4 py-2 text-center font-sans text-[11px] uppercase tracking-[0.06em]">Key</th>
              <th className="px-4 py-2 font-sans text-[11px] uppercase tracking-[0.06em]">References</th>
              <th className="px-4 py-2 text-right font-sans text-[11px] uppercase tracking-[0.06em]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {columns.map((col, idx) => (
              <tr key={col.name} className="border-b border-border/40 hover:bg-surface2/40">
                <td className="px-3 py-2 text-center text-textMuted">{idx + 1}</td>
                <td className="px-4 py-2 text-text font-medium">{col.name}</td>
                <td className="px-4 py-2 text-accent">{col.data_type}</td>
                <td className="px-4 py-2 text-center text-textMuted">
                  {col.is_nullable ? 'YES' : 'NO'}
                </td>
                <td className="px-4 py-2 text-center">
                  {col.is_primary_key ? (
                    <span className="inline-flex items-center space-x-1 text-accent">
                      <Key className="w-3 h-3" />
                      <span>PK</span>
                    </span>
                  ) : col.is_foreign_key ? (
                    <span className="inline-flex items-center space-x-1 text-blue-400">
                      <Link2 className="w-3 h-3" />
                      <span>FK</span>
                    </span>
                  ) : (
                    <span className="text-textMuted">—</span>
                  )}
                </td>
                <td className="px-4 py-2 text-blue-400 font-mono text-[11px]">
                  {col.fk_references
                    ? `${col.fk_references.table}.${col.fk_references.column}`
                    : '—'}
                </td>
                <td className="px-4 py-2 text-right">
                  {onDropColumn && !col.is_primary_key && (
                    <button
                      onClick={() => {
                        if (confirm(`Drop column ${col.name}?`)) onDropColumn(col.name);
                      }}
                      className="p-1 rounded text-textMuted hover:text-rose-400 hover:bg-rose-500/10"
                      title="Drop column"
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

      {/* Indexes */}
      <div className="border border-border rounded-lg overflow-hidden bg-surface2/25">
        <div className="px-4 py-2 bg-surface border-b border-border text-[11px] font-semibold uppercase tracking-wider text-textMuted">
          Indexes ({indexes.length})
        </div>
        {indexes.length === 0 ? (
          <div className="p-4 text-textMuted text-[11px]">
            {isTauriAvailable()
              ? 'No secondary indexes reported (or catalog unavailable).'
              : 'Connect via the desktop app to load live indexes.'}
          </div>
        ) : (
          <table className="w-full text-left font-mono text-xs">
            <thead className="text-textMuted border-b border-border/40">
              <tr>
                <th className="px-4 py-2 font-sans text-[10px] uppercase">Name</th>
                <th className="px-4 py-2 font-sans text-[10px] uppercase">Columns</th>
                <th className="px-4 py-2 font-sans text-[10px] uppercase">Flags</th>
              </tr>
            </thead>
            <tbody>
              {indexes.map((idx) => (
                <tr key={idx.name} className="border-b border-border/30">
                  <td className="px-4 py-2 text-text">{idx.name}</td>
                  <td className="px-4 py-2 text-accent">{idx.columns.join(', ')}</td>
                  <td className="px-4 py-2 text-textMuted">
                    {idx.is_primary ? 'PRIMARY ' : ''}
                    {idx.is_unique ? 'UNIQUE' : 'NON-UNIQUE'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-surface border border-border rounded-xl p-5 w-[400px] space-y-3">
            <h3 className="text-sm font-semibold">Add Column</h3>
            <input
              value={newColName}
              onChange={(e) => setNewColName(e.target.value)}
              placeholder="column_name"
              className="w-full bg-base border border-border rounded px-3 py-2 text-xs font-mono"
            />
            <input
              value={newColType}
              onChange={(e) => setNewColType(e.target.value)}
              placeholder="VARCHAR(255)"
              className="w-full bg-base border border-border rounded px-3 py-2 text-xs font-mono"
            />
            <div className="flex justify-end space-x-2">
              <button onClick={() => setShowAddModal(false)} className="px-3 py-1.5 text-xs text-textMuted">
                Cancel
              </button>
              <button
                onClick={() => {
                  if (newColName && onAddColumn) {
                    onAddColumn(newColName, newColType);
                    setNewColName('');
                    setShowAddModal(false);
                    setTimeout(loadMeta, 400);
                  }
                }}
                className="px-3 py-1.5 bg-accent text-white rounded text-xs"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {showDdlModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-surface border border-border rounded-xl w-[640px] max-w-[95vw] max-h-[80vh] flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <span className="text-sm font-semibold flex items-center space-x-2">
                <Code2 className="w-4 h-4 text-accent" />
                <span>CREATE TABLE DDL</span>
                {ddl && (
                  <span className="text-[10px] text-textMuted font-normal">
                    (live catalog · {ddl.indexes.length} idx · {ddl.foreign_keys.length} fk)
                  </span>
                )}
              </span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleCopyDdl}
                  className="px-2.5 py-1 rounded bg-surface2 text-xs flex items-center space-x-1"
                >
                  {copiedDdl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedDdl ? 'Copied' : 'Copy'}</span>
                </button>
                <button onClick={() => setShowDdlModal(false)} className="text-textMuted text-xs px-2">
                  Close
                </button>
              </div>
            </div>
            <pre className="p-4 overflow-auto text-[11px] font-mono text-accent whitespace-pre-wrap flex-1 bg-base">
              {ddlText}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
