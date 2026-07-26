import React, { useState } from 'react';
import { Upload, X, FileText, CheckCircle2 } from 'lucide-react';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: (fileName: string, rowCount: number) => void;
}

export const ImportModal: React.FC<ImportModalProps> = ({
  isOpen,
  onClose,
  onImportSuccess,
}) => {
  const [fileContent, setFileContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = (event) => {
        setFileContent(event.target?.result as string);
      };
      reader.readAsText(file);
    }
  };

  const handleImport = () => {
    if (!fileContent) return;
    const lines = fileContent.trim().split('\n').length;
    setIsSuccess(true);
    setTimeout(() => {
      onImportSuccess(fileName, Math.max(1, lines - 1));
      setIsSuccess(false);
      onClose();
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fadeIn select-none font-sans">
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-[480px] max-w-[90vw] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
          <div className="flex items-center space-x-2 text-indigo-400">
            <Upload className="w-5 h-5" />
            <h3 className="text-sm font-semibold text-slate-100">Import Data File (CSV / SQL)</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* File Dropzone */}
        <div className="p-6 space-y-4">
          {isSuccess ? (
            <div className="flex flex-col items-center justify-center py-6 space-y-2 text-emerald-400">
              <CheckCircle2 className="w-12 h-12 animate-bounce" />
              <span className="text-sm font-semibold text-slate-100">Data Imported Successfully!</span>
            </div>
          ) : (
            <>
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-xl p-8 cursor-pointer transition-colors bg-slate-950/60">
                <FileText className="w-8 h-8 text-indigo-400 mb-2" />
                <span className="text-xs text-slate-200 font-medium">Click to select CSV or SQL file</span>
                <span className="text-[10px] text-slate-500 mt-1">Supports UTF-8 CSV, TSV, or SQL Dump files</span>
                <input
                  type="file"
                  accept=".csv,.sql,.txt"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>

              {fileName && (
                <div className="bg-slate-950 border border-slate-800 rounded p-2.5 flex items-center justify-between text-xs font-mono text-indigo-300">
                  <span>Selected: {fileName}</span>
                  <span className="text-slate-500">({fileContent.length} bytes)</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-950 border-t border-slate-800 flex items-center justify-end space-x-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
          >
            Cancel
          </button>
          <button
            disabled={!fileContent || isSuccess}
            onClick={handleImport}
            className="px-4 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-medium text-xs flex items-center space-x-1.5 shadow-lg shadow-indigo-600/30 transition-all"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import Data</span>
          </button>
        </div>
      </div>
    </div>
  );
};
