import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { TableGrid } from './components/TableGrid';
import { SqlEditor } from './components/SqlEditor';
import { SavedQueries } from './components/SavedQueries';
import { ConnectionModal } from './components/ConnectionModal';
import { SafeModeModal } from './components/SafeModeModal';
import { FilterBar } from './components/FilterBar';
import { StructureView } from './components/StructureView';
import { ExportModal } from './components/ExportModal';
import { ImportModal } from './components/ImportModal';
import { StagingCommit } from './components/StagingCommit';
import { HealthGrid } from './components/HealthGrid';
import { SchemaVisualizer } from './components/SchemaVisualizer';
import { AiAgentBar } from './components/AiAgentBar';
import { InlineJsonPopup } from './components/InlineJsonPopup';
import { ContextMenu, buildCellContextMenu, ContextMenuAction } from './components/ContextMenu';
import { SettingsModal, AiConfig, GeneralSettings } from './components/SettingsModal';
import {
  ConnectionConfig,
  TableItem,
  ColumnItem,
  PkInfo,
  StagedChange,
  StagedCellEdit,
  SavedQuery,
  WorkspaceTab,
  QueryHistoryEntry,
  TabType,
} from './types';
import {
  X, Plus, Terminal, Table as TableIcon, Layers, Download, Upload,
  GitBranch, Activity, Network, Shield, Clock, Wand2, Search, Sparkles, Settings,
} from 'lucide-react';
import { Tooltip } from './components/Tooltip';

