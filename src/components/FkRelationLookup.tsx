import React, { useState } from 'react';
import { ExternalLink, Database, Search, ChevronRight } from 'lucide-react';

interface FkRelationLookupProps {
  fkTable: string;
  fkColumn: string;
  value: any;
  onJumpToRow: (table: string, filterCol: string, val: any) => void;
}

export const FkRelationLookup: React.FC<FkRelationLookupProps> = ({
  fkTable,
  fkColumn,
  value,
  onJumpToRow,
}) => {
  const [showTooltip, setShowTooltip] = useState(false);

  if (value === null || value === undefined) return null;

  return (
    <div className="relative inline-flex items-center group">
      <span
        className="font-mono text-accent hover:underline cursor-pointer flex items-center space-x-1"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={(e) => {
          e.stopPropagation();
          onJumpToRow(fkTable, fkColumn, value);
        }}
        title={`Click to jump to ${fkTable}.${fkColumn} = ${value}`}
      >
        <span>{String(value)}</span>
        <ExternalLink className="w-2.5 h-2.5 opacity-60 group-hover:opacity-100 transition-opacity" />
      </span>

      {/* Hover Card */}
      {showTooltip && (
        <div className="absolute bottom-full left-0 mb-1 z-50 bg-surface border border-border rounded-lg shadow-xl p-2.5 min-w-[200px] font-sans text-xs animate-fadeIn pointer-events-none">
          <div className="flex items-center space-x-1.5 text-textMuted border-b border-border/50 pb-1.5 mb-1.5">
            <Database className="w-3 h-3 text-accent" />
            <span className="font-semibold text-text">{fkTable}</span>
            <ChevronRight className="w-3 h-3 text-textMuted" />
            <span className="font-mono text-accent">{fkColumn} = {String(value)}</span>
          </div>
          <div className="text-[10px] text-textMuted">
            <span className="block font-medium text-text">Referenced Relation:</span>
            <span className="block font-mono text-emerald-400 mt-0.5">WHERE {fkColumn} = '{String(value)}'</span>
            <span className="block text-[9px] text-textMuted/70 mt-1 italic">Click or Cmd+Click to jump</span>
          </div>
        </div>
      )}
    </div>
  );
};
