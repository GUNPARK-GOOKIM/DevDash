import React, { useState } from 'react';
import { Wand2, X, Play, RefreshCw, CheckCircle2, Table, Layers, Database } from 'lucide-react';
import { ColumnItem } from '../types';

interface MockDataGeneratorProps {
  isOpen: boolean;
  onClose: () => void;
  tableName: string;
  columns: ColumnItem[];
  onGenerate: (rows: Record<string, any>[]) => void;
}

export const MockDataGenerator: React.FC<MockDataGeneratorProps> = ({
  isOpen,
  onClose,
  tableName,
  columns,
  onGenerate,
}) => {
  const [rowCount, setRowCount] = useState<number>(100);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string>('');

  if (!isOpen) return null;

  const sampleFirstNames = ['Alice', 'Bob', 'Carol', 'David', 'Eva', 'Frank', 'Grace', 'Henry', 'Ivy', 'Jack'];
  const sampleLastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez'];
  const sampleDomains = ['example.com', 'test.org', 'devdash.io', 'company.net', 'cloud.dev'];

  const getRandomElement = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

  const generateFieldValue = (col: ColumnItem, index: number) => {
    const colName = col.name.toLowerCase();
    const dataType = col.data_type.toLowerCase();

    if (col.is_primary_key && (dataType.includes('int') || dataType.includes('serial'))) {
      return index + 1;
    }
    if (colName.includes('uuid') || dataType.includes('uuid')) {
      return `f47ac10b-58cc-4372-a567-0e02b2c3d47${index % 10}`;
    }
    if (colName.includes('email')) {
      const fn = getRandomElement(sampleFirstNames).toLowerCase();
      const ln = getRandomElement(sampleLastNames).toLowerCase();
      return `${fn}.${ln}${index}@${getRandomElement(sampleDomains)}`;
    }
    if (colName.includes('name')) {
      return `${getRandomElement(sampleFirstNames)} ${getRandomElement(sampleLastNames)}`;
    }
    if (colName.includes('price') || colName.includes('amount') || colName.includes('cost')) {
      return Number((Math.random() * 500 + 5).toFixed(2));
    }
    if (colName.includes('status')) {
      return getRandomElement(['active', 'pending', 'completed', 'archived']);
    }
    if (colName.includes('ip') || colName.includes('host')) {
      return `192.168.1.${(index % 250) + 1}`;
    }
    if (dataType.includes('int') || dataType.includes('number')) {
      return Math.floor(Math.random() * 1000) + 1;
    }
    if (dataType.includes('bool')) {
      return Math.random() > 0.5;
    }
    if (dataType.includes('date') || dataType.includes('time') || colName.includes('at')) {
      const d = new Date(Date.now() - Math.random() * 30 * 24 * 3600 * 1000);
      return d.toISOString();
    }
    return `Sample_${col.name}_${index + 1}`;
  };

  const handleGenerateClick = () => {
    setIsGenerating(true);
    setTimeout(() => {
      const generated: Record<string, any>[] = [];
      for (let i = 0; i < rowCount; i++) {
        const row: Record<string, any> = {};
        columns.forEach((col) => {
          row[col.name] = generateFieldValue(col, i);
        });
        generated.push(row);
      }
      onGenerate(generated);
      setIsGenerating(false);
      setSuccessMessage(`Successfully generated ${rowCount} synthetic rows for ${tableName}!`);
      setTimeout(() => {
        setSuccessMessage('');
        onClose();
      }, 1500);
    }, 400);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-fadeIn select-none font-sans">
      <div className="bg-surface border border-border rounded-xl shadow-2xl w-[480px] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between bg-surface/90">
          <div className="flex items-center space-x-2 text-accent font-semibold text-sm">
            <Wand2 className="w-4 h-4" />
            <span className="text-text">Synthetic Mock Seed Generator</span>
          </div>
          <button onClick={onClose} className="p-1 rounded text-textMuted hover:text-text hover:bg-surface2 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          <div className="flex items-center space-x-2 text-xs text-textMuted bg-surface2/40 p-3 rounded-lg border border-border/50">
            <Table className="w-4 h-4 text-accent shrink-0" />
            <span>Target Table: <strong className="text-text font-mono">{tableName}</strong> ({columns.length} columns)</span>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-text block">Number of Synthetic Rows:</label>
            <div className="flex items-center space-x-2">
              {[100, 500, 1000, 5000].map((count) => (
                <button
                  key={count}
                  onClick={() => setRowCount(count)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-medium border transition-colors ${
                    rowCount === count ? 'bg-accent/20 border-accent text-accent font-bold' : 'border-border text-textMuted hover:text-text hover:bg-surface2'
                  }`}
                >
                  {count.toLocaleString()}
                </button>
              ))}
            </div>
          </div>

          {/* Column type preview list */}
          <div className="space-y-1.5 max-h-[140px] overflow-auto border border-border/40 rounded-lg p-2 bg-base">
            <span className="text-[10px] text-textMuted uppercase font-semibold block mb-1">Inferred Data Generators:</span>
            {columns.map((col) => (
              <div key={col.name} className="flex items-center justify-between text-[11px] font-mono py-0.5 border-b border-border/20 last:border-0">
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
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-surface2/30 border-t border-border flex items-center justify-end space-x-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs text-textMuted hover:text-text hover:bg-surface2 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleGenerateClick}
            disabled={isGenerating}
            className="px-4 py-1.5 rounded-lg bg-accent hover:bg-accentHover text-white text-xs font-semibold flex items-center space-x-1.5 transition-colors shadow"
          >
            {isGenerating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            <span>{isGenerating ? 'Generating...' : `Generate ${rowCount} Rows`}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
