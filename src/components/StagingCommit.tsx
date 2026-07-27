import React, { useState, useMemo } from 'react';
import { StagedChange } from '../types';
import { CheckSquare, Square, Pencil, Plus, Trash2 } from 'lucide-react';

interface StagingCommitProps {
  stagedChanges: StagedChange[];
  onToggleChange: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
  onCommit: (message: string) => void;
  onDiscard: (id: string) => void;
}

export const StagingCommit: React.FC<StagingCommitProps> = ({
  stagedChanges,
  onToggleChange,
  onToggleAll,
  onCommit,
  onDiscard,
}) => {
  const autoMessage = useMemo(() => {
    const grouped: Record<string, { updates: number; inserts: number; deletes: number }> = {};
    stagedChanges.filter(c => c.checked).forEach(c => {
      if (!grouped[c.tableName]) grouped[c.tableName] = { updates: 0, inserts: 0, deletes: 0 };
      if (c.changeType === 'update') grouped[c.tableName].updates++;
      if (c.changeType === 'insert') grouped[c.tableName].inserts++;
      if (c.changeType === 'delete') grouped[c.tableName].deletes++;
    });
    return Object.entries(grouped)
      .map(([table, counts]) => {
        const parts: string[] = [];
        if (counts.updates > 0) parts.push(`Updated ${counts.updates} row${counts.updates > 1 ? 's' : ''}`);
        if (counts.inserts > 0) parts.push(`Inserted ${counts.inserts} row${counts.inserts > 1 ? 's' : ''}`);
        if (counts.deletes > 0) parts.push(`Deleted ${counts.deletes} row${counts.deletes > 1 ? 's' : ''}`);
        return `${parts.join(', ')} in ${table}`;
      })
      .join(', ');
  }, [stagedChanges]);

  const [commitMessage, setCommitMessage] = useState('');
  const displayMessage = commitMessage || autoMessage;

  const allChecked = stagedChanges.length > 0 && stagedChanges.every(c => c.checked);
  const checkedCount = stagedChanges.filter(c => c.checked).length;

  const changeTypeIcon = (type: StagedChange['changeType']) => {
    switch (type) {
      case 'update': return <Pencil className="w-3.5 h-3.5 text-warning" />;
      case 'insert': return <Plus className="w-3.5 h-3.5 text-success" />;
      case 'delete': return <Trash2 className="w-3.5 h-3.5 text-error" />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-base">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text">Staged Changes</h2>
        <span className="text-xs bg-warning/20 text-warning px-2 py-0.5 rounded-full font-medium">
          Staged Changes... {checkedCount}
        </span>
      </div>

      {/* Changes Table */}
      <div className="flex-1 overflow-auto">
        {stagedChanges.length === 0 ? (
          <div className="flex items-center justify-center h-full text-textMuted text-sm">
            No staged changes. Edit cells in the Data Browser to stage changes.
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface z-10">
              <tr className="border-b border-border text-textMuted">
                <th className="w-10 px-3 py-2 text-left">
                  <button onClick={() => onToggleAll(!allChecked)} className="text-accent hover:text-accentHover">
                    {allChecked ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                  </button>
                </th>
                <th className="px-3 py-2 text-left font-medium">Table Name</th>
                <th className="px-3 py-2 text-left font-medium">Change Type</th>
                <th className="px-3 py-2 text-left font-medium">Identifier</th>
                <th className="px-3 py-2 text-left font-medium">Diff</th>
              </tr>
            </thead>
            <tbody>
              {stagedChanges.map((change) => (
                <tr
                  key={change.id}
                  className="border-b border-border/50 hover:bg-surface/50 transition-colors"
                >
                  <td className="px-3 py-2">
                    <button onClick={() => onToggleChange(change.id)} className="text-accent hover:text-accentHover">
                      {change.checked ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-accent font-medium">{change.tableName}</td>
                  <td className="px-3 py-2">
                    <span className="flex items-center space-x-1.5">
                      {changeTypeIcon(change.changeType)}
                      <span className="text-textMuted capitalize">{change.columnName || change.changeType}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2 text-text font-mono">{change.identifier}</td>
                  <td className="px-3 py-2">
                    <DiffDisplay diff={change.diff} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Commit Section */}
      {stagedChanges.length > 0 && (
        <div className="border-t border-border p-4 space-y-3">
          <div>
            <h3 className="text-xs font-medium text-textMuted mb-2">Commit Message</h3>
            <textarea
              value={displayMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="Enter commit message..."
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text placeholder-textMuted resize-none h-20 focus:border-accent/50 focus:outline-none transition-colors"
            />
          </div>
          <button
            onClick={() => onCommit(displayMessage)}
            disabled={checkedCount === 0}
            className="w-full py-2.5 rounded-lg font-medium text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-success hover:bg-success/90 text-white"
          >
            Commit (Cmd+Enter)
          </button>
        </div>
      )}
    </div>
  );
};

const DiffDisplay: React.FC<{ diff: string }> = ({ diff }) => {
  // Parse diff format: "price: $25 → $24.99, stock: 48 → 72"
  const parts = diff.split(', ');
  return (
    <span className="flex flex-wrap gap-1">
      {parts.map((part, i) => {
        const arrowIdx = part.indexOf('→');
        if (arrowIdx === -1) {
          // For inserts/deletes without arrow
          return <span key={i} className="text-textMuted">{part}</span>;
        }
        const before = part.slice(0, arrowIdx).trim();
        const after = part.slice(arrowIdx + 1).trim();
        const colonIdx = before.indexOf(':');
        const field = colonIdx >= 0 ? before.slice(0, colonIdx + 1) : '';
        const oldVal = colonIdx >= 0 ? before.slice(colonIdx + 1).trim() : before;
        return (
          <span key={i} className="inline-flex items-center space-x-1">
            {field && <span className="text-textMuted">{field}</span>}
            <span className="text-error">{oldVal}</span>
            <span className="text-textMuted">→</span>
            <span className="text-success">{after}</span>
            {i < parts.length - 1 && <span className="text-textMuted">,</span>}
          </span>
        );
      })}
    </span>
  );
};
