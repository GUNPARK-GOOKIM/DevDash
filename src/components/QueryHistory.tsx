import React from 'react';
import { Clock, Terminal, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';

export interface QueryHistoryItem {
  id: string;
  sql: string;
  timestamp: string;
  executionTimeMs: number;
  status: 'success' | 'error';
  errorMessage?: string;
}

interface QueryHistoryProps {
  history: QueryHistoryItem[];
  onSelectQuery: (sql: string) => void;
  onClearHistory: () => void;
}

export const QueryHistory: React.FC<QueryHistoryProps> = ({
  history,
  onSelectQuery,
  onClearHistory,
}) => {
  return (
    <div className="flex flex-col h-full bg-surface border-l border-border w-72 text-xs font-sans select-none shrink-0">
      {/* Header */}
      <div className="h-10 border-b border-border px-3 flex items-center justify-between bg-surface/90 shrink-0">
        <div className="flex items-center space-x-2 text-accent font-medium">
          <Clock className="w-4 h-4" />
          <span className="text-text font-semibold text-[13px]">Query History ({history.length})</span>
        </div>
        {history.length > 0 && (
          <button
            onClick={onClearHistory}
            className="p-1 rounded text-textMuted hover:text-error hover:bg-surface2 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            title="Clear History"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* History List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-textMuted text-center text-[11px] space-y-1">
            <Terminal className="w-6 h-6 opacity-30" />
            <span>No query history yet</span>
          </div>
        ) : (
          history.map((item) => (
            <div
              key={item.id}
              onClick={() => onSelectQuery(item.sql)}
              className="group bg-base/50 hover:bg-surface2/30 border border-border rounded-lg p-2.5 cursor-pointer transition-all space-y-1.5"
            >
              <div className="flex items-center justify-between text-[10px] text-textMuted">
                <div className="flex items-center space-x-1">
                  {item.status === 'success' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 text-error shrink-0" />
                  )}
                  <span>{new Date(item.timestamp).toLocaleTimeString()}</span>
                </div>
                <span className="font-mono text-accent">{item.executionTimeMs}ms</span>
              </div>
              <div className="font-mono text-[11px] text-text group-hover:text-accent truncate">
                {item.sql}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
