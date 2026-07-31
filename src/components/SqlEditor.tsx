import React, { useState, useEffect, useRef } from 'react';
import { Play, Download, Clock, Database, Layers, Code2, Cpu, ChevronDown, Sparkles, Bookmark } from 'lucide-react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { sql as sqlLang, PostgreSQL, MySQL, SQLite, MSSQL, StandardSQL } from '@codemirror/lang-sql';
import { oneDark } from '@codemirror/theme-one-dark';
import { ExplainVisualizerModal } from './ExplainVisualizerModal';
import { Tooltip } from './Tooltip';

interface SqlEditorProps {
  initialSql?: string;
  onRunQuery: (sql: string) => void;
  queryResult: {
    columns: { name: string; type_name: string }[];
    rows: any[][];
    execution_time_ms: number;
    affected_rows: number;
  } | null;
  isLoading: boolean;
  onSaveQuery: (name: string, sql: string) => void;
}

export interface DialectOption {
  id: string;
  name: string;
  category: 'Relational' | 'NoSQL' | 'Cloud';
  dialectObj: any;
}

// Syntax highlighting only — connection engines are limited by the Rust backend.
export const DIALECTS: DialectOption[] = [
  { id: 'postgres', name: 'PostgreSQL', category: 'Relational', dialectObj: PostgreSQL },
  { id: 'mysql', name: 'MySQL', category: 'Relational', dialectObj: MySQL },
  { id: 'mariadb', name: 'MariaDB', category: 'Relational', dialectObj: MySQL },
  { id: 'sqlite', name: 'SQLite', category: 'Relational', dialectObj: SQLite },
  { id: 'cockroachdb', name: 'CockroachDB', category: 'Relational', dialectObj: PostgreSQL },
  { id: 'redshift', name: 'Amazon Redshift', category: 'Cloud', dialectObj: PostgreSQL },
  // Editor-only (no backend driver): kept for syntax convenience
  { id: 'mssql', name: 'SQL Server (highlight only)', category: 'Relational', dialectObj: MSSQL },
  { id: 'standard', name: 'Standard SQL (highlight only)', category: 'Relational', dialectObj: StandardSQL },
];

export interface SqlSnippet {
  name: string;
  description: string;
  sql: string;
}

export const SQL_SNIPPETS: SqlSnippet[] = [
  {
    name: 'SELECT with JOIN & Filter',
    description: 'Fetch records with relational join and criteria',
    sql: 'SELECT u.id, u.email, u.name, a.action\nFROM users u\nJOIN audit_logs a ON u.id = a.id\nWHERE u.role = \'Backend Lead\'\nLIMIT 50;',
  },
  {
    name: 'Batch INSERT Into Table',
    description: 'Insert multiple rows in a single atomic statement',
    sql: 'INSERT INTO users (email, name, role)\nVALUES\n  (\'test1@devdash.io\', \'Test One\', \'Developer\'),\n  (\'test2@devdash.io\', \'Test Two\', \'Designer\');',
  },
  {
    name: 'CREATE TABLE with Constraints',
    description: 'DDL template for creating a new table with primary key',
    sql: 'CREATE TABLE IF NOT EXISTS products (\n  id SERIAL PRIMARY KEY,\n  title VARCHAR(255) NOT NULL,\n  price DECIMAL(10, 2) DEFAULT 0.00,\n  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n);',
  },
  {
    name: 'CREATE Index',
    description: 'Speed up queries on specific columns',
    sql: 'CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);',
  },
  {
    name: 'UPSERT (On Conflict Update)',
    description: 'Insert or update existing row on unique key conflict',
    sql: 'INSERT INTO users (id, email, name)\nVALUES (1, \'akshat@devdash.io\', \'Akshat\')\nON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;',
  },
];

