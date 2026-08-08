import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { TableGrid } from './components/TableGrid';
import { SqlEditor } from './components/SqlEditor';
import { ConnectionModal } from './components/ConnectionModal';
import { WelcomePage } from './components/WelcomePage';
import { SafeModeModal } from './components/SafeModeModal';
import { FilterBar } from './components/FilterBar';
import { StructureView } from './components/StructureView';
import { ExportModal } from './components/ExportModal';
import { ImportModal } from './components/ImportModal';
import { StagingCommit } from './components/StagingCommit';
import { ResultSnapshotsModal } from './components/ResultSnapshotsModal';
import { HealthGrid } from './components/HealthGrid';
import { SchemaVisualizer } from './components/SchemaVisualizer';
import { AiAgentBar } from './components/AiAgentBar';
import { InlineJsonPopup } from './components/InlineJsonPopup';
import { ContextMenu, ContextMenuAction } from './components/ContextMenu';
import { SettingsModal, AiConfig, GeneralSettings } from './components/SettingsModal';
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
import { CommandPalette } from './components/CommandPalette';
import { ProcessManagerModal } from './components/ProcessManagerModal';
import { QueryHistory } from './components/QueryHistory';
import { MultiQueryResult } from './components/SqlEditor';
import { TransactionBar } from './components/TransactionBar';
import { ConnectionDiagnosticsModal } from './components/ConnectionDiagnosticsModal';
import { QueryProfilerModal } from './components/QueryProfilerModal';
import { useIsMobile } from './hooks/useMediaQuery';
import { MobileApp } from './mobile/MobileApp';
import {
  catalogToConfig,
  configToCatalog,
  listConnectionCatalog,
  removeCatalogConnection,
  upsertCatalogConnection,
} from './services/tauriBridge';
import { maskRowRecord } from './utils/piiMask';
import { batchContainsWrite } from './utils/sqlSafety';
import {
  getEnvironmentMeta,
  normalizeEnvironment,
  readOnlyReason,
  resolveReadOnlyFlag,
} from './utils/connectionEnv';
import {
  buildStagingSqlPatch,
  downloadTextFile,
  type PatchDialect,
} from './utils/stagingSqlPatch';
import { saveWorkspaceSession, loadWorkspaceSession } from './utils/workspaceSession';
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
  objectKey,
} from './types';
import {
  X, Plus, Terminal, Table as TableIcon, Layers, Download,
  GitBranch, Activity, Network, Shield, Wand2, Sparkles, Settings,
  Database, Cpu, Share2, Command, Clock, Camera,
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
  commitStagedInserts,
  commitStagedDeletes,
  structureAddColumn,
  structureDropColumn,
  isEngineSupported,
  saveSecret,
  getSecret,
  getAutocompleteData,
  cancelQuery,
  fetchPersistedQueryHistory,
  clearPersistedQueryHistory,
  splitSqlStatements,
  exportTableData,
  exportRowsParquet,
  downloadBase64Parquet,
  AutocompleteData,
  EngineDialect,
} from './services/tauriBridge';

export const App: React.FC = () => {
  const isMobile = useIsMobile();
  if (isMobile) {
    return <MobileApp />;
  }
  return <DesktopApp />;
};

