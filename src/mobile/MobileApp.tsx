import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ConnectionModal } from '../components/ConnectionModal';
import { SafeModeModal } from '../components/SafeModeModal';
import { SettingsModal, AiConfig, GeneralSettings } from '../components/SettingsModal';
import { MobileViewport } from '../components/mobile/MobileViewport';
import { MobileTab } from '../components/mobile/MobileBottomNav';
import {
  AiAssistResponsePayload,
  cancelQuery,
  catalogToConfig,
  checkSqlSafety,
  configToCatalog,
  connectDatabase,
  ConnectionDiagnostics,
  diagnoseConnection,
  disconnectDatabase,
  exportDeviceSync,
  fetchPersistedQueryHistory,
  generateSqlAssist,
  getDatabaseTables,
  getDbPassword,
  getDeviceSyncStatus,
  getSecret,
  getTableColumns,
  importDeviceSync,
  listConnectionCatalog,
  listResultSnapshots,
  MergeReport,
  PersistedQueryHistoryItem,
  QueryResultPayload,
  removeCatalogConnection,
  runSqlQuery,
  saveDbPassword,
  saveResultSnapshot,
  SnapshotMeta,
  suggestedSyncExportPath,
  SyncExportReport,
  SyncStatus,
  upsertCatalogConnection,
} from '../services/tauriBridge';
import { ColumnItem, ConnectionConfig, DbKind, TableItem, objectKey } from '../types';
import { resolveReadOnlyFlag } from '../utils/connectionEnv';
import { ConnectionsScreen } from './screens/ConnectionsScreen';
import { SchemaScreen } from './screens/SchemaScreen';
import { QueryScreen } from './screens/QueryScreen';
import { AssistScreen } from './screens/AssistScreen';
import { MoreScreen } from './screens/MoreScreen';

const defaultAi = (): AiConfig => {
  try {
    const saved = localStorage.getItem('devdash_ai_config');
    if (saved) return JSON.parse(saved);
  } catch {
    /* ignore */
  }
  return {
    enabled: true,
    provider: 'ollama',
    model: 'qwen2.5-coder',
    baseUrl: 'http://127.0.0.1:11434',
    apiKey: '',
  };
};

