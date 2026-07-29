import React, { useState } from 'react';
import { Eye, X, Copy, Check, FileText, Image as ImageIcon, Binary, Upload, Download } from 'lucide-react';

interface CellInspectorPanelProps {
  isOpen: boolean;
  onClose: () => void;
  columnName: string;
  dataType: string;
  cellValue: any;
  onUpdateValue?: (newVal: any) => void;
}

export const CellInspectorPanel: React.FC<CellInspectorPanelProps> = ({
  isOpen,
  onClose,
  columnName,
  dataType,
  cellValue,
  onUpdateValue,
}) => {
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'text' | 'image' | 'hex'>('text');

  if (!isOpen) return null;

  const strVal = cellValue === null || cellValue === undefined ? '' : String(cellValue);
  const isImageCandidate =
    dataType.toLowerCase().includes('blob') ||
    dataType.toLowerCase().includes('bytea') ||
    dataType.toLowerCase().includes('binary') ||
    strVal.startsWith('data:image/') ||
    strVal.startsWith('http://') ||
    strVal.startsWith('https://') ||
    strVal.endsWith('.png') ||
    strVal.endsWith('.jpg') ||
    strVal.endsWith('.jpeg') ||
    strVal.endsWith('.svg') ||
    strVal.endsWith('.webp');

  const displayString =
    cellValue === null
      ? 'NULL'
      : typeof cellValue === 'object'
      ? JSON.stringify(cellValue, null, 2)
      : String(cellValue);

  const handleCopy = () => {
    navigator.clipboard.writeText(displayString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Format hex string representation
  const formatHexView = () => {
    let bytes: number[] = [];
    for (let i = 0; i < strVal.length; i++) {
      bytes.push(strVal.charCodeAt(i));
    }
    const hexLines: string[] = [];
    for (let i = 0; i < bytes.length; i += 16) {
      const chunk = bytes.slice(i, i + 16);
      const hexStr = chunk.map((b) => b.toString(16).padStart(2, '0')).join(' ');
      const asciiStr = chunk.map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.')).join('');
      const offset = i.toString(16).padStart(8, '0');
      hexLines.push(`${offset}  ${hexStr.padEnd(48, ' ')}  |${asciiStr}|`);
    }
    return hexLines.join('\n');
  };

  return (
    <div className="w-80 h-full bg-surface border-l border-border flex flex-col font-sans select-none text-xs">
      {/* Header */}
      <div className="h-10 border-b border-border px-3 flex items-center justify-between bg-surface/90 shrink-0">
        <div className="flex items-center space-x-2 text-accent font-medium">
          <Eye className="w-4 h-4" />
          <span className="text-text font-semibold text-[13px]">Cell Inspector</span>
        </div>
        <div className="flex items-center space-x-1">
          <button
            onClick={handleCopy}
            className="p-1 rounded text-textMuted hover:text-text hover:bg-surface2 transition-colors"
            title="Copy cell value"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded text-textMuted hover:text-text hover:bg-surface2 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Metadata Bar */}
      <div className="bg-base px-3 py-2 border-b border-border flex items-center justify-between text-[11px] shrink-0">
        <div className="flex items-center space-x-1.5 text-textMuted">
          <FileText className="w-3.5 h-3.5 text-accent" />
          <span className="font-mono text-text font-semibold">{columnName}</span>
        </div>
        <span className="font-mono text-[10px] bg-surface2 px-1.5 py-0.5 rounded text-accent border border-border">
          {dataType}
        </span>
      </div>

      {/* View Mode Switcher */}
      <div className="flex border-b border-border bg-surface2/30 px-2 py-1 space-x-1 shrink-0">
        <button
          onClick={() => setViewMode('text')}
          className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
            viewMode === 'text' ? 'bg-accent/20 text-accent font-bold' : 'text-textMuted hover:text-text'
          }`}
        >
          Text/JSON
        </button>
        <button
          onClick={() => setViewMode('hex')}
          className={`px-2 py-0.5 rounded text-[10px] font-medium flex items-center space-x-1 transition-colors ${
            viewMode === 'hex' ? 'bg-accent/20 text-accent font-bold' : 'text-textMuted hover:text-text'
          }`}
        >
          <Binary className="w-3 h-3" />
          <span>Hex</span>
        </button>
        {isImageCandidate && (
          <button
            onClick={() => setViewMode('image')}
            className={`px-2 py-0.5 rounded text-[10px] font-medium flex items-center space-x-1 transition-colors ${
              viewMode === 'image' ? 'bg-accent/20 text-accent font-bold' : 'text-textMuted hover:text-text'
            }`}
          >
            <ImageIcon className="w-3 h-3" />
            <span>Image</span>
          </button>
        )}
      </div>

      {/* Inspection Box */}
      <div className="flex-1 p-3 overflow-auto bg-base font-mono text-[12px] text-text leading-relaxed whitespace-pre-wrap select-text">
        {viewMode === 'text' && displayString}

        {viewMode === 'hex' && (
          <div className="text-[10px] text-purple-300 font-mono leading-tight whitespace-pre">
            {formatHexView() || '00000000 | (empty)'}
          </div>
        )}

        {viewMode === 'image' && (
          <div className="flex flex-col items-center justify-center h-full p-2 space-y-2">
            <img
              src={strVal}
              alt="BLOB Preview"
              className="max-w-full max-h-[220px] rounded-lg border border-border shadow-lg object-contain bg-slate-950"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <span className="text-[10px] text-textMuted font-sans">Image BLOB Preview</span>
          </div>
        )}
      </div>

      {/* Footer Details */}
      <div className="h-7 bg-surface border-t border-border px-3 flex items-center justify-between text-[10px] font-sans text-textMuted shrink-0">
        <span>Length: {displayString.length} chars</span>
        <span>{cellValue === null ? 'Type: Null' : `Type: ${typeof cellValue}`}</span>
      </div>
    </div>
  );
};
