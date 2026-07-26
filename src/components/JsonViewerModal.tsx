import React from 'react';
import { Code, X, Copy, Check } from 'lucide-react';

interface JsonViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  columnName: string;
  jsonData: any;
}

export const JsonViewerModal: React.FC<JsonViewerModalProps> = ({
  isOpen,
  onClose,
  columnName,
  jsonData,
}) => {
  const [copied, setCopied] = React.useState(false);

  if (!isOpen) return null;

  const formattedJson =
    typeof jsonData === 'string'
      ? (() => {
          try {
            return JSON.stringify(JSON.parse(jsonData), null, 2);
          } catch {
            return jsonData;
          }
        })()
      : JSON.stringify(jsonData, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(formattedJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fadeIn select-none font-sans">
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-[600px] max-w-[90vw] h-[450px] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center space-x-2 text-indigo-400">
            <Code className="w-5 h-5" />
            <h3 className="text-sm font-semibold text-slate-100">
              JSON Viewer: <strong className="font-mono text-indigo-300">{columnName}</strong>
            </h3>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleCopy}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center space-x-1 transition-colors border border-slate-700"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Formatted Code Box */}
        <div className="flex-1 p-4 bg-slate-950 overflow-auto font-mono text-xs text-indigo-200 leading-relaxed whitespace-pre">
          {formattedJson}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 bg-slate-950 border-t border-slate-800 flex items-center justify-end text-xs text-slate-400">
          <button
            onClick={onClose}
            className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
