import React, { useState } from 'react';
import { ShieldAlert, AlertTriangle, X } from 'lucide-react';

interface SafeModeModalProps {
  isOpen: boolean;
  onClose: () => void;
  sql: string;
  warningMessage: string;
  onConfirmExecute: () => void;
}

export const SafeModeModal: React.FC<SafeModeModalProps> = ({
  isOpen,
  onClose,
  sql,
  warningMessage,
  onConfirmExecute,
}) => {
  const [typedConfirm, setTypedConfirm] = useState('');

  if (!isOpen) return null;

  const isConfirmed = typedConfirm.trim().toUpperCase() === 'CONFIRM';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-fadeIn select-none">
      <div className="bg-slate-900 border border-rose-900/60 rounded-xl shadow-2xl w-[520px] max-w-[90vw] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 bg-rose-950/60 border-b border-rose-900/50 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-rose-300">
            <ShieldAlert className="w-5 h-5 text-rose-400" />
            <h3 className="text-sm font-semibold text-rose-100">Safe Mode Protection Alert</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 font-sans text-xs">
          <div className="bg-rose-950/40 border border-rose-900/50 rounded-lg p-3 text-rose-200 flex items-start space-x-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{warningMessage}</span>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-mono text-slate-400">Target Statement:</label>
            <div className="bg-slate-950 border border-slate-800 rounded p-2.5 font-mono text-indigo-300 text-[11px] max-h-24 overflow-y-auto whitespace-pre-wrap">
              {sql}
            </div>
          </div>

          <div className="space-y-1.5 pt-2">
            <label className="text-slate-300 font-medium block">
              Type <strong className="text-rose-400 font-mono">CONFIRM</strong> to execute:
            </label>
            <input
              type="text"
              autoFocus
              value={typedConfirm}
              onChange={(e) => setTypedConfirm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && isConfirmed) {
                  onConfirmExecute();
                  onClose();
                }
              }}
              placeholder="Type CONFIRM here..."
              className="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-slate-100 outline-none focus:border-rose-500 font-mono text-xs"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-end space-x-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
          >
            Cancel
          </button>
          <button
            disabled={!isConfirmed}
            onClick={() => {
              onConfirmExecute();
              onClose();
            }}
            className="px-4 py-1.5 rounded-md bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white font-medium text-xs shadow-lg transition-all"
          >
            Execute Destructive Query
          </button>
        </div>
      </div>
    </div>
  );
};
