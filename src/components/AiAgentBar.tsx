import React, { useState, useRef, useEffect } from 'react';
import { Search, X, Play, AlertTriangle, Sparkles } from 'lucide-react';
import { AiConfig } from './SettingsModal';

interface AiAgentBarProps {
  schema: { tables: { name: string; columns: string[] }[] };
  activeTable?: string;
  lastQueries: string[];
  dbType: string;
  onExecuteQuery: (sql: string) => void;
  aiConfig: AiConfig;
}

export const AiAgentBar: React.FC<AiAgentBarProps> = ({
  schema,
  activeTable,
  lastQueries,
  dbType,
  onExecuteQuery,
  aiConfig,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [previewSql, setPreviewSql] = useState<string | null>(null);
  const [isWrite, setIsWrite] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cmd+K to focus
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (!aiConfig.enabled) return;
        setExpanded(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape' && expanded) {
        setExpanded(false);
        setPreviewSql(null);
        setError(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [expanded, aiConfig.enabled]);

  if (!aiConfig.enabled) {
    return (
      <div className="flex items-center space-x-1.5 px-3 py-1 bg-surface2/30 border border-border rounded-lg text-textMuted text-xs opacity-60">
        <Sparkles className="w-3.5 h-3.5" />
        <span>AI Agent Disabled (Enable in Settings)</span>
      </div>
    );
  }

  const handleSubmit = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setPreviewSql(null);

    const schemaContext = schema.tables
      .map(t => `Table: ${t.name} (${t.columns.join(', ')})`)
      .join('\n');

    const promptText = `You are a SQL assistant for a ${dbType} database. Given this schema:\n${schemaContext}\n\nActive table: ${activeTable || 'none'}\nRecent queries: ${lastQueries.slice(0, 3).join('; ')}\n\nUser request: "${query}"\n\nGenerate ONLY valid SQL query. No markdown formatting, no explanations. If unsafe or unclear, respond with ERROR: reason.`;

    try {
      let content = '';

      if (aiConfig.provider === 'ollama') {
        // Direct Ollama API call (100% local, no key needed)
        const res = await fetch(`${aiConfig.baseUrl || 'http://localhost:11434'}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: aiConfig.model || 'qwen2.5-coder',
            prompt: promptText,
            stream: false,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          content = data.response?.trim() || '';
        }
      } else if (aiConfig.provider === 'openai' || aiConfig.provider === 'custom') {
        // Standard OpenAI-compatible API
        const res = await fetch(`${aiConfig.baseUrl || 'https://api.openai.com/v1'}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${aiConfig.apiKey}`,
          },
          body: JSON.stringify({
            model: aiConfig.model || 'gpt-4o-mini',
            messages: [{ role: 'user', content: promptText }],
          }),
        });
        if (res.ok) {
          const data = await res.json();
          content = data.choices?.[0]?.message?.content?.trim() || '';
        }
      } else if (aiConfig.provider === 'claude') {
        // Anthropic Claude API
        const res = await fetch(`${aiConfig.baseUrl || 'https://api.anthropic.com/v1'}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': aiConfig.apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model: aiConfig.model || 'claude-sonnet-4-6-20250514',
            max_tokens: 512,
            messages: [{ role: 'user', content: promptText }],
          }),
        });
        if (res.ok) {
          const data = await res.json();
          content = data.content?.[0]?.text?.trim() || '';
        }
      }

      if (!content) {
        // Local fallback parser
        content = localFallbackGenerate(query, schema, dbType, activeTable);
      }

      // Clean up markdown formatting if present
      content = content.replace(/```sql/gi, '').replace(/```/g, '').trim();

      if (content.startsWith('ERROR:')) {
        setError(content.slice(7));
      } else {
        setPreviewSql(content);
        setIsWrite(isWriteOperation(content));
      }
    } catch {
      // Fallback if network or local server unavailable
      const fallback = localFallbackGenerate(query, schema, dbType, activeTable);
      if (fallback.startsWith('ERROR:')) {
        setError(fallback.slice(7));
      } else {
        setPreviewSql(fallback);
        setIsWrite(isWriteOperation(fallback));
      }
    }
    setLoading(false);
  };

  const handleExecute = () => {
    if (previewSql) {
      onExecuteQuery(previewSql);
      setPreviewSql(null);
      setQuery('');
      setExpanded(false);
    }
  };

  return (
    <div className="relative">
      {/* Bar Container */}
      <div
        className={`flex items-center bg-surface2/60 border border-border rounded-lg transition-all cursor-text ${
          expanded ? 'w-[500px]' : 'w-[320px]'
        }`}
        onClick={() => {
          setExpanded(true);
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
      >
        <Search className="w-3.5 h-3.5 text-textMuted ml-2.5 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !previewSql) handleSubmit();
            if (e.key === 'Enter' && previewSql) handleExecute();
          }}
          placeholder={`AI Agent (${aiConfig.provider.toUpperCase()}): Talk to your DB...`}
          className="flex-1 bg-transparent text-xs text-text placeholder-textMuted py-1.5 px-2 outline-none"
        />
        <span className="text-[10px] text-textMuted bg-surface border border-border rounded px-1.5 py-0.5 mr-2 font-mono shrink-0">
          Cmd + K
        </span>
      </div>

      {/* Preview Panel */}
      {expanded && (previewSql || loading || error) && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-surface border border-border rounded-lg shadow-2xl overflow-hidden z-50 min-w-[400px]">
          {loading && (
            <div className="p-4 flex items-center justify-center space-x-2 text-textMuted text-xs">
              <Sparkles className="w-4 h-4 animate-pulse text-accent" />
              <span>Thinking with {aiConfig.provider.toUpperCase()} ({aiConfig.model})...</span>
            </div>
          )}

          {error && (
            <div className="p-4 space-y-2">
              <div className="flex items-center space-x-2 text-warning text-xs">
                <AlertTriangle className="w-4 h-4" />
                <span className="font-medium">Cannot generate safe SQL</span>
              </div>
              <p className="text-xs text-textMuted">{error}</p>
            </div>
          )}

          {previewSql && (
            <div className="p-4 space-y-3">
              <div className="flex items-center space-x-2 text-xs text-textMuted">
                <Sparkles className="w-3.5 h-3.5 text-accent" />
                <span>I'll run this query:</span>
              </div>
              <pre className="bg-base rounded-lg p-3 text-xs font-mono text-text overflow-auto max-h-40 border border-border/50">
                {previewSql}
              </pre>
              {isWrite && (
                <div className="flex items-center space-x-2 text-warning text-[11px] bg-warning/10 rounded px-2 py-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>This is a write operation. Data will be modified.</span>
                </div>
              )}
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleExecute}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-success hover:bg-success/90 text-white rounded-lg text-xs font-medium transition-colors"
                >
                  <Play className="w-3 h-3" />
                  <span>Execute</span>
                </button>
                <button
                  onClick={() => { setPreviewSql(null); setError(null); }}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-surface2 hover:bg-surface2/80 text-text rounded-lg text-xs transition-colors"
                >
                  <X className="w-3 h-3" />
                  <span>Cancel</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

function isWriteOperation(sql: string): boolean {
  const upper = sql.trim().toUpperCase();
  return upper.startsWith('INSERT') || upper.startsWith('UPDATE') || upper.startsWith('DELETE') ||
         upper.startsWith('DROP') || upper.startsWith('ALTER') || upper.startsWith('TRUNCATE') ||
         upper.startsWith('CREATE');
}

function localFallbackGenerate(
  query: string,
  schema: { tables: { name: string; columns: string[] }[] },
  dbType: string,
  activeTable?: string,
): string {
  const q = query.toLowerCase();
  let targetTable = activeTable || schema.tables[0]?.name || 'unknown';
  for (const t of schema.tables) {
    if (q.includes(t.name.toLowerCase())) {
      targetTable = t.name;
      break;
    }
  }

  const tableSchema = schema.tables.find(t => t.name === targetTable);
  if (!tableSchema) return `ERROR: Could not find table matching your request.`;

  if (q.includes('recent') || q.includes('latest') || q.includes('last')) {
    const limitMatch = q.match(/(\d+)/);
    const limit = limitMatch ? parseInt(limitMatch[1]) : 10;
    const timeCol = tableSchema.columns.find(c => c.includes('created') || c.includes('date') || c.includes('time')) || tableSchema.columns[0];
    return `SELECT * FROM ${targetTable} ORDER BY ${timeCol} DESC LIMIT ${limit};`;
  }

  if (q.includes('count')) {
    return `SELECT COUNT(*) FROM ${targetTable};`;
  }

  if (q.includes('below') || q.includes('less than') || q.includes('under')) {
    const numMatch = q.match(/(\d+)/);
    const num = numMatch ? numMatch[1] : '10';
    const numericCol = tableSchema.columns.find(c => c.includes('stock') || c.includes('quantity') || c.includes('price') || c.includes('amount'));
    if (numericCol) {
      return `SELECT * FROM ${targetTable} WHERE ${numericCol} < ${num};`;
    }
  }

  return `SELECT * FROM ${targetTable} LIMIT 50;`;
}
