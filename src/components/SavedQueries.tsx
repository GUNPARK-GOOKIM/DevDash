import React, { useState } from 'react';
import { SavedQuery } from '../types';
import { Bookmark, Code2, FolderGit2, ChevronRight, ChevronLeft, Copy, Check } from 'lucide-react';

interface SavedQueriesProps {
  savedQueries: SavedQuery[];
  onSelectQuery: (query: SavedQuery) => void;
  currentProjectPath: string;
}

export const SavedQueries: React.FC<SavedQueriesProps> = ({
  savedQueries,
  onSelectQuery,
  currentProjectPath,
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const currentProjectQueries = savedQueries.filter((q) => q.project_path === currentProjectPath);
  const otherQueries = savedQueries.filter((q) => q.project_path !== currentProjectPath);

  const handleCopy = (e: React.MouseEvent, id: string, text: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="h-full bg-surface border-l border-border p-2 flex flex-col items-center justify-start text-textMuted hover:text-text transition-colors shrink-0"
        title="Open Saved Queries Panel"
      >
        <ChevronLeft className="w-4 h-4 mb-2" />
        <Bookmark className="w-4 h-4 text-accent" />
      </button>
    );
  }

  const renderQueryCard = (query: SavedQuery) => (
    <div
      key={query.id}
      onClick={() => onSelectQuery(query)}
      className="w-full text-left p-2.5 bento-card hover:bg-surface2/30 transition-all group relative cursor-pointer"
    >
      <div className="flex items-center justify-between mb-1.5 pr-6">
        <span className="font-bold text-[13px] text-text group-hover:text-accent transition-colors truncate">
          {query.name}
        </span>
        <Code2 className="w-3.5 h-3.5 text-textMuted group-hover:text-accent shrink-0 ml-1" />
      </div>
      <p className="font-mono text-[11px] text-text/65 line-clamp-2 bg-base/50 p-1.5 rounded border border-border/40 font-normal">
        {query.sql_content}
      </p>

      {/* Copy button appearing on hover */}
      <button
        onClick={(e) => handleCopy(e, query.id, query.sql_content)}
        className="absolute right-2 top-2.5 p-1 rounded bg-surface border border-border text-textMuted hover:text-text opacity-0 group-hover:opacity-100 transition-opacity"
        title="Copy SQL to Clipboard"
      >
        {copiedId === query.id ? (
          <Check className="w-3 h-3 text-success" />
        ) : (
          <Copy className="w-3 h-3" />
        )}
      </button>
    </div>
  );

  return (
    <aside className="w-64 glass-sidebar border-l border-border flex flex-col h-full z-10 select-none">
      {/* Header */}
      <div className="h-10 px-3 border-b border-border flex items-center justify-between bg-transparent shrink-0">
        <div className="flex items-center space-x-2 text-[13px] font-semibold text-text">
          <Bookmark className="w-4 h-4 text-accent" />
          <span>Saved Queries</span>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="p-1 rounded text-textMuted hover:text-text transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Project Path Scope Indicator */}
      <div className="px-3 py-2 bg-transparent border-b border-border flex items-center justify-between text-[11px] shrink-0">
        <div className="flex items-center space-x-1.5 text-textMuted truncate">
          <FolderGit2 className="w-3.5 h-3.5 text-accent shrink-0" />
          <span className="truncate">
            {showAll ? 'All Saved Queries' : 'Current Project'}
          </span>
        </div>
        <button
          onClick={() => setShowAll(!showAll)}
          className="text-[10px] text-accent hover:underline shrink-0 font-medium"
        >
          {showAll ? 'Filter Project' : 'Show All'}
        </button>
      </div>

      {/* Query Cards List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {/* Current Project Queries */}
        <div className="space-y-1.5">
          <div className="flex items-center space-x-2 px-1">
            <span className="text-[10px] uppercase font-bold text-textMuted tracking-wider">Current Project</span>
            <div className="flex-1 h-[1px] bg-border/40"></div>
          </div>
          {currentProjectQueries.length === 0 ? (
            <div className="text-center py-4 text-xs text-textMuted font-sans">
              No queries for this project
            </div>
          ) : (
            currentProjectQueries.map(renderQueryCard)
          )}
        </div>

        {/* Other Projects (when showAll is active) */}
        {showAll && (
          <div className="space-y-1.5">
            <div className="flex items-center space-x-2 px-1">
              <span className="text-[10px] uppercase font-bold text-textMuted tracking-wider">Other Projects</span>
              <div className="flex-1 h-[1px] bg-border/40"></div>
            </div>
            {otherQueries.length === 0 ? (
              <div className="text-center py-4 text-xs text-textMuted font-sans">
                No other saved queries
              </div>
            ) : (
              otherQueries.map(renderQueryCard)
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
