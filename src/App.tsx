import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { TableGrid } from './components/TableGrid';
import { SqlEditor } from './components/SqlEditor';
import { SavedQueries } from './components/SavedQueries';
import { ConnectionModal } from './components/ConnectionModal';
import { WelcomePage } from './components/WelcomePage';
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
import { NoSqlInspector } from './components/NoSqlInspector';
import { ExplainVisualizer } from './components/ExplainVisualizer';
import { RoutinesManager } from './components/RoutinesManager';
import { RolesManager } from './components/RolesManager';
import { VisualQueryBuilder } from './components/VisualQueryBuilder';
import { MockDataGenerator } from './components/MockDataGenerator';
import {
  ConnectionConfig,
  DbKind,
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
  Database, Cpu,
} from 'lucide-react';
import { Tooltip } from './components/Tooltip';
import {
  connectDatabase,
  getDatabaseTables,
  getTableColumns,
  getPkAnalysis,
  runSqlQuery,
} from './services/tauriBridge';

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

  // === WELCOME PAGE STATE ===
  const [showWelcome, setShowWelcome] = useState<boolean>(() => {
    const saved = localStorage.getItem('devdash_show_welcome');
    // Show welcome by default; only skip if user was previously connected
    return saved !== 'false';
  });

  const [selectedDbKind, setSelectedDbKind] = useState<DbKind | undefined>(undefined);

  // === CONNECTIONS (PERSISTED) ===
  const [connections, setConnections] = useState<ConnectionConfig[]>(() => {
    const saved = localStorage.getItem('devdash_connections');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Strictly purge demo connections
          return parsed.filter((c: any) =>
            c.id !== 'conn-1' && c.id !== 'conn-2' && c.id !== 'conn-3' &&
            c.name !== 'production_db_app_main' && c.name !== 'local_test_db' &&
            c.name !== 'staging_cache' && c.name !== 'POSTGRES Connection'
          );
        }
      } catch {}
    }
    return [];
  });
  const [activeConnection, setActiveConnection] = useState<ConnectionConfig | null>(null);

  // Recent connection IDs (persisted)
  const [recentConnectionIds, setRecentConnectionIds] = useState<string[]>(() => {
    const saved = localStorage.getItem('devdash_recent_connections');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem('devdash_connections', JSON.stringify(connections));
  }, [connections]);

  useEffect(() => {
    localStorage.setItem('devdash_recent_connections', JSON.stringify(recentConnectionIds));
  }, [recentConnectionIds]);

  useEffect(() => {
    localStorage.setItem('devdash_show_welcome', String(showWelcome));
  }, [showWelcome]);

  // Welcome page handlers
  const handleWelcomeConnect = useCallback(async (conn: ConnectionConfig) => {
    setActiveConnection(conn);
    setShowWelcome(false);
    // Track recent connections (most recent first, max 10)
    setRecentConnectionIds(prev => {
      const filtered = prev.filter(id => id !== conn.id);
      return [conn.id, ...filtered].slice(0, 10);
    });

    try {
      await connectDatabase(conn);
      const fetchedTables = await getDatabaseTables(conn.id, conn.db_type);
      if (fetchedTables && fetchedTables.length > 0) {
        setTables(fetchedTables);
      }
    } catch (err) {
      console.warn('Failed to connect to database or fetch tables:', err);
    }
  }, []);

  const handleDeleteConnection = useCallback((id: string) => {
    setConnections(prev => prev.filter(c => c.id !== id));
    setRecentConnectionIds(prev => prev.filter(cid => cid !== id));
    if (activeConnection?.id === id) {
      setActiveConnection(null);
      setShowWelcome(true);
    }
  }, [activeConnection]);

  const handleDuplicateConnection = useCallback((conn: ConnectionConfig) => {
    const duplicate: ConnectionConfig = {
      ...conn,
      id: `conn-${Date.now()}`,
      name: `${conn.name} (copy)`,
      is_connected: false,
    };
    setConnections(prev => [...prev, duplicate]);
  }, []);

  const handleImportConnections = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        const imported = Array.isArray(data) ? data : [data];
        const newConns: ConnectionConfig[] = imported.map((c: any, i: number) => ({
          id: `conn-import-${Date.now()}-${i}`,
          name: c.name || `Imported Connection ${i + 1}`,
          db_type: c.db_type || 'postgres',
          host: c.host || 'localhost',
          port: c.port || 5432,
          user: c.user || '',
          database: c.database || '',
          is_connected: false,
        }));
        setConnections(prev => [...prev, ...newConns]);
      } catch {
        console.error('Failed to parse connection file');
      }
    };
    reader.readAsText(file);
  }, []);

  // Ctrl+N shortcut to open new connection from welcome page
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n' && showWelcome) {
        e.preventDefault();
        setIsConnModalOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showWelcome]);

  // === TABLES (populated from actual DB connection) ===
  const [tables, setTables] = useState<TableItem[]>([]);

  // === COLUMNS (populated from selected table) ===
  const [columns, setColumns] = useState<ColumnItem[]>([]);

  // === ROWS (populated from query results) ===
  const [rows, setRows] = useState<any[]>([]);

  const [pkInfo, setPkInfo] = useState<PkInfo>({ has_single_pk: true, pk_column_name: 'id', is_read_only: false });

  // === WORKSPACE TABS (PERSISTED) ===
  const [tabs, setTabs] = useState<WorkspaceTab[]>(() => {
    const saved = localStorage.getItem('devdash_workspace_tabs');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {}
    }
    return [
      { id: 'tab-query', title: 'Query Editor', type: 'query', sql: '-- Write your SQL query here\n' },
      { id: 'tab-staging', title: 'Staging & Commit', type: 'staging' },
    ];
  });

  const [activeTabId, setActiveTabId] = useState<string>(() => {
    const saved = localStorage.getItem('devdash_active_tab_id');
    if (saved && tabs.some(t => t.id === saved)) return saved;
    return tabs[0]?.id || 'tab-browser';
  });

  useEffect(() => {
    localStorage.setItem('devdash_workspace_tabs', JSON.stringify(tabs));
  }, [tabs]);

  useEffect(() => {
    localStorage.setItem('devdash_active_tab_id', activeTabId);
  }, [activeTabId]);

  // === STAGED CHANGES (PERSISTED) ===
  const [stagedChanges, setStagedChanges] = useState<StagedChange[]>(() => {
    const saved = localStorage.getItem('devdash_staged_changes');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem('devdash_staged_changes', JSON.stringify(stagedChanges));
  }, [stagedChanges]);

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
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);

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
  const executeSqlQuery = useCallback(async (sql: string) => {
    const connId = activeConnection?.id || 'default';
    try {
      const payload = await runSqlQuery(connId, sql);
      setQueryResult(payload);
      
      // Convert rows payload to objects if column descriptors match
      if (payload.columns && payload.rows) {
        const objRows = payload.rows.map(r => {
          const obj: Record<string, any> = {};
          payload.columns.forEach((col, idx) => {
            obj[col.name] = r[idx];
          });
          return obj;
        });
        setRows(objRows);
      }

      setQueryHistory(prev => [{
        id: `qh-${Date.now()}`,
        sql,
        connectionName: activeConnection?.name || '',
        engine: activeConnection?.db_type || '',
        timestamp: new Date().toISOString(),
        executionTimeMs: payload.execution_time_ms,
        rowCount: payload.rows?.length || payload.affected_rows || 0,
        status: 'success',
      }, ...prev]);
    } catch (err: any) {
      console.error('Query execution error:', err);
      setQueryHistory(prev => [{
        id: `qh-${Date.now()}`,
        sql,
        connectionName: activeConnection?.name || '',
        engine: activeConnection?.db_type || '',
        timestamp: new Date().toISOString(),
        executionTimeMs: 0,
        rowCount: 0,
        status: 'error',
      }, ...prev]);
    }
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

  const handleOpenTableTab = useCallback(async (tableName: string) => {
    const existing = tabs.find(t => t.tableName === tableName && t.type === 'browser');
    if (existing) { setActiveTabId(existing.id); }
    else {
      const newId = `tab-${Date.now()}`;
      setTabs(prev => [...prev, { id: newId, title: `Browser (${tableName})`, type: 'browser', tableName }]);
      setActiveTabId(newId);
    }

    if (activeConnection) {
      try {
        const [fetchedCols, fetchedPk] = await Promise.all([
          getTableColumns(activeConnection.id, activeConnection.db_type, tableName),
          getPkAnalysis(activeConnection.id, activeConnection.db_type, tableName),
        ]);
        if (fetchedCols && fetchedCols.length > 0) setColumns(fetchedCols);
        if (fetchedPk) setPkInfo(fetchedPk);
        
        // Execute SELECT query to retrieve live table rows
        executeSqlQuery(`SELECT * FROM ${tableName} LIMIT 1000;`);
      } catch (err) {
        console.warn('Failed to load table details/rows:', err);
      }
    }
  }, [tabs, activeConnection, executeSqlQuery]);

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

  const handleExportData = useCallback((format: 'csv' | 'json' | 'sql' | 'jsonl' | 'markdown' | 'parquet') => {
    let content = '';
    if (format === 'csv') {
      const headers = columns.map(c => c.name).join(',');
      const rowStrs = rows.map(r => columns.map(c => String(r[c.name] ?? '')).join(',')).join('\n');
      content = `${headers}\n${rowStrs}`;
    } else if (format === 'json') {
      content = JSON.stringify(rows, null, 2);
    } else if (format === 'jsonl') {
      content = rows.map(r => JSON.stringify(r)).join('\n');
    } else if (format === 'markdown') {
      const headers = `| ${columns.map(c => c.name).join(' | ')} |`;
      const separator = `| ${columns.map(() => '---').join(' | ')} |`;
      const rowStrs = rows.map(r => `| ${columns.map(c => String(r[c.name] ?? '')).join(' | ')} |`).join('\n');
      content = `${headers}\n${separator}\n${rowStrs}`;
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
      case 'nosql': return <Database className={cls} />;
      case 'explain': return <Cpu className={cls} />;
      case 'routines': return <Wand2 className={cls} />;
      case 'roles': return <Shield className={cls} />;
      case 'builder': return <Wand2 className={cls} />;
      case 'mockseed': return <Sparkles className={cls} />;
      default: return <TableIcon className={cls} />;
    }
  };

  // === WELCOME PAGE ===
  if (showWelcome) {
    return (
      <div className="flex h-screen w-screen font-sans relative select-none bg-base text-text">
        <WelcomePage
          connections={connections}
          onConnect={handleWelcomeConnect}
          onNewConnection={(kind) => {
            setSelectedDbKind(kind);
            setIsConnModalOpen(true);
          }}
          onDeleteConnection={handleDeleteConnection}
          onDuplicateConnection={handleDuplicateConnection}
          onImportConnections={handleImportConnections}
          onOpenSettings={() => setIsSettingsOpen(true)}
          recentConnectionIds={recentConnectionIds}
        />

        {/* Connection Modal available from Welcome page */}
        <ConnectionModal
          isOpen={isConnModalOpen}
          initialDbKind={selectedDbKind}
          onClose={() => setIsConnModalOpen(false)}
          onSave={(connData) => {
            const newConn: ConnectionConfig = { ...connData, id: `conn-${Date.now()}`, is_connected: true };
            setConnections(prev => [...prev, newConn]);
            handleWelcomeConnect(newConn);
          }}
        />

        {/* Settings Modal available from Welcome page */}
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
  }

  return (
    <div className="flex h-screen w-screen font-sans relative select-none bg-base text-text">
      {/* === LEFT SIDEBAR === */}
      <Sidebar
        connections={connections}
        activeConnection={activeConnection}
        tables={tables}
        onSelectConnection={(conn) => setActiveConnection(conn)}
        onSelectTable={handleOpenTableTab}
        onOpenNewConnectionModal={() => {
          setSelectedDbKind(undefined);
          setIsConnModalOpen(true);
        }}
        onDisconnect={() => { setActiveConnection(null); setShowWelcome(true); }}
        onDeleteConnection={handleDeleteConnection}
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
            ) : activeTab.type === 'nosql' ? (
              <NoSqlInspector connectionId={activeConnection?.id || ''} dbType={(activeConnection?.db_type as 'redis' | 'mongodb') || 'redis'} />
            ) : activeTab.type === 'explain' ? (
              <ExplainVisualizer connectionId={activeConnection?.id || ''} dbType={activeConnection?.db_type || 'postgres'} />
            ) : activeTab.type === 'routines' ? (
              <RoutinesManager connectionId={activeConnection?.id || ''} dbType={activeConnection?.db_type || 'postgres'} />
            ) : activeTab.type === 'roles' ? (
              <RolesManager connectionId={activeConnection?.id || ''} dbType={activeConnection?.db_type || 'postgres'} />
            ) : activeTab.type === 'builder' ? (
              <VisualQueryBuilder
                tables={tables}
                columns={columns}
                activeTable={activeTab.tableName}
                onExecuteQuery={(sql) => {
                  handleOpenNewQueryTab();
                  handleRunQueryWithSafeMode(sql);
                }}
              />
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
      <ConnectionModal
        isOpen={isConnModalOpen}
        initialDbKind={selectedDbKind}
        onClose={() => setIsConnModalOpen(false)}
        onSave={(connData) => {
          const newConn: ConnectionConfig = { ...connData, id: `conn-${Date.now()}`, is_connected: true };
          setConnections(prev => [...prev, newConn]);
          setActiveConnection(newConn);
        }}
      />

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
