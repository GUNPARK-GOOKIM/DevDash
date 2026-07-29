import React, { useState, useRef } from 'react';
import { ColumnItem, PkInfo, StagedCellEdit } from '../types';
import { ShieldAlert, Check, RotateCcw, ChevronLeft, ChevronRight, Layers, Eye } from 'lucide-react';
import { CellInspectorPanel } from './CellInspectorPanel';

interface TableGridProps {
  tableName: string;
  columns: ColumnItem[];
  rows: any[];
  pkInfo: PkInfo;
  stagedEdits: StagedCellEdit[];
  onStageEdit: (edit: StagedCellEdit) => void;
  onApplyEdits: () => void;
  onResetEdits: () => void;
  currentPage: number;
  onPageChange: (newPage: number) => void;
  isLoading: boolean;
}

export const TableGrid: React.FC<TableGridProps> = ({
  tableName,
  columns,
  rows,
  pkInfo,
  stagedEdits,
  onStageEdit,
  onApplyEdits,
  onResetEdits,
  currentPage,
  onPageChange,
  isLoading,
}) => {
  const [editingCell, setEditingCell] = useState<{ rowIdx: number; colName: string } | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ rowIdx: number; colName: string; val: any; type: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [colSearch] = useState<string>('');
  const [showInspector, setShowInspector] = useState<boolean>(false);

  // GAP 13: Persistent Column Layouts
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem(`devdash_col_widths_${tableName}`);
    if (saved) { try { return JSON.parse(saved); } catch {} }
    return {};
  });

  const saveColWidth = (colName: string, width: number) => {
    const next = { ...colWidths, [colName]: width };
    setColWidths(next);
    localStorage.setItem(`devdash_col_widths_${tableName}`, JSON.stringify(next));
  };

  const parentRef = useRef<HTMLDivElement>(null);

  const filteredColumns = columns.filter((c) =>
    c.name.toLowerCase().includes(colSearch.toLowerCase())
  );

  // GAP 11: Keyboard Arrow Key Cell Focus & Navigation
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedCell || editingCell) return;
      const colIdx = filteredColumns.findIndex(c => c.name === selectedCell.colName);
      if (colIdx === -1) return;

      let nextRowIdx = selectedCell.rowIdx;
      let nextColIdx = colIdx;

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        nextRowIdx = Math.max(0, selectedCell.rowIdx - 1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        nextRowIdx = Math.min(rows.length - 1, selectedCell.rowIdx + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        nextColIdx = Math.max(0, colIdx - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        nextColIdx = Math.min(filteredColumns.length - 1, colIdx + 1);
      } else if (e.key === 'Enter' || e.key === 'F2') {
        e.preventDefault();
        const col = filteredColumns[colIdx];
        const val = getCellValue(rows[selectedCell.rowIdx], col.name, getRowIdentifier(rows[selectedCell.rowIdx]));
        handleCellDoubleClick(selectedCell.rowIdx, col.name, val);
        return;
      } else return;

      const nextCol = filteredColumns[nextColIdx];
      const nextRow = rows[nextRowIdx];
      if (nextRow && nextCol) {
        const val = getCellValue(nextRow, nextCol.name, getRowIdentifier(nextRow));
        setSelectedCell({
          rowIdx: nextRowIdx,
          colName: nextCol.name,
          val,
          type: nextCol.data_type,
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCell, editingCell, filteredColumns, rows]);

  const isCellDirty = (rowId: any, colName: string) => {
    return stagedEdits.some((e) => e.rowId === rowId && e.columnName === colName);
  };

  const getCellValue = (row: any, colName: string, rowId: any) => {
    const edit = stagedEdits.find((e) => e.rowId === rowId && e.columnName === colName);
    if (edit) return edit.newValue;
    return row[colName];
  };

  const handleCellClick = (rowIdx: number, col: ColumnItem, val: any) => {
    setSelectedCell({
      rowIdx,
      colName: col.name,
      val,
      type: col.data_type,
    });
  };

  const handleCellDoubleClick = (rowIdx: number, colName: string, val: any) => {
    if (pkInfo.is_read_only) return;
    setEditingCell({ rowIdx, colName });
    setEditValue(val === null ? '' : typeof val === 'object' ? JSON.stringify(val) : String(val));
  };

  const getRowIdentifier = (row: any) => {
    if (pkInfo.pk_columns && pkInfo.pk_columns.length > 1) {
      const obj: Record<string, any> = {};
      pkInfo.pk_columns.forEach((col: string) => {
        obj[col] = row[col];
      });
      return JSON.stringify(obj);
    }
    const pkCol = pkInfo.pk_column_name || 'id';
    return row[pkCol];
  };

  const handleCellSave = (row: any, colName: string) => {
    if (!editingCell) return;
    const rowId = getRowIdentifier(row);
    const oldValue = row[colName];

    if (editValue !== String(oldValue)) {
      onStageEdit({
        rowId,
        columnName: colName,
        oldValue,
        newValue: editValue,
      });
    }
    setEditingCell(null);
  };

  const formatDisplayValue = (val: any) => {
    if (val === null || val === undefined) {
      return <span className="text-textMuted italic font-sans text-xs">NULL</span>;
    }
    if (typeof val === 'object') {
      return JSON.stringify(val);
    }
    return String(val);
  };

  const renderEmptyState = () => (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-base text-text min-h-[300px]">
      <svg className="w-16 h-16 text-textMuted/30 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 2.21 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
      </svg>
      <p className="text-[13px] font-sans text-textMuted/45 font-medium">No rows found</p>
    </div>
  );

  const renderSkeleton = () => {
    const widths = [65, 80, 45, 90, 55, 70, 85, 40, 75, 60];
    return (
      <div className="flex-1 overflow-auto bg-base">
        <table className="w-full border-collapse text-left">
          <thead className="bg-surface border-b border-border sticky top-0 z-10">
            <tr>
              <th className="w-10 px-2 py-2 text-center text-textMuted border-r border-border font-sans text-[11px] uppercase tracking-[0.06em] opacity-60">#</th>
              {filteredColumns.map((col) => (
                <th key={col.name} className="px-2.5 py-2 text-text/60 border-r border-border font-sans text-[11px] uppercase tracking-[0.06em]">{col.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 12 }).map((_, rIdx) => (
              <tr key={rIdx} className="border-b border-border/40">
                <td className="w-10 px-2 py-2 text-center text-textMuted border-r border-border/40 font-mono text-[11px]">
                  {rIdx + 1}
                </td>
                {filteredColumns.map((col, cIdx) => {
                  const widthPercent = widths[(rIdx + cIdx) % widths.length];
                  return (
                    <td key={col.name} className="px-2.5 py-2.5 border-r border-border/40">
                      <div
                        className="h-3.5 skeleton-shimmer rounded"
                        style={{ width: `${widthPercent}%` }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  if (isLoading) {
    return renderSkeleton();
  }

  return (
    <div className="flex flex-col h-full bg-base font-sans text-xs select-text">
      {/* Read-Only or Staged Edits Header Bar */}
      {pkInfo.is_read_only ? (
        <div className="bg-[#2D1B1B] border-b border-error/25 px-3 py-1.5 flex items-center space-x-2 text-error text-[11px] font-sans shrink-0">
          <ShieldAlert className="w-3.5 h-3.5 text-error shrink-0" />
          <span>
            <strong>Read-Only:</strong> {pkInfo.read_only_reason || 'Table lacks a single primary key.'}
          </span>
        </div>
      ) : stagedEdits.length > 0 ? (
        <div className="bg-[#1E1F30] border-b border-accent/25 px-3 py-1.5 flex items-center justify-between text-[11px] font-sans text-text shrink-0">
          <div className="flex items-center space-x-2 text-accent">
            <Layers className="w-3.5 h-3.5 text-accent" />
            <span>
              <strong>{stagedEdits.length} staged change(s)</strong> pending commit
            </span>
          </div>
          <div className="flex items-center space-x-1.5">
            <button
              onClick={onResetEdits}
              className="px-2 py-0.5 rounded border border-[rgba(255,255,255,0.12)] bg-transparent hover:bg-[rgba(255,255,255,0.06)] text-textMuted hover:text-text transition-colors text-[11px] font-sans"
            >
              <RotateCcw className="w-3 h-3 inline mr-1" />
              <span>Reset</span>
            </button>
            <button
              onClick={onApplyEdits}
              className="px-2.5 py-0.5 rounded bg-accent hover:bg-accentHover text-white font-medium flex items-center space-x-1 transition-colors shadow text-[11px] font-sans"
            >
              <Check className="w-3 h-3" />
              <span>Apply</span>
            </button>
          </div>
        </div>
      ) : null}

      {/* Main Grid View */}
      <div className="flex-1 flex overflow-hidden relative">
        {rows.length === 0 ? (
          renderEmptyState()
        ) : (
          <div ref={parentRef} className="flex-1 overflow-auto relative bg-base">
            <table className="w-full border-collapse text-left font-mono text-[13px]">
              <thead className="sticky top-0 bg-surface border-b border-border z-10">
                <tr>
                  <th className="w-10 px-2 py-1.5 text-center text-textMuted border-r border-border font-sans text-[11px] uppercase tracking-[0.06em] opacity-60">
                    #
                  </th>
                  {filteredColumns.map((col) => (
                    <th
                      key={col.name}
                      className="px-2.5 py-1.5 text-text border-r border-border whitespace-nowrap bg-surface font-sans text-[11px] uppercase tracking-[0.06em]"
                    >
                      <div className="flex items-center space-x-1.5">
                        <span className="text-text/60 font-semibold">{col.name}</span>
                        {col.is_primary_key && (
                          <span className="pk-badge font-sans ml-1 text-[10px]">
                            PK
                          </span>
                        )}
                        <span className="text-[11px] text-text/45 font-sans font-normal ml-1">
                          {col.data_type}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIdx) => {
                  const rowId = getRowIdentifier(row) ?? rowIdx;
                  const isRowSelected = selectedCell?.rowIdx === rowIdx;

                  return (
                    <tr
                      key={rowId}
                      className={`grid-row-transition border-b border-border/40 ${
                        isRowSelected ? 'grid-row-selected' : 'even:bg-surface/20'
                      }`}
                    >
                      <td className={`w-10 px-2 py-1.5 text-center text-textMuted border-r border-border/40 text-[11px] ${
                        isRowSelected ? 'border-l-2 border-l-accent' : ''
                      }`}>
                        {rowIdx + 1 + (currentPage - 1) * 100}
                      </td>
                      {filteredColumns.map((col) => {
                        const dirty = isCellDirty(rowId, col.name);
                        const displayVal = getCellValue(row, col.name, rowId);
                        const isEditing =
                          editingCell?.rowIdx === rowIdx && editingCell?.colName === col.name;
                        const isSelected =
                          selectedCell?.rowIdx === rowIdx && selectedCell?.colName === col.name;

                        return (
                          <td
                            key={col.name}
                            onClick={() => handleCellClick(rowIdx, col, displayVal)}
                            onDoubleClick={() => handleCellDoubleClick(rowIdx, col.name, displayVal)}
                            className={`px-2.5 py-1.5 border-r border-border/40 whitespace-nowrap max-w-xs truncate cursor-pointer font-mono text-[13px] font-normal ${
                              isSelected
                                ? 'bg-accent/15 text-text outline outline-1 outline-accent/70'
                                : dirty
                                ? 'cell-dirty'
                                : 'text-text'
                            }`}
                          >
                            {isEditing ? (
                              <input
                                type="text"
                                autoFocus
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={() => handleCellSave(row, col.name)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleCellSave(row, col.name);
                                  if (e.key === 'Escape') setEditingCell(null);
                                }}
                                className="w-full bg-surface text-text border border-accent rounded px-1.5 py-0.5 outline-none font-mono text-[13px]"
                              />
                            ) : (
                              formatDisplayValue(displayVal)
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Cell Inspector Side Panel */}
        {showInspector && selectedCell && (
          <CellInspectorPanel
            isOpen={showInspector}
            onClose={() => setShowInspector(false)}
            columnName={selectedCell.colName}
            dataType={selectedCell.type}
            cellValue={selectedCell.val}
          />
        )}
      </div>

      {/* Pagination & Filter Footer */}
      <div className="h-7 bg-surface border-t border-border px-3 flex items-center justify-between text-textMuted font-mono text-[10px] shrink-0 z-10">
        <div className="flex items-center space-x-3">
          <span>Page {currentPage} ({rows.length} rows)</span>
          {selectedCell && (
            <button
              onClick={() => setShowInspector((prev) => !prev)}
              className="flex items-center space-x-1 text-accent hover:underline font-sans cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Inspect Cell ({selectedCell.colName})</span>
            </button>
          )}
        </div>

        <div className="flex items-center space-x-1">
          <button
            disabled={currentPage === 1}
            onClick={() => onPageChange(currentPage - 1)}
            className="p-0.5 rounded hover:bg-surface2 disabled:opacity-30 cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="px-1.5 py-0.5 bg-surface2 text-text rounded border border-border">
            {currentPage}
          </span>
          <button
            onClick={() => onPageChange(currentPage + 1)}
            className="p-0.5 rounded hover:bg-surface2 cursor-pointer"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
