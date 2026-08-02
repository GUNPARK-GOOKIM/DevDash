import React, { useState, useRef, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ColumnItem, PkInfo, StagedCellEdit } from '../types';
import { ShieldAlert, Check, RotateCcw, ChevronLeft, ChevronRight, Layers, Eye, Plus, Trash2 } from 'lucide-react';
import { CellInspectorPanel } from './CellInspectorPanel';
import { FkRelationLookup } from './FkRelationLookup';
import { applyPiiMask, PiiMaskRuleLike } from '../utils/piiMask';

export type PiiMaskRuleApplied = PiiMaskRuleLike;

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
  onJumpToRow?: (table: string, filterCol: string, val: any) => void;
  piiRules?: PiiMaskRuleApplied[];
  /** Total row count for server-side pagination (optional) */
  totalRows?: number;
  pageSize?: number;
  /** Stage a new blank insert row */
  onAddRow?: () => void;
  /** Stage delete for the selected row */
  onDeleteSelectedRow?: (rowId: string | number) => void;
  readOnly?: boolean;
}

const ROW_HEIGHT = 32;
const DEFAULT_COL_WIDTH = 140;
const ROW_NUM_WIDTH = 48;

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
  onJumpToRow,
  piiRules,
  totalRows,
  pageSize = 100,
  onAddRow,
  onDeleteSelectedRow,
  readOnly,
}) => {
  const [editingCell, setEditingCell] = useState<{ rowIdx: number; colName: string } | null>(null);
  const [selectedCell, setSelectedCell] = useState<{
    rowIdx: number;
    colName: string;
    val: any;
    type: string;
  } | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [showInspector, setShowInspector] = useState(false);
  const [selectedRange, setSelectedRange] = useState<{
    startRow: number;
    endRow: number;
    startCol: number;
    endCol: number;
  } | null>(null);

  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem(`devdash_col_widths_${tableName}`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        /* ignore */
      }
    }
    return {};
  });

  const parentRef = useRef<HTMLDivElement>(null);
  const filteredColumns = columns;

  const colWidth = useCallback(
    (name: string) => colWidths[name] ?? DEFAULT_COL_WIDTH,
    [colWidths]
  );

  const totalWidth =
    ROW_NUM_WIDTH + filteredColumns.reduce((sum, c) => sum + colWidth(c.name), 0);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 25,
  });

  const getRowIdentifier = useCallback(
    (row: any) => {
      if (pkInfo.pk_columns && pkInfo.pk_columns.length > 1) {
        const obj: Record<string, any> = {};
        pkInfo.pk_columns.forEach((col: string) => {
          obj[col] = row[col];
        });
        return JSON.stringify(obj);
      }
      const pkCol = pkInfo.pk_column_name || 'id';
      return row[pkCol];
    },
    [pkInfo]
  );

  const getCellValue = useCallback(
    (row: any, colName: string, rowId: any) => {
      const edit = stagedEdits.find((e) => e.rowId === rowId && e.columnName === colName);
      if (edit) return edit.newValue;
      return row[colName];
    },
    [stagedEdits]
  );

  // Keyboard navigation + scroll into view
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedCell || editingCell) return;
      const colIdx = filteredColumns.findIndex((c) => c.name === selectedCell.colName);
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
      } else if (e.key === 'F2' || e.key === 'Enter') {
        e.preventDefault();
        const col = filteredColumns[colIdx];
        if (col && !pkInfo.is_read_only) {
          const row = rows[selectedCell.rowIdx];
          const rowId = getRowIdentifier(row);
          const val = getCellValue(row, col.name, rowId);
          setEditingCell({ rowIdx: selectedCell.rowIdx, colName: col.name });
          setEditValue(val === null || val === undefined ? '' : typeof val === 'object' ? JSON.stringify(val) : String(val));
        }
        return;
      } else {
        return;
      }

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
        rowVirtualizer.scrollToIndex(nextRowIdx, { align: 'auto' });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    selectedCell,
    editingCell,
    filteredColumns,
    rows,
    pkInfo.is_read_only,
    getCellValue,
    getRowIdentifier,
    rowVirtualizer,
  ]);

  // TSV copy for selection range or single cell
  React.useEffect(() => {
    const handleCopy = (e: ClipboardEvent) => {
      if (editingCell || !selectedCell) return;
      if (selectedRange) {
        const rMin = Math.min(selectedRange.startRow, selectedRange.endRow);
        const rMax = Math.max(selectedRange.startRow, selectedRange.endRow);
        const cMin = Math.min(selectedRange.startCol, selectedRange.endCol);
        const cMax = Math.max(selectedRange.startCol, selectedRange.endCol);
        const tsvRows: string[] = [];
        for (let r = rMin; r <= rMax; r++) {
          const rowVals: string[] = [];
          for (let c = cMin; c <= cMax; c++) {
            const colName = filteredColumns[c]?.name;
            if (colName) {
              const val = getCellValue(rows[r], colName, getRowIdentifier(rows[r]));
              rowVals.push(val === null || val === undefined ? '' : String(val));
            }
          }
          tsvRows.push(rowVals.join('\t'));
        }
        e.clipboardData?.setData('text/plain', tsvRows.join('\n'));
        e.preventDefault();
      } else {
        e.clipboardData?.setData('text/plain', String(selectedCell.val ?? ''));
        e.preventDefault();
      }
    };
    window.addEventListener('copy', handleCopy);
    return () => window.removeEventListener('copy', handleCopy);
  }, [selectedCell, selectedRange, editingCell, filteredColumns, rows, getCellValue, getRowIdentifier]);

  const isCellDirty = (rowId: any, colName: string) =>
    stagedEdits.some((e) => e.rowId === rowId && e.columnName === colName);

  const handleCellClick = (rowIdx: number, colIdx: number, col: ColumnItem, val: any, shiftKey: boolean) => {
    if (shiftKey && selectedCell) {
      const startCol = filteredColumns.findIndex((c) => c.name === selectedCell.colName);
      setSelectedRange({
        startRow: selectedCell.rowIdx,
        endRow: rowIdx,
        startCol: Math.max(0, startCol),
        endCol: colIdx,
      });
    } else {
      setSelectedRange(null);
    }
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
    setEditValue(val === null || val === undefined ? '' : typeof val === 'object' ? JSON.stringify(val) : String(val));
  };

  const handleCellSave = (row: any, colName: string) => {
    if (!editingCell) return;
    const rowId = getRowIdentifier(row);
    const oldValue = row[colName];
    const oldStr = oldValue === null || oldValue === undefined ? '' : String(oldValue);
    if (editValue !== oldStr) {
      onStageEdit({
        rowId,
        columnName: colName,
        oldValue,
        newValue: editValue,
      });
    }
    setEditingCell(null);
  };

  const formatDisplayValue = (val: any, colName?: string) => {
    const display = colName ? applyPiiMask(colName, val, piiRules) : val;
    if (display === null || display === undefined) {
      return <span className="text-textMuted italic font-sans text-xs">NULL</span>;
    }
    if (typeof display === 'object') {
      return JSON.stringify(display);
    }
    return String(display);
  };

  const inRange = (rowIdx: number, colIdx: number) => {
    if (!selectedRange) return false;
    const rMin = Math.min(selectedRange.startRow, selectedRange.endRow);
    const rMax = Math.max(selectedRange.startRow, selectedRange.endRow);
    const cMin = Math.min(selectedRange.startCol, selectedRange.endCol);
    const cMax = Math.max(selectedRange.startCol, selectedRange.endCol);
    return rowIdx >= rMin && rowIdx <= rMax && colIdx >= cMin && colIdx <= cMax;
  };

  if (isLoading) {
    const widths = [65, 80, 45, 90, 55, 70, 85, 40, 75, 60];
    return (
      <div className="flex-1 overflow-auto bg-base">
        <table className="w-full border-collapse text-left">
          <thead className="bg-surface border-b border-border sticky top-0 z-10">
            <tr>
              <th className="w-10 px-2 py-2 text-center text-textMuted border-r border-border font-sans text-[11px] uppercase tracking-[0.06em] opacity-60">
                #
              </th>
              {filteredColumns.map((col) => (
                <th
                  key={col.name}
                  className="px-2.5 py-2 text-text/60 border-r border-border font-sans text-[11px] uppercase tracking-[0.06em]"
                >
                  {col.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 12 }).map((_, rIdx) => (
              <tr key={rIdx} className="border-b border-border/40">
                <td className="w-10 px-2 py-2 text-center text-textMuted border-r border-border/40 font-mono text-[11px]">
                  {rIdx + 1}
                </td>
                {filteredColumns.map((col, cIdx) => (
                  <td key={col.name} className="px-2.5 py-2.5 border-r border-border/40">
                    <div
                      className="h-3.5 skeleton-shimmer rounded"
                      style={{ width: `${widths[(rIdx + cIdx) % widths.length]}%` }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualItems.length > 0
      ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
      : 0;

  return (
    <div className="flex flex-col h-full bg-base font-sans text-xs select-text">
      {pkInfo.is_read_only ? (
        <div className="bg-[#2D1B1B] border-b border-error/25 px-3 py-1.5 flex items-center space-x-2 text-error text-[11px] font-sans shrink-0">
          <ShieldAlert className="w-3.5 h-3.5 text-error shrink-0" />
          <span>
            <strong>Read-Only:</strong> {pkInfo.read_only_reason || 'Table lacks a single primary key.'}
          </span>
        </div>
      ) : (
        <div className="bg-surface/80 border-b border-border px-3 py-1.5 flex items-center justify-between text-[11px] font-sans text-text shrink-0">
          <div className="flex items-center space-x-2">
            {stagedEdits.length > 0 ? (
              <div className="flex items-center space-x-2 text-accent">
                <Layers className="w-3.5 h-3.5 text-accent" />
                <span>
                  <strong>{stagedEdits.length} staged change(s)</strong> pending commit
                </span>
              </div>
            ) : (
              <span className="text-textMuted">Double-click cells to edit · Shift+click for range</span>
            )}
          </div>
          <div className="flex items-center space-x-1.5">
            {!readOnly && !pkInfo.is_read_only && onAddRow && (
              <button
                onClick={onAddRow}
                className="px-2 py-0.5 rounded border border-[rgba(255,255,255,0.12)] hover:bg-[rgba(255,255,255,0.06)] text-textMuted hover:text-text text-[11px] flex items-center space-x-1"
                title="Stage a new INSERT row"
              >
                <Plus className="w-3 h-3" />
                <span>Add Row</span>
              </button>
            )}
            {!readOnly && !pkInfo.is_read_only && onDeleteSelectedRow && selectedCell && (
              <button
                onClick={() => {
                  const row = rows[selectedCell.rowIdx];
                  if (row) onDeleteSelectedRow(getRowIdentifier(row) ?? selectedCell.rowIdx);
                }}
                className="px-2 py-0.5 rounded border border-rose-500/30 hover:bg-rose-500/10 text-rose-300 text-[11px] flex items-center space-x-1"
                title="Stage DELETE for selected row"
              >
                <Trash2 className="w-3 h-3" />
                <span>Delete Row</span>
              </button>
            )}
            {stagedEdits.length > 0 && (
              <>
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
              </>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden relative">
        {rows.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-base text-text min-h-[300px]">
            <svg className="w-16 h-16 text-textMuted/30 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.2}
                d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 2.21 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
              />
            </svg>
            <p className="text-[13px] font-sans text-textMuted/45 font-medium">No rows found</p>
          </div>
        ) : (
          <div ref={parentRef} className="flex-1 overflow-auto relative bg-base">
            {/* Single table keeps header/body column alignment; spacers implement virtualization */}
            <table
              className="border-collapse text-left font-mono text-[13px]"
              style={{ width: totalWidth, minWidth: '100%', tableLayout: 'fixed' }}
            >
              <colgroup>
                <col style={{ width: ROW_NUM_WIDTH }} />
                {filteredColumns.map((col) => (
                  <col key={col.name} style={{ width: colWidth(col.name) }} />
                ))}
              </colgroup>
              <thead className="sticky top-0 bg-surface border-b border-border z-20">
                <tr>
                  <th className="px-2 py-1.5 text-center text-textMuted border-r border-border font-sans text-[11px] uppercase tracking-[0.06em] opacity-60">
                    #
                  </th>
                  {filteredColumns.map((col) => (
                    <th
                      key={col.name}
                      className="px-2.5 py-1.5 text-text border-r border-border whitespace-nowrap bg-surface font-sans text-[11px] uppercase tracking-[0.06em] relative group"
                    >
                      <div className="flex items-center space-x-1.5 overflow-hidden">
                        <span className="text-text/60 font-semibold truncate">{col.name}</span>
                        {col.is_primary_key && (
                          <span className="pk-badge font-sans ml-1 text-[10px] shrink-0">PK</span>
                        )}
                        <span className="text-[11px] text-text/45 font-sans font-normal ml-1 truncate">
                          {col.data_type}
                        </span>
                      </div>
                      {/* Column resize handle */}
                      <div
                        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent/50"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const startX = e.clientX;
                          const startW = colWidth(col.name);
                          const onMove = (ev: MouseEvent) => {
                            const next = Math.max(60, startW + (ev.clientX - startX));
                            setColWidths((prev) => {
                              const updated = { ...prev, [col.name]: next };
                              localStorage.setItem(
                                `devdash_col_widths_${tableName}`,
                                JSON.stringify(updated)
                              );
                              return updated;
                            });
                          };
                          const onUp = () => {
                            window.removeEventListener('mousemove', onMove);
                            window.removeEventListener('mouseup', onUp);
                          };
                          window.addEventListener('mousemove', onMove);
                          window.addEventListener('mouseup', onUp);
                        }}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paddingTop > 0 && (
                  <tr aria-hidden>
                    <td
                      colSpan={filteredColumns.length + 1}
                      style={{ height: paddingTop, padding: 0, border: 0 }}
                    />
                  </tr>
                )}
                {virtualItems.map((virtualRow) => {
                  const rowIdx = virtualRow.index;
                  const row = rows[rowIdx];
                  const rowId = getRowIdentifier(row) ?? rowIdx;
                  const isRowSelected = selectedCell?.rowIdx === rowIdx;

                  return (
                    <tr
                      key={`${rowIdx}-${String(rowId)}`}
                      data-index={rowIdx}
                      className={`grid-row-transition border-b border-border/40 ${
                        isRowSelected ? 'grid-row-selected' : rowIdx % 2 === 1 ? 'bg-surface/20' : ''
                      }`}
                      style={{ height: ROW_HEIGHT }}
                    >
                      <td
                        className={`px-2 py-1.5 text-center text-textMuted border-r border-border/40 text-[11px] ${
                          isRowSelected ? 'border-l-2 border-l-accent' : ''
                        }`}
                      >
                        {rowIdx + 1 + (currentPage - 1) * pageSize}
                      </td>
                      {filteredColumns.map((col, colIdx) => {
                        const dirty = isCellDirty(rowId, col.name);
                        const displayVal = getCellValue(row, col.name, rowId);
                        const isEditing =
                          editingCell?.rowIdx === rowIdx && editingCell?.colName === col.name;
                        const isSelected =
                          selectedCell?.rowIdx === rowIdx && selectedCell?.colName === col.name;
                        const ranged = inRange(rowIdx, colIdx);

                        return (
                          <td
                            key={col.name}
                            onClick={(e) => handleCellClick(rowIdx, colIdx, col, displayVal, e.shiftKey)}
                            onDoubleClick={() => handleCellDoubleClick(rowIdx, col.name, displayVal)}
                            className={`px-2.5 py-1.5 border-r border-border/40 whitespace-nowrap truncate cursor-pointer font-mono text-[13px] font-normal ${
                              isSelected
                                ? 'bg-accent/15 text-text outline outline-1 outline-accent/70'
                                : ranged
                                ? 'bg-accent/10 text-text'
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
                                  e.stopPropagation();
                                }}
                                className="w-full bg-surface text-text border border-accent rounded px-1.5 py-0.5 outline-none font-mono text-[13px]"
                              />
                            ) : col.is_foreign_key && col.fk_references ? (
                              <FkRelationLookup
                                fkTable={col.fk_references.table}
                                fkColumn={col.fk_references.column}
                                value={displayVal}
                                onJumpToRow={(tbl, colName, val) => {
                                  if (onJumpToRow) onJumpToRow(tbl, colName, val);
                                }}
                              />
                            ) : (
                              formatDisplayValue(displayVal, col.name)
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {paddingBottom > 0 && (
                  <tr aria-hidden>
                    <td
                      colSpan={filteredColumns.length + 1}
                      style={{ height: paddingBottom, padding: 0, border: 0 }}
                    />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

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

      <div className="h-7 bg-surface border-t border-border px-3 flex items-center justify-between text-textMuted font-mono text-[10px] shrink-0 z-10">
        <div className="flex items-center space-x-3">
          <span>
            Page {currentPage}
            {totalRows != null
              ? ` · ${rows.length} of ${totalRows.toLocaleString()} rows`
              : ` · ${rows.length} rows`}
            {` · ${pageSize}/page`}
          </span>
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
            disabled={
              totalRows != null
                ? currentPage * pageSize >= totalRows
                : rows.length < pageSize
            }
            onClick={() => onPageChange(currentPage + 1)}
            className="p-0.5 rounded hover:bg-surface2 disabled:opacity-30 cursor-pointer"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
