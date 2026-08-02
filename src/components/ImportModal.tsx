import React, { useState } from 'react';
import { Upload, X, FileText, CheckCircle2, AlertTriangle } from 'lucide-react';
import {
  importCsvContent,
  isTauriAvailable,
  runSqlQuery,
  splitSqlStatements,
} from '../services/tauriBridge';

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
  const [mode, setMode] = useState<'csv' | 'sql'>('csv');

  if (!isOpen) return null;

  const detectMode = (name: string, content: string) => {
    if (name.toLowerCase().endsWith('.sql')) return 'sql';
    if (name.toLowerCase().endsWith('.csv')) return 'csv';
    // Heuristic
    if (/^\s*(INSERT|CREATE|UPDATE|DELETE|ALTER|DROP|BEGIN|COMMIT)\b/im.test(content)) {
      return 'sql';
    }
    return 'csv';
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
      setError(null);
      setResultSummary(null);
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setFileContent(text);
        setMode(detectMode(file.name, text));
      };
      reader.readAsText(file);
    }
  };

  const handleImport = async () => {
    if (!fileContent) return;
    if (!connectionId) {
      setError('Connect to a database first.');
      return;
    }
    if (!isTauriAvailable()) {
      setError('Import requires the native Tauri desktop app (not browser preview).');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      if (mode === 'sql') {
        const statements = splitSqlStatements(fileContent);
        if (statements.length === 0) {
          setError('No SQL statements found in file.');
          setIsLoading(false);
          return;
        }
        let ok = 0;
        let failed = 0;
        let lastErr = '';
        for (const stmt of statements) {
          try {
            await runSqlQuery(connectionId, stmt);
            ok++;
          } catch (err) {
            failed++;
            lastErr = String(err);
            // Stop on first error for safety (like many clients default)
            break;
          }
        }
        if (failed > 0 && ok === 0) {
          setError(`SQL import failed: ${lastErr}`);
          setIsLoading(false);
          return;
        }
        setResultSummary(
          `Executed ${ok} statement(s)` +
            (failed ? `, stopped after error: ${lastErr}` : ' successfully')
        );
        setIsSuccess(true);
        setTimeout(() => {
          onImportSuccess(fileName, ok);
          setIsSuccess(false);
          setFileContent('');
          setFileName('');
          setResultSummary(null);
          onClose();
        }, 1000);
      } else {
        if (!tableName) {
          setError('Open a table browser first so CSV import knows the target table.');
          setIsLoading(false);
          return;
        }
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
      }
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fadeIn select-none font-sans">
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-[520px] max-w-[90vw] overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-indigo-400">
            <Upload className="w-5 h-5" />
            <h3 className="text-sm font-semibold text-slate-100">Import Data</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded text-slate-400 hover:text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex space-x-2">
            <button
              onClick={() => setMode('csv')}
              className={`flex-1 py-1.5 rounded text-xs border ${
                mode === 'csv'
                  ? 'bg-indigo-950/50 border-indigo-500 text-indigo-200'
                  : 'border-slate-700 text-slate-400'
              }`}
            >
              CSV → table
            </button>
            <button
              onClick={() => setMode('sql')}
              className={`flex-1 py-1.5 rounded text-xs border ${
                mode === 'sql'
                  ? 'bg-indigo-950/50 border-indigo-500 text-indigo-200'
                  : 'border-slate-700 text-slate-400'
              }`}
            >
              SQL dump
            </button>
          </div>

          <p className="text-[11px] text-slate-500">
            {mode === 'csv'
              ? `Import CSV rows into ${tableName || '(select a table first)'}.`
              : 'Execute a multi-statement SQL script against the active connection. Stops on first error.'}
          </p>

          <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-700 rounded-xl p-8 cursor-pointer hover:border-indigo-500/50 transition-colors">
            <FileText className="w-8 h-8 text-slate-500 mb-2" />
            <span className="text-xs text-slate-400">
              {fileName || (mode === 'sql' ? 'Choose .sql file' : 'Choose .csv file')}
            </span>
            <input
              type="file"
              accept={mode === 'sql' ? '.sql,text/plain' : '.csv,text/csv'}
              className="hidden"
              onChange={handleFileChange}
            />
          </label>

          {error && (
            <div className="flex items-start space-x-2 text-xs text-rose-300 bg-rose-950/40 border border-rose-900/50 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {(isSuccess || resultSummary) && (
            <div className="flex items-start space-x-2 text-xs text-emerald-300 bg-emerald-950/40 border border-emerald-900/50 rounded-lg p-3">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{resultSummary || 'Import complete'}</span>
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 bg-slate-950 border-t border-slate-800 flex justify-end space-x-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 text-xs">
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!fileContent || isLoading}
            className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium disabled:opacity-40"
          >
            {isLoading ? 'Importing…' : mode === 'sql' ? 'Run SQL Script' : 'Import CSV'}
          </button>
        </div>
      </div>
    </div>
  );
};
