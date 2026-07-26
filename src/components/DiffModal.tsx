import React from 'react';
import { StagedCellEdit } from '../types';
import { Layers, Check, X, ArrowRight } from 'lucide-react';

interface DiffModalProps {
  isOpen: boolean;
  onClose: () => void;
  stagedEdits: StagedCellEdit[];
  onConfirmApply: () => void;
}

export const DiffModal: React.FC<DiffModalProps> = ({
  isOpen,
  onClose,
  stagedEdits,
  onConfirmApply,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fadeIn select-none">
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-[600px] max-w-[90vw] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
          <div className="flex items-center space-x-2 text-indigo-400">
            <Layers className="w-5 h-5" />
            <h3 className="text-sm font-semibold text-slate-100">Review Staged Edits ({stagedEdits.length})</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Diff List */}
        <div className="p-5 max-h-[400px] overflow-y-auto space-y-3 font-mono text-xs">
          {stagedEdits.map((edit, idx) => (
            <div
              key={idx}
              className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-3 flex flex-col space-y-1.5"
            >
              <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800/50 pb-1">
                <span>Row PK: <strong className="text-indigo-300">{String(edit.rowId)}</strong></span>
                <span>Column: <strong className="text-slate-200">{edit.columnName}</strong></span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="bg-rose-950/30 border border-rose-900/40 rounded p-2 text-rose-300 flex flex-col space-y-1">
                  <span className="text-[9px] uppercase tracking-wider text-rose-400 font-sans">Old Value</span>
                  <span className="truncate">{edit.oldValue === null ? 'NULL' : String(edit.oldValue)}</span>
                </div>
                <div className="bg-emerald-950/30 border border-emerald-900/40 rounded p-2 text-emerald-300 flex flex-col space-y-1">
                  <span className="text-[9px] uppercase tracking-wider text-emerald-400 font-sans">New Value</span>
                  <span className="truncate">{edit.newValue === null ? 'NULL' : String(edit.newValue)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <span className="text-xs text-slate-400 font-sans">
            Atomic commit: rollback on any error
          </span>
          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                onConfirmApply();
                onClose();
              }}
              className="px-4 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs flex items-center space-x-1.5 shadow-lg shadow-indigo-600/30 transition-all"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Apply All Edits</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
