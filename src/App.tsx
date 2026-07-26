import React, { useState, useEffect, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { TableGrid } from './components/TableGrid';
import { SqlEditor } from './components/SqlEditor';
import { SavedQueries } from './components/SavedQueries';
import { CommandPalette } from './components/CommandPalette';
import { ConnectionModal } from './components/ConnectionModal';
import { DiffModal } from './components/DiffModal';
import { SafeModeModal } from './components/SafeModeModal';
import { FilterBar } from './components/FilterBar';
import { QueryHistory, QueryHistoryItem } from './components/QueryHistory';
import { StructureView } from './components/StructureView';
import { ErDiagramModal } from './components/ErDiagramModal';
import { ExportModal } from './components/ExportModal';
import { ImportModal } from './components/ImportModal';
import { JsonViewerModal } from './components/JsonViewerModal';
import { ProcessManagerModal } from './components/ProcessManagerModal';
import {
  ConnectionConfig,
  TableItem,
  ColumnItem,
  PkInfo,
  StagedCellEdit,
  SavedQuery,
  WorkspaceTab,
} from './types';
import { X, Plus, Terminal, Table as TableIcon, Sparkles, Sun, Moon, Clock, Network, Layers, Download, Upload, Activity, ChevronDown, Wand2 } from 'lucide-react';
import { Tooltip } from './components/Tooltip';

export const App: React.FC = () => {
  const currentProjectPath = 'e:\\devdash';

  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  const [connections, setConnections] = useState<ConnectionConfig[]>([
    {
      id: 'conn-1',
      name: 'Local PostgreSQL',
      db_type: 'postgres',
      host: 'localhost',
      port: 5432,
      user: 'postgres',
      database: 'devdash_demo',
      project_path: currentProjectPath,
      is_connected: true,
    },
    {
      id: 'conn-2',
      name: 'Analytics SQLite',
      db_type: 'sqlite',
      host: 'localhost',
      port: 0,
      user: '',
      database: 'devdash_internal.db',
      project_path: currentProjectPath,
      is_connected: false,
    },
    {
      id: 'conn-3',
      name: 'Production MySQL',
      db_type: 'mysql',
      host: '192.168.1.50',
      port: 3306,
      user: 'admin',
      database: 'prod_app',
      project_path: currentProjectPath,
      is_connected: false,
    },
  ]);

  const [activeConnection, setActiveConnection] = useState<ConnectionConfig | null>(connections[0]);
  const [tables] = useState<TableItem[]>([
    { name: 'users', table_type: 'BASE TABLE' },
    { name: 'orders', table_type: 'BASE TABLE' },
    { name: 'products', table_type: 'BASE TABLE' },
    { name: 'audit_logs', table_type: 'BASE TABLE' },
  ]);

  const [tabs, setTabs] = useState<WorkspaceTab[]>([
    { id: 'tab-1', title: 'users', type: 'table', tableName: 'users' },
    { id: 'tab-2', title: 'SQL Query 1', type: 'query', sql: 'SELECT * FROM users LIMIT 50;' },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>('tab-1');

  const [columns, setColumns] = useState<ColumnItem[]>([
    { name: 'id', data_type: 'INT', is_nullable: false, is_primary_key: true },
    { name: 'email', data_type: 'VARCHAR', is_nullable: false, is_primary_key: false },
    { name: 'name', data_type: 'VARCHAR', is_nullable: true, is_primary_key: false },
    { name: 'role', data_type: 'VARCHAR', is_nullable: false, is_primary_key: false },
    { name: 'metadata', data_type: 'JSONB', is_nullable: true, is_primary_key: false },
    { name: 'created_at', data_type: 'TIMESTAMP', is_nullable: false, is_primary_key: false },
  ]);

  const [rows, setRows] = useState<any[]>([
    { id: 1, email: 'akshat@devdash.io', name: 'Akshat', role: 'Backend Lead', metadata: { level: 'Senior', permissions: ['all'] }, created_at: '2026-07-25 10:00:00' },
    { id: 2, email: 'rishi@devdash.io', name: 'Rishi', role: 'Frontend Lead', metadata: { level: 'Senior', theme: 'dark' }, created_at: '2026-07-25 10:05:00' },
    { id: 3, email: 'demo@devdash.io', name: 'Demo User', role: 'Developer', metadata: { level: 'Mid' }, created_at: '2026-07-25 10:12:00' },
  ]);

  const [pkInfo] = useState<PkInfo>({
    has_single_pk: true,
    pk_column_name: 'id',
    is_read_only: false,
  });

  const [stagedEdits, setStagedEdits] = useState<StagedCellEdit[]>([]);
  const [isDiffModalOpen, setIsDiffModalOpen] = useState(false);

  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([
    {
      id: 'sq-1',
      name: 'Fetch High Priority Users',
      sql_content: "SELECT * FROM users WHERE role = 'Backend Lead';",
      project_path: currentProjectPath,
      created_at: '2026-07-25T11:00:00Z',
    },
    {
      id: 'sq-2',
      name: 'Audit Log Trail',
      sql_content: 'SELECT * FROM audit_logs ORDER BY id DESC LIMIT 100;',
      project_path: currentProjectPath,
      created_at: '2026-07-25T11:30:00Z',
    },
  ]);

  const [queryHistory, setQueryHistory] = useState<QueryHistoryItem[]>([
    {
      id: 'qh-1',
      sql: 'SELECT * FROM users LIMIT 50;',
      timestamp: new Date().toISOString(),
      executionTimeMs: 12,
      status: 'success',
    },
  ]);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);

  const [queryResult, setQueryResult] = useState<{
    columns: { name: string; type_name: string }[];
    rows: any[][];
    execution_time_ms: number;
    affected_rows: number;
  } | null>({
    columns: [
      { name: 'id', type_name: 'INTEGER' },
      { name: 'email', type_name: 'VARCHAR' },
      { name: 'name', type_name: 'VARCHAR' },
    ],
    rows: [
      [1, 'akshat@devdash.io', 'Akshat'],
      [2, 'rishi@devdash.io', 'Rishi'],
    ],
    execution_time_ms: 12,
    affected_rows: 2,
  });

  const [isCmdPaletteOpen, setIsCmdPaletteOpen] = useState(false);
  const [isConnModalOpen, setIsConnModalOpen] = useState(false);
  const [isSafeModeModalOpen, setIsSafeModeModalOpen] = useState(false);
  const [isErDiagramOpen, setIsErDiagramOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isProcessManagerOpen, setIsProcessManagerOpen] = useState(false);
  const [selectedJsonCell, setSelectedJsonCell] = useState<{ col: string; data: any } | null>(null);

  const [pendingDestructiveSql, setPendingDestructiveSql] = useState('');
  const [safeModeWarning, setSafeModeWarning] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const [showTabDropdown, setShowTabDropdown] = useState(false);
  const [filterWhere, setFilterWhere] = useState<string>('');
  const [filterSort, setFilterSort] = useState<string>('');

  const displayRows = useMemo(() => {
    let result = [...rows];

    if (filterWhere) {
      const match = filterWhere.match(/WHERE\s+(\w+)\s*(=|LIKE|>|<|!=)\s*'?([^']*)'?/i);
      if (match) {
        const [, col, op, val] = match;
        const cleanVal = val.replace(/%/g, '').toLowerCase();
        result = result.filter((r) => {
          const cellVal = String(r[col] ?? '').toLowerCase();
          if (op === '=') return cellVal === cleanVal || cellVal.includes(cleanVal);
          if (op === 'LIKE') return cellVal.includes(cleanVal);
          if (op === '!=') return cellVal !== cleanVal;
          if (op === '>') return Number(r[col]) > Number(cleanVal);
          if (op === '<') return Number(r[col]) < Number(cleanVal);
          return true;
        });
      }
    }

    if (filterSort) {
      const match = filterSort.match(/ORDER BY\s+(\w+)\s+(ASC|DESC)/i);
      if (match) {
        const [, col, dir] = match;
        result.sort((a, b) => {
          if (a[col] < b[col]) return dir.toUpperCase() === 'ASC' ? -1 : 1;
          if (a[col] > b[col]) return dir.toUpperCase() === 'ASC' ? 1 : -1;
          return 0;
        });
      }
    }

    return result;
  }, [rows, filterWhere, filterSort]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCmdPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleStageEdit = (edit: StagedCellEdit) => {
    setStagedEdits((prev) => {
      const filtered = prev.filter(
        (e) => !(e.rowId === edit.rowId && e.columnName === edit.columnName)
      );
      return [...filtered, edit];
    });
  };

  const handleRunQueryWithSafeMode = (sql: string) => {
    const upper = sql.trim().toUpperCase();
    const isDestructive =
      upper.startsWith('DROP') ||
      upper.startsWith('TRUNCATE') ||
      (upper.startsWith('DELETE') && !upper.includes('WHERE')) ||
      (upper.startsWith('UPDATE') && !upper.includes('WHERE'));

    if (isDestructive) {
      setPendingDestructiveSql(sql);
      setSafeModeWarning(
        upper.startsWith('DROP')
          ? 'DROP statement will permanently delete database structures.'
          : upper.startsWith('TRUNCATE')
          ? 'TRUNCATE will remove all rows from the table.'
          : 'Operation without WHERE clause will affect ALL rows.'
      );
      setIsSafeModeModalOpen(true);
    } else {
      executeSqlQuery(sql);
    }
  };

  const handleSeedMockData = () => {
    const nextId = rows.length + 1;
    const newMockRow = {
      id: nextId,
      email: `mock_user_${nextId}@devdash.io`,
      name: `Mock Developer ${nextId}`,
      role: 'QA Engineer',
      metadata: { level: 'Mid', seeded: true },
      created_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
    };
    setRows((prev) => [...prev, newMockRow]);
  };

  const executeSqlQuery = (sql: string) => {
    const start = performance.now();
    setQueryResult({
      columns: [
        { name: 'id', type_name: 'INTEGER' },
        { name: 'query', type_name: 'TEXT' },
        { name: 'status', type_name: 'VARCHAR' },
      ],
      rows: [[1, sql, 'EXECUTED']],
      execution_time_ms: Math.round(performance.now() - start),
      affected_rows: 1,
    });

    setQueryHistory((prev) => [
      {
        id: `qh-${Date.now()}`,
        sql,
        timestamp: new Date().toISOString(),
        executionTimeMs: Math.round(performance.now() - start),
        status: 'success',
      },
      ...prev,
    ]);
  };

  const handleOpenTableTab = (tableName: string) => {
    const existing = tabs.find((t) => t.tableName === tableName && t.type === 'table');
    if (existing) {
      setActiveTabId(existing.id);
    } else {
      const newId = `tab-${Date.now()}`;
      const newTab: WorkspaceTab = {
        id: newId,
        title: tableName,
        type: 'table',
        tableName,
      };
      setTabs([...tabs, newTab]);
      setActiveTabId(newId);
    }
  };

  const handleOpenStructureTab = (tableName: string) => {
    const existing = tabs.find((t) => t.tableName === tableName && t.type === 'structure');
    if (existing) {
      setActiveTabId(existing.id);
    } else {
      const newId = `tab-struct-${Date.now()}`;
      const newTab: WorkspaceTab = {
        id: newId,
        title: `Structure: ${tableName}`,
        type: 'structure',
        tableName,
      };
      setTabs([...tabs, newTab]);
      setActiveTabId(newId);
    }
  };

  const handleOpenNewQueryTab = () => {
    const newId = `tab-${Date.now()}`;
    const newTab: WorkspaceTab = {
      id: newId,
      title: `Query ${tabs.length + 1}`,
      type: 'query',
      sql: 'SELECT * FROM users LIMIT 50;',
    };
    setTabs([...tabs, newTab]);
    setActiveTabId(newId);
  };

  const handleCloseTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length === 1) return;
    const remaining = tabs.filter((t) => t.id !== id);
    setTabs(remaining);
    if (activeTabId === id) {
      setActiveTabId(remaining[remaining.length - 1].id);
    }
  };

  const handleExportData = (format: 'csv' | 'json' | 'sql') => {
    let content = '';
    if (format === 'csv') {
      content = 'id,email,name,role,created_at\n1,akshat@devdash.io,Akshat,Backend Lead,2026-07-25 10:00:00\n2,rishi@devdash.io,Rishi,Frontend Lead,2026-07-25 10:05:00';
    } else if (format === 'json') {
      content = JSON.stringify(rows, null, 2);
    } else {
      content = "INSERT INTO users (id, email, name, role) VALUES (1, 'akshat@devdash.io', 'Akshat', 'Backend Lead');\nINSERT INTO users (id, email, name, role) VALUES (2, 'rishi@devdash.io', 'Rishi', 'Frontend Lead');";
    }

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeTab.tableName || 'export'}.${format}`;
    a.click();
  };

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  return (
    <div className="flex h-screen w-screen font-sans relative select-none bg-base text-text">
      {/* Sidebar */}
      <Sidebar
        connections={connections}
        activeConnection={activeConnection}
        tables={tables}
        onSelectConnection={(conn) => setActiveConnection(conn)}
        onSelectTable={handleOpenTableTab}
        onOpenNewConnectionModal={() => setIsConnModalOpen(true)}
        currentProjectPath={currentProjectPath}
      />

      {/* Main Content Pane */}
      <main className="flex-1 flex flex-col h-full bg-transparent z-10 min-w-0">
        {/* Workspace Tab Bar */}
        <div className="h-10 bg-surface border-b border-border flex items-center px-3 space-x-1.5 select-none shrink-0 relative">
          {/* Scrollable tabs container */}
          <div className="flex-1 flex items-center space-x-1.5 overflow-x-auto no-scrollbar scroll-smooth">
            {tabs.map((tab) => {
              const isActive = tab.id === activeTabId;
              return (
                <div
                  key={tab.id}
                  onClick={() => setActiveTabId(tab.id)}
                  className={`group flex items-center space-x-1.5 px-3 py-1 rounded-full text-[13px] font-sans font-medium cursor-pointer transition-all min-w-[80px] shrink-0 ${
                    isActive
                      ? 'bg-[rgba(255,255,255,0.08)] text-text'
                      : 'bg-transparent text-text/50 hover:text-text'
                  }`}
                >
                  {/* UX3: 14px icons, matching active state color/opacity */}
                  {tab.type === 'table' ? (
                    <TableIcon className={`w-[14px] h-[14px] shrink-0 ${isActive ? 'text-accent' : 'text-text/30 group-hover:text-text/60'}`} />
                  ) : tab.type === 'structure' ? (
                    <Layers className={`w-[14px] h-[14px] shrink-0 ${isActive ? 'text-warning' : 'text-text/30 group-hover:text-text/60'}`} />
                  ) : (
                    <Terminal className={`w-[14px] h-[14px] shrink-0 ${isActive ? 'text-accentHover' : 'text-text/30 group-hover:text-text/60'}`} />
                  )}
                  <span className="truncate max-w-[100px]">{tab.title}</span>
                  {tabs.length > 1 && (
                    <button
                      onClick={(e) => handleCloseTab(tab.id, e)}
                      className="p-0.5 rounded text-text/40 hover:text-text hover:bg-[rgba(255,255,255,0.12)] opacity-0 group-hover:opacity-100 transition-opacity ml-1 shrink-0"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* New tab (+) button */}
          <button
            onClick={handleOpenNewQueryTab}
            className="p-1.5 rounded text-text/40 hover:text-text hover:bg-[rgba(255,255,255,0.08)] transition-all ml-1 shrink-0"
            title="New SQL Editor Tab"
          >
            <Plus className="w-4 h-4" />
          </button>

          {/* UX9: Chevron Overflow Tab Dropdown */}
          <div className="relative shrink-0">
            <button
              onClick={() => setShowTabDropdown(!showTabDropdown)}
              className="p-1.5 rounded text-text/40 hover:text-text hover:bg-[rgba(255,255,255,0.08)] transition-all"
              title="Show all open tabs"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
            {showTabDropdown && (
              <div className="absolute right-0 mt-1 w-48 bg-surface border border-border rounded-lg shadow-xl py-1 z-50 max-h-60 overflow-y-auto">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setActiveTabId(t.id);
                      setShowTabDropdown(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-surface2 transition-colors truncate block ${
                      t.id === activeTabId ? 'text-accent font-medium' : 'text-text'
                    }`}
                  >
                    {t.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Table View Sub-bar (Data vs Structure Mode + Import/Export) */}
        {activeTab.type === 'table' && (
          <div className="h-8 bg-surface border-b border-border px-3 flex items-center justify-between text-xs font-sans shrink-0">
            <div className="flex items-center space-x-1.5 font-sans text-[13px] text-textMuted">
              <span>Table:</span>
              <strong className="text-text font-semibold">{activeTab.tableName}</strong>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => setIsImportModalOpen(true)}
                className="px-2.5 py-0.5 rounded border border-[rgba(255,255,255,0.12)] bg-transparent hover:bg-[rgba(255,255,255,0.06)] text-text flex items-center space-x-1 text-[11px] transition-colors font-sans"
              >
                <Upload className="w-3 h-3 text-success" />
                <span>Import</span>
              </button>

              <button
                onClick={() => setIsExportModalOpen(true)}
                className="px-2.5 py-0.5 rounded border border-[rgba(255,255,255,0.12)] bg-transparent hover:bg-[rgba(255,255,255,0.06)] text-text flex items-center space-x-1 text-[11px] transition-colors font-sans"
              >
                <Download className="w-3 h-3 text-accent" />
                <span>Export</span>
              </button>

              <button
                onClick={handleSeedMockData}
                className="px-2.5 py-0.5 rounded border border-[rgba(255,255,255,0.12)] bg-transparent hover:bg-[rgba(255,255,255,0.06)] text-text flex items-center space-x-1 text-[11px] transition-colors font-sans"
                title="Generate 1 mock sample row for testing schema"
              >
                <Wand2 className="w-3 h-3 text-warning" />
                <span>Seed Mock Data</span>
              </button>

              <div className="flex items-center space-x-1 bg-base p-0.5 rounded border border-border text-[11px]">
                <button
                  className="px-2 py-0.5 rounded bg-accent text-white font-medium shadow"
                >
                  Data Grid
                </button>
                <button
                  onClick={() => handleOpenStructureTab(activeTab.tableName || 'users')}
                  className="px-2 py-0.5 rounded text-textMuted hover:text-text transition-colors"
                >
                  Structure / DDL
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Workspace Active View */}
        <div className="flex-1 overflow-hidden relative flex">
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            {activeTab.type === 'table' ? (
              <>
                <FilterBar
                  columns={columns}
                  onApplyFilter={(where, sort) => {
                    setFilterWhere(where);
                    setFilterSort(sort);
                  }}
                  onClearFilter={() => {
                    setFilterWhere('');
                    setFilterSort('');
                  }}
                />
                <TableGrid
                  tableName={activeTab.tableName || 'users'}
                  columns={columns}
                  rows={displayRows}
                  pkInfo={pkInfo}
                  stagedEdits={stagedEdits}
                  onStageEdit={handleStageEdit}
                  onApplyEdits={() => setIsDiffModalOpen(true)}
                  onResetEdits={() => setStagedEdits([])}
                  currentPage={currentPage}
                  onPageChange={(p) => setCurrentPage(p)}
                  isLoading={false}
                />
              </>
            ) : activeTab.type === 'structure' ? (
              <StructureView
                tableName={activeTab.tableName || 'users'}
                columns={columns}
                onAddColumn={(colName, type) => {
                  setColumns([
                    ...columns,
                    { name: colName, data_type: type, is_nullable: true, is_primary_key: false },
                  ]);
                }}
                onDropColumn={(colName) => {
                  setColumns(columns.filter((c) => c.name !== colName));
                }}
              />
            ) : (
              <SqlEditor
                initialSql={activeTab.sql}
                onRunQuery={handleRunQueryWithSafeMode}
                queryResult={queryResult}
                isLoading={false}
                onSaveQuery={(name, sql) => {
                  const newQuery: SavedQuery = {
                    id: `sq-${Date.now()}`,
                    name,
                    sql_content: sql,
                    project_path: currentProjectPath,
                    created_at: new Date().toISOString(),
                  };
                  setSavedQueries([...savedQueries, newQuery]);
                }}
              />
            )}
          </div>

          {/* Collapsible Query History Panel */}
          {showHistoryPanel && (
            <QueryHistory
              history={queryHistory}
              onSelectQuery={(sql) => handleRunQueryWithSafeMode(sql)}
              onClearHistory={() => setQueryHistory([])}
            />
          )}
        </div>

        {/* Footer Status Bar */}
        <footer className="h-6 bg-[#0A0A0B] px-3 flex items-center justify-between text-[11px] font-sans text-textMuted select-none shrink-0 z-20">
          <div className="flex items-center space-x-3">
            <span className="flex items-center space-x-1.5 font-sans">
              <span className={`w-1.5 h-1.5 rounded-full ${activeConnection?.is_connected ? 'bg-success' : 'bg-error'}`}></span>
              <span className="text-text font-medium">
                {activeConnection?.name || 'Disconnected'}
              </span>
            </span>
            <span>({activeConnection?.db_type.toUpperCase()})</span>

            {/* UX10: Fullscreen / Browser mode hint */}
            {!(window as any).__TAURI__ && (
              <span className="text-[10px] text-textMuted bg-surface2 px-1.5 py-0.5 rounded border border-border/80 select-none">
                Browser Mode: 'Press Esc' fullscreen hint is browser-only
              </span>
            )}
          </div>

          <div className="flex items-center space-x-4">
            <Tooltip content="Show server activity manager">
              <button
                onClick={() => setIsProcessManagerOpen(true)}
                className="flex items-center space-x-1 text-success hover:underline"
                title="Monitor active database server processes"
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Process Activity</span>
              </button>
            </Tooltip>

            <Tooltip content="Show database entity relationships map">
              <button
                onClick={() => setIsErDiagramOpen(true)}
                className="flex items-center space-x-1 text-accent hover:underline"
                title="View ER Diagram Schema Map"
              >
                <Network className="w-3.5 h-3.5" />
                <span>ER Diagram</span>
              </button>
            </Tooltip>

            <Tooltip content="Toggle SQL Query History panel">
              <button
                onClick={() => setShowHistoryPanel((prev) => !prev)}
                className={`flex items-center space-x-1 transition-colors ${
                  showHistoryPanel ? 'text-accent font-medium' : 'text-textMuted hover:text-text'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>History</span>
              </button>
            </Tooltip>

            <Tooltip content="Toggle Light/Dark color mode">
              <button
                onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
                className="flex items-center space-x-1 text-textMuted hover:text-text transition-colors"
              >
                {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              </button>
            </Tooltip>

            <Tooltip content="Search anything (tables, saved queries, connections)">
              <span className="text-accent font-mono cursor-pointer hover:underline" onClick={() => setIsCmdPaletteOpen(true)}>Cmd+K</span>
            </Tooltip>

            <span>Latency: 1.2ms</span>
          </div>
        </footer>
      </main>

      {/* Right Saved Queries Collapsible Panel */}
      <SavedQueries
        savedQueries={savedQueries}
        onSelectQuery={() => {
          handleOpenNewQueryTab();
          setQueryResult(null);
        }}
        currentProjectPath={currentProjectPath}
      />

      {/* Command Palette */}
      <CommandPalette
        isOpen={isCmdPaletteOpen}
        onClose={() => setIsCmdPaletteOpen(false)}
        tables={tables}
        connections={connections}
        savedQueries={savedQueries}
        onSelectTable={handleOpenTableTab}
        onSelectConnection={(conn) => setActiveConnection(conn)}
        onSelectQuery={() => handleOpenNewQueryTab()}
      />

      {/* New Connection Modal */}
      <ConnectionModal
        isOpen={isConnModalOpen}
        onClose={() => setIsConnModalOpen(false)}
        onSave={(connData) => {
          const newConn: ConnectionConfig = {
            ...connData,
            id: `conn-${Date.now()}`,
            is_connected: true,
          };
          setConnections([...connections, newConn]);
          setActiveConnection(newConn);
        }}
      />

      {/* Staged Edits Diff Review Modal */}
      <DiffModal
        isOpen={isDiffModalOpen}
        onClose={() => setIsDiffModalOpen(false)}
        stagedEdits={stagedEdits}
        onConfirmApply={() => setStagedEdits([])}
      />

      {/* Safe Mode Destructive Confirmation Modal */}
      <SafeModeModal
        isOpen={isSafeModeModalOpen}
        onClose={() => setIsSafeModeModalOpen(false)}
        sql={pendingDestructiveSql}
        warningMessage={safeModeWarning}
        onConfirmExecute={() => executeSqlQuery(pendingDestructiveSql)}
      />

      {/* ER Diagram Modal */}
      <ErDiagramModal
        isOpen={isErDiagramOpen}
        onClose={() => setIsErDiagramOpen(false)}
        tables={tables}
        columns={columns}
      />

      {/* Export Format Selector Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        tableName={activeTab.tableName || 'users'}
        onExport={handleExportData}
      />

      {/* Import Data Modal */}
      <ImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportSuccess={(file, count) => {
          executeSqlQuery(`-- Imported ${count} rows from ${file}`);
        }}
      />

      {/* Process Activity Manager Modal */}
      <ProcessManagerModal
        isOpen={isProcessManagerOpen}
        onClose={() => setIsProcessManagerOpen(false)}
        dbType={activeConnection?.db_type || 'postgres'}
        onKillProcess={(pid) => {
          executeSqlQuery(`-- Terminated process PID ${pid}`);
        }}
      />

      {/* JSON Viewer Modal */}
      {selectedJsonCell && (
        <JsonViewerModal
          isOpen={!!selectedJsonCell}
          onClose={() => setSelectedJsonCell(null)}
          columnName={selectedJsonCell.col}
          jsonData={selectedJsonCell.data}
        />
      )}
    </div>
  );
};
