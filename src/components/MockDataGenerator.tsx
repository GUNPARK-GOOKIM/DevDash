import React, { useState } from 'react';
import { Wand2, X, Play, RefreshCw, CheckCircle2, Table, AlertCircle } from 'lucide-react';
import { ColumnItem } from '../types';

interface MockDataGeneratorProps {
  isOpen: boolean;
  onClose: () => void;
  tableName: string;
  columns: ColumnItem[];
  /** May be async (e.g. INSERT). Generator awaits and surfaces errors. */
  onGenerate: (rows: Record<string, any>[]) => void | Promise<void>;
}

/** Columns that the database fills itself — omit from INSERT. */
function isGeneratedSkip(col: ColumnItem): boolean {
  const t = col.data_type.toLowerCase();
  const d = (col.default_value || '').toLowerCase();
  return (
    t.includes('serial') ||
    t.includes('bigserial') ||
    t.includes('smallserial') ||
    t.includes('identity') ||
    t.includes('auto_increment') ||
    t.includes('generated') ||
    d.includes('nextval') ||
    d.includes('autoincrement') ||
    d.includes('auto_increment')
  );
}

function randomUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const MockDataGenerator: React.FC<MockDataGeneratorProps> = ({
  isOpen,
  onClose,
  tableName,
  columns,
  onGenerate,
}) => {
  const [rowCount, setRowCount] = useState<number>(100);
  const [isGenerating, setIsGenerating] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  const sampleFirstNames = ['Alice', 'Bob', 'Carol', 'David', 'Eva', 'Frank', 'Grace', 'Henry', 'Ivy', 'Jack'];
  const sampleLastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez'];
  const sampleDomains = ['example.com', 'test.org', 'devdash.io', 'company.net', 'cloud.dev'];

  const insertableColumns = columns.filter((c) => !isGeneratedSkip(c));
  const skippedColumns = columns.filter((c) => isGeneratedSkip(c));

  const getRandomElement = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

  const generateFieldValue = (col: ColumnItem, index: number) => {
    const colName = col.name.toLowerCase();
    const dataType = col.data_type.toLowerCase();

    // Non-serial integer PKs: use a large unique-ish value to reduce collisions
    if (
      col.is_primary_key &&
      (dataType.includes('int') || dataType.includes('numeric') || dataType.includes('number'))
    ) {
      return Math.floor(Date.now() % 1e9) + index + Math.floor(Math.random() * 1000);
    }
    if (col.is_primary_key && (colName.includes('uuid') || dataType.includes('uuid'))) {
      return randomUuid();
    }

    if (colName.includes('uuid') || dataType.includes('uuid')) {
      return randomUuid();
    }
    if (colName.includes('email')) {
      const fn = getRandomElement(sampleFirstNames).toLowerCase();
      const ln = getRandomElement(sampleLastNames).toLowerCase();
      return `${fn}.${ln}${Date.now().toString(36)}${index}@${getRandomElement(sampleDomains)}`;
    }
    if (colName.includes('name') && !colName.includes('user')) {
      return `${getRandomElement(sampleFirstNames)} ${getRandomElement(sampleLastNames)}`;
    }
    if (colName.includes('username') || colName === 'user' || colName === 'login') {
      return `user_${getRandomElement(sampleFirstNames).toLowerCase()}_${index}_${Math.floor(Math.random() * 1e5)}`;
    }
    if (colName.includes('price') || colName.includes('amount') || colName.includes('cost')) {
      return Number((Math.random() * 500 + 5).toFixed(2));
    }
    if (colName.includes('status')) {
      return getRandomElement(['active', 'pending', 'completed', 'archived']);
    }
    if (colName.includes('ip') || colName.includes('host')) {
      return `192.168.${Math.floor(Math.random() * 255)}.${(index % 250) + 1}`;
    }
    if (dataType.includes('bool') || dataType === 'bit') {
      return Math.random() > 0.5;
    }
    if (dataType.includes('json')) {
      return JSON.stringify({ seed: true, n: index, at: new Date().toISOString() });
    }
    if (
      dataType.includes('int') ||
      dataType.includes('numeric') ||
      dataType.includes('decimal') ||
      dataType.includes('float') ||
      dataType.includes('double') ||
      dataType.includes('real') ||
      dataType.includes('number')
    ) {
      return Math.floor(Math.random() * 10000) + 1;
    }
    if (dataType.includes('date') || dataType.includes('time') || colName.endsWith('_at')) {
      const d = new Date(Date.now() - Math.random() * 30 * 24 * 3600 * 1000);
      if (dataType.includes('date') && !dataType.includes('time') && !dataType.includes('timestamp')) {
        return d.toISOString().slice(0, 10);
      }
      return d.toISOString();
    }
    return `Sample_${col.name}_${index + 1}_${Math.floor(Math.random() * 1e6)}`;
  };

  const handleGenerateClick = async () => {
    if (insertableColumns.length === 0) {
      setErrorMessage('No insertable columns (all appear auto-generated / serial PKs).');
      return;
    }
    setIsGenerating(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const generated: Record<string, any>[] = [];
      for (let i = 0; i < rowCount; i++) {
        const row: Record<string, any> = {};
        insertableColumns.forEach((col) => {
          row[col.name] = generateFieldValue(col, i);
        });
        generated.push(row);
      }
      await onGenerate(generated);
      setSuccessMessage(`Inserted ${rowCount} synthetic rows into ${tableName}.`);
      setTimeout(() => {
        setSuccessMessage('');
        onClose();
      }, 1200);
    } catch (err) {
      setErrorMessage(String(err));
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-fadeIn select-none font-sans">
      <div className="bg-surface border border-border rounded-xl shadow-2xl w-[480px] overflow-hidden flex flex-col">
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between bg-surface/90">
          <div className="flex items-center space-x-2 text-accent font-semibold text-sm">
            <Wand2 className="w-4 h-4" />
            <span className="text-text">Synthetic Mock Seed Generator</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-textMuted hover:text-text hover:bg-surface2 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-center space-x-2 text-xs text-textMuted bg-surface2/40 p-3 rounded-lg border border-border/50">
            <Table className="w-4 h-4 text-accent shrink-0" />
            <span>
              Target Table: <strong className="text-text font-mono">{tableName}</strong> (
              {insertableColumns.length} insertable / {columns.length} total)
            </span>
          </div>

          {skippedColumns.length > 0 && (
            <p className="text-[11px] text-textMuted">
              Skipping auto-generated columns:{' '}
              <span className="font-mono text-text/70">{skippedColumns.map((c) => c.name).join(', ')}</span>
            </p>
          )}

          <div className="space-y-2">
            <label className="text-xs font-semibold text-text block">Number of Synthetic Rows:</label>
            <div className="flex items-center space-x-2">
              {[100, 500, 1000, 5000].map((count) => (
                <button
                  key={count}
                  onClick={() => setRowCount(count)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-medium border transition-colors ${
                    rowCount === count
                      ? 'bg-accent/20 border-accent text-accent font-bold'
                      : 'border-border text-textMuted hover:text-text hover:bg-surface2'
                  }`}
                >
                  {count.toLocaleString()}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5 max-h-[140px] overflow-auto border border-border/40 rounded-lg p-2 bg-base">
            <span className="text-[10px] text-textMuted uppercase font-semibold block mb-1">
              Inserted Columns:
            </span>
            {insertableColumns.map((col) => (
              <div
                key={col.name}
                className="flex items-center justify-between text-[11px] font-mono py-0.5 border-b border-border/20 last:border-0"
              >
                <span className="text-text font-medium">{col.name}</span>
                <span className="text-accent text-[10px]">{col.data_type}</span>
              </div>
            ))}
          </div>

          {successMessage && (
            <div className="flex items-center space-x-2 text-xs text-emerald-400 bg-emerald-500/15 p-2.5 rounded-lg border border-emerald-500/30">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}
          {errorMessage && (
            <div className="flex items-start space-x-2 text-xs text-red-300 bg-red-500/15 p-2.5 rounded-lg border border-red-500/30">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="break-all">{errorMessage}</span>
            </div>
          )}
        </div>

        <div className="px-5 py-3 bg-surface2/30 border-t border-border flex items-center justify-end space-x-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs text-textMuted hover:text-text hover:bg-surface2 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerateClick}
            disabled={isGenerating || insertableColumns.length === 0}
            className="px-4 py-1.5 rounded-lg bg-accent hover:bg-accentHover text-white text-xs font-semibold flex items-center space-x-1.5 transition-colors shadow disabled:opacity-40"
          >
            {isGenerating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            <span>{isGenerating ? 'Inserting…' : `Generate & Insert ${rowCount} Rows`}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