export const App: React.FC = () => {
  const currentProjectPath = 'e:\\devdash';

  // === SETTINGS STATE ===
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [generalSettings, setGeneralSettings] = useState<GeneralSettings>(() => {
    const saved = localStorage.getItem('devdash_general_settings');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return {
      pageSize: 1000,
      fontSize: 13,
      fontFamily: "'JetBrains Mono', monospace",
      showRowCountInTab: true,
      autoReconnect: true,
      autoCapitalizeSql: true,
      queryTimeoutSec: 30,
      safeModeDefaultProd: true,
      confirmDestructiveNoWhere: true,
      sshTimeoutSec: 10,
      strictSslVerify: true,
    };
  });

  const [aiConfig, setAiConfig] = useState<AiConfig>(() => {
    const saved = localStorage.getItem('devdash_ai_config');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return {
      enabled: true,
      provider: 'ollama',
      apiKey: '',
      baseUrl: 'http://localhost:11434',
      model: 'qwen2.5-coder',
    };
  });

  const handleGeneralSettingsChange = (newSettings: GeneralSettings) => {
    setGeneralSettings(newSettings);
    localStorage.setItem('devdash_general_settings', JSON.stringify(newSettings));
  };

  const handleAiConfigChange = (newConfig: AiConfig) => {
    setAiConfig(newConfig);
    localStorage.setItem('devdash_ai_config', JSON.stringify(newConfig));
  };

  // Cmd + comma for Settings
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setIsSettingsOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // === CONNECTIONS ===
  const [connections, setConnections] = useState<ConnectionConfig[]>([
    { id: 'conn-1', name: 'production_db_app_main', db_type: 'postgres', host: 'localhost', port: 5432, user: 'postgres', database: 'prod_db', project_path: currentProjectPath, is_connected: true },
    { id: 'conn-2', name: 'local_test_db', db_type: 'mysql', host: 'localhost', port: 3306, user: 'root', database: 'test_db', project_path: currentProjectPath, is_connected: false },
    { id: 'conn-3', name: 'staging_cache', db_type: 'redis', host: 'localhost', port: 6379, user: '', database: '0', project_path: currentProjectPath, is_connected: false },
  ]);
  const [activeConnection, setActiveConnection] = useState<ConnectionConfig | null>(connections[0]);

  // === TABLES ===
  const [tables] = useState<TableItem[]>([
    { name: 'users', table_type: 'BASE TABLE' },
    { name: 'transactions', table_type: 'BASE TABLE' },
    { name: 'orders', table_type: 'BASE TABLE' },
    { name: 'orders_shipped', table_type: 'BASE TABLE' },
    { name: 'logs_system', table_type: 'BASE TABLE' },
    { name: 'products', table_type: 'BASE TABLE' },
  ]);

  // === COLUMNS (for products table as shown in screenshots) ===
  const [columns, setColumns] = useState<ColumnItem[]>([
    { name: 'id', data_type: 'INT', is_nullable: false, is_primary_key: true },
    { name: 'product_id', data_type: 'VARCHAR', is_nullable: false, is_primary_key: false },
    { name: 'product_name', data_type: 'VARCHAR', is_nullable: false, is_primary_key: false },
    { name: 'price', data_type: 'DECIMAL', is_nullable: false, is_primary_key: false },
    { name: 'stock_quantity', data_type: 'INT', is_nullable: true, is_primary_key: false },
    { name: 'could', data_type: 'VARCHAR', is_nullable: true, is_primary_key: false },
    { name: 'could2', data_type: 'VARCHAR', is_nullable: true, is_primary_key: false },
    { name: 'updated_at', data_type: 'TIMESTAMP', is_nullable: true, is_primary_key: false },
  ]);

  // === ROWS (matching screenshot products data) ===
  const [rows, setRows] = useState<any[]>([
    { id: 1, product_id: 'u101', product_name: 'Apple liks RB', price: '$28.00', stock_quantity: 30, could: '-', could2: '-', updated_at: '2024-0...' },
    { id: 2, product_id: 'u102', product_name: 'Electronics', price: '$25.00', stock_quantity: 15, could: '-', could2: '-', updated_at: '2024-0...' },
    { id: 3, product_id: 'u103', product_name: 'Corny Categories', price: '$25.00', stock_quantity: 10, could: '-', could2: '-', updated_at: '2024-0...' },
    { id: 4, product_id: 'u104', product_name: 'Sony Reflex', price: '$75.00', stock_quantity: 100, could: '-', could2: '-', updated_at: '2024-0...' },
    { id: 5, product_id: 'u106', product_name: 'products', price: '$25.00', stock_quantity: null, could: '-', could2: '-', updated_at: '2024-0...', product_config: { category: 'Electronics', brand: 'Sony', stock: '48' } },
    { id: 6, product_id: 'u106', product_name: 'Rutaphanic Bags', price: '$29.00', stock_quantity: null, could: '-', could2: '-', updated_at: '2024-0...' },
    { id: 7, product_id: 'u107', product_name: 'Brand: Sony', price: '$29.00', stock_quantity: null, could: '-', could2: '-', updated_at: '2024-0...' },
    { id: 8, product_id: 'u106', product_name: 'Apple Purker', price: '$19.00', stock_quantity: null, could: '-', could2: '-', updated_at: '2024-0...' },
    { id: 9, product_id: 'u104', product_name: 'Stock_Quantity', price: '$35.00', stock_quantity: null, could: '-', could2: '-', updated_at: '2024-0...' },
    { id: 10, product_id: 'u101', product_name: 'Apple liks RB', price: '$25.00', stock_quantity: null, could: '-', could2: '-', updated_at: '2024-0...' },
    { id: 11, product_id: 'u102', product_name: 'Electronics', price: '$25.00', stock_quantity: 10, could: 'win: shipped:it...', could2: '-', updated_at: '2024-0...' },
    { id: 12, product_id: 'u103', product_name: 'Corny Reflex', price: '$75.00', stock_quantity: 10, could: 'win: shipped: t...', could2: '-', updated_at: '2024-0...' },
    { id: 13, product_id: 'u105', product_name: 'produsts', price: '$25.00', stock_quantity: 10, could: 'win: shipped: t', could2: '-', updated_at: '2024-0...' },
    { id: 14, product_id: 'u106', product_name: 'products', price: '$25.00', stock_quantity: null, could: 'ecovin: shipped"...', could2: '-', updated_at: '2024-0...' },
    { id: 15, product_id: 'u107', product_name: 'Rutaphanic Bags', price: '$29.00', stock_quantity: null, could: 'alkandactions@t...', could2: '-', updated_at: '2024-0...' },
    { id: 16, product_id: 'u108', product_name: 'Brand: Sony', price: '$39.00', stock_quantity: null, could: 'esovirn:shipped: t...', could2: '-', updated_at: '2024-0...' },
  ]);

  const [pkInfo] = useState<PkInfo>({ has_single_pk: true, pk_column_name: 'id', is_read_only: false });

  // === TABS (matching screenshot tab bar) ===
  const [tabs, setTabs] = useState<WorkspaceTab[]>([
    { id: 'tab-browser', title: 'Browser (Products)', type: 'browser', tableName: 'products' },
    { id: 'tab-query', title: 'Query Editor', type: 'query', sql: "-- Querying Product Stock Levels\nSELECT product_id, product_name, price, stock_quantity\n  FROM products\n  WHERE stock_quantity < 60;" },
    { id: 'tab-staging', title: 'Staging & Commit', type: 'staging' },
    { id: 'tab-console', title: 'Query Console 1', type: 'console', sql: '' },
    { id: 'tab-structure', title: 'Table Structure', type: 'structure', tableName: 'products' },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>('tab-browser');

  // === STAGED CHANGES (matching screenshot staging view) ===
  const [stagedChanges, setStagedChanges] = useState<StagedChange[]>([
    { id: 'sc-1', tableName: 'products', changeType: 'update', identifier: 'product_id', diff: 'price: $25 → $24.99, stock: 48 → 72', rowId: 1, columnName: 'product_id', checked: true },
    { id: 'sc-2', tableName: 'products', changeType: 'update', identifier: 'product_id', diff: 'price: $25 → $24.99, stock: 48 → 72', rowId: 2, columnName: 'product_id', checked: true },
    { id: 'sc-3', tableName: 'products', changeType: 'update', identifier: 'product_id', diff: 'price: $25 → $24.99, stock: 48 → 72', rowId: 3, columnName: 'product_id', checked: true },
    { id: 'sc-4', tableName: 'products', changeType: 'update', identifier: 'name', diff: 'price: $25 → $24.99, stock: 48 → 72', rowId: 4, columnName: 'name', checked: true },
    { id: 'sc-5', tableName: 'products', changeType: 'update', identifier: 'price', diff: 'price: $25 → $24.99, stock: 48 → 72', rowId: 5, columnName: 'price', checked: true },
    { id: 'sc-6', tableName: 'products', changeType: 'update', identifier: 'price', diff: 'price: $25 → $24.99, stock: 48 → 72', rowId: 6, columnName: 'price', checked: true },
    { id: 'sc-7', tableName: 'users', changeType: 'update', identifier: 'product_id', diff: 'price: $60 → $60', rowId: 7, columnName: 'product_id', checked: true },
    { id: 'sc-8', tableName: 'users', changeType: 'update', identifier: 'user_name', diff: 'price: $10 → $16.99, stock: 48 → 100.0035', rowId: 8, columnName: 'user_name', checked: true },
    { id: 'sc-9', tableName: 'users', changeType: 'update', identifier: 'user_name', diff: 'price: $10 → 60', rowId: 9, columnName: 'user_name', checked: true },
  ]);

  // === SAFE MODE ===
  const [safeModeEnabled, setSafeModeEnabled] = useState(true);
  const [isSafeModeModalOpen, setIsSafeModeModalOpen] = useState(false);
  const [pendingDestructiveSql, setPendingDestructiveSql] = useState('');
  const [safeModeWarning, setSafeModeWarning] = useState('');

  // === MODALS ===
  const [isConnModalOpen, setIsConnModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // === INLINE JSON POPUP ===
  const [jsonPopup, setJsonPopup] = useState<{ data: any; rect: { top: number; left: number; width: number; height: number } } | null>(null);

  // === CONTEXT MENU ===
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; actions: ContextMenuAction[] } | null>(null);

  // === QUERY STATE ===
  const [queryResult, setQueryResult] = useState<{ columns: { name: string; type_name: string }[]; rows: any[][]; execution_time_ms: number; affected_rows: number } | null>(null);
  const [queryHistory, setQueryHistory] = useState<QueryHistoryEntry[]>([]);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);

  // === SAVED QUERIES ===
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([
    { id: 'sq-1', name: 'Fetch Stock Levels', sql_content: "SELECT * FROM products WHERE stock_quantity < 60;", project_path: currentProjectPath, created_at: '2026-07-25T11:00:00Z' },
    { id: 'sq-2', name: 'Recent Orders', sql_content: 'SELECT * FROM orders ORDER BY created_at DESC LIMIT 100;', project_path: currentProjectPath, created_at: '2026-07-25T11:30:00Z' },
  ]);

  // === FILTER ===
  const [filterWhere, setFilterWhere] = useState('');
  const [filterSort, setFilterSort] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // === LEGACY STAGED EDITS (for TableGrid compatibility) ===
  const [stagedEdits, setStagedEdits] = useState<StagedCellEdit[]>([]);

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

  // === HANDLERS ===
  const executeSqlQuery = useCallback((sql: string) => {
    const start = performance.now();
    const ms = Math.round(performance.now() - start);
    setQueryResult({
      columns: [{ name: 'id', type_name: 'INTEGER' }, { name: 'query', type_name: 'TEXT' }, { name: 'status', type_name: 'VARCHAR' }],
      rows: [[1, sql, 'EXECUTED']],
      execution_time_ms: ms,
      affected_rows: 1,
    });
    setQueryHistory(prev => [{
      id: `qh-${Date.now()}`,
      sql,
      connectionName: activeConnection?.name || '',
      engine: activeConnection?.db_type || '',
      timestamp: new Date().toISOString(),
      executionTimeMs: ms,
      rowCount: 1,
      status: 'success',
    }, ...prev]);
  }, [activeConnection]);

  const handleRunQueryWithSafeMode = useCallback((sql: string) => {
    if (!safeModeEnabled) { executeSqlQuery(sql); return; }
    const upper = sql.trim().toUpperCase();
    const isDestructive = upper.startsWith('DROP') || upper.startsWith('TRUNCATE') ||
      (upper.startsWith('DELETE') && !upper.includes('WHERE')) ||
      (upper.startsWith('UPDATE') && !upper.includes('WHERE'));
    if (isDestructive) {
      setPendingDestructiveSql(sql);
      setSafeModeWarning(upper.startsWith('DROP') ? 'DROP statement will permanently delete database structures.' :
        upper.startsWith('TRUNCATE') ? 'TRUNCATE will remove all rows from the table.' :
        'Operation without WHERE clause will affect ALL rows.');
      setIsSafeModeModalOpen(true);
    } else {
      executeSqlQuery(sql);
    }
  }, [safeModeEnabled, executeSqlQuery]);

  const handleStageEdit = useCallback((edit: StagedCellEdit) => {
    setStagedEdits(prev => {
      const filtered = prev.filter(e => !(e.rowId === edit.rowId && e.columnName === edit.columnName));
      return [...filtered, edit];
    });
    // Also add to staging view
    const activeTab = tabs.find(t => t.id === activeTabId);
    const tblName = activeTab?.tableName || 'unknown';
    setStagedChanges(prev => [...prev, {
      id: `sc-${Date.now()}-${Math.random()}`,
      tableName: edit.tableName || tblName,
      changeType: 'update',
      identifier: edit.columnName,
      diff: `${edit.columnName}: ${String(edit.oldValue)} → ${String(edit.newValue)}`,
      rowId: edit.rowId,
      columnName: edit.columnName,
      checked: true,
    }]);
  }, [tabs, activeTabId]);

  const handleOpenTableTab = useCallback((tableName: string) => {
    const existing = tabs.find(t => t.tableName === tableName && t.type === 'browser');
    if (existing) { setActiveTabId(existing.id); return; }
    const newId = `tab-${Date.now()}`;
    setTabs(prev => [...prev, { id: newId, title: `Browser (${tableName})`, type: 'browser', tableName }]);
    setActiveTabId(newId);
  }, [tabs]);

  const handleOpenNewQueryTab = useCallback(() => {
    const newId = `tab-${Date.now()}`;
    setTabs(prev => [...prev, { id: newId, title: `Query Console ${prev.filter(t => t.type === 'query' || t.type === 'console').length + 1}`, type: 'query', sql: '' }]);
    setActiveTabId(newId);
  }, []);

  const handleCloseTab = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length === 1) return;
    const remaining = tabs.filter(t => t.id !== id);
    setTabs(remaining);
    if (activeTabId === id) setActiveTabId(remaining[remaining.length - 1].id);
  }, [tabs, activeTabId]);

  const handleOpenErd = useCallback(() => {
    const existing = tabs.find(t => t.type === 'erd');
    if (existing) { setActiveTabId(existing.id); return; }
    const newId = `tab-erd-${Date.now()}`;
    setTabs(prev => [...prev, { id: newId, title: 'Schema Visualizer (ERD)', type: 'erd' }]);
    setActiveTabId(newId);
  }, [tabs]);

  const handleOpenHealth = useCallback(() => {
    const existing = tabs.find(t => t.type === 'health');
    if (existing) { setActiveTabId(existing.id); return; }
    const newId = `tab-health-${Date.now()}`;
    setTabs(prev => [...prev, { id: newId, title: 'Slow Queries (Bento)', type: 'health' }]);
    setActiveTabId(newId);
  }, [tabs]);

  const handleExportData = useCallback((format: 'csv' | 'json' | 'sql') => {
    let content = '';
    if (format === 'csv') {
      const headers = columns.map(c => c.name).join(',');
      const rowStrs = rows.map(r => columns.map(c => String(r[c.name] ?? '')).join(',')).join('\n');
      content = `${headers}\n${rowStrs}`;
    } else if (format === 'json') {
      content = JSON.stringify(rows, null, 2);
    } else {
      content = rows.map(r => {
        const vals = columns.map(c => typeof r[c.name] === 'string' ? `'${r[c.name]}'` : String(r[c.name] ?? 'NULL'));
        return `INSERT INTO products (${columns.map(c => c.name).join(', ')}) VALUES (${vals.join(', ')});`;
      }).join('\n');
    }
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const activeTab = tabs.find(t => t.id === activeTabId);
    a.download = `${activeTab?.tableName || 'export'}_${Date.now()}.${format}`;
    a.click();
  }, [columns, rows, tabs, activeTabId]);

  // Schema for AI agent
  const aiSchema = useMemo(() => ({
    tables: tables.map(t => ({ name: t.name, columns: columns.map(c => c.name) })),
  }), [tables, columns]);

  // ERD table data
  const erdTables = useMemo(() => [
    { name: 'products', columns: [
      { name: 'id', data_type: 'int8', is_nullable: false, is_primary_key: true },
      { name: 'email', data_type: 'varchar', is_nullable: true, is_primary_key: false },
      { name: 'email', data_type: 'varchar', is_nullable: true, is_primary_key: false },
      { name: 'created_at', data_type: 'timestamp', is_nullable: true, is_primary_key: false },
    ]},
    { name: 'users', columns: [
      { name: 'id', data_type: 'int8', is_nullable: false, is_primary_key: true },
      { name: 'email', data_type: 'varchar', is_nullable: false, is_primary_key: false },
      { name: 'costed_at', data_type: 'timestamp', is_nullable: true, is_primary_key: false },
      { name: 'created_at', data_type: 'timestamp', is_nullable: true, is_primary_key: false },
    ]},
    { name: 'orders', columns: [
      { name: 'id', data_type: 'int8', is_nullable: false, is_primary_key: true },
      { name: 'user_id', data_type: 'int8', is_nullable: false, is_primary_key: false, is_foreign_key: true, fk_references: { table: 'users', column: 'id' } },
      { name: 'user', data_type: 'varchar', is_nullable: true, is_primary_key: false },
      { name: 'created_at', data_type: 'timestamp', is_nullable: true, is_primary_key: false },
    ]},
    { name: 'transactions', columns: [
      { name: 'order_id', data_type: 'int8', is_nullable: false, is_primary_key: true },
      { name: 'order_id', data_type: 'int8', is_nullable: false, is_primary_key: false, is_foreign_key: true, fk_references: { table: 'orders', column: 'id' } },
    ]},
    { name: 'logs', columns: [
      { name: 'id', data_type: 'int8', is_nullable: false, is_primary_key: true },
      { name: 'created_at', data_type: 'timestamp', is_nullable: true, is_primary_key: false },
      { name: 'created_at', data_type: 'timestamp', is_nullable: true, is_primary_key: false },
    ]},
  ], []);

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

  const tabIcon = (type: TabType, isActive: boolean) => {
    const cls = `w-[14px] h-[14px] shrink-0 ${isActive ? 'text-accent' : 'text-text/30'}`;
    switch (type) {
      case 'browser': return <TableIcon className={cls} />;
      case 'query': case 'console': return <Terminal className={cls} />;
      case 'staging': return <GitBranch className={cls} />;
      case 'structure': return <Layers className={cls} />;
      case 'erd': return <Network className={cls} />;
      case 'health': return <Activity className={cls} />;
      default: return <TableIcon className={cls} />;
    }
  };

  return (
    <div className="flex h-screen w-screen font-sans relative select-none bg-base text-text">
      {/* === LEFT SIDEBAR === */}
      <Sidebar
        connections={connections}
        activeConnection={activeConnection}
        tables={tables}
        onSelectConnection={(conn) => setActiveConnection(conn)}
        onSelectTable={handleOpenTableTab}
        onOpenNewConnectionModal={() => setIsConnModalOpen(true)}
        currentProjectPath={currentProjectPath}
      />

      {/* === MAIN CONTENT === */}
      <main className="flex-1 flex flex-col h-full bg-transparent z-10 min-w-0">
        {/* TOP BAR with AI Agent */}
        <div className="h-10 bg-surface border-b border-border flex items-center px-3 justify-between shrink-0">
          {/* Left: user avatar placeholder */}
          <div className="w-6" />
          
          {/* Center: AI Agent Bar */}
          <AiAgentBar
            schema={aiSchema}
            activeTable={activeTab.tableName}
            lastQueries={queryHistory.slice(0, 3).map(q => q.sql)}
            dbType={activeConnection?.db_type || 'postgres'}
            onExecuteQuery={(sql) => {
              handleOpenNewQueryTab();
              handleRunQueryWithSafeMode(sql);
            }}
            aiConfig={aiConfig}
          />

          {/* Right: Settings icon */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="text-textMuted hover:text-text transition-colors p-1.5 rounded-lg hover:bg-surface2"
            title="Preferences & Settings (Cmd+,)"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>

        {/* TAB BAR */}
        <div className="h-9 bg-surface border-b border-border flex items-center px-2 space-x-0.5 select-none shrink-0 overflow-x-auto no-scrollbar">
          {tabs.map(tab => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                className={`group flex items-center space-x-1.5 px-3 py-1 rounded-md text-[12px] font-medium cursor-pointer transition-all min-w-[80px] shrink-0 ${
                  isActive ? 'bg-accent/15 text-accent border-b-2 border-accent' : 'text-textMuted hover:text-text hover:bg-surface2/50'
                }`}
              >
                {tabIcon(tab.type, isActive)}
                <span className="truncate max-w-[120px]">{tab.title}</span>
                {tab.type === 'staging' && stagedChanges.length > 0 && (
                  <span className="ml-1 text-[10px] bg-warning text-base px-1.5 py-0.5 rounded-full font-bold min-w-[18px] text-center">
                    {stagedChanges.length}
                  </span>
                )}
                {isActive && <X className="w-3 h-3 ml-1 opacity-0 group-hover:opacity-100 text-textMuted hover:text-text cursor-pointer shrink-0" onClick={(e) => handleCloseTab(tab.id, e)} />}
              </div>
            );
          })}
          <button onClick={handleOpenNewQueryTab} className="p-1 rounded text-text/40 hover:text-text hover:bg-surface2/50 transition-all ml-1 shrink-0">
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Browser sub-bar */}
        {activeTab.type === 'browser' && (
          <div className="h-8 bg-surface border-b border-border px-3 flex items-center justify-between text-xs shrink-0">
            <div className="flex items-center space-x-1.5 text-textMuted">
              <TableIcon className="w-3.5 h-3.5 text-accent" />
              <strong className="text-text font-semibold">{activeTab.tableName}</strong>
            </div>
            <div className="flex items-center space-x-2">
              <button className="px-2 py-0.5 rounded bg-accent/20 text-accent text-[11px] font-medium">Activ.</button>
              <button className="px-2 py-0.5 rounded text-textMuted text-[11px] hover:bg-surface2">Clear ∨</button>
            </div>
          </div>
        )}

        {/* === WORKSPACE CONTENT === */}
        <div className="flex-1 overflow-hidden relative flex">
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            {activeTab.type === 'browser' ? (
              <>
                <FilterBar columns={columns} onApplyFilter={(w, s) => { setFilterWhere(w); setFilterSort(s); }} onClearFilter={() => { setFilterWhere(''); setFilterSort(''); }} />
                <TableGrid
                  tableName={activeTab.tableName || 'products'}
                  columns={columns}
                  rows={displayRows}
                  pkInfo={pkInfo}
                  stagedEdits={stagedEdits}
                  onStageEdit={handleStageEdit}
                  onApplyEdits={() => setActiveTabId('tab-staging')}
                  onResetEdits={() => setStagedEdits([])}
                  currentPage={currentPage}
                  onPageChange={setCurrentPage}
                  isLoading={false}
                />
              </>
            ) : activeTab.type === 'query' || activeTab.type === 'console' ? (
              <SqlEditor
                initialSql={activeTab.sql}
                onRunQuery={handleRunQueryWithSafeMode}
                queryResult={queryResult}
                isLoading={false}
                onSaveQuery={(name, sql) => {
                  setSavedQueries(prev => [...prev, { id: `sq-${Date.now()}`, name, sql_content: sql, project_path: currentProjectPath, created_at: new Date().toISOString() }]);
                }}
              />
            ) : activeTab.type === 'staging' ? (
              <StagingCommit
                stagedChanges={stagedChanges}
                onToggleChange={(id) => setStagedChanges(prev => prev.map(c => c.id === id ? { ...c, checked: !c.checked } : c))}
                onToggleAll={(checked) => setStagedChanges(prev => prev.map(c => ({ ...c, checked })))}
                onCommit={(msg) => {
                  // Apply all checked changes
                  setStagedChanges(prev => prev.filter(c => !c.checked));
                  setStagedEdits([]);
                }}
                onDiscard={(id) => setStagedChanges(prev => prev.filter(c => c.id !== id))}
              />
            ) : activeTab.type === 'structure' ? (
              <StructureView
                tableName={activeTab.tableName || 'products'}
                columns={columns}
                onAddColumn={(name, type) => setColumns(prev => [...prev, { name, data_type: type, is_nullable: true, is_primary_key: false }])}
                onDropColumn={(name) => setColumns(prev => prev.filter(c => c.name !== name))}
              />
            ) : activeTab.type === 'erd' ? (
              <SchemaVisualizer tables={erdTables} onSelectTable={handleOpenTableTab} />
            ) : activeTab.type === 'health' ? (
              <HealthGrid connectionId={activeConnection?.id || ''} dbType={activeConnection?.db_type || 'postgres'} />
            ) : null}
          </div>
        </div>

        {/* FOOTER STATUS BAR */}
        <footer className="h-7 bg-[#0A0A0B] px-3 flex items-center justify-between text-[11px] text-textMuted select-none shrink-0 z-20 border-t border-border/30">
          <div className="flex items-center space-x-3">
            {safeModeEnabled && (
              <span className="flex items-center space-x-1 text-accent">
                <Shield className="w-3 h-3" />
                <span className="text-[10px]">Safe Mode</span>
              </span>
            )}
          </div>

          <div className="flex items-center space-x-3">
            {/* Uncommitted Changes Badge */}
            {stagedChanges.length > 0 && (
              <button
                onClick={() => setActiveTabId('tab-staging')}
                className="flex items-center space-x-1.5 bg-warning/15 text-warning px-2 py-0.5 rounded-full text-[11px] font-medium hover:bg-warning/25 transition-colors"
              >
                <span className="w-2 h-2 bg-warning rounded-full animate-pulse" />
                <span>{stagedChanges.length} Uncommitted Changes</span>
              </button>
            )}
            
            <button
              onClick={() => setActiveTabId('tab-staging')}
              className="px-2.5 py-0.5 rounded bg-surface2 hover:bg-surface2/80 text-text text-[11px] transition-colors"
            >
              Commit Diff...
            </button>

            {/* Connection Status */}
            <span className="flex items-center space-x-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${activeConnection?.is_connected ? 'bg-success' : 'bg-error'}`} />
              <span className="text-text font-medium">Connected: {activeConnection?.database || 'Disconnected'}</span>
              <span className="text-textMuted">{queryHistory.length > 0 ? `${queryHistory[0].executionTimeMs}ms` : '9ms'}</span>
            </span>
          </div>
        </footer>
      </main>

      {/* === INLINE JSON POPUP === */}
      {jsonPopup && (
        <InlineJsonPopup data={jsonPopup.data} anchorRect={jsonPopup.rect} onClose={() => setJsonPopup(null)} />
      )}

      {/* === CONTEXT MENU === */}
      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} actions={contextMenu.actions} onClose={() => setContextMenu(null)} />
      )}

      {/* === MODALS === */}
      <ConnectionModal isOpen={isConnModalOpen} onClose={() => setIsConnModalOpen(false)} onSave={(connData) => {
        const newConn: ConnectionConfig = { ...connData, id: `conn-${Date.now()}`, is_connected: true };
        setConnections(prev => [...prev, newConn]);
        setActiveConnection(newConn);
      }} />

      <SafeModeModal isOpen={isSafeModeModalOpen} onClose={() => setIsSafeModeModalOpen(false)} sql={pendingDestructiveSql} warningMessage={safeModeWarning} onConfirmExecute={() => executeSqlQuery(pendingDestructiveSql)} />

      <ExportModal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} tableName={activeTab.tableName || 'products'} onExport={handleExportData} />

      <ImportModal isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)} onImportSuccess={(file, count) => executeSqlQuery(`-- Imported ${count} rows from ${file}`)} />

      {/* Settings & Preferences Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        aiConfig={aiConfig}
        onAiConfigChange={handleAiConfigChange}
        generalSettings={generalSettings}
        onGeneralSettingsChange={handleGeneralSettingsChange}
      />
    </div>
  );
};
