import React, { useState } from 'react';
import { Download, X, FileText, Code, FileSpreadsheet } from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  tableName: string;
  onExport: (format: 'csv' | 'json' | 'sql') => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  tableName,
  onExport,
}) => {
  const [selectedFormat, setSelectedFormat] = useState<'csv' | 'json' | 'sql'>('csv');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fadeIn select-none font-sans">
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-[440px] max-w-[90vw] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
          <div className="flex items-center space-x-2 text-indigo-400">
            <Download className="w-5 h-5" />
            <h3 className="text-sm font-semibold text-slate-100">Export Data: <strong className="font-mono text-indigo-300">{tableName}</strong></h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Format Selection Cards */}
        <div className="p-5 space-y-3">
          <label className="text-xs text-slate-400 font-medium block">Choose Export Format:</label>

          <div className="grid grid-cols-3 gap-3">
            {/* CSV */}
            <div
              onClick={() => setSelectedFormat('csv')}
              className={`flex flex-col items-center justify-center p-3 rounded-lg border cursor-pointer transition-all space-y-1.5 ${
                selectedFormat === 'csv'
                  ? 'bg-indigo-950/60 border-indigo-500 text-indigo-200 shadow-md'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              <FileSpreadsheet className="w-6 h-6 text-emerald-400" />
              <span className="text-xs font-mono font-medium">CSV</span>
              <span className="text-[9px] text-slate-500">Excel / Sheets</span>
            </div>

            {/* JSON */}
            <div
              onClick={() => setSelectedFormat('json')}
              className={`flex flex-col items-center justify-center p-3 rounded-lg border cursor-pointer transition-all space-y-1.5 ${
                selectedFormat === 'json'
                  ? 'bg-indigo-950/60 border-indigo-500 text-indigo-200 shadow-md'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              <Code className="w-6 h-6 text-amber-400" />
              <span className="text-xs font-mono font-medium">JSON</span>
              <span className="text-[9px] text-slate-500">Web / API</span>
            </div>

            {/* SQL Dump */}
            <div
              onClick={() => setSelectedFormat('sql')}
              className={`flex flex-col items-center justify-center p-3 rounded-lg border cursor-pointer transition-all space-y-1.5 ${
                selectedFormat === 'sql'
                  ? 'bg-indigo-950/60 border-indigo-500 text-indigo-200 shadow-md'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              <FileText className="w-6 h-6 text-purple-400" />
              <span className="text-xs font-mono font-medium">SQL Dump</span>
              <span className="text-[9px] text-slate-500">INSERT Statements</span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 bg-slate-950 border-t border-slate-800 flex items-center justify-end space-x-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onExport(selectedFormat);
              onClose();
            }}
            className="px-4 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs flex items-center space-x-1.5 shadow-lg shadow-indigo-600/30 transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download {selectedFormat.toUpperCase()}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