export const SqlEditor: React.FC<SqlEditorProps> = ({
  initialSql = 'SELECT * FROM users LIMIT 50;',
  onRunQuery,
  queryResult,
  isLoading,
  onSaveQuery,
}) => {
  const [sql, setSql] = useState(initialSql);
  const [dialect, setDialect] = useState<string>('postgres');
  const [showDialectMenu, setShowDialectMenu] = useState(false);
  const [showSnippetsMenu, setShowSnippetsMenu] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [isExplainOpen, setIsExplainOpen] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  
  // Resizable panel height state (starts at 35%)
  const [editorHeightPercent, setEditorHeightPercent] = useState(35);

  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const isDraggingRef = useRef(false);

  const selectedDialect = DIALECTS.find((d) => d.id === dialect) || DIALECTS[0];

  // Initialize CodeMirror 6
  useEffect(() => {
    if (!editorRef.current) return;

    const state = EditorState.create({
      doc: sql,
      extensions: [
        oneDark,
        sqlLang({ dialect: selectedDialect.dialectObj }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            setSql(update.state.doc.toString());
          }
        }),
        keymap.of([
          {
            key: 'Mod-Enter',
            run: () => {
              handleRunAction();
              return true;
            },
          },
          {
            key: 'Mod-i',
            run: () => {
              formatSql();
              return true;
            },
          },
        ]),
      ],
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
    };
  }, [dialect]);

  const handleRunAction = () => {
    setIsSpinning(true);
    setTimeout(() => {
      onRunQuery(viewRef.current?.state.doc.toString() || sql);
      setIsSpinning(false);
    }, 150); // 150ms spinner
  };

  const formatSql = () => {
    const currentSql = viewRef.current ? viewRef.current.state.doc.toString() : sql;
    const keywords = [
      'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 
      'JOIN', 'GROUP BY', 'ORDER BY', 'LIMIT', 'HAVING', 'INSERT INTO', 'VALUES', 
      'UPDATE', 'SET', 'DELETE FROM', 'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE'
    ];

    let formatted = currentSql;
    keywords.forEach((kw) => {
      const regex = new RegExp(`\\b${kw}\\b`, 'gi');
      formatted = formatted.replace(regex, `\n${kw}`);
    });

    formatted = formatted.trim();

    if (viewRef.current) {
      viewRef.current.dispatch({
        changes: { from: 0, to: viewRef.current.state.doc.length, insert: formatted },
      });
    }
    setSql(formatted);
  };

  const exportToJson = () => {
    if (!queryResult) return;
    const blob = new Blob([JSON.stringify(queryResult.rows, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'query_results.json';
    a.click();
  };

  // Draggable resize logic
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDraggingRef.current || !containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const newPercent = ((e.clientY - containerRect.top) / containerRect.height) * 100;
    
    if (newPercent >= 15 && newPercent <= 80) {
      setEditorHeightPercent(newPercent);
    }
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  const isSelectQuery = sql.trim().toUpperCase().startsWith('SELECT');

  return (
    <div ref={containerRef} className="flex flex-col h-full bg-base text-text font-sans relative select-none">
      {/* Editor Toolbar Header */}
      <div className="h-11 bg-surface border-b border-border px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-3">
          {/* Run Query Button + Cmd+Enter Muted Hint */}
          <div className="flex items-center space-x-2">
            <button
              onClick={handleRunAction}
              disabled={isLoading || isSpinning}
              className="px-[14px] py-[6px] rounded-[6px] bg-accent hover:bg-accentHover text-white font-medium text-[13px] flex items-center space-x-1.5 shadow-md shadow-accent/20 transition-all disabled:opacity-50 font-sans outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2"
            >
              {isSpinning || isLoading ? (
                <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <Play className="w-3.5 h-3.5 fill-current" />
              )}
              <span>Run Query</span>
            </button>
            <span className="text-[11px] text-textMuted font-sans">Cmd+Enter</span>
          </div>

          {/* Explain Plan Button */}
          <Tooltip content={isSelectQuery ? "Visualize SQL Execution Plan" : "Explain Plan only available for SELECT queries."}>
            <button
              onClick={() => isSelectQuery && setIsExplainOpen(true)}
              disabled={!isSelectQuery}
              className={`px-[14px] py-[6px] rounded-[6px] border border-[rgba(255,255,255,0.12)] bg-transparent text-accent text-[13px] font-semibold transition-all flex items-center space-x-1.5 font-sans outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 ${
                isSelectQuery ? 'hover:bg-[rgba(255,255,255,0.06)]' : 'opacity-40 cursor-not-allowed'
              }`}
            >
              <Cpu className="w-3.5 h-3.5 text-accent" />
              <span>Explain Plan</span>
            </button>
          </Tooltip>

          {/* TablePlus Dialect Switcher Dropdown (Supports 14 Dialects) */}
          <div className="relative">
            <button
              onClick={() => setShowDialectMenu(!showDialectMenu)}
              className="px-2.5 py-1 rounded bg-base hover:bg-surface2 border border-border text-xs text-text flex items-center space-x-1.5 transition-colors font-sans"
              title="Select TablePlus SQL Engine Dialect"
            >
              <Code2 className="w-3.5 h-3.5 text-accent" />
              <span className="font-medium text-[12px]">{selectedDialect.name}</span>
              <ChevronDown className="w-3.5 h-3.5 text-textMuted ml-0.5" />
            </button>

            {showDialectMenu && (
              <div className="absolute left-0 mt-1 w-56 bg-surface border border-border rounded-lg shadow-2xl py-1 z-50 max-h-72 overflow-y-auto">
                <div className="px-3 py-1 text-[10px] font-semibold text-textMuted uppercase tracking-wider border-b border-border/50 font-sans">
                  TablePlus Supported Dialects ({DIALECTS.length})
                </div>
                {DIALECTS.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => {
                      setDialect(d.id);
                      setShowDialectMenu(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-surface2 flex items-center justify-between transition-colors font-sans ${
                      d.id === dialect ? 'bg-accent/15 text-accent font-medium' : 'text-text'
                    }`}
                  >
                    <span>{d.name}</span>
                    <span className="text-[10px] text-textMuted opacity-60 font-mono">{d.category}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Format / Beautify SQL Button */}
          <Tooltip content="Beautify / Format SQL code (Cmd+I)">
            <button
              onClick={formatSql}
              className="px-2.5 py-1.5 rounded border border-[rgba(255,255,255,0.12)] bg-transparent hover:bg-[rgba(255,255,255,0.06)] text-text text-xs font-semibold transition-all flex items-center space-x-1 font-sans outline-none"
            >
              <Sparkles className="w-3.5 h-3.5 text-warning" />
              <span>Format</span>
            </button>
          </Tooltip>

          {/* Reusable SQL Snippets Dropdown */}
          <div className="relative">
            <Tooltip content="Insert reusable SQL snippet templates">
              <button
                onClick={() => setShowSnippetsMenu(!showSnippetsMenu)}
                className="px-2.5 py-1.5 rounded border border-[rgba(255,255,255,0.12)] bg-transparent hover:bg-[rgba(255,255,255,0.06)] text-text text-xs font-semibold transition-all flex items-center space-x-1 font-sans outline-none"
              >
                <Bookmark className="w-3.5 h-3.5 text-accent" />
                <span>Snippets</span>
                <ChevronDown className="w-3 h-3 text-textMuted" />
              </button>
            </Tooltip>

            {showSnippetsMenu && (
              <div className="absolute left-0 mt-1 w-64 bg-surface border border-border rounded-lg shadow-2xl py-1 z-50 overflow-hidden">
                <div className="px-3 py-1 text-[10px] font-semibold text-textMuted uppercase tracking-wider border-b border-border/50 font-sans">
                  Reusable SQL Snippets
                </div>
                {SQL_SNIPPETS.map((snippet) => (
                  <button
                    key={snippet.name}
                    onClick={() => {
                      setSql(snippet.sql);
                      if (viewRef.current) {
                        viewRef.current.dispatch({
                          changes: { from: 0, to: viewRef.current.state.doc.length, insert: snippet.sql },
                        });
                      }
                      setShowSnippetsMenu(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-surface2 transition-colors border-b border-border/20 last:border-0"
                  >
                    <div className="text-xs font-semibold text-text font-sans">{snippet.name}</div>
                    <div className="text-[10px] text-textMuted font-sans opacity-70 truncate">{snippet.description}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {showSaveInput ? (
            <div className="flex items-center space-x-1.5">
              <input
                type="text"
                placeholder="Query name..."
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                className="bg-base border border-border rounded px-2 py-1 text-xs text-text outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 font-sans"
              />
              <button
                onClick={() => {
                  if (saveName.trim()) {
                    onSaveQuery(saveName, sql);
                    setShowSaveInput(false);
                    setSaveName('');
                  }
                }}
                className="px-2.5 py-1 rounded bg-success text-white text-xs hover:bg-success/80 transition-all font-sans"
              >
                Save
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowSaveInput(true)}
              className="px-3 py-1.5 rounded border border-[rgba(255,255,255,0.12)] bg-transparent hover:bg-[rgba(255,255,255,0.06)] text-text text-xs font-semibold transition-all font-sans outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            >
              Save Query
            </button>
          )}
        </div>

        {queryResult && (
          <div className="flex items-center space-x-4 text-xs font-mono text-textMuted">
            <div className="flex items-center space-x-1 text-accent">
              <Clock className="w-3.5 h-3.5" />
              <span>{queryResult.execution_time_ms} ms</span>
            </div>
            <div className="flex items-center space-x-1 text-accentHover">
              <Layers className="w-3.5 h-3.5" />
              <span>{queryResult.affected_rows} row(s)</span>
            </div>
            <button
              onClick={exportToJson}
              className="p-1.5 rounded border border-[rgba(255,255,255,0.12)] bg-transparent hover:bg-[rgba(255,255,255,0.06)] text-text transition-all"
              title="Export as JSON"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* CodeMirror 6 Editor Container */}
      <div 
        style={{ height: `calc(${editorHeightPercent}% - 44px)` }}
        className="bg-base p-1 border-b border-border text-[13px] font-mono overflow-auto min-h-[80px]" 
        ref={editorRef} 
      />

      {/* Resizable Divider Handle */}
      <div
        onMouseDown={handleMouseDown}
        className="h-1.5 bg-transparent border-t border-b border-border/40 hover:bg-accent/40 cursor-row-resize shrink-0 transition-colors relative z-20"
        title="Drag to resize editor"
      >
        <div className="absolute inset-x-0 top-1/2 h-[1px] bg-border/60"></div>
      </div>

      {/* Query Results Data Matrix */}
      <div 
        style={{ height: `${100 - editorHeightPercent}%` }}
        className="overflow-auto bg-base min-h-[100px]"
      >
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-textMuted font-sans text-[13px]">
            Executing query against server...
          </div>
        ) : !queryResult ? (
          <div className="flex items-center justify-center h-full text-textMuted/45 font-sans text-[13px] flex-col space-y-2 select-none min-h-[150px]">
            <Database className="w-8 h-8 opacity-30" />
            <span>Click 'Run Query' or press Cmd+Enter to view results</span>
          </div>
        ) : queryResult.rows.length === 0 ? (
          <div className="flex items-center justify-center h-full text-textMuted/45 font-sans text-[13px]">
            Query executed successfully. 0 rows returned.
          </div>
        ) : (
          <table className="w-full border-collapse text-left font-mono text-[13px]">
            <thead className="sticky top-0 bg-surface border-b border-border shadow-sm z-10">
              <tr>
                <th className="w-10 px-2 py-1.5 text-center text-textMuted border-r border-border font-sans text-[11px] uppercase tracking-[0.06em] opacity-60">
                  #
                </th>
                {queryResult.columns.map((col, idx) => (
                  <th
                    key={idx}
                    className="px-3 py-1.5 text-text border-r border-border whitespace-nowrap bg-surface font-sans text-[11px] uppercase tracking-[0.06em]"
                  >
                    <span className="text-text/60 font-semibold">{col.name}</span>
                    <span className="text-[11px] text-text/45 font-sans font-normal ml-1">
                      {col.type_name}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {queryResult.rows.map((row, rowIdx) => (
                <tr key={rowIdx} className="hover:bg-[rgba(255,255,255,0.04)] transition-colors border-b border-border/40 even:bg-surface/20">
                  <td className="w-10 px-2 py-1 text-center text-textMuted border-r border-border/40 font-mono text-[11px]">
                    {rowIdx + 1}
                  </td>
                  {row.map((val: any, colIdx: number) => (
                    <td
                      key={colIdx}
                      className="px-3 py-1 border-r border-border/40 whitespace-nowrap text-text font-mono text-[13px] max-w-xs truncate"
                    >
                      {val === null ? (
                        <span className="text-textMuted italic font-sans text-xs">NULL</span>
                      ) : (
                        String(val)
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* EXPLAIN Execution Plan Modal */}
      <ExplainVisualizerModal
        isOpen={isExplainOpen}
        onClose={() => setIsExplainOpen(false)}
        sql={sql}
      />
    </div>
  );
};
