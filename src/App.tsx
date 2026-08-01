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
import { AuditLoggerModal } from './components/AuditLoggerModal';
import { SchemaDiffModal } from './components/SchemaDiffModal';
import { PiiMaskingConfig } from './components/PiiMaskingConfig';
import { SecureShareModal } from './components/SecureShareModal';
import { SecureImportModal } from './components/SecureImportModal';
import { useIsMobile } from './hooks/useMediaQuery';
import { MobileViewport } from './components/mobile/MobileViewport';
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
  Database, Cpu, Share2,
} from 'lucide-react';
import { Tooltip } from './components/Tooltip';
import {
  connectDatabase,
  disconnectDatabase,
  getDatabaseTables,
  getTableColumns,
  getPkAnalysis,
  runSqlQuery,
  saveDbPassword,
  getDbPassword,
  checkSqlSafety,
  commitStagedRowEdits,
  structureAddColumn,
  structureDropColumn,
  isEngineSupported,
  EngineDialect,
} from './services/tauriBridge';

export const App: React.FC = () => {
  const currentProjectPath = 'local';
  const isMobile = useIsMobile();

  // === SETTINGS STATE ===
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [generalSettings, setGeneralSettings] = useState<GeneralSettings>(() => {
    const saved = localStorage.getItem('devdash_general_settings');
    if (saved) {
      try { return JSON.parse(saved); } catch { }
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
      try {
        const parsed = JSON.parse(saved);
        // Strip any legacy plaintext keys from localStorage immediately
        if (parsed.apiKey && parsed.apiKey !== '__KEYCHAIN__' && parsed.apiKey !== '') {
          localStorage.setItem(
            'devdash_ai_config',
            JSON.stringify({ ...parsed, apiKey: '__KEYCHAIN__' })
          );
        }
        return { ...parsed, apiKey: '' };
      } catch { /* fall through */ }
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

  const handleAiConfigChange = async (newConfig: AiConfig) => {
    // Never persist API keys in localStorage — store in OS keychain when available
    const { apiKey, ...rest } = newConfig;
    const safeForStorage = { ...rest, apiKey: apiKey ? '__KEYCHAIN__' : '' };
    setAiConfig(newConfig);
    localStorage.setItem('devdash_ai_config', JSON.stringify(safeForStorage));
    if (apiKey && apiKey !== '__KEYCHAIN__') {
      try {
        const { saveSecret } = await import('./services/tauriBridge');
        await saveSecret('ai_api_key', apiKey);
      } catch (err) {
        console.warn('Failed to store AI API key in keychain:', err);
      }
    }
  };

  // Hydrate AI API key from keychain on mount
  useEffect(() => {
    (async () => {
      try {
        const { getSecret } = await import('./services/tauriBridge');
        const key = await getSecret('ai_api_key');
        if (key) {
          setAiConfig((prev) => ({ ...prev, apiKey: key }));
        }
      } catch {
        /* browser mode or missing key */
      }
    })();
  }, []);

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
    const defaultTestDb: ConnectionConfig = {
      id: 'conn-test-db',
      name: 'DevDash Test DB (SQLite)',
      db_type: 'sqlite',
      host: 'localhost',
      port: 0,
      user: 'local',
      database: 'e:\\devdash\\devdash_test.db',
      is_connected: false,
    };
    const saved = localStorage.getItem('devdash_connections');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const clean = parsed.filter((c: any) =>
            c.id !== 'conn-1' && c.id !== 'conn-2' && c.id !== 'conn-3' &&
            c.name !== 'production_db_app_main' && c.name !== 'local_test_db' &&
            c.name !== 'staging_cache' && c.name !== 'POSTGRES Connection'
          );
          if (!clean.some((c: any) => c.id === 'conn-test-db')) {
            return [defaultTestDb, ...clean];
          }
          return clean;
        }
      } catch { }
    }
    return [defaultTestDb];
  });
  const [activeConnection, setActiveConnection] = useState<ConnectionConfig | null>(null);

  // Recent connection IDs (persisted)
  const [recentConnectionIds, setRecentConnectionIds] = useState<string[]>(() => {
    const saved = localStorage.getItem('devdash_recent_connections');
    if (saved) {
      try { return JSON.parse(saved); } catch { }
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
  const handleWelcomeConnect = useCallback(async (conn: ConnectionConfig, password?: string) => {
    if (!isEngineSupported(conn.db_type)) {
      alert(
        `Engine "${conn.db_type}" is not supported by the backend yet.\n\nSupported: PostgreSQL, MySQL/MariaDB, SQLite, CockroachDB, Redshift.`
      );
      return;
    }

    // Drop previous pool when switching connections (avoid leaking remote sessions)
    if (activeConnection?.id && activeConnection.id !== conn.id) {
      await disconnectDatabase(activeConnection.id);
    }

    setActiveConnection({ ...conn, is_connected: false });
    setShowWelcome(false);
    // Track recent connections (most recent first, max 10)
    setRecentConnectionIds(prev => {
      const filtered = prev.filter(id => id !== conn.id);
      return [conn.id, ...filtered].slice(0, 10);
    });

    try {
      let pwd = password;
      if (pwd === undefined || pwd === '') {
        pwd = (await getDbPassword(conn.id)) || undefined;
      }
      await connectDatabase(conn, pwd);
      setActiveConnection({ ...conn, is_connected: true });
      const fetchedTables = await getDatabaseTables(conn.id, conn.db_type);
      setTables(fetchedTables || []);
    } catch (err) {
      console.warn('Failed to connect to database or fetch tables:', err);
      setActiveConnection({ ...conn, is_connected: false });
      alert(`Connection failed: ${String(err)}`);
    }
  }, [activeConnection?.id]);

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
      } catch { }
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

  // Auto-fetch tables when activeConnection is set but tables list is empty
  useEffect(() => {
    if (activeConnection?.id && tables.length === 0) {
      (async () => {
        try {
          const list = await getDatabaseTables(activeConnection.id, activeConnection.db_type);
          if (list && list.length > 0) {
            setTables(list);
          }
        } catch { /* ignore */ }
      })();
    }
  }, [activeConnection?.id, activeConnection?.db_type, tables.length]);

  // === STAGED CHANGES (PERSISTED) ===
  const [stagedChanges, setStagedChanges] = useState<StagedChange[]>(() => {
    const saved = localStorage.getItem('devdash_staged_changes');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Clean legacy mock items so staging tab starts empty unless real edits are staged
          const clean = parsed.filter(
            (c: any) =>
              !c.diffDescription?.includes('$25') &&
              !c.diffDescription?.includes('$24.99') &&
              !c.diffDescription?.includes('stock: 48') &&
              !c.diffDescription?.includes('$60') &&
              !c.diffDescription?.includes('$10')
          );
          return clean;
        }
      } catch { }
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
  const [isSecureShareModalOpen, setIsSecureShareModalOpen] = useState(false);
  const [isSecureImportModalOpen, setIsSecureImportModalOpen] = useState(false);
  const [shareTargetConnId, setShareTargetConnId] = useState<string | undefined>(undefined);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [isSchemaDiffModalOpen, setIsSchemaDiffModalOpen] = useState(false);
  const [isPiiConfigModalOpen, setIsPiiConfigModalOpen] = useState(false);
  const [piiRules, setPiiRules] = useState(() => {
    const saved = localStorage.getItem('devdash_pii_rules');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch { /* fall through */ }
    }
    return [
      { id: 'pii-1', fieldPattern: 'ssn', maskType: 'LAST_FOUR' as const, enabled: true },
      { id: 'pii-2', fieldPattern: 'credit_card', maskType: 'LAST_FOUR' as const, enabled: true },
      { id: 'pii-3', fieldPattern: 'password', maskType: 'FULL' as const, enabled: true },
      { id: 'pii-4', fieldPattern: 'email', maskType: 'PARTIAL_EMAIL' as const, enabled: false },
      { id: 'pii-5', fieldPattern: 'phone', maskType: 'LAST_FOUR' as const, enabled: true },
    ];
  });

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

      // Convert rows payload to objects and sync columns state
      if (payload.columns && payload.rows) {
        const mappedCols: ColumnItem[] = payload.columns.map((col: any) => ({
          name: col.name,
          data_type: col.type_name || col.data_type || 'TEXT',
          is_nullable: true,
          is_primary_key: col.name === 'id',
        }));
        setColumns(mappedCols);

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

  const handleRunQueryWithSafeMode = useCallback(async (sql: string) => {
    if (!safeModeEnabled) {
      executeSqlQuery(sql);
      return;
    }
    try {
      const analysis = await checkSqlSafety(sql);
      if (analysis.requires_confirmation || analysis.is_destructive) {
        setPendingDestructiveSql(sql);
        setSafeModeWarning(
          analysis.warning_message || 'Destructive operation detected. Confirm to continue.'
        );
        setIsSafeModeModalOpen(true);
      } else {
        executeSqlQuery(sql);
      }
    } catch {
      // Fall back to local heuristic if backend unavailable
      const upper = sql.trim().toUpperCase();
      const isDestructive =
        upper.startsWith('DROP') ||
        upper.startsWith('TRUNCATE') ||
        (upper.startsWith('DELETE') && !upper.includes('WHERE')) ||
        (upper.startsWith('UPDATE') && !upper.includes('WHERE'));
      if (isDestructive) {
        setPendingDestructiveSql(sql);
        setSafeModeWarning('Destructive operation detected. Confirm to continue.');
        setIsSafeModeModalOpen(true);
      } else {
        executeSqlQuery(sql);
      }
    }
  }, [safeModeEnabled, executeSqlQuery]);

  const mapEngineDialect = useCallback((dbType?: string): EngineDialect => {
    const t = (dbType || 'postgres').toLowerCase();
    if (t === 'mysql' || t === 'mariadb') return 'mysql';
    if (t === 'sqlite') return 'sqlite';
    return 'postgres';
  }, []);

  const handleCommitStaged = useCallback(async (_message: string) => {
    if (!activeConnection) {
      alert('No active connection to commit against.');
      return;
    }
    const checked = stagedChanges.filter((c) => c.checked && c.changeType === 'update');
    if (checked.length === 0) {
      setStagedChanges((prev) => prev.filter((c) => !c.checked));
      setStagedEdits([]);
      return;
    }

    const currentTab = tabs.find((t) => t.id === activeTabId);

    // Group by table
    const byTable = new Map<string, typeof checked>();
    for (const change of checked) {
      const list = byTable.get(change.tableName) || [];
      list.push(change);
      byTable.set(change.tableName, list);
    }

    try {
      for (const [tableName, changes] of byTable) {
        // Resolve PK column from current pkInfo when matching table, else 'id'
        const pkColumn =
          (currentTab?.tableName === tableName && pkInfo.pk_column_name) ||
          pkInfo.pk_column_name ||
          'id';

        // Collapse cell-level staged changes into row edits
        const rowMap = new Map<string | number, { pk: string | number; changes: { column_name: string; new_value: unknown }[] }>();
        for (const c of changes) {
          const matchingEdit = stagedEdits.find(
            (e) => e.rowId === c.rowId && e.columnName === c.columnName
          );
          const entry = rowMap.get(c.rowId) || { pk: c.rowId, changes: [] };
          entry.changes.push({
            column_name: c.columnName || c.identifier,
            new_value: matchingEdit?.newValue ?? null,
          });
          rowMap.set(c.rowId, entry);
        }

        const edits = Array.from(rowMap.values()).map((r) => ({
          pk_value: r.pk,
          changes: r.changes,
        }));

        await commitStagedRowEdits(activeConnection.id, tableName, pkColumn, edits);
      }

      setStagedChanges((prev) => prev.filter((c) => !c.checked));
      setStagedEdits([]);

      // Refresh active browser table if open
      if (currentTab?.type === 'browser' && currentTab.tableName) {
        executeSqlQuery(`SELECT * FROM ${currentTab.tableName} LIMIT 1000;`);
      }
    } catch (err) {
      alert(`Failed to commit staged edits: ${String(err)}`);
    }
  }, [activeConnection, stagedChanges, stagedEdits, pkInfo, tabs, activeTabId, executeSqlQuery]);

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

  // Auto-fetch columns and rows when active browser tab changes or reloads
  useEffect(() => {
    const currentTab = tabs.find((t) => t.id === activeTabId);
    if (currentTab?.type === 'browser' && currentTab?.tableName && activeConnection) {
      (async () => {
        try {
          const [fetchedCols, fetchedPk] = await Promise.all([
            getTableColumns(activeConnection.id, activeConnection.db_type, currentTab.tableName!),
            getPkAnalysis(activeConnection.id, activeConnection.db_type, currentTab.tableName!),
          ]);
          if (fetchedCols && fetchedCols.length > 0) setColumns(fetchedCols);
          if (fetchedPk) setPkInfo(fetchedPk);
          executeSqlQuery(`SELECT * FROM ${currentTab.tableName} LIMIT 1000;`);
        } catch { /* ignore */ }
      })();
    }
  }, [activeTabId, activeConnection?.id]);

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
      const tbl = tabs.find((t) => t.id === activeTabId)?.tableName || 'exported_table';
      content = rows
        .map((r) => {
          const vals = columns.map((c) =>
            typeof r[c.name] === 'string'
              ? `'${String(r[c.name]).replace(/'/g, "''")}'`
              : r[c.name] === null || r[c.name] === undefined
                ? 'NULL'
                : String(r[c.name])
          );
          return `INSERT INTO ${tbl} (${columns.map((c) => c.name).join(', ')}) VALUES (${vals.join(', ')});`;
        })
        .join('\n');
    }
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const activeTab = tabs.find(t => t.id === activeTabId);
    a.download = `${activeTab?.tableName || 'export'}_${Date.now()}.${format}`;
    a.click();
  }, [columns, rows, tabs, activeTabId]);

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

  // Schema for AI agent — include columns only for the currently inspected table
  // (full multi-table schema map would require per-table introspection cache)
  const aiSchema = useMemo(() => ({
    tables: tables.map(t => ({
      name: t.name,
      columns: activeTab?.tableName === t.name ? columns.map(c => c.name) : [],
    })),
  }), [tables, columns, activeTab?.tableName]);

  // ERD: use live tables + columns when available; otherwise table names only
  const erdTables = useMemo(() => {
    if (tables.length === 0) return [];
    return tables.map((t) => {
      if (activeTab?.tableName === t.name && columns.length > 0) {
        return { name: t.name, columns };
      }
      return {
        name: t.name,
        columns: [{ name: '(open table to load columns)', data_type: '', is_nullable: true, is_primary_key: false }],
      };
    });
  }, [tables, columns, activeTab?.tableName]);

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
          onSave={async (connData, password) => {
            if (!isEngineSupported(connData.db_type)) {
              alert(
                `Engine "${connData.db_type}" is not supported by the backend yet.\n\nSupported: PostgreSQL, MySQL/MariaDB, SQLite, CockroachDB, Redshift.`
              );
              return;
            }
            const newConn: ConnectionConfig = {
              ...connData,
              id: `conn-${Date.now()}`,
              is_connected: false,
            };
            if (password) {
              try {
                await saveDbPassword(newConn.id, password);
              } catch (err) {
                console.warn('Failed to store password in OS keychain:', err);
              }
            }
            setConnections((prev) => [...prev, newConn]);
            await handleWelcomeConnect(newConn, password);
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

  if (isMobile) {
    return (
      <MobileViewport
        connections={connections}
        activeConnection={activeConnection}
        tables={tables}
        stagedCount={stagedChanges.length}
        onSelectConnection={async (conn) => {
          await handleWelcomeConnect(conn);
        }}
        onSelectTable={handleOpenTableTab}
        onOpenNewConnectionModal={() => {
          setSelectedDbKind(undefined);
          setIsConnModalOpen(true);
        }}
        onShareConnection={(conn) => {
          setShareTargetConnId(conn.id);
          setIsSecureShareModalOpen(true);
        }}
        onOpenImportShared={() => setIsSecureImportModalOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      >
        {/* Essential Mobile Workspace View */}
        <div className="flex flex-col h-full overflow-hidden p-2 space-y-2">
          {/* Active Table Title / Quick Filter */}
          <div className="flex items-center justify-between px-2 py-1.5 bg-slate-900 border border-slate-800 rounded-lg shrink-0">
            <span className="text-xs font-semibold text-slate-200 truncate">
              {activeTab.tableName ? `Table: ${activeTab.tableName}` : activeTab.title}
            </span>
            <span className="text-[10px] text-indigo-400 font-mono px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20">
              {activeConnection?.db_type || 'sqlite'}
            </span>
          </div>

          {/* Virtual Data Grid / Query View */}
          <div className="flex-1 overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
            {activeTab.type === 'browser' ? (
              <TableGrid
                tableName={activeTab.tableName || 'users'}
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
                piiRules={piiRules}
              />
            ) : (
              <SqlEditor
                initialSql={activeTab.sql || ''}
                onRunQuery={handleRunQueryWithSafeMode}
                queryResult={queryResult}
                isLoading={false}
                onSaveQuery={(name, sql) => {
                  setSavedQueries((prev) => [
                    ...prev,
                    {
                      id: `sq-${Date.now()}`,
                      name,
                      sql_content: sql,
                      project_path: currentProjectPath,
                      created_at: new Date().toISOString(),
                    },
                  ]);
                }}
              />
            )}
          </div>
        </div>
      </MobileViewport>
    );
  }

  return (
    <div className="flex h-screen w-screen font-sans relative select-none bg-base text-text">
      {/* === LEFT SIDEBAR === */}
      <Sidebar
        connections={connections}
        activeConnection={activeConnection}
        tables={tables}
        onSelectConnection={async (conn) => {
          // Real reconnect — previous code only set React state
          await handleWelcomeConnect(conn);
        }}
        onSelectTable={handleOpenTableTab}
        onOpenNewConnectionModal={() => {
          setSelectedDbKind(undefined);
          setIsConnModalOpen(true);
        }}
        onDisconnect={() => { setActiveConnection(null); setShowWelcome(true); }}
        onDeleteConnection={handleDeleteConnection}
        onShareConnection={(conn) => {
          setShareTargetConnId(conn.id);
          setIsSecureShareModalOpen(true);
        }}
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

          {/* Right: Actions & Settings icons */}
          <div className="flex items-center space-x-1">
            <button
              onClick={() => {
                setShareTargetConnId(undefined);
                setIsSecureShareModalOpen(true);
              }}
              className="text-textMuted hover:text-text transition-colors p-1.5 rounded-lg hover:bg-surface2 flex items-center space-x-1 text-xs"
              title="Share Connections via Encrypted Text / QR Code"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Share</span>
            </button>

            <button
              onClick={() => setIsSecureImportModalOpen(true)}
              className="text-textMuted hover:text-text transition-colors p-1.5 rounded-lg hover:bg-surface2 flex items-center space-x-1 text-xs"
              title="Import Shared Connection Payload"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Import Shared</span>
            </button>

            <button
              onClick={() => setIsSettingsOpen(true)}
              className="text-textMuted hover:text-text transition-colors p-1.5 rounded-lg hover:bg-surface2"
              title="Preferences & Settings (Cmd+,)"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* TAB BAR */}
        <div className="h-9 bg-surface border-b border-border flex items-center px-2 space-x-0.5 select-none shrink-0 overflow-x-auto no-scrollbar">
          {tabs.map(tab => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                className={`group flex items-center space-x-1.5 px-3 py-1 rounded-md text-[12px] font-medium cursor-pointer transition-all min-w-[80px] shrink-0 ${isActive ? 'bg-accent/15 text-accent border-b-2 border-accent' : 'text-textMuted hover:text-text hover:bg-surface2/50'
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
            <div className="flex items-center space-x-1">
              <button
                onClick={() => {
                  const id = `tab-structure-${Date.now()}`;
                  setTabs((prev) => [
                    ...prev.filter((t) => t.type !== 'structure'),
                    { id, title: `Structure (${activeTab.tableName})`, type: 'structure', tableName: activeTab.tableName },
                  ]);
                  setActiveTabId(id);
                }}
                className="px-2 py-0.5 rounded text-textMuted text-[11px] hover:bg-surface2"
              >
                Structure
              </button>
              <button
                onClick={() => setIsImportModalOpen(true)}
                className="px-2 py-0.5 rounded text-textMuted text-[11px] hover:bg-surface2"
              >
                Import CSV
              </button>
              <button
                onClick={() => setIsExportModalOpen(true)}
                className="px-2 py-0.5 rounded text-textMuted text-[11px] hover:bg-surface2"
              >
                Export
              </button>
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
                  piiRules={piiRules}
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
                onCommit={handleCommitStaged}
                onDiscard={(id) => setStagedChanges(prev => prev.filter(c => c.id !== id))}
              />
            ) : activeTab.type === 'structure' ? (
              <StructureView
                tableName={activeTab.tableName || 'products'}
                columns={columns}
                onAddColumn={async (name, type) => {
                  if (!activeConnection || !activeTab.tableName) {
                    setColumns((prev) => [
                      ...prev,
                      { name, data_type: type, is_nullable: true, is_primary_key: false },
                    ]);
                    return;
                  }
                  try {
                    await structureAddColumn(
                      activeConnection.id,
                      activeTab.tableName,
                      name,
                      type,
                      mapEngineDialect(activeConnection.db_type)
                    );
                    const refreshed = await getTableColumns(
                      activeConnection.id,
                      activeConnection.db_type,
                      activeTab.tableName
                    );
                    setColumns(refreshed);
                  } catch (err) {
                    alert(`Failed to add column: ${String(err)}`);
                  }
                }}
                onDropColumn={async (name) => {
                  if (!activeConnection || !activeTab.tableName) {
                    setColumns((prev) => prev.filter((c) => c.name !== name));
                    return;
                  }
                  try {
                    await structureDropColumn(
                      activeConnection.id,
                      activeTab.tableName,
                      name,
                      mapEngineDialect(activeConnection.db_type)
                    );
                    setColumns((prev) => prev.filter((c) => c.name !== name));
                  } catch (err) {
                    alert(`Failed to drop column: ${String(err)}`);
                  }
                }}
              />
            ) : activeTab.type === 'erd' ? (
              <SchemaVisualizer tables={erdTables} onSelectTable={handleOpenTableTab} />
            ) : activeTab.type === 'health' ? (
              <HealthGrid connectionId={activeConnection?.id || ''} dbType={activeConnection?.db_type || 'postgres'} />
            ) : activeTab.type === 'nosql' ? (
              <div className="flex items-center justify-center h-full text-textMuted p-8">
                <div className="text-center space-y-2 max-w-md">
                  <p className="text-sm font-medium text-text">NoSQL inspector is a UI prototype only</p>
                  <p className="text-xs">
                    There is no Redis/MongoDB driver in the Rust backend. The previous demo used hardcoded sample keys/documents.
                    Use a real Redis/Mongo client until protocol drivers are implemented.
                  </p>
                </div>
              </div>
            ) : activeTab.type === 'explain' ? (
              <ExplainVisualizer
                connectionId={activeConnection?.id || ''}
                dbType={activeConnection?.db_type || 'postgres'}
                onRunExplain={(sql) => handleRunQueryWithSafeMode(sql)}
              />
            ) : activeTab.type === 'routines' ? (
              <div className="flex items-center justify-center h-full text-textMuted p-8">
                <div className="text-center space-y-2 max-w-md">
                  <p className="text-sm font-medium text-text">Routines manager is a UI prototype only</p>
                  <p className="text-xs">
                    Stored procedure / function introspection is not implemented in the backend.
                    Demo PL/pgSQL definitions were previously hard-coded in the frontend.
                  </p>
                </div>
              </div>
            ) : activeTab.type === 'roles' ? (
              <div className="flex items-center justify-center h-full text-textMuted p-8">
                <div className="text-center space-y-2 max-w-md">
                  <p className="text-sm font-medium text-text">Roles / privileges manager is a UI prototype only</p>
                  <p className="text-xs">
                    No GRANT/REVOKE catalog queries are implemented. Demo users/roles were hard-coded.
                  </p>
                </div>
              </div>
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
              <button
                onClick={() => setSafeModeEnabled(false)}
                className="flex items-center space-x-1 text-accent hover:opacity-80"
                title="Click to disable Safe Mode"
              >
                <Shield className="w-3 h-3" />
                <span className="text-[10px]">Safe Mode</span>
              </button>
            )}
            {!safeModeEnabled && (
              <button
                onClick={() => setSafeModeEnabled(true)}
                className="flex items-center space-x-1 text-warning hover:opacity-80"
                title="Click to enable Safe Mode"
              >
                <Shield className="w-3 h-3" />
                <span className="text-[10px]">Safe Mode Off</span>
              </button>
            )}
            <button onClick={handleOpenErd} className="hover:text-text text-[10px]">ERD</button>
            <button onClick={handleOpenHealth} className="hover:text-text text-[10px]">Health</button>
            <button onClick={() => setIsAuditModalOpen(true)} className="hover:text-text text-[10px]">Audit</button>
            <button onClick={() => setIsPiiConfigModalOpen(true)} className="hover:text-text text-[10px]">PII</button>
            <button
              onClick={() => setIsSchemaDiffModalOpen(true)}
              className="hover:text-text text-[10px]"
              title="UI prototype only"
            >
              Schema Diff*
            </button>
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
        onSave={async (connData, password) => {
          if (!isEngineSupported(connData.db_type)) {
            alert(
              `Engine "${connData.db_type}" is not supported by the backend yet.\n\nSupported: PostgreSQL, MySQL/MariaDB, SQLite, CockroachDB, Redshift.`
            );
            return;
          }
          const newConn: ConnectionConfig = {
            ...connData,
            id: `conn-${Date.now()}`,
            is_connected: false,
          };
          if (password) {
            try {
              await saveDbPassword(newConn.id, password);
            } catch (err) {
              console.warn('Failed to store password in OS keychain:', err);
            }
          }
          setConnections((prev) => [...prev, newConn]);
          await handleWelcomeConnect(newConn, password);
        }}
      />

      <SafeModeModal isOpen={isSafeModeModalOpen} onClose={() => setIsSafeModeModalOpen(false)} sql={pendingDestructiveSql} warningMessage={safeModeWarning} onConfirmExecute={() => executeSqlQuery(pendingDestructiveSql)} />

      <ExportModal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} tableName={activeTab.tableName || 'products'} onExport={handleExportData} />

      <ImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        connectionId={activeConnection?.id}
        tableName={activeTab?.tableName}
        onImportSuccess={(file, count) => {
          if (activeTab?.tableName) {
            executeSqlQuery(`SELECT * FROM ${activeTab.tableName} LIMIT 1000;`);
          }
          console.info(`Imported ${count} rows from ${file}`);
        }}
      />

      <AuditLoggerModal isOpen={isAuditModalOpen} onClose={() => setIsAuditModalOpen(false)} />
      <SchemaDiffModal isOpen={isSchemaDiffModalOpen} onClose={() => setIsSchemaDiffModalOpen(false)} />
      <PiiMaskingConfig
        isOpen={isPiiConfigModalOpen}
        onClose={() => setIsPiiConfigModalOpen(false)}
        rules={piiRules}
        onSaveRules={(rules) => {
          setPiiRules(rules);
          localStorage.setItem('devdash_pii_rules', JSON.stringify(rules));
        }}
      />

      <SecureShareModal
        isOpen={isSecureShareModalOpen}
        onClose={() => setIsSecureShareModalOpen(false)}
        connections={connections}
        initialSelectedId={shareTargetConnId}
      />

      <SecureImportModal
        isOpen={isSecureImportModalOpen}
        onClose={() => setIsSecureImportModalOpen(false)}
        onImportSuccess={async () => {
          try {
            const saved = localStorage.getItem('devdash_connections');
            if (saved) {
              setConnections(JSON.parse(saved));
            }
          } catch { /* ignore */ }
        }}
      />

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
