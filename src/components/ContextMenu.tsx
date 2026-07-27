import React, { useEffect, useRef } from 'react';
import { Copy, FileJson, FileSpreadsheet, FileCode, Filter, Eye, XCircle, Trash2 } from 'lucide-react';

export interface ContextMenuAction {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  actions: ContextMenuAction[];
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, actions, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as HTMLElement)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Keep menu within viewport
  const adjustedStyle: React.CSSProperties = {
    position: 'fixed',
    top: y,
    left: x,
    zIndex: 99999,
  };

  return (
    <div ref={menuRef} style={adjustedStyle} className="bg-surface border border-border rounded-lg shadow-2xl py-1 min-w-[200px] animate-in fade-in zoom-in-95 duration-100">
      {actions.map((action, i) => (
        <React.Fragment key={i}>
          {action.separator && <div className="h-px bg-border my-1" />}
          <button
            onClick={() => { action.onClick(); onClose(); }}
            disabled={action.disabled}
            className={`w-full flex items-center space-x-2.5 px-3 py-1.5 text-xs transition-colors text-left ${
              action.disabled
                ? 'text-textMuted/40 cursor-not-allowed'
                : action.danger
                ? 'text-error hover:bg-error/10'
                : 'text-text hover:bg-surface2'
            }`}
          >
            <span className="w-4 h-4 flex items-center justify-center shrink-0">{action.icon}</span>
            <span>{action.label}</span>
          </button>
        </React.Fragment>
      ))}
    </div>
  );
};

// Helper to build the standard cell context menu actions
export function buildCellContextMenu(params: {
  cellValue: any;
  rowData: Record<string, any>;
  columnName: string;
  tableName: string;
  columns: { name: string; data_type: string; is_nullable: boolean }[];
  dbType: string;
  onCopyCellValue: () => void;
  onCopyRowJson: () => void;
  onCopyRowCsv: () => void;
  onCopyRowInsert: () => void;
  onFilterByValue: () => void;
  onOpenJsonViewer: () => void;
  onSetNull: () => void;
  onDeleteRow: () => void;
}): ContextMenuAction[] {
  const isJson = (() => {
    if (typeof params.cellValue === 'object' && params.cellValue !== null) return true;
    if (typeof params.cellValue === 'string') {
      try { JSON.parse(params.cellValue); return true; } catch { return false; }
    }
    return false;
  })();

  const colMeta = params.columns.find(c => c.name === params.columnName);
  const isNullable = colMeta?.is_nullable ?? true;

  return [
    { label: 'Copy cell value', icon: <Copy className="w-3.5 h-3.5" />, onClick: params.onCopyCellValue },
    { label: 'Copy row as JSON', icon: <FileJson className="w-3.5 h-3.5" />, onClick: params.onCopyRowJson },
    { label: 'Copy row as CSV', icon: <FileSpreadsheet className="w-3.5 h-3.5" />, onClick: params.onCopyRowCsv },
    { label: 'Copy row as INSERT', icon: <FileCode className="w-3.5 h-3.5" />, onClick: params.onCopyRowInsert },
    { label: 'Filter by this value', icon: <Filter className="w-3.5 h-3.5" />, onClick: params.onFilterByValue, separator: true },
    { label: 'Open in JSON viewer', icon: <Eye className="w-3.5 h-3.5" />, onClick: params.onOpenJsonViewer, disabled: !isJson },
    { label: 'Set NULL', icon: <XCircle className="w-3.5 h-3.5" />, onClick: params.onSetNull, disabled: !isNullable, separator: true },
    { label: 'Delete row', icon: <Trash2 className="w-3.5 h-3.5" />, onClick: params.onDeleteRow, danger: true },
  ];
}