const DesktopApp: React.FC = () => {
  const currentProjectPath = 'local';

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
    const saved = localStorage.getItem('devdash_connections');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed
            .filter(
              (c: any) =>
                c.id !== 'conn-1' &&
                c.id !== 'conn-2' &&
                c.id !== 'conn-3' &&
                c.id !== 'conn-test-db' &&
                c.name !== 'production_db_app_main' &&
                c.name !== 'local_test_db' &&
                c.name !== 'DevDash Test DB (SQLite)' &&
                c.name !== 'staging_cache' &&
                c.name !== 'POSTGRES Connection'
            )
            .map((c: ConnectionConfig) => {
              const environment = normalizeEnvironment(c.environment);
              const allow_writes_on_prod = !!c.allow_writes_on_prod;
              return {
                ...c,
                environment,
                allow_writes_on_prod,
                is_read_only: resolveReadOnlyFlag({
                  environment,
                  is_read_only: c.is_read_only,
                  allow_writes_on_prod,
                }),
              };
            });
        }
      } catch {
        /* ignore */
      }
    }
    return [];
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

  // Pull shared catalog (CLI/Mobile) into Desktop on launch; push Desktop saves back.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cat = await listConnectionCatalog();
        if (cancelled || !cat.connections.length) return;
        setConnections((prev) => {
          const byId = new Map(prev.map((c) => [c.id, c]));
          const names = new Set(prev.map((c) => c.name.toLowerCase()));
          let changed = false;
          for (const cc of cat.connections) {
            if (byId.has(cc.id) || names.has(cc.name.toLowerCase())) continue;
            const cfg = catalogToConfig(cc);
            byId.set(cfg.id, cfg);
            names.add(cfg.name.toLowerCase());
            changed = true;
          }
          return changed ? Array.from(byId.values()) : prev;
        });
      } catch {
        /* catalog optional in web preview */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('devdash_recent_connections', JSON.stringify(recentConnectionIds));
  }, [recentConnectionIds]);

  useEffect(() => {
    localStorage.setItem('devdash_show_welcome', String(showWelcome));
  }, [showWelcome]);

  // Multi-connection workspace: keep pools open; cache catalog per connection
  const [tablesByConn, setTablesByConn] = useState<Record<string, TableItem[]>>({});
  const [schemaByConn, setSchemaByConn] = useState<Record<string, AutocompleteData | null>>({});
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  const [isProfilerOpen, setIsProfilerOpen] = useState(false);
  const [profilerSql, setProfilerSql] = useState('');
  const [txActive, setTxActive] = useState(false);

  // Welcome page handlers — multi-connection: do NOT drop previous pools
  const handleWelcomeConnect = useCallback(async (conn: ConnectionConfig, password?: string) => {
    if (!isEngineSupported(conn.db_type)) {
      alert(
        `Engine "${conn.db_type}" is not supported by the backend yet.\n\nSupported: PostgreSQL, MySQL/MariaDB, SQLite, DuckDB, CockroachDB, Redshift.`
      );
      return;
    }

    // Re-resolve RO from environment (prod protection) before opening the pool
    const secured: ConnectionConfig = {
      ...conn,
      environment: normalizeEnvironment(conn.environment),
      is_read_only: resolveReadOnlyFlag(conn),
    };

    setActiveConnection({ ...secured, is_connected: false });
    setShowWelcome(false);
    // Track recent connections (most recent first, max 10)
    setRecentConnectionIds(prev => {
      const filtered = prev.filter(id => id !== conn.id);
      return [conn.id, ...filtered].slice(0, 10);
    });

    try {
      // Fast switch if pool already open
      const already = connections.find((c) => c.id === conn.id)?.is_connected;
      let pwd = password;
      if (pwd === undefined || pwd === '') {
        pwd = (await getDbPassword(conn.id)) || undefined;
      }
      if (pwd) {
        await saveDbPassword(conn.id, pwd);
      }
      if (!already) {
        await connectDatabase(secured, pwd);
      }

      setActiveConnection({ ...secured, is_connected: true });
      setConnections((prev) =>
        prev.map((c) =>
          c.id === conn.id ? { ...c, ...secured, is_connected: true } : c
        )
      );
      void upsertCatalogConnection(configToCatalog(secured), pwd, 'desktop').catch(() => {
        /* catalog write is best-effort; Desktop still owns localStorage */
      });

      const fetchedTables = (await getDatabaseTables(conn.id, conn.db_type)) || [];
      setTablesByConn((prev) => ({ ...prev, [conn.id]: fetchedTables }));
      setTables(fetchedTables);

      const cachedSchema = schemaByConn[conn.id];
      if (cachedSchema) {
        setSchemaData(cachedSchema);
      } else {
        getAutocompleteData(conn.id, conn.db_type)
          .then((data) => {
            setSchemaData(data);
            setSchemaByConn((prev) => ({ ...prev, [conn.id]: data }));
          })
          .catch(() => setSchemaData(null));
      }

      // Hydrate history once if empty (functional update avoids stale deps)
      setQueryHistory((prev) => {
        if (prev.length > 0) return prev;
        fetchPersistedQueryHistory(1, 50)
          .then((items) => {
            if (!items?.length) return;
            setQueryHistory(
              items.map((h) => ({
                id: h.id,
                sql: h.query_text,
                connectionName: conn.name,
                engine: conn.db_type,
                timestamp: h.timestamp,
                executionTimeMs: Math.round(h.execution_time_ms),
                rowCount: h.row_count,
                status: h.error ? ('error' as const) : ('success' as const),
                errorMessage: h.error || undefined,
              }))
            );
          })
          .catch(() => {
            /* ignore */
          });
        return prev;
      });
    } catch (err: any) {
      console.warn('Failed to connect to database or fetch tables:', err);
      setActiveConnection(null);
      setShowWelcome(true);
      alert(`Connection failed: ${String(err?.message || err)}`);
    }
  }, [tablesByConn, schemaByConn, connections]);

  const handleDeleteConnection = useCallback(async (id: string) => {
    try {
      await disconnectDatabase(id);
    } catch {
      /* ignore */
    }
    setConnections((prev) => prev.filter((c) => c.id !== id));
    void removeCatalogConnection(id).catch(() => {
      /* ignore */
    });
    setRecentConnectionIds((prev) => prev.filter((cid) => cid !== id));
    setTablesByConn((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setSchemaByConn((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (activeConnection?.id === id) {
      // Switch to another still-connected pool if available
      const remaining = connections.filter((c) => c.id !== id && c.is_connected);
      if (remaining[0]) {
        setActiveConnection(remaining[0]);
        setTables(tablesByConn[remaining[0].id] || []);
        setSchemaData(schemaByConn[remaining[0].id] || null);
      } else {
        setActiveConnection(null);
        setShowWelcome(true);
        setTables([]);
      }
    }
  }, [activeConnection, connections, tablesByConn, schemaByConn]);

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

  const [pkInfo, setPkInfo] = useState<PkInfo>({
    has_single_pk: false,
    is_read_only: true,
    read_only_reason: 'Primary key not analyzed yet.',
  });

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

  // Persist workspace session (multi-connection + tabs)
  useEffect(() => {
    if (showWelcome && !activeConnection) return;
    saveWorkspaceSession({
      activeConnectionId: activeConnection?.id || null,
      connectedIds: connections.filter((c) => c.is_connected).map((c) => c.id),
      tabs,
      activeTabId,
      showWelcome,
      connections,
      recentConnectionIds,
    });
  }, [activeConnection, connections, tabs, activeTabId, showWelcome, recentConnectionIds]);

  // Restore multi-connection session once on mount
  useEffect(() => {
    const session = loadWorkspaceSession();
    if (!session) return;
    if (session.connections?.length) {
      setConnections(session.connections);
    }
    if (session.tabs?.length) {
      setTabs(session.tabs);
    }
    if (session.activeTabId) {
      setActiveTabId(session.activeTabId);
    }
    if (session.recentConnectionIds?.length) {
      setRecentConnectionIds(session.recentConnectionIds);
    }
    (async () => {
      for (const id of session.connectedIds || []) {
        const conn = session.connections.find((c) => c.id === id);
        if (!conn) continue;
        try {
          const pwd = (await getDbPassword(id)) || undefined;
          await connectDatabase(conn, pwd);
          setConnections((prev) =>
            prev.map((c) => (c.id === id ? { ...c, is_connected: true } : c))
          );
          const tbls = await getDatabaseTables(id, conn.db_type);
          setTablesByConn((prev) => ({ ...prev, [id]: tbls }));
          if (session.activeConnectionId === id) {
            setActiveConnection({ ...conn, is_connected: true });
            setTables(tbls);
            setShowWelcome(false);
          }
        } catch {
          /* Connection offline or authentication failed: reset active connection so open tabs don't throw catalog errors */
          if (session.activeConnectionId === id) {
            setActiveConnection(null);
            setShowWelcome(true);
          }
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-fetch tables when activeConnection is set but tables list is empty
  useEffect(() => {
    if (activeConnection?.id && tables.length === 0) {
      (async () => {
        try {
          const list = await getDatabaseTables(activeConnection.id, activeConnection.db_type);
          if (list && list.length > 0) {
            setTables(list);
            setTablesByConn((prev) => ({ ...prev, [activeConnection.id]: list }));
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
  const [isSnapshotsModalOpen, setIsSnapshotsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isSecureShareModalOpen, setIsSecureShareModalOpen] = useState(false);
  const [isSecureImportModalOpen, setIsSecureImportModalOpen] = useState(false);
  const [shareTargetConnId, setShareTargetConnId] = useState<string | undefined>(undefined);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [isSchemaDiffModalOpen, setIsSchemaDiffModalOpen] = useState(false);
  const [isPiiConfigModalOpen, setIsPiiConfigModalOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isProcessManagerOpen, setIsProcessManagerOpen] = useState(false);
  const [isMockDataOpen, setIsMockDataOpen] = useState(false);
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
  const [multiResults, setMultiResults] = useState<MultiQueryResult[]>([]);
  const [isQueryLoading, setIsQueryLoading] = useState(false);
  const [activeQueryId, setActiveQueryId] = useState<string | null>(null);
  const [queryHistory, setQueryHistory] = useState<QueryHistoryEntry[]>([]);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [schemaData, setSchemaData] = useState<AutocompleteData | null>(null);
  const [erdSchema, setErdSchema] = useState<{ name: string; columns: ColumnItem[] }[]>([]);
  const [erdLoading, setErdLoading] = useState(false);
  const [tableTotalRows, setTableTotalRows] = useState<number | null>(null);
  const [isBrowserLoading, setIsBrowserLoading] = useState(false);

  // === SAVED QUERIES ===
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);

  // === FILTER ===
  const [filterWhere, setFilterWhere] = useState('');
  const [filterSort, setFilterSort] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // === LEGACY STAGED EDITS (for TableGrid compatibility) ===
  const [stagedEdits, setStagedEdits] = useState<StagedCellEdit[]>([]);

  // Server-side filter/sort via loadTablePage — rows are already filtered
  const displayRows = rows;

  const quoteTableForQuery = useCallback(
    (tableName: string) => {
      const mysql =
        activeConnection?.db_type === 'mysql' || activeConnection?.db_type === 'mariadb';
      return tableName
        .split('.')
        .map((p) => (mysql ? `\`${p.replace(/`/g, '``')}\`` : `"${p.replace(/"/g, '""')}"`))
        .join('.');
    },
    [activeConnection?.db_type]
  );

  const pushHistory = useCallback(
    (entry: Omit<QueryHistoryEntry, 'id' | 'timestamp' | 'connectionName' | 'engine'>) => {
      setQueryHistory((prev) => [
        {
          id: `qh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: new Date().toISOString(),
          connectionName: activeConnection?.name || '',
          engine: activeConnection?.db_type || '',
          ...entry,
        },
        ...prev,
      ].slice(0, 200));
    },
    [activeConnection?.name, activeConnection?.db_type]
  );

  /** Run SQL query with automatic pool reconnection if connection expired */
  const safeRunSqlQuery = useCallback(async (
    connId: string,
    sql: string,
    extras?: { queryId?: string; allowDestructive?: boolean; queryTimeoutSec?: number }
  ) => {
    const run = () =>
      runSqlQuery(
        connId,
        sql,
        extras?.queryId,
        extras?.allowDestructive,
        extras?.queryTimeoutSec
      );
    try {
      return await run();
    } catch (err: any) {
      const msg = String(err?.message || err || '');
      if (msg.includes('is not connected') || msg.includes('pool expired')) {
        const target = connections.find(c => c.id === connId) || activeConnection;
        if (target) {
          const pwd = (await getDbPassword(target.id)) || undefined;
          await connectDatabase(target, pwd);
          return await run();
        }
      }
      throw err;
    }
  }, [connections, activeConnection]);

  /** Load one page of table data server-side (pageSize from settings). */
  const loadTablePage = useCallback(
    async (
      tableName: string,
      page: number,
      opts?: { where?: string; sort?: string }
    ) => {
      if (!activeConnection) return;
      const pageSize = generalSettings.pageSize || 1000;
      const offset = Math.max(0, (page - 1) * pageSize);
      const qTable = quoteTableForQuery(tableName);
      const whereClause = (opts?.where || filterWhere || '').trim();
      const sortClause = (opts?.sort || filterSort || '').trim();
      // Only allow safe fragments: must start with WHERE / ORDER BY and no multi-statement
      const safeWhere =
        whereClause &&
        /^where\b/i.test(whereClause) &&
        !whereClause.includes(';')
          ? ` ${whereClause}`
          : '';
      const safeSort =
        sortClause &&
        /^order\s+by\b/i.test(sortClause) &&
        !sortClause.includes(';')
          ? ` ${sortClause}`
          : '';
      setIsBrowserLoading(true);
      try {
        const [countRes, dataRes] = await Promise.all([
          safeRunSqlQuery(
            activeConnection.id,
            `SELECT COUNT(*) AS cnt FROM ${qTable}${safeWhere}`
          ).catch(() => null),
          safeRunSqlQuery(
            activeConnection.id,
            `SELECT * FROM ${qTable}${safeWhere}${safeSort} LIMIT ${pageSize} OFFSET ${offset}`
          ),
        ]);
        if (countRes?.rows?.[0]) {
          const raw = countRes.rows[0][0];
          setTableTotalRows(typeof raw === 'number' ? raw : Number(raw) || null);
        }
        setQueryResult(dataRes);
        if (dataRes.columns && dataRes.rows) {
          setRows(
            dataRes.rows.map((r) => {
              const obj: Record<string, any> = {};
              dataRes.columns.forEach((col, idx) => {
                obj[col.name] = r[idx];
              });
              return obj;
            })
          );
        }
      } catch (err: any) {
        console.warn('Failed to load table page:', err);
        const errStr = String(err?.message || err || '');
        setRows([]);
        setQueryResult({ columns: [], rows: [], execution_time_ms: 0, affected_rows: 0 });
        if (!errStr.includes('does not exist')) {
          alert(`Failed to load table: ${errStr}`);
        }
      } finally {
        setIsBrowserLoading(false);
      }
    },
    [activeConnection, generalSettings.pageSize, quoteTableForQuery, filterWhere, filterSort]
  );

  // === HANDLERS ===
  const executeSqlQuery = useCallback(
    async (
      sql: string,
      opts?: { updateGrid?: boolean; queryId?: string; allowDestructive?: boolean }
    ) => {
      const connId = activeConnection?.id || 'default';
      const queryId = opts?.queryId || `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const allowDestructive = opts?.allowDestructive === true;
      const queryTimeoutSec =
        generalSettings.queryTimeoutSec > 0 ? generalSettings.queryTimeoutSec : undefined;
      setActiveQueryId(queryId);
      setIsQueryLoading(true);
      try {
        if (activeConnection && resolveReadOnlyFlag(activeConnection)) {
          if (batchContainsWrite(splitSqlStatements(sql))) {
            throw new Error(
              readOnlyReason(activeConnection) ||
                'Connection is read-only. Write/DDL statements are blocked.'
            );
          }
        }

        const statements = splitSqlStatements(sql);
        if (statements.length === 0) return;

        if (statements.length === 1) {
          const payload = await safeRunSqlQuery(connId, statements[0], {
            queryId,
            allowDestructive,
            queryTimeoutSec,
          });
          setQueryResult(payload);
          setMultiResults([
            {
              id: 'r0',
              sql: statements[0],
              result: payload,
              status: 'success',
            },
          ]);

          if (opts?.updateGrid !== false && payload.columns && payload.rows) {
            const mappedCols: ColumnItem[] = payload.columns.map((col: any) => ({
              name: col.name,
              data_type: col.type_name || col.data_type || 'TEXT',
              is_nullable: true,
              is_primary_key: col.name === 'id',
            }));
            // Don't clobber table-catalog columns when running ad-hoc SQL in query tab
            if (opts?.updateGrid ?? true) {
              setColumns(mappedCols);
            }
            setRows(
              payload.rows.map((r) => {
                const obj: Record<string, any> = {};
                payload.columns.forEach((col, idx) => {
                  obj[col.name] = r[idx];
                });
                return obj;
              })
            );
          }

          pushHistory({
            sql: statements[0],
            executionTimeMs: payload.execution_time_ms,
            rowCount: payload.rows?.length || payload.affected_rows || 0,
            status: 'success',
          });
        } else {
          // Multi-statement: one result set per statement (TablePlus/DBeaver style)
          const results: MultiQueryResult[] = statements.map((s, i) => ({
            id: `r${i}`,
            sql: s,
            status: 'pending' as const,
          }));
          setMultiResults(results);
          setQueryResult(null);

          let lastPayload: typeof queryResult = null;
          for (let i = 0; i < statements.length; i++) {
            const stmtId = `${queryId}-${i}`;
            setActiveQueryId(stmtId);
            setMultiResults((prev) =>
              prev.map((r, idx) => (idx === i ? { ...r, status: 'running' } : r))
            );
            try {
              const payload = await safeRunSqlQuery(connId, statements[i], {
                queryId: stmtId,
                allowDestructive,
                queryTimeoutSec,
              });
              lastPayload = payload;
              setMultiResults((prev) =>
                prev.map((r, idx) =>
                  idx === i ? { ...r, status: 'success', result: payload } : r
                )
              );
              pushHistory({
                sql: statements[i],
                executionTimeMs: payload.execution_time_ms,
                rowCount: payload.rows?.length || payload.affected_rows || 0,
                status: 'success',
              });
            } catch (err) {
              setMultiResults((prev) =>
                prev.map((r, idx) =>
                  idx === i ? { ...r, status: 'error', error: String(err) } : r
                )
              );
              pushHistory({
                sql: statements[i],
                executionTimeMs: 0,
                rowCount: 0,
                status: 'error',
                errorMessage: String(err),
              });
              break;
            }
          }
          if (lastPayload) setQueryResult(lastPayload);
        }
      } catch (err: any) {
        console.error('Query execution error:', err);
        setMultiResults([
          {
            id: 'r-err',
            sql,
            status: 'error',
            error: String(err?.message || err),
          },
        ]);
        pushHistory({
          sql,
          executionTimeMs: 0,
          rowCount: 0,
          status: 'error',
          errorMessage: String(err?.message || err),
        });
      } finally {
        setIsQueryLoading(false);
        setActiveQueryId(null);
      }
    },
    [activeConnection, pushHistory, generalSettings.queryTimeoutSec]
  );

  const handleCancelQuery = useCallback(async () => {
    if (activeQueryId) {
      try {
        await cancelQuery(activeQueryId);
      } catch {
        /* ignore */
      }
    }
    setIsQueryLoading(false);
    setActiveQueryId(null);
  }, [activeQueryId]);

  const handleRunQueryWithSafeMode = useCallback(
    async (sql: string) => {
      // Read-only gate before safe mode (per-statement, multi-batch safe)
      if (
        activeConnection &&
        resolveReadOnlyFlag(activeConnection) &&
        batchContainsWrite(splitSqlStatements(sql))
      ) {
        alert(
          readOnlyReason(activeConnection) ||
            'This connection is marked read-only. Write/DDL statements are blocked.'
        );
        return;
      }

      // Safe Mode off → server allow_destructive=true; on → only after modal confirm
      const run = (allowDestructive: boolean) =>
        executeSqlQuery(sql, { updateGrid: false, allowDestructive });

      if (!safeModeEnabled) {
        run(true);
        return;
      }
      try {
        // Analyze each statement for multi-scripts
        const statements = splitSqlStatements(sql);
        for (const stmt of statements) {
          const analysis = await checkSqlSafety(stmt);
          if (analysis.requires_confirmation || analysis.is_destructive) {
            setPendingDestructiveSql(sql);
            setSafeModeWarning(
              analysis.warning_message ||
                `Destructive operation detected in: ${stmt.slice(0, 80)}…`
            );
            setIsSafeModeModalOpen(true);
            return;
          }
        }
        run(false);
      } catch {
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
          run(false);
        }
      }
    },
    [safeModeEnabled, executeSqlQuery, activeConnection]
  );

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
    if (resolveReadOnlyFlag(activeConnection)) {
      alert(
        readOnlyReason(activeConnection) ||
          'Connection is read-only. Cannot commit staged changes.'
      );
      return;
    }

    const checked = stagedChanges.filter((c) => c.checked);
    if (checked.length === 0) {
      setStagedChanges((prev) => prev.filter((c) => !c.checked));
      setStagedEdits([]);
      return;
    }

    const currentTab = tabs.find((t) => t.id === activeTabId);
    const pkColumn = pkInfo.pk_column_name || 'id';

    try {
      // Group by table + change type
      const tables = new Set(checked.map((c) => c.tableName));
      for (const tableName of tables) {
        const tableChanges = checked.filter((c) => c.tableName === tableName);

        // UPDATEs
        const updates = tableChanges.filter((c) => c.changeType === 'update');
        if (updates.length > 0) {
          const rowMap = new Map<
            string | number,
            { pk: string | number; changes: { column_name: string; new_value: unknown }[] }
          >();
          for (const c of updates) {
            const matchingEdit = stagedEdits.find(
              (e) => e.rowId === c.rowId && e.columnName === c.columnName
            );
            const entry = rowMap.get(c.rowId) || { pk: c.rowId, changes: [] };
            entry.changes.push({
              column_name: c.columnName || c.identifier,
              new_value: matchingEdit?.newValue ?? c.newValues?.[c.columnName || ''] ?? null,
            });
            rowMap.set(c.rowId, entry);
          }
          const edits = Array.from(rowMap.values()).map((r) => ({
            pk_value: r.pk,
            changes: r.changes,
          }));
          await commitStagedRowEdits(activeConnection.id, tableName, pkColumn, edits);
        }

        // INSERTs — one staged change per new row with newValues bag
        const inserts = tableChanges.filter((c) => c.changeType === 'insert');
        if (inserts.length > 0) {
          const rows = inserts.map((c) => {
            // Merge cell-level staged edits into the insert payload
            const vals: Record<string, unknown> = { ...(c.newValues || {}) };
            for (const e of stagedEdits) {
              if (e.rowId === c.rowId) vals[e.columnName] = e.newValue;
            }
            // Drop empty-string / null optional fields for cleaner INSERT
            const cols = Object.keys(vals).filter(
              (k) => vals[k] !== '' && vals[k] !== undefined
            );
            return {
              columns: cols,
              values: cols.map((k) => vals[k]),
            };
          });
          await commitStagedInserts(activeConnection.id, tableName, rows);
        }

        // DELETEs
        const deletes = tableChanges.filter((c) => c.changeType === 'delete');
        if (deletes.length > 0) {
          await commitStagedDeletes(
            activeConnection.id,
            tableName,
            pkColumn,
            deletes.map((c) => ({ pk_value: c.rowId }))
          );
        }
      }

      setStagedChanges((prev) => prev.filter((c) => !c.checked));
      setStagedEdits([]);

      if (currentTab?.type === 'browser' && currentTab.tableName) {
        await loadTablePage(currentTab.tableName, currentPage);
      }
    } catch (err) {
      alert(`Failed to commit staged edits: ${String(err)}`);
    }
  }, [activeConnection, stagedChanges, stagedEdits, pkInfo, tabs, activeTabId, loadTablePage, currentPage]);

  const stagingPatchDialect = useCallback((): PatchDialect => {
    const t = (activeConnection?.db_type || 'postgres').toLowerCase();
    if (t === 'mysql' || t === 'mariadb') return 'mysql';
    if (t === 'sqlite' || t === 'duckdb') return 'sqlite';
    return 'postgres';
  }, [activeConnection?.db_type]);

  const buildCurrentStagingPatch = useCallback(
    (message: string) =>
      buildStagingSqlPatch({
        stagedChanges,
        stagedEdits,
        pkColumn: pkInfo.pk_column_name || 'id',
        dialect: stagingPatchDialect(),
        message,
        connectionName: activeConnection?.name,
      }),
    [stagedChanges, stagedEdits, pkInfo.pk_column_name, stagingPatchDialect, activeConnection?.name]
  );

  const handleExportStagingPatch = useCallback(
    (message: string) => {
      const sql = buildCurrentStagingPatch(message);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      downloadTextFile(`devdash_staging_patch_${stamp}.sql`, sql);
    },
    [buildCurrentStagingPatch]
  );

  const handleCopyStagingPatch = useCallback(
    (message: string) => {
      const sql = buildCurrentStagingPatch(message);
      navigator.clipboard.writeText(sql).catch(() => {
        alert('Could not copy to clipboard');
      });
    },
    [buildCurrentStagingPatch]
  );

  const handleAddRow = useCallback(() => {
    const tab = tabs.find((t) => t.id === activeTabId);
    const tbl = tab?.tableName || 'unknown';
    const insertable = columns.filter((c) => !c.is_primary_key || !/serial|identity|auto/i.test(c.data_type));
    const newValues: Record<string, any> = {};
    for (const c of insertable) {
      newValues[c.name] = c.is_nullable ? null : '';
    }
    const rowId = `new-${Date.now()}`;
    setStagedChanges((prev) => [
      ...prev,
      {
        id: `ins-${rowId}`,
        tableName: tbl,
        changeType: 'insert',
        identifier: '(new row)',
        diff: `INSERT ${Object.keys(newValues).join(', ')}`,
        rowId,
        columnName: undefined,
        checked: true,
        newValues,
      },
    ]);
    // Seed staged cell edits so user can fill values in staging tab display
    setStagedEdits((prev) => [
      ...prev,
      ...Object.entries(newValues).map(([columnName, newValue]) => ({
        rowId,
        columnName,
        oldValue: null,
        newValue,
        tableName: tbl,
      })),
    ]);
    setActiveTabId('tab-staging');
  }, [tabs, activeTabId, columns]);

  const handleDeleteSelectedRow = useCallback(
    (rowId: string | number) => {
      const tab = tabs.find((t) => t.id === activeTabId);
      const tbl = tab?.tableName || 'unknown';
      setStagedChanges((prev) => {
        const without = prev.filter(
          (c) => !(c.rowId === rowId && c.changeType === 'delete' && c.tableName === tbl)
        );
        return [
          ...without,
          {
            id: `del-${rowId}`,
            tableName: tbl,
            changeType: 'delete' as const,
            identifier: String(rowId),
            diff: `DELETE row ${rowId}`,
            rowId,
            checked: true,
          },
        ];
      });
    },
    [tabs, activeTabId]
  );

  const handleStageEdit = useCallback((edit: StagedCellEdit) => {
    setStagedEdits((prev) => {
      const filtered = prev.filter(
        (e) => !(e.rowId === edit.rowId && e.columnName === edit.columnName)
      );
      return [...filtered, edit];
    });
    // Upsert into staging commit view (same cell should not create duplicate rows)
    const activeTabForStage = tabs.find((t) => t.id === activeTabId);
    const tblName = edit.tableName || activeTabForStage?.tableName || 'unknown';
    setStagedChanges((prev) => {
      const without = prev.filter(
        (c) => !(c.rowId === edit.rowId && c.columnName === edit.columnName)
      );
      return [
        ...without,
        {
          id: `sc-${edit.rowId}-${edit.columnName}`,
          tableName: tblName,
          changeType: 'update' as const,
          identifier: edit.columnName,
          diff: `${edit.columnName}: ${String(edit.oldValue)} → ${String(edit.newValue)}`,
          rowId: edit.rowId,
          columnName: edit.columnName,
          checked: true,
        },
      ];
    });
  }, [tabs, activeTabId]);

  const handleResetAllStaged = useCallback(() => {
    setStagedEdits([]);
    setStagedChanges([]);
  }, []);

  const handleOpenTableTab = useCallback(async (tableName: string) => {
    // tableName is expected to be schema-qualified when multi-schema (e.g. public.users)
    const shortTitle = tableName.includes('.') ? tableName.split('.').pop()! : tableName;
    const existing = tabs.find(t => t.tableName === tableName && t.type === 'browser');
    if (existing) { setActiveTabId(existing.id); }
    else {
      const newId = `tab-${Date.now()}`;
      setTabs(prev => [...prev, { id: newId, title: shortTitle, type: 'browser', tableName }]);
      setActiveTabId(newId);
    }

    setCurrentPage(1);
    setTableTotalRows(null);
    if (activeConnection) {
      try {
        const [fetchedCols, fetchedPk] = await Promise.all([
          getTableColumns(activeConnection.id, activeConnection.db_type, tableName),
          getPkAnalysis(activeConnection.id, activeConnection.db_type, tableName),
        ]);
        if (fetchedCols && fetchedCols.length > 0) setColumns(fetchedCols);
        if (fetchedPk) setPkInfo(fetchedPk);
        await loadTablePage(tableName, 1);
      } catch (err) {
        console.warn('Failed to load table details/rows:', err);
      }
    }
  }, [tabs, activeConnection, loadTablePage]);

  // Auto-fetch columns and rows when active browser tab changes
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
          await loadTablePage(currentTab.tableName!, currentPage);
        } catch {
          /* ignore */
        }
      })();
    }
    // Intentionally omit currentPage — page changes handled separately
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId, activeConnection?.id]);

  // Server-side page change for browser tabs
  const handleBrowserPageChange = useCallback(
    (newPage: number) => {
      setCurrentPage(newPage);
      const currentTab = tabs.find((t) => t.id === activeTabId);
      if (currentTab?.type === 'browser' && currentTab.tableName) {
        loadTablePage(currentTab.tableName, newPage);
      }
    },
    [tabs, activeTabId, loadTablePage]
  );

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

  const handleOpenErd = useCallback(async () => {
    const existing = tabs.find((t) => t.type === 'erd');
    if (existing) {
      setActiveTabId(existing.id);
    } else {
      const newId = `tab-erd-${Date.now()}`;
      setTabs((prev) => [...prev, { id: newId, title: 'Schema Visualizer (ERD)', type: 'erd' }]);
      setActiveTabId(newId);
    }

    // Full schema load with FK edges — use qualified names for multi-schema DBs
    if (!activeConnection || tables.length === 0) return;
    setErdLoading(true);
    try {
      const batchSize = 8;
      // Prefer base tables for ERD (views rarely have FKs)
      const erdSources = tables.filter(
        (t) => !(t.table_type || '').toUpperCase().includes('VIEW')
      );
      const loaded: { name: string; columns: ColumnItem[] }[] = [];
      for (let i = 0; i < erdSources.length; i += batchSize) {
        const batch = erdSources.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map(async (t) => {
            const key = objectKey(t);
            const cols = await getTableColumns(
              activeConnection.id,
              activeConnection.db_type,
              key
            );
            return { name: key, columns: cols };
          })
        );
        loaded.push(...results);
      }
      setErdSchema(loaded);
    } catch (err) {
      console.warn('ERD schema load failed:', err);
    } finally {
      setErdLoading(false);
    }
  }, [tabs, activeConnection, tables]);

  const handleOpenHealth = useCallback(() => {
    const existing = tabs.find(t => t.type === 'health');
    if (existing) { setActiveTabId(existing.id); return; }
    const newId = `tab-health-${Date.now()}`;
    setTabs(prev => [...prev, { id: newId, title: 'Slow Queries (Bento)', type: 'health' }]);
    setActiveTabId(newId);
  }, [tabs]);

  const handleExportData = useCallback(
    async (
      format: 'csv' | 'json' | 'sql' | 'jsonl' | 'markdown' | 'parquet',
      scope: 'full' | 'page' = 'page'
    ) => {
      const activeTabForExport = tabs.find((t) => t.id === activeTabId);
      const tbl = activeTabForExport?.tableName || 'export';
      const stamp = Date.now();

      // ── Parquet (binary via base64 from Rust) ─────────────────────
      if (format === 'parquet') {
        let b64: string;
        if (scope === 'full' && activeConnection) {
          b64 = await exportTableData(
            activeConnection.id,
            tbl,
            'parquet',
            filterWhere || undefined
          );
        } else {
          const colNames = columns.map((c) => c.name);
          const exportRows = rows.map((r) => maskRowRecord(r, colNames, piiRules));
          const matrix = exportRows.map((r) => colNames.map((c) => r[c] ?? null));
          b64 = await exportRowsParquet(colNames, matrix);
        }
        downloadBase64Parquet(b64, `${tbl}_${scope}_${stamp}.parquet`);
        return;
      }

      let content = '';
      let extension = format === 'sql' ? 'sql' : format;

      // Full table server export for csv/json/sql when native app available
      if (
        scope === 'full' &&
        activeConnection &&
        (format === 'csv' || format === 'json' || format === 'sql')
      ) {
        content = await exportTableData(
          activeConnection.id,
          tbl,
          format,
          filterWhere || undefined
        );
      } else {
        const colNames = columns.map((c) => c.name);
        const exportRows = rows.map((r) => maskRowRecord(r, colNames, piiRules));

        const sqlLiteral = (val: unknown): string => {
          if (val === null || val === undefined) return 'NULL';
          if (typeof val === 'number' || typeof val === 'bigint') return String(val);
          if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
          return `'${String(val).replace(/'/g, "''")}'`;
        };

        if (format === 'csv') {
          const headers = colNames.join(',');
          const rowStrs = exportRows
            .map((r) =>
              colNames
                .map((c) => {
                  const v = r[c];
                  const s = v === null || v === undefined ? '' : String(v);
                  return s.includes(',') || s.includes('"') || s.includes('\n')
                    ? `"${s.replace(/"/g, '""')}"`
                    : s;
                })
                .join(',')
            )
            .join('\n');
          content = `${headers}\n${rowStrs}`;
        } else if (format === 'json') {
          content = JSON.stringify(exportRows, null, 2);
        } else if (format === 'jsonl') {
          content = exportRows.map((r) => JSON.stringify(r)).join('\n');
        } else if (format === 'markdown') {
          const headers = `| ${colNames.join(' | ')} |`;
          const separator = `| ${colNames.map(() => '---').join(' | ')} |`;
          const rowStrs = exportRows
            .map((r) => `| ${colNames.map((c) => String(r[c] ?? '')).join(' | ')} |`)
            .join('\n');
          content = `${headers}\n${separator}\n${rowStrs}`;
        } else {
          extension = 'sql';
          content = exportRows
            .map((r) => {
              const vals = colNames.map((c) => sqlLiteral(r[c]));
              return `INSERT INTO ${tbl} (${colNames.join(', ')}) VALUES (${vals.join(', ')});`;
            })
            .join('\n');
        }
      }

      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${tbl}_${scope}_${stamp}.${extension}`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [columns, rows, tabs, activeTabId, piiRules, activeConnection, filterWhere]
  );

  const quoteIdent = useCallback(
    (name: string): string => {
      const mysql =
        activeConnection?.db_type === 'mysql' || activeConnection?.db_type === 'mariadb';
      // Allow schema.table
      return name
        .split('.')
        .map((part) => {
          if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(part)) {
            throw new Error(`Unsafe SQL identifier: ${part}`);
          }
          return mysql ? `\`${part}\`` : `"${part}"`;
        })
        .join('.');
    },
    [activeConnection?.db_type]
  );

  const handleMockDataGenerate = useCallback(
    async (generatedRows: Record<string, any>[]) => {
      const tableName = tabs.find((t) => t.id === activeTabId)?.tableName;
      if (!activeConnection || !tableName) {
        throw new Error('Open a table browser tab before seeding mock data.');
      }
      if (generatedRows.length === 0) return;

      const colNames = Object.keys(generatedRows[0]);
      for (const c of colNames) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(c)) {
          throw new Error(`Unsafe column name: ${c}`);
        }
      }

      const sqlLiteral = (val: unknown): string => {
        if (val === null || val === undefined) return 'NULL';
        if (typeof val === 'number' || typeof val === 'bigint') {
          if (Number.isNaN(val)) return 'NULL';
          return String(val);
        }
        if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
        return `'${String(val).replace(/'/g, "''")}'`;
      };

      const qTable = quoteIdent(tableName);
      const qCols = colNames.map((c) => quoteIdent(c)).join(', ');
      const batchSize = 50;
      let inserted = 0;
      try {
        for (let i = 0; i < generatedRows.length; i += batchSize) {
          const batch = generatedRows.slice(i, i + batchSize);
          const values = batch
            .map((row) => `(${colNames.map((c) => sqlLiteral(row[c])).join(', ')})`)
            .join(',\n');
          const sql = `INSERT INTO ${qTable} (${qCols}) VALUES\n${values};`;
          await runSqlQuery(activeConnection.id, sql);
          inserted += batch.length;
        }
        await loadTablePage(tableName, currentPage);
      } catch (err) {
        throw new Error(`Insert failed after ${inserted} rows: ${String(err)}`);
      }
    },
    [activeConnection, tabs, activeTabId, loadTablePage, currentPage, quoteIdent]
  );

  /** Open a query tab prefilled with SQL; optionally run it immediately. */
  const openQueryWithSql = useCallback((sql: string, runImmediately = false) => {
    const newId = `tab-${Date.now()}`;
    setTabs((prev) => [
      ...prev,
      {
        id: newId,
        title: `Query Console ${prev.filter((t) => t.type === 'query' || t.type === 'console').length + 1}`,
        type: 'query' as TabType,
        sql,
      },
    ]);
    setActiveTabId(newId);
    if (runImmediately && sql.trim()) {
      // Defer so tab state is committed before run updates shared result state
      setTimeout(() => handleRunQueryWithSafeMode(sql), 0);
    }
  }, [handleRunQueryWithSafeMode]);

  // Cmd/Ctrl+P command palette; Cmd/Ctrl+Shift+P also works
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setIsCommandPaletteOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const fallbackTab: WorkspaceTab = { id: 'tab-query', title: 'Query Editor', type: 'query', sql: '-- Write your SQL query here\n' };
  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0] || fallbackTab;

  // Schema for AI agent — prefer qualified names; columns for active browser object
  const aiSchema = useMemo(() => ({
    tables: tables.map((t) => {
      const key = objectKey(t);
      return {
        name: key,
        columns: activeTab?.tableName === key ? columns.map((c) => c.name) : [],
      };
    }),
  }), [tables, columns, activeTab?.tableName]);

  // ERD: prefer fully-loaded schema cache (with FKs); fall back to partial
  const erdTables = useMemo(() => {
    if (erdSchema.length > 0) return erdSchema;
    if (tables.length === 0) return [];
    return tables
      .filter((t) => !(t.table_type || '').toUpperCase().includes('VIEW'))
      .map((t) => {
        const key = objectKey(t);
        if (activeTab?.tableName === key && columns.length > 0) {
          return { name: key, columns };
        }
        return {
          name: key,
          columns: [
            {
              name: erdLoading ? 'loading…' : '(open ERD to load full schema)',
              data_type: '',
              is_nullable: true,
              is_primary_key: false,
            },
          ],
        };
      });
  }, [erdSchema, tables, columns, activeTab?.tableName, erdLoading]);

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
          queryHistory={queryHistory}
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
          onSelectQuery={(sql: string) => {
            if (activeConnection) {
              setShowWelcome(false);
            } else if (connections.length > 0) {
              handleWelcomeConnect(connections[0]);
            }
          }}
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
        activeObjectKey={activeTab?.tableName}
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
            onExecuteQuery={(sql) => openQueryWithSql(sql, true)}
            aiConfig={aiConfig}
          />

          {/* Right: Actions & Settings icons */}
          <div className="flex items-center space-x-1">
            <button
              onClick={() => setIsSnapshotsModalOpen(true)}
              className="text-textMuted hover:text-text transition-colors p-1.5 rounded-lg hover:bg-surface2 flex items-center space-x-1 text-xs"
              title="Save / compare query result snapshots"
            >
              <Camera className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Snapshots</span>
            </button>

            <button
              onClick={() => {
                setShareTargetConnId(undefined);
                setIsSecureShareModalOpen(true);
              }}
              className="text-textMuted hover:text-text transition-colors p-1.5 rounded-lg hover:bg-surface2 flex items-center space-x-1 text-xs"
              title="Share Connections via Encrypted Text"
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

        <TransactionBar
          connectionId={activeConnection?.id || null}
          connectionName={activeConnection?.name}
          onStatusChange={setTxActive}
        />

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
              <button
                onClick={() => setIsSnapshotsModalOpen(true)}
                className="px-2 py-0.5 rounded text-textMuted text-[11px] hover:bg-surface2 flex items-center space-x-1"
                title="Save / compare query result snapshots"
              >
                <Camera className="w-3 h-3" />
                <span>Snapshots</span>
              </button>
              <button
                onClick={() => setIsMockDataOpen(true)}
                className="px-2 py-0.5 rounded text-textMuted text-[11px] hover:bg-surface2 flex items-center space-x-1"
                title="Generate and INSERT synthetic rows"
              >
                <Sparkles className="w-3 h-3" />
                <span>Seed Mock Data</span>
              </button>
            </div>
          </div>
        )}

        {/* === WORKSPACE CONTENT === */}
        <div className="flex-1 overflow-hidden relative flex">
          <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
            {activeTab.type === 'browser' ? (
              <>
                <FilterBar
                  columns={columns}
                  onApplyFilter={(w, s) => {
                    setFilterWhere(w);
                    setFilterSort(s);
                    setCurrentPage(1);
                    if (activeTab.tableName) {
                      loadTablePage(activeTab.tableName, 1, { where: w, sort: s });
                    }
                  }}
                  onClearFilter={() => {
                    setFilterWhere('');
                    setFilterSort('');
                    setCurrentPage(1);
                    if (activeTab.tableName) {
                      loadTablePage(activeTab.tableName, 1, { where: '', sort: '' });
                    }
                  }}
                />
                <TableGrid
                  tableName={activeTab.tableName || 'products'}
                  columns={columns}
                  rows={displayRows}
                  pkInfo={pkInfo}
                  stagedEdits={stagedEdits}
                  onStageEdit={handleStageEdit}
                  onApplyEdits={() => setActiveTabId('tab-staging')}
                  onResetEdits={handleResetAllStaged}
                  currentPage={currentPage}
                  onPageChange={handleBrowserPageChange}
                  isLoading={isBrowserLoading}
                  piiRules={piiRules}
                  totalRows={tableTotalRows ?? undefined}
                  pageSize={generalSettings.pageSize}
                  onAddRow={handleAddRow}
                  onDeleteSelectedRow={handleDeleteSelectedRow}
                  readOnly={!!activeConnection && resolveReadOnlyFlag(activeConnection)}
                  onJumpToRow={(tbl, filterCol, val) => {
                    const where = `WHERE ${filterCol} = '${String(val).replace(/'/g, "''")}'`;
                    handleOpenTableTab(tbl).then(() => {
                      setFilterWhere(where);
                      setCurrentPage(1);
                      loadTablePage(tbl, 1, { where });
                    });
                  }}
                />
              </>
            ) : activeTab.type === 'query' || activeTab.type === 'console' ? (
              <SqlEditor
                key={activeTab.id}
                initialSql={activeTab.sql || ''}
                onRunQuery={handleRunQueryWithSafeMode}
                onCancelQuery={handleCancelQuery}
                queryResult={queryResult}
                multiResults={multiResults}
                isLoading={isQueryLoading}
                schemaData={schemaData}
                dialectHint={activeConnection?.db_type}
                readOnlyConnection={
                  !!activeConnection && resolveReadOnlyFlag(activeConnection)
                }
                onProfileQuery={(sql) => {
                  setProfilerSql(sql);
                  setIsProfilerOpen(true);
                }}
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
                onExportSqlPatch={handleExportStagingPatch}
                onCopySqlPatch={handleCopyStagingPatch}
                onDiscard={(id) => {
                  setStagedChanges((prev) => {
                    const removed = prev.find((c) => c.id === id);
                    if (removed) {
                      setStagedEdits((edits) =>
                        edits.filter(
                          (e) =>
                            !(e.rowId === removed.rowId && e.columnName === removed.columnName)
                        )
                      );
                    }
                    return prev.filter((c) => c.id !== id);
                  });
                }}
              />
            ) : activeTab.type === 'structure' ? (
              <StructureView
                tableName={activeTab.tableName || 'products'}
                columns={columns}
                connectionId={activeConnection?.id}
                dbType={activeConnection?.db_type}
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
              erdLoading && erdSchema.length === 0 ? (
                <div className="flex items-center justify-center h-full text-textMuted text-sm">
                  Loading full schema with foreign keys…
                </div>
              ) : (
                <SchemaVisualizer tables={erdTables} onSelectTable={handleOpenTableTab} />
              )
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
              <RoutinesManager
                connectionId={activeConnection?.id || ''}
                dbType={activeConnection?.db_type || 'postgres'}
                onExecuteSql={(sql) => openQueryWithSql(sql, true)}
              />
            ) : activeTab.type === 'roles' ? (
              <RolesManager
                connectionId={activeConnection?.id || ''}
                dbType={activeConnection?.db_type || 'postgres'}
                onExecuteSql={(sql) => openQueryWithSql(sql, false)}
              />
            ) : activeTab.type === 'builder' ? (
              <VisualQueryBuilder
                tables={tables}
                columns={columns}
                activeTable={activeTab.tableName}
                onExecuteQuery={(sql) => openQueryWithSql(sql, true)}
              />
            ) : null}
          </div>

          {showHistoryPanel && (
            <QueryHistory
              history={queryHistory.map((h) => ({
                id: h.id,
                sql: h.sql,
                timestamp: h.timestamp,
                executionTimeMs: h.executionTimeMs,
                status: h.status,
                errorMessage: h.errorMessage,
              }))}
              onSelectQuery={(sql) => openQueryWithSql(sql, false)}
              onClearHistory={async () => {
                setQueryHistory([]);
                try {
                  await clearPersistedQueryHistory();
                } catch {
                  /* ignore */
                }
              }}
            />
          )}
        </div>

        {/* FOOTER STATUS BAR */}
        <footer className="h-7 bg-[#0A0A0B] px-3 flex items-center justify-between text-[11px] text-textMuted select-none shrink-0 z-20 border-t border-border/30">
          <div className="flex items-center space-x-3">
            {activeConnection && (
              <span
                className={`px-1.5 py-0.5 rounded border text-[9px] font-bold tracking-wide ${
                  getEnvironmentMeta(activeConnection.environment).badgeClass
                }`}
                title={getEnvironmentMeta(activeConnection.environment).description}
              >
                {getEnvironmentMeta(activeConnection.environment).short}
              </span>
            )}
            {activeConnection && resolveReadOnlyFlag(activeConnection) && (
              <span
                className="flex items-center space-x-1 text-amber-400"
                title={readOnlyReason(activeConnection) || 'Read-only'}
              >
                <Shield className="w-3 h-3" />
                <span className="text-[10px]">Read-only</span>
              </span>
            )}
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
            <button
              onClick={() => setIsDiagnosticsOpen(true)}
              disabled={!activeConnection}
              className="hover:text-text text-[10px] disabled:opacity-40"
              title="Connection diagnostics"
            >
              Diagnose
            </button>
            <button
              onClick={() => {
                setProfilerSql('');
                setIsProfilerOpen(true);
              }}
              disabled={!activeConnection}
              className="hover:text-text text-[10px] disabled:opacity-40"
              title="Query profiler"
            >
              Profile
            </button>
            <button
              onClick={() => setShowHistoryPanel((v) => !v)}
              className={`hover:text-text text-[10px] flex items-center space-x-0.5 ${showHistoryPanel ? 'text-accent' : ''}`}
              title="Query history"
            >
              <Clock className="w-3 h-3" />
              <span>History</span>
            </button>
            {txActive && (
              <span className="text-amber-400 text-[10px] font-semibold">TX</span>
            )}
            <button
              onClick={() => {
                const existing = tabs.find((t) => t.type === 'routines');
                if (existing) {
                  setActiveTabId(existing.id);
                  return;
                }
                const id = `tab-routines-${Date.now()}`;
                setTabs((prev) => [...prev, { id, title: 'Routines', type: 'routines' }]);
                setActiveTabId(id);
              }}
              className="hover:text-text text-[10px]"
            >
              Routines
            </button>
            <button
              onClick={() => {
                const existing = tabs.find((t) => t.type === 'roles');
                if (existing) {
                  setActiveTabId(existing.id);
                  return;
                }
                const id = `tab-roles-${Date.now()}`;
                setTabs((prev) => [...prev, { id, title: 'Roles', type: 'roles' }]);
                setActiveTabId(id);
              }}
              className="hover:text-text text-[10px]"
            >
              Roles
            </button>
            <button onClick={() => setIsProcessManagerOpen(true)} className="hover:text-text text-[10px]">
              Processes
            </button>
            <button onClick={() => setIsAuditModalOpen(true)} className="hover:text-text text-[10px]">Audit</button>
            <button onClick={() => setIsPiiConfigModalOpen(true)} className="hover:text-text text-[10px]">PII</button>
            <button
              onClick={() => setIsSchemaDiffModalOpen(true)}
              className="hover:text-text text-[10px]"
              title="Live schema diff between connected databases"
            >
              Schema Diff
            </button>
            <button
              onClick={() => setIsCommandPaletteOpen(true)}
              className="hover:text-text text-[10px] flex items-center space-x-0.5"
              title="Command Palette (Cmd+P)"
            >
              <Command className="w-3 h-3" />
              <span>Palette</span>
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
              <span className="text-text font-medium">
                {activeConnection?.name || 'Disconnected'}
                {activeConnection?.database ? ` · ${activeConnection.database}` : ''}
              </span>
              <span className="text-textMuted">
                {connections.filter((c) => c.is_connected).length} open
              </span>
              <span className="text-textMuted">
                {queryHistory.length > 0 ? `${queryHistory[0].executionTimeMs}ms` : '—'}
              </span>
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

      <SafeModeModal
        isOpen={isSafeModeModalOpen}
        onClose={() => setIsSafeModeModalOpen(false)}
        sql={pendingDestructiveSql}
        warningMessage={safeModeWarning}
        onConfirmExecute={() => {
          setIsSafeModeModalOpen(false);
          executeSqlQuery(pendingDestructiveSql, {
            updateGrid: false,
            allowDestructive: true,
          });
        }}
      />

      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        tableName={activeTab.tableName || 'products'}
        onExport={handleExportData}
        activeFilter={filterWhere}
        supportsFullExport={!!activeConnection}
      />

      <ResultSnapshotsModal
        isOpen={isSnapshotsModalOpen}
        onClose={() => setIsSnapshotsModalOpen(false)}
        capture={
          queryResult && queryResult.rows.length > 0
            ? {
                columns: queryResult.columns.map((c) => c.name),
                rows: queryResult.rows,
                sql: activeTab?.sql || '',
                connectionId: activeConnection?.id || '',
                connectionName: activeConnection?.name || '',
              }
            : displayRows.length > 0 && columns.length > 0
              ? {
                  columns: columns.map((c) => c.name),
                  rows: displayRows,
                  sql: activeTab?.tableName
                    ? `-- browser page: ${activeTab.tableName}`
                    : '',
                  connectionId: activeConnection?.id || '',
                  connectionName: activeConnection?.name || '',
                }
              : null
        }
      />

      <ImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        connectionId={activeConnection?.id}
        tableName={activeTab?.tableName}
        onImportSuccess={(file, count) => {
          if (activeTab?.tableName) {
            loadTablePage(activeTab.tableName, currentPage);
          }
          console.info(`Imported ${count} rows from ${file}`);
        }}
      />

      <AuditLoggerModal isOpen={isAuditModalOpen} onClose={() => setIsAuditModalOpen(false)} />
      <SchemaDiffModal
        isOpen={isSchemaDiffModalOpen}
        onClose={() => setIsSchemaDiffModalOpen(false)}
        connections={connections}
        activeConnectionId={activeConnection?.id}
      />
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

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        tables={tables}
        connections={connections}
        savedQueries={savedQueries}
        onSelectTable={handleOpenTableTab}
        onSelectConnection={async (conn) => {
          await handleWelcomeConnect(conn);
        }}
        onSelectQuery={(q) => openQueryWithSql(q.sql_content, false)}
        commands={[
          { id: 'cmd-new-query', label: 'New Query Console', action: handleOpenNewQueryTab },
          { id: 'cmd-erd', label: 'Open Schema Visualizer (ERD)', action: handleOpenErd },
          { id: 'cmd-health', label: 'Open Health / Metrics', action: handleOpenHealth },
          {
            id: 'cmd-processes',
            label: 'Open Process Manager',
            action: () => setIsProcessManagerOpen(true),
          },
          {
            id: 'cmd-schema-diff',
            label: 'Open Schema Diff',
            action: () => setIsSchemaDiffModalOpen(true),
          },
          {
            id: 'cmd-settings',
            label: 'Open Settings',
            action: () => setIsSettingsOpen(true),
          },
          {
            id: 'cmd-staging',
            label: 'Go to Staging & Commit',
            action: () => setActiveTabId('tab-staging'),
          },
          {
            id: 'cmd-routines',
            label: 'Open Routines Manager',
            action: () => {
              const existing = tabs.find((t) => t.type === 'routines');
              if (existing) setActiveTabId(existing.id);
              else {
                const id = `tab-routines-${Date.now()}`;
                setTabs((prev) => [...prev, { id, title: 'Routines', type: 'routines' }]);
                setActiveTabId(id);
              }
            },
          },
          {
            id: 'cmd-roles',
            label: 'Open Roles Manager',
            action: () => {
              const existing = tabs.find((t) => t.type === 'roles');
              if (existing) setActiveTabId(existing.id);
              else {
                const id = `tab-roles-${Date.now()}`;
                setTabs((prev) => [...prev, { id, title: 'Roles', type: 'roles' }]);
                setActiveTabId(id);
              }
            },
          },
        ]}
      />

      <ProcessManagerModal
        isOpen={isProcessManagerOpen}
        onClose={() => setIsProcessManagerOpen(false)}
        connectionId={activeConnection?.id || ''}
        dbType={activeConnection?.db_type || 'postgres'}
      />

      <ConnectionDiagnosticsModal
        isOpen={isDiagnosticsOpen}
        onClose={() => setIsDiagnosticsOpen(false)}
        connectionId={activeConnection?.id || ''}
        connectionName={activeConnection?.name || ''}
      />

      <QueryProfilerModal
        isOpen={isProfilerOpen}
        onClose={() => setIsProfilerOpen(false)}
        connectionId={activeConnection?.id || ''}
        initialSql={profilerSql || queryHistory[0]?.sql || 'SELECT 1'}
      />

      <MockDataGenerator
        isOpen={isMockDataOpen}
        onClose={() => setIsMockDataOpen(false)}
        tableName={activeTab?.tableName || 'table'}
        columns={columns}
        onGenerate={handleMockDataGenerate}
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
