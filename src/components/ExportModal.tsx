import React, { useState } from 'react';
import { Download, X, FileText, Code, FileSpreadsheet, Layers, FileCode } from 'lucide-react';

export type ExportFormat = 'csv' | 'json' | 'sql' | 'jsonl' | 'markdown' | 'parquet';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  tableName: string;
  onExport: (format: ExportFormat, scope: 'full' | 'page') => void | Promise<void>;
  /** Active filter to pass to full-table server export */
  activeFilter?: string;
  supportsFullExport?: boolean;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  tableName,
  onExport,
  activeFilter,
  supportsFullExport = true,
}) => {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('csv');
  const [scope, setScope] = useState<'full' | 'page'>('full');
  const [busy, setBusy] = useState(false);

  if (!isOpen) return null;

  const formatOptions: { id: ExportFormat; label: string; sub: string; icon: React.ReactNode; disabled?: boolean }[] = [
    { id: 'csv', label: 'CSV', sub: 'Excel / Sheets', icon: <FileSpreadsheet className="w-5 h-5 text-emerald-400" /> },
    { id: 'json', label: 'JSON', sub: 'Web / API Array', icon: <Code className="w-5 h-5 text-amber-400" /> },
    { id: 'sql', label: 'SQL Dump', sub: 'INSERT Statements', icon: <FileText className="w-5 h-5 text-purple-400" /> },
    { id: 'jsonl', label: 'JSON Lines', sub: 'Streaming / BigData', icon: <FileCode className="w-5 h-5 text-sky-400" /> },
    { id: 'markdown', label: 'Markdown', sub: 'GFM Markdown Table', icon: <Layers className="w-5 h-5 text-pink-400" /> },
    { id: 'parquet', label: 'Parquet', sub: 'Not implemented', icon: <Download className="w-5 h-5 text-slate-600" />, disabled: true },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fadeIn select-none font-sans">
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-[520px] max-w-[90vw] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
          <div className="flex items-center space-x-2 text-indigo-400">
            <Download className="w-5 h-5" />
            <h3 className="text-sm font-semibold text-slate-100">
              Export Data: <strong className="font-mono text-indigo-300">{tableName}</strong>
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <label className="text-xs text-slate-400 font-medium block">Choose Export Format:</label>

          <div className="grid grid-cols-3 gap-3">
            {formatOptions.map((opt) => (
              <div
                key={opt.id}
                onClick={() => {
                  if (!opt.disabled) setSelectedFormat(opt.id);
                }}
                className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-all space-y-1.5 ${
                  opt.disabled
                    ? 'bg-slate-950/40 border-slate-900 text-slate-600 cursor-not-allowed opacity-60'
                    : selectedFormat === opt.id
                    ? 'bg-indigo-950/60 border-indigo-500 text-indigo-200 shadow-md cursor-pointer'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200 cursor-pointer'
                }`}
              >
                {opt.icon}
                <span className="text-xs font-mono font-medium">{opt.label}</span>
                <span className="text-[9px] text-slate-500">{opt.sub}</span>
              </div>
            ))}
          </div>

          {supportsFullExport && ['csv', 'json', 'sql'].includes(selectedFormat) && (
            <div className="space-y-2">
              <label className="text-xs text-slate-400 font-medium block">Scope:</label>
              <div className="flex space-x-2">
                <button
                  onClick={() => setScope('full')}
                  className={`flex-1 py-1.5 rounded text-xs border ${
                    scope === 'full'
                      ? 'bg-indigo-950/50 border-indigo-500 text-indigo-200'
                      : 'border-slate-700 text-slate-400'
                  }`}
                >
                  Full table (server)
                </button>
                <button
                  onClick={() => setScope('page')}
                  className={`flex-1 py-1.5 rounded text-xs border ${
                    scope === 'page'
                      ? 'bg-indigo-950/50 border-indigo-500 text-indigo-200'
                      : 'border-slate-700 text-slate-400'
                  }`}
                >
                  Current page only
                </button>
              </div>
              {scope === 'full' && activeFilter && (
                <p className="text-[10px] text-slate-500 font-mono truncate" title={activeFilter}>
                  Filter: {activeFilter}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 bg-slate-950 border-t border-slate-800 flex items-center justify-end space-x-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
          >
            Cancel
          </button>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onExport(selectedFormat, scope);
                onClose();
              } catch (err) {
                alert(String(err));
              } finally {
                setBusy(false);
              }
            }}
            className="px-4 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs flex items-center space-x-1.5 shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{busy ? 'Exporting…' : `Download ${selectedFormat.toUpperCase()}`}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
