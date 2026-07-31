import React, { useState } from 'react';
import { Upload, X, FileText, CheckCircle2, AlertTriangle } from 'lucide-react';
import { importCsvContent, isTauriAvailable } from '../services/tauriBridge';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectionId?: string;
  tableName?: string;
  onImportSuccess: (fileName: string, rowCount: number) => void;
}

export const ImportModal: React.FC<ImportModalProps> = ({
  isOpen,
  onClose,
  connectionId,
  tableName,
  onImportSuccess,
}) => {
  const [fileContent, setFileContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultSummary, setResultSummary] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
      setError(null);
      setResultSummary(null);
      const reader = new FileReader();
      reader.onload = (event) => {
        setFileContent(event.target?.result as string);
      };
      reader.readAsText(file);
    }
  };

  const handleImport = async () => {
    if (!fileContent) return;
    if (!connectionId || !tableName) {
      setError('Open a table browser first so import knows the target table.');
      return;
    }
    if (!isTauriAvailable()) {
      setError('CSV import requires the native Tauri desktop app (not browser preview).');
      return;
    }
    if (!fileName.toLowerCase().endsWith('.csv') && !fileContent.includes(',')) {
      setError('Only CSV import is supported by the backend. SQL dump import is not implemented.');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await importCsvContent(connectionId, tableName, fileContent);
      setResultSummary(
        `Inserted ${result.inserted_count} row(s)` +
          (result.failed_count > 0 ? `, ${result.failed_count} failed` : '')
      );
      if (result.inserted_count === 0 && result.failed_count > 0) {
        setError(result.failed_rows[0]?.reason || 'All rows failed to import');
        setIsLoading(false);
        return;
      }
      setIsSuccess(true);
      setTimeout(() => {
        onImportSuccess(fileName, result.inserted_count);
        setIsSuccess(false);
        setFileContent('');
        setFileName('');
        setResultSummary(null);
        onClose();
      }, 900);
    } catch (err: any) {
      setError(String(err?.message || err || 'Import failed'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fadeIn select-none font-sans">
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-[480px] max-w-[90vw] overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
          <div className="flex items-center space-x-2 text-indigo-400">
            <Upload className="w-5 h-5" />
            <h3 className="text-sm font-semibold text-slate-100">
              Import CSV into {tableName || '(no table selected)'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {isSuccess ? (
            <div className="flex flex-col items-center justify-center py-6 space-y-2 text-emerald-400">
              <CheckCircle2 className="w-12 h-12" />
              <span className="text-sm font-semibold text-slate-100">
                {resultSummary || 'Data imported successfully'}
              </span>
            </div>
          ) : (
            <>
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-xl p-8 cursor-pointer transition-colors bg-slate-950/60">
                <FileText className="w-8 h-8 text-indigo-400 mb-2" />
                <span className="text-xs text-slate-200 font-medium">Click to select a CSV file</span>
                <span className="text-[10px] text-slate-500 mt-1">
                  Headers must match target columns. SQL dump import is not supported.
                </span>
                <input type="file" accept=".csv,text/csv" onChange={handleFileChange} className="hidden" />
              </label>

              {fileName && (
                <div className="bg-slate-950 border border-slate-800 rounded p-2.5 flex items-center justify-between text-xs font-mono text-indigo-300">
                  <span>Selected: {fileName}</span>
                  <span className="text-slate-500">({fileContent.length} bytes)</span>
                </div>
              )}

              {error && (
                <div className="flex items-start space-x-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded p-2.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
            </>
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
            disabled={!fileContent || isSuccess || isLoading}
            onClick={handleImport}
            className="px-4 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-medium text-xs flex items-center space-x-1.5 shadow-lg shadow-indigo-600/30 transition-all"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{isLoading ? 'Importing…' : 'Import CSV'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
