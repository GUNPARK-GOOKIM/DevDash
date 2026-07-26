import React from 'react';
import { Eye, X, Copy, Check, FileText } from 'lucide-react';

interface CellInspectorPanelProps {
  isOpen: boolean;
  onClose: () => void;
  columnName: string;
  dataType: string;
  cellValue: any;
}

export const CellInspectorPanel: React.FC<CellInspectorPanelProps> = ({
  isOpen,
  onClose,
  columnName,
  dataType,
  cellValue,
}) => {
  const [copied, setCopied] = React.useState(false);

  if (!isOpen) return null;

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
            className="p-1 rounded text-textMuted hover:text-text hover:bg-surface2 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            title="Copy cell value"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded text-textMuted hover:text-text hover:bg-surface2 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
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

      {/* Raw Value Inspection Box */}
      <div className="flex-1 p-3 overflow-auto bg-base font-mono text-[13px] text-text leading-relaxed whitespace-pre-wrap select-text">
        {displayString}
      </div>

      {/* Footer Details */}
      <div className="h-7 bg-surface border-t border-border px-3 flex items-center justify-between text-[10px] font-sans text-textMuted shrink-0">
        <span>Length: {displayString.length} chars</span>
        <span>{cellValue === null ? 'Type: Null' : `Type: ${typeof cellValue}`}</span>
      </div>
    </div>
  );
};