const defaultGeneral = (): GeneralSettings => {
  try {
    const saved = localStorage.getItem('devdash_general_settings');
    if (saved) return JSON.parse(saved);
  } catch {
    /* ignore */
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
};

export const MobileApp: React.FC = () => {
  const [tab, setTab] = useState<MobileTab>('connections');
  const [connections, setConnections] = useState<ConnectionConfig[]>([]);
  const [defaultName, setDefaultName] = useState<string | null>(null);
  const [active, setActive] = useState<ConnectionConfig | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [tables, setTables] = useState<TableItem[]>([]);
  const [selectedTable, setSelectedTable] = useState<TableItem | null>(null);
  const [columns, setColumns] = useState<ColumnItem[]>([]);
  const [previewCols, setPreviewCols] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<unknown[][]>([]);
  const [schemaLoading, setSchemaLoading] = useState(false);

  const [sql, setSql] = useState('SELECT 1;');
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryId, setQueryId] = useState<string | null>(null);
  const [result, setResult] = useState<QueryResultPayload | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [safeOpen, setSafeOpen] = useState(false);
  const [safeMsg, setSafeMsg] = useState('');
  const [pendingSql, setPendingSql] = useState<string | null>(null);

  const [prompt, setPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AiAssistResponsePayload | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagnostics, setDiagnostics] = useState<ConnectionDiagnostics | null>(null);
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]);
  const [snapshotBusy, setSnapshotBusy] = useState(false);

  const [history, setHistory] = useState<PersistedQueryHistoryItem[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [includeSecrets, setIncludeSecrets] = useState(false);
  const [importText, setImportText] = useState('');
  const [lastCipher, setLastCipher] = useState('');
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [lastReport, setLastReport] = useState<MergeReport | null>(null);

  const [connModal, setConnModal] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aiConfig, setAiConfig] = useState<AiConfig>(defaultAi);
  const [general, setGeneral] = useState<GeneralSettings>(defaultGeneral);

  const reloadCatalog = useCallback(async () => {
    const cat = await listConnectionCatalog();
    setConnections(cat.connections.map(catalogToConfig));
    setDefaultName(cat.default || null);
  }, []);

  const reloadAux = useCallback(async () => {
    try {
      setSnapshots(await listResultSnapshots(50));
    } catch {
      setSnapshots([]);
    }
    try {
      setHistory(await fetchPersistedQueryHistory(1, 40));
    } catch {
      setHistory([]);
    }
    try {
      setSyncStatus(await getDeviceSyncStatus('mobile'));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void reloadCatalog();
    void reloadAux();
  }, [reloadCatalog, reloadAux]);

  const handleConnect = async (conn: ConnectionConfig) => {
    setConnectingId(conn.id);
    setError(null);
    try {
      const pw = (await getDbPassword(conn.id)) || undefined;
      const ready: ConnectionConfig = {
        ...conn,
        is_read_only: resolveReadOnlyFlag(conn),
      };
      await connectDatabase(ready, pw);
      const tbls = await getDatabaseTables(ready.id, ready.db_type);
      setActive({ ...ready, is_connected: true });
      setTables(tbls);
      setSelectedTable(null);
      setColumns([]);
      setPreviewCols([]);
      setPreviewRows([]);
      setTab('schema');
    } catch (e: unknown) {
      setError(String((e as Error)?.message || e || 'Connect failed'));
    } finally {
      setConnectingId(null);
    }
  };

  const handleAdd = async (partial: Omit<ConnectionConfig, 'id'>, password: string) => {
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `conn-${Date.now()}`;
    const conn: ConnectionConfig = {
      ...partial,
      id,
      is_read_only: resolveReadOnlyFlag(partial),
    };
    if (password) {
      try {
        await saveDbPassword(id, password);
      } catch {
        /* keyring optional */
      }
    }
    await upsertCatalogConnection(configToCatalog(conn), password, 'mobile');
    await reloadCatalog();
    setConnModal(false);
    await handleConnect(conn);
  };

  const handleRemove = async (conn: ConnectionConfig) => {
    if (active?.id === conn.id) {
      try {
        await disconnectDatabase(conn.id);
      } catch {
        /* ignore */
      }
      setActive(null);
      setTables([]);
    }
    await removeCatalogConnection(conn.id);
    await reloadCatalog();
  };

  const loadTable = async (t: TableItem) => {
    if (!active) return;
    setSchemaLoading(true);
    setSelectedTable(t);
    try {
      const cols = await getTableColumns(active.id, active.db_type, objectKey(t));
      setColumns(cols);
      setPreviewCols([]);
      setPreviewRows([]);
    } finally {
      setSchemaLoading(false);
    }
  };

  const previewTable = async (t: TableItem) => {
    if (!active) return;
    const ident = objectKey(t);
    const q = `SELECT * FROM ${ident} LIMIT 50`;
    try {
      const payload = await runSqlQuery(active.id, q);
      setPreviewCols(payload.columns.map((c) => c.name));
      setPreviewRows(payload.rows);
    } catch (e: unknown) {
      setError(String((e as Error)?.message || e));
    }
  };

  const executeSql = async (text: string, allowDestructive: boolean) => {
    if (!active) return;
    setQueryLoading(true);
    setQueryError(null);
    const qid = `m-${Date.now()}`;
    setQueryId(qid);
    try {
      const payload = await runSqlQuery(active.id, text, qid, allowDestructive);
      setResult(payload);
      void reloadAux();
    } catch (e: unknown) {
      setQueryError(String((e as Error)?.message || e));
    } finally {
      setQueryLoading(false);
      setQueryId(null);
    }
  };

  const handleRun = async () => {
    const text = sql.trim();
    if (!text) return;
    const safety = await checkSqlSafety(text);
    if (safety.requires_confirmation && safety.is_destructive) {
      setSafeMsg(safety.warning_message || 'Destructive SQL');
      setPendingSql(text);
      setSafeOpen(true);
      return;
    }
    await executeSql(text, false);
  };

  const generateAi = async () => {
    if (!active) return;
    setAiLoading(true);
    setAiError(null);
    try {
      let apiKey = aiConfig.apiKey;
      if (!apiKey) {
        try {
          apiKey = (await getSecret('ai_api_key')) || '';
        } catch {
          apiKey = '';
        }
      }
      const schemaTables = tables.slice(0, 40).map((t) => ({
        name: objectKey(t),
        columns: [],
      }));
      const res = await generateSqlAssist({
        provider: aiConfig.provider || 'ollama',
        base_url: aiConfig.baseUrl || null,
        model: aiConfig.model || null,
        api_key: apiKey || null,
        db_type: active.db_type,
        active_table: selectedTable ? objectKey(selectedTable) : null,
        last_queries: history.slice(0, 3).map((h) => h.query_text),
        tables: schemaTables,
        prompt,
      });
      setAiResult(res);
    } catch (e: unknown) {
      setAiError(String((e as Error)?.message || e));
    } finally {
      setAiLoading(false);
    }
  };

  const runDiagnose = async () => {
    if (!active) return;
    setDiagLoading(true);
    try {
      setDiagnostics(await diagnoseConnection(active.id));
    } catch (e: unknown) {
      setDiagnostics({
        success: false,
        latency_ms: 0,
        server_version: '',
        current_database: '',
        current_user: '',
        message: String((e as Error)?.message || e),
        checks: [],
      });
    } finally {
      setDiagLoading(false);
    }
  };

  const saveSnap = async () => {
    if (!active || !result) {
      setError('Run a query before saving a snapshot');
      return;
    }
    setSnapshotBusy(true);
    try {
      await saveResultSnapshot({
        name: `mobile-${new Date().toISOString().slice(0, 19)}`,
        connectionId: active.id,
        connectionName: active.name,
        sqlText: sql,
        columns: result.columns.map((c) => c.name),
        rows: result.rows,
      });
      await reloadAux();
    } catch (e: unknown) {
      setError(String((e as Error)?.message || e));
    } finally {
      setSnapshotBusy(false);
    }
  };

  const doExport = async () => {
    setSyncBusy(true);
    setSyncMessage(null);
    try {
      const path = await suggestedSyncExportPath();
      const report: SyncExportReport = await exportDeviceSync({
        passphrase,
        includeSecrets,
        path: path || undefined,
        platform: 'mobile',
      });
      setLastCipher(report.ciphertext);
      setImportText(report.ciphertext);
      setSyncMessage(
        report.path
          ? `Wrote ${report.path} (${report.connection_count} connections)`
          : `Exported ${report.connection_count} connections (ciphertext ready to copy)`
      );
      await reloadAux();
    } catch (e: unknown) {
      setSyncMessage(String((e as Error)?.message || e));
    } finally {
      setSyncBusy(false);
    }
  };

  const doImport = async () => {
    setSyncBusy(true);
    setSyncMessage(null);
    try {
      const report = await importDeviceSync({
        passphrase,
        ciphertext: importText || lastCipher,
        importSecrets: includeSecrets,
      });
      setLastReport(report);
      setSyncMessage(
        `Merged from ${report.origin_device_name || 'bundle'}: +${report.connections_added} connections`
      );
      await reloadCatalog();
      await reloadAux();
    } catch (e: unknown) {
      setSyncMessage(String((e as Error)?.message || e));
    } finally {
      setSyncBusy(false);
    }
  };

  const subtitle = useMemo(() => {
    if (!active) return 'Offline-first · shared Rust core';
    return `${active.name} · ${active.db_type}${resolveReadOnlyFlag(active) ? ' · RO' : ''}`;
  }, [active]);

  return (
    <>
      <MobileViewport
        title="DevDash Mobile"
        subtitle={subtitle}
        activeTab={tab}
        onSelectTab={setTab}
      >
        {tab === 'connections' && (
          <ConnectionsScreen
            connections={connections}
            activeId={active?.id}
            defaultName={defaultName}
            connectingId={connectingId}
            error={error}
            onAdd={() => setConnModal(true)}
            onConnect={handleConnect}
            onRemove={handleRemove}
          />
        )}
        {tab === 'schema' && (
          <SchemaScreen
            connection={active}
            tables={tables}
            selectedTable={selectedTable}
            columns={columns}
            previewRows={previewRows}
            previewCols={previewCols}
            loading={schemaLoading}
            onSelectTable={loadTable}
            onPreview={previewTable}
            onBack={() => {
              setSelectedTable(null);
              setColumns([]);
              setPreviewCols([]);
              setPreviewRows([]);
            }}
          />
        )}
        {tab === 'query' && (
          <QueryScreen
            connection={active}
            sql={sql}
            onSqlChange={setSql}
            onRun={handleRun}
            onCancel={() => queryId && void cancelQuery(queryId)}
            loading={queryLoading}
            readOnly={!!active && resolveReadOnlyFlag(active)}
            result={result}
            error={queryError}
          />
        )}
        {tab === 'assist' && (
          <AssistScreen
            connection={active}
            prompt={prompt}
            onPromptChange={setPrompt}
            onGenerate={generateAi}
            onRunGenerated={() => {
              if (aiResult?.sql) {
                setSql(aiResult.sql);
                setTab('query');
              }
            }}
            aiLoading={aiLoading}
            aiResult={aiResult}
            aiError={aiError}
            onDiagnose={runDiagnose}
            diagLoading={diagLoading}
            diagnostics={diagnostics}
            snapshots={snapshots}
            onSaveSnapshot={saveSnap}
            snapshotBusy={snapshotBusy}
          />
        )}
        {tab === 'more' && (
          <MoreScreen
            history={history}
            onLoadHistory={(q) => {
              setSql(q);
              setTab('query');
            }}
            syncStatus={syncStatus}
            passphrase={passphrase}
            onPassphraseChange={setPassphrase}
            includeSecrets={includeSecrets}
            onIncludeSecretsChange={setIncludeSecrets}
            importText={importText}
            onImportTextChange={setImportText}
            onExport={doExport}
            onImport={doImport}
            onRefreshStatus={() => void reloadAux()}
            syncBusy={syncBusy}
            syncMessage={syncMessage}
            lastReport={lastReport}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        )}
      </MobileViewport>

      <ConnectionModal
        isOpen={connModal}
        onClose={() => setConnModal(false)}
        onSave={handleAdd}
        initialDbKind={undefined as DbKind | undefined}
      />

      <SafeModeModal
        isOpen={safeOpen}
        onClose={() => {
          setSafeOpen(false);
          setPendingSql(null);
        }}
        sql={pendingSql || ''}
        warningMessage={safeMsg}
        onConfirmExecute={() => {
          const t = pendingSql;
          setSafeOpen(false);
          setPendingSql(null);
          if (t) void executeSql(t, true);
        }}
      />

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        aiConfig={aiConfig}
        onAiConfigChange={(cfg) => {
          setAiConfig(cfg);
          localStorage.setItem('devdash_ai_config', JSON.stringify(cfg));
        }}
        generalSettings={general}
        onGeneralSettingsChange={(g) => {
          setGeneral(g);
          localStorage.setItem('devdash_general_settings', JSON.stringify(g));
        }}
      />
    </>
  );
};
