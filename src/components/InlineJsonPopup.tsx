import React, { useState, useRef, useEffect } from 'react';
import { Copy, ChevronRight, ChevronDown, X } from 'lucide-react';

interface InlineJsonPopupProps {
  data: any;
  anchorRect: { top: number; left: number; width: number; height: number };
  onClose: () => void;
}

export const InlineJsonPopup: React.FC<InlineJsonPopupProps> = ({ data, anchorRect, onClose }) => {
  const popupRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  // Close on click outside or Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as HTMLElement)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Position below the cell
  const style: React.CSSProperties = {
    position: 'fixed',
    top: anchorRect.top + anchorRect.height + 4,
    left: Math.max(8, anchorRect.left - 40),
    zIndex: 9999,
    maxWidth: 420,
    maxHeight: 360,
  };

  return (
    <div ref={popupRef} style={style} className="bg-surface border border-border rounded-lg shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-surface2">
        <span className="text-[10px] text-textMuted font-medium">JSON Inspector</span>
        <div className="flex items-center space-x-1.5">
          <button
            onClick={handleCopy}
            className="text-[10px] text-accent hover:text-accentHover flex items-center space-x-1 transition-colors"
          >
            <Copy className="w-3 h-3" />
            <span>{copied ? 'Copied!' : 'Copy'}</span>
          </button>
          <button onClick={onClose} className="text-textMuted hover:text-text transition-colors">
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
      
      {/* Tree */}
      <div className="p-3 overflow-auto max-h-[300px] font-mono text-[11px] leading-relaxed">
        <JsonNode value={data} depth={0} />
      </div>
    </div>
  );
};

const JsonNode: React.FC<{ value: any; depth: number; keyName?: string }> = ({ value, depth, keyName }) => {
  const [expanded, setExpanded] = useState(depth < 2);
  const indent = depth * 16;

  if (value === null) {
    return (
      <div style={{ paddingLeft: indent }} className="flex items-center space-x-1">
        {keyName !== undefined && <span className="text-purple-400">"{keyName}"</span>}
        {keyName !== undefined && <span className="text-textMuted">: </span>}
        <span className="text-red-400 italic">null</span>
      </div>
    );
  }

  if (typeof value === 'boolean') {
    return (
      <div style={{ paddingLeft: indent }} className="flex items-center space-x-1">
        {keyName !== undefined && <span className="text-purple-400">"{keyName}"</span>}
        {keyName !== undefined && <span className="text-textMuted">: </span>}
        <span className="text-blue-400">{String(value)}</span>
      </div>
    );
  }

  if (typeof value === 'number') {
    return (
      <div style={{ paddingLeft: indent }} className="flex items-center space-x-1">
        {keyName !== undefined && <span className="text-purple-400">"{keyName}"</span>}
        {keyName !== undefined && <span className="text-textMuted">: </span>}
        <span className="text-amber-400">{value}</span>
      </div>
    );
  }

  if (typeof value === 'string') {
    return (
      <div style={{ paddingLeft: indent }} className="flex items-center space-x-1">
        {keyName !== undefined && <span className="text-purple-400">"{keyName}"</span>}
        {keyName !== undefined && <span className="text-textMuted">: </span>}
        <span className="text-green-400">"{value}"</span>
      </div>
    );
  }

  if (Array.isArray(value)) {
    return (
      <div>
        <div
          style={{ paddingLeft: indent }}
          className="flex items-center space-x-1 cursor-pointer hover:bg-surface2/50 rounded py-0.5"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronDown className="w-3 h-3 text-textMuted shrink-0" /> : <ChevronRight className="w-3 h-3 text-textMuted shrink-0" />}
          {keyName !== undefined && <span className="text-purple-400">"{keyName}"</span>}
          {keyName !== undefined && <span className="text-textMuted">: </span>}
          <span className="text-textMuted">[{!expanded && `${value.length} items`}]</span>
        </div>
        {expanded && (
          <>
            {value.map((item, i) => (
              <JsonNode key={i} value={item} depth={depth + 1} keyName={String(i)} />
            ))}
            <div style={{ paddingLeft: indent }} className="text-textMuted">]</div>
          </>
        )}
      </div>
    );
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value);
    return (
      <div>
        <div
          style={{ paddingLeft: indent }}
          className="flex items-center space-x-1 cursor-pointer hover:bg-surface2/50 rounded py-0.5"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronDown className="w-3 h-3 text-textMuted shrink-0" /> : <ChevronRight className="w-3 h-3 text-textMuted shrink-0" />}
          {keyName !== undefined && <span className="text-purple-400">"{keyName}"</span>}
          {keyName !== undefined && <span className="text-textMuted">: </span>}
          <span className="text-textMuted">{'{'}{!expanded && `${entries.length} keys`}{'}'}</span>
        </div>
        {expanded && (
          <>
            {entries.map(([k, v]) => (
              <JsonNode key={k} value={v} depth={depth + 1} keyName={k} />
            ))}
            <div style={{ paddingLeft: indent }} className="text-textMuted">{'}'}</div>
          </>
        )}
      </div>
    );
  }

  return (
    <div style={{ paddingLeft: indent }} className="text-text">
      {keyName !== undefined && <span className="text-purple-400">"{keyName}": </span>}
      {String(value)}
    </div>
  );
};
