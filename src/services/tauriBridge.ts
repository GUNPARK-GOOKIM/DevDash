import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { ConnectionConfig, TableItem, ColumnItem, PkInfo } from '../types';

export interface ConnectionDetailsPayload {
  db_type: string;
  host: string;
  port: number;
  user: string;
  password?: string;
  database: string;
  ssl_mode?: string;
}

export interface TestConnectionResultPayload {
  success: boolean;
  latency_ms: number;
  message: string;
}

export interface QueryResultPayload {
  columns: { name: string; type_name: string }[];
  rows: any[][];
  execution_time_ms: number;
  affected_rows: number;
}

export const isTauriAvailable = (): boolean => {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
};

export const testDbConnection = async (
  config: Partial<ConnectionConfig>,
  password?: string
): Promise<TestConnectionResultPayload> => {
  if (!isTauriAvailable()) {
    // Web Browser Fallback simulation
    await new Promise((r) => setTimeout(r, 400));
    return {
      success: true,
      latency_ms: 24,
      message: `[Web Preview] Connection test simulated for ${config.db_type || 'database'}. Install/run in native Tauri desktop container for live TCP execution.`,
    };
  }

  const payload: ConnectionDetailsPayload = {
    db_type: config.db_type || 'postgres',
    host: config.host || 'localhost',
    port: config.port || 5432,
    user: config.user || 'postgres',
    password: password || '',
    database: config.database || 'postgres',
    ssl_mode: 'prefer',
  };

  try {
    return await invoke<TestConnectionResultPayload>('test_db_connection', { details: payload });
  } catch (err: any) {
    return {
      success: false,
      latency_ms: 0,
      message: String(err?.message || err || 'Failed to connect'),
    };
  }
};

export const connectDatabase = async (
  conn: ConnectionConfig,
  password?: string
): Promise<void> => {
  if (!isTauriAvailable()) return;

  let targetHost = conn.host;
  let targetPort = conn.port;

  if (conn.ssh_config?.enabled) {
    const localPort = await openSshTunnel(
      conn.id,
      {
        enabled: true,
        host: conn.ssh_config.host,
        port: conn.ssh_config.port,
        user: conn.ssh_config.user,
        key_path: conn.ssh_config.key_path,
      },
      conn.host,
      conn.port
    );
    targetHost = '127.0.0.1';
    targetPort = localPort;
  }

  const payload: ConnectionDetailsPayload = {
    db_type: conn.db_type,
    host: targetHost,
    port: targetPort,
    user: conn.user,
    password: password || '',
    database: conn.database,
    ssl_mode: 'prefer',
  };

  await invoke('connect_database_config', {
    connectionId: conn.id,
    details: payload,
  });
};

export const getDatabaseTables = async (
  connectionId: string,
  dbKind: string
): Promise<TableItem[]> => {
  if (!isTauriAvailable()) {
    return [
      { name: 'users', table_type: 'table' },
      { name: 'products', table_type: 'table' },
      { name: 'orders', table_type: 'table' },
      { name: 'categories', table_type: 'table' },
    ];
  }

  try {
    return await invoke<TableItem[]>('get_database_tables', {
      connectionId,
      dbKind,
    });
  } catch (err) {
    console.warn('Failed to fetch database tables via IPC:', err);
    return [];
  }
};

export const getTableColumns = async (
  connectionId: string,
  dbKind: string,
  tableName: string
): Promise<ColumnItem[]> => {
  if (!isTauriAvailable()) {
    if (tableName === 'users') {
      return [
        { name: 'id', data_type: 'INTEGER', is_nullable: false, is_primary_key: true },
        { name: 'username', data_type: 'TEXT', is_nullable: false, is_primary_key: false },
        { name: 'email', data_type: 'TEXT', is_nullable: false, is_primary_key: false },
        { name: 'role', data_type: 'TEXT', is_nullable: true, is_primary_key: false },
        { name: 'status', data_type: 'TEXT', is_nullable: true, is_primary_key: false },
        { name: 'created_at', data_type: 'TIMESTAMP', is_nullable: true, is_primary_key: false },
      ];
    }
    if (tableName === 'products') {
      return [
        { name: 'id', data_type: 'INTEGER', is_nullable: false, is_primary_key: true },
        { name: 'category_id', data_type: 'INTEGER', is_nullable: true, is_primary_key: false },
        { name: 'name', data_type: 'TEXT', is_nullable: false, is_primary_key: false },
        { name: 'price', data_type: 'REAL', is_nullable: false, is_primary_key: false },
        { name: 'stock', data_type: 'INTEGER', is_nullable: true, is_primary_key: false },
        { name: 'is_active', data_type: 'INTEGER', is_nullable: true, is_primary_key: false },
      ];
    }
    if (tableName === 'orders') {
      return [
        { name: 'id', data_type: 'INTEGER', is_nullable: false, is_primary_key: true },
        { name: 'user_id', data_type: 'INTEGER', is_nullable: false, is_primary_key: false },
        { name: 'product_id', data_type: 'INTEGER', is_nullable: false, is_primary_key: false },
        { name: 'quantity', data_type: 'INTEGER', is_nullable: true, is_primary_key: false },
        { name: 'total_amount', data_type: 'REAL', is_nullable: false, is_primary_key: false },
        { name: 'order_date', data_type: 'TIMESTAMP', is_nullable: true, is_primary_key: false },
      ];
    }
    return [
      { name: 'id', data_type: 'INTEGER', is_nullable: false, is_primary_key: true },
      { name: 'name', data_type: 'TEXT', is_nullable: false, is_primary_key: false },
      { name: 'description', data_type: 'TEXT', is_nullable: true, is_primary_key: false },
    ];
  }

  try {
    return await invoke<ColumnItem[]>('get_table_columns', {
      connectionId,
      dbKind,
      tableName,
    });
  } catch (err) {
    console.warn('Failed to fetch table columns via IPC:', err);
    return [];
  }
};

export const getPkAnalysis = async (
  connectionId: string,
  dbKind: string,
  tableName: string
): Promise<PkInfo> => {
  if (!isTauriAvailable()) {
    return { has_single_pk: true, pk_column_name: 'id', is_read_only: false };
  }

  try {
    return await invoke<PkInfo>('get_pk_analysis', {
      connectionId,
      dbKind,
      tableName,
    });
  } catch (err) {
    return { has_single_pk: true, pk_column_name: 'id', is_read_only: false };
  }
};

export const runSqlQuery = async (
  connectionId: string,
  sql: string
): Promise<QueryResultPayload> => {
  if (!isTauriAvailable()) {
    const lower = sql.toLowerCase();
    if (lower.includes('from users')) {
      return {
        columns: [
          { name: 'id', type_name: 'INTEGER' },
          { name: 'username', type_name: 'TEXT' },
          { name: 'email', type_name: 'TEXT' },
          { name: 'role', type_name: 'TEXT' },
          { name: 'status', type_name: 'TEXT' },
        ],
        rows: [
          [1, 'alice_dev', 'alice@devdash.io', 'admin', 'active'],
          [2, 'bob_lead', 'bob@devdash.io', 'lead_engineer', 'active'],
          [3, 'charlie_qa', 'charlie@devdash.io', 'qa_engineer', 'active'],
          [4, 'david_pm', 'david@devdash.io', 'product_manager', 'inactive'],
          [5, 'eva_security', 'eva@devdash.io', 'security_auditor', 'active'],
        ],
        execution_time_ms: 8,
        affected_rows: 5,
      };
    }
    if (lower.includes('from orders')) {
      return {
        columns: [
          { name: 'id', type_name: 'INTEGER' },
          { name: 'user_id', type_name: 'INTEGER' },
          { name: 'product_id', type_name: 'INTEGER' },
          { name: 'quantity', type_name: 'INTEGER' },
          { name: 'total_amount', type_name: 'REAL' },
        ],
        rows: [
          [101, 1, 1, 2, 99.98],
          [102, 2, 2, 1, 299.99],
          [103, 3, 4, 3, 106.50],
          [104, 4, 5, 1, 89.00],
          [105, 5, 3, 2, 240.00],
        ],
        execution_time_ms: 10,
        affected_rows: 5,
      };
    }
    return {
      columns: [
        { name: 'id', type_name: 'INTEGER' },
        { name: 'name', type_name: 'TEXT' },
        { name: 'price', type_name: 'REAL' },
        { name: 'stock', type_name: 'INTEGER' },
        { name: 'is_active', type_name: 'INTEGER' },
      ],
      rows: [
        [1, 'DevDash Pro Desktop License', 49.99, 500, 1],
        [2, 'DevDash Enterprise Server', 299.99, 50, 1],
        [3, 'Postgres High-Availability Cluster', 120.00, 20, 1],
        [4, 'Redis In-Memory Cache Node', 35.50, 100, 1],
        [5, 'SOC2 Compliance Audit Reporter', 89.00, 150, 1],
      ],
      execution_time_ms: 9,
      affected_rows: 5,
    };
  }

  const queryId = `q-${Date.now()}-${Math.random()}`;
  return await invoke<QueryResultPayload>('run_sql_query', {
    connectionId,
    queryId,
    sql,
  });
};

export interface SshConfigPayload {
  enabled: boolean;
  host: string;
  port: number;
  user: string;
  password?: string;
  key_path?: string;
  passphrase?: string;
}

export const testSshTunnel = async (
  sshConfig: SshConfigPayload
): Promise<TestConnectionResultPayload> => {
  if (!isTauriAvailable()) {
    await new Promise((r) => setTimeout(r, 300));
    return {
      success: true,
      latency_ms: 32,
      message: `[Web Preview] SSH tunnel check simulated for user '${sshConfig.user}' on ${sshConfig.host}:${sshConfig.port}.`,
    };
  }

  try {
    const latency = await invoke<number>('test_ssh_tunnel', { config: sshConfig });
    return {
      success: true,
      latency_ms: latency,
      message: `SSH authentication succeeded for ${sshConfig.user}@${sshConfig.host}:${sshConfig.port}`,
    };
  } catch (err: any) {
    return {
      success: false,
      latency_ms: 0,
      message: String(err?.message || err || 'SSH tunnel test failed'),
    };
  }
};

export const openSshTunnel = async (
  connectionId: string,
  sshConfig: SshConfigPayload,
  targetHost: string,
  targetPort: number
): Promise<number> => {
  if (!isTauriAvailable()) return 58432;
  return await invoke<number>('open_ssh_tunnel', {
    connectionId,
    sshConfig,
    targetHost,
    targetPort,
  });
};

export const closeSshTunnel = async (connectionId: string): Promise<void> => {
  if (!isTauriAvailable()) return;
  await invoke('close_ssh_tunnel', { connectionId });
};

export const disconnectDatabase = async (connectionId: string): Promise<void> => {
  if (!isTauriAvailable()) return;
  try {
    await invoke('disconnect_database', { connectionId });
  } catch {
    /* already closed or never opened */
  }
};

export const streamSqlQuery = async (
  connectionId: string,
  sql: string,
  onColumns: (columns: { name: string; type_name: string }[]) => void,
  onChunk: (chunk: any[][]) => void,
  onDone: (executionTimeMs: number, totalRows: number) => void
): Promise<void> => {
  if (!isTauriAvailable()) {
    onColumns([{ name: 'id', type_name: 'INTEGER' }, { name: 'data', type_name: 'TEXT' }]);
    onChunk([[1, 'Sample Row (Browser Mock)']]);
    onDone(10, 1);
    return;
  }

  const queryId = `sq-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  const unlistenCols = await listen<{ name: string; type_name: string }[]>(`query_columns_${queryId}`, (event) => {
    onColumns(event.payload);
  });

  const unlistenChunk = await listen<{ rows: any[][] }>(`query_chunk_${queryId}`, (event) => {
    onChunk(event.payload.rows);
  });

  const unlistenDone = await listen<{ execution_time_ms: number; total_rows: number }>(`query_done_${queryId}`, (event) => {
    onDone(event.payload.execution_time_ms, event.payload.total_rows);
    unlistenCols();
    unlistenChunk();
    unlistenDone();
  });

  try {
    await invoke('stream_sql_query', {
      connectionId,
      queryId,
      sql,
      chunkSize: 500,
    });
  } catch (err) {
    unlistenCols();
    unlistenChunk();
    unlistenDone();
    throw err;
  }
};

// ─── Credentials (OS keychain) ───────────────────────────────────────
export const saveDbPassword = async (connectionId: string, password: string): Promise<void> => {
  if (!isTauriAvailable()) return;
  await invoke('save_db_password', { connectionId, password });
};

export const getDbPassword = async (connectionId: string): Promise<string | null> => {
  if (!isTauriAvailable()) return null;
  try {
    return await invoke<string>('get_db_password', { connectionId });
  } catch {
    return null;
  }
};

// ─── Safety / staging ────────────────────────────────────────────────
export interface SafetyAnalysis {
  is_destructive: boolean;
  destructive_type?: string;
  warning_message?: string;
  requires_confirmation: boolean;
}

export const checkSqlSafety = async (sql: string): Promise<SafetyAnalysis> => {
  if (!isTauriAvailable()) {
    const upper = sql.trim().toUpperCase();
    const isDestructive =
      upper.startsWith('DROP') ||
      upper.startsWith('TRUNCATE') ||
      (upper.startsWith('DELETE') && !upper.includes('WHERE')) ||
      (upper.startsWith('UPDATE') && !upper.includes('WHERE'));
    return {
      is_destructive: isDestructive,
      requires_confirmation: isDestructive,
      warning_message: isDestructive ? 'Destructive operation detected' : undefined,
    };
  }
  return await invoke<SafetyAnalysis>('check_sql_safety', { sql });
};

export interface StagedCellChangePayload {
  column_name: string;
  new_value: unknown;
}

export interface StagedRowEditPayload {
  pk_value: unknown;
  changes: StagedCellChangePayload[];
}

export const commitStagedRowEdits = async (
  connectionId: string,
  tableName: string,
  pkColumn: string,
  edits: StagedRowEditPayload[]
): Promise<number> => {
  if (!isTauriAvailable()) {
    throw new Error('Staged commits require the native Tauri desktop app');
  }
  return await invoke<number>('commit_staged_row_edits', {
    connectionId,
    tableName,
    pkColumn,
    edits,
  });
};

// ─── Live metrics ────────────────────────────────────────────────────
export interface DatabaseLiveMetrics {
  active_connections: number;
  queries_per_second: number;
  cache_hit_ratio: number;
  slow_queries: { query: string; duration_ms: number; calls: number }[];
  table_sizes: { table_name: string; size_bytes: number; size_pretty: string }[];
  response_time_ms: number;
}

export const getLiveDatabaseMetrics = async (
  connectionId: string,
  engine: 'postgres' | 'mysql' | 'sqlite'
): Promise<DatabaseLiveMetrics> => {
  if (!isTauriAvailable()) {
    throw new Error('Live metrics require the native Tauri desktop app');
  }
  return await invoke<DatabaseLiveMetrics>('get_live_database_metrics', {
    connectionId,
    engine,
  });
};

// ─── Audit log ───────────────────────────────────────────────────────
export interface AuditLogEntryPayload {
  id: string;
  timestamp: string;
  user: string;
  connection_name: string;
  action_type: string;
  sql: string;
  affected_rows: number;
  status: string;
  client_ip: string;
}

export const getAuditLog = async (limit = 200): Promise<AuditLogEntryPayload[]> => {
  if (!isTauriAvailable()) return [];
  return await invoke<AuditLogEntryPayload[]>('get_audit_log', { limit });
};

// ─── Structure editor ────────────────────────────────────────────────
export type EngineDialect = 'postgres' | 'mysql' | 'sqlite';

export const structureAddColumn = async (
  connectionId: string,
  tableName: string,
  columnName: string,
  dataType: string,
  engine: EngineDialect
): Promise<void> => {
  if (!isTauriAvailable()) throw new Error('Structure edits require native app');
  // Serde on the Rust side expects lowercase enum variants (rename_all = "lowercase")
  await invoke('structure_add_column', {
    connectionId,
    payload: {
      table_name: tableName,
      column_name: columnName,
      data_type: dataType,
      is_nullable: true,
    },
    engine,
  });
};

export const structureDropColumn = async (
  connectionId: string,
  tableName: string,
  columnName: string,
  engine: EngineDialect
): Promise<void> => {
  if (!isTauriAvailable()) throw new Error('Structure edits require native app');
  await invoke('structure_drop_column', {
    connectionId,
    payload: { table_name: tableName, column_name: columnName },
    engine,
  });
};

// Engines the backend can actually open
export const SUPPORTED_ENGINES = new Set([
  'postgres',
  'postgresql',
  'mysql',
  'mariadb',
  'sqlite',
  'cockroachdb',
  'redshift',
]);

export const isEngineSupported = (dbType: string): boolean =>
  SUPPORTED_ENGINES.has(dbType.toLowerCase());

export const importCsvContent = async (
  connectionId: string,
  tableName: string,
  csvContent: string
): Promise<{ inserted_count: number; failed_count: number; failed_rows: { row_index: number; reason: string }[] }> => {
  if (!isTauriAvailable()) {
    throw new Error('CSV import requires the native Tauri desktop app');
  }
  return await invoke('import_csv_content', {
    connectionId,
    tableName,
    csvContent,
  });
};

export const saveSecret = async (account: string, secret: string): Promise<void> => {
  if (!isTauriAvailable()) return;
  await invoke('save_secret', { account, secret });
};

export const getSecret = async (account: string): Promise<string | null> => {
  if (!isTauriAvailable()) return null;
  try {
    return await invoke<string>('get_secret', { account });
  } catch {
    return null;
  }
};

export const deleteSecret = async (account: string): Promise<void> => {
  if (!isTauriAvailable()) return;
  try {
    await invoke('delete_secret', { account });
  } catch {
    /* ignore missing secret */
  }
};

async function webAesEncrypt(payloadObj: any, passphrase: string): Promise<string> {
  const enc = new TextEncoder();
  const jsonBytes = enc.encode(JSON.stringify(payloadObj));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(12));

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    key,
    jsonBytes
  );

  const toB64 = (arr: Uint8Array) => btoa(String.fromCharCode(...arr));
  return JSON.stringify({
    salt_b64: toB64(salt),
    nonce_b64: toB64(nonce),
    ciphertext_b64: toB64(new Uint8Array(ciphertext)),
    kdf_iters: 100000,
  });
}

async function webAesDecrypt(encryptedJsonStr: string, passphrase: string): Promise<any> {
  const enc = new TextEncoder();
  const fileObj = JSON.parse(encryptedJsonStr);
  const fromB64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

  const salt = fromB64(fileObj.salt_b64);
  const nonce = fromB64(fileObj.nonce_b64);
  const ciphertext = fromB64(fileObj.ciphertext_b64);
  const iters = fileObj.kdf_iters || 100000;

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: iters,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  const decryptedBytes = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce },
    key,
    ciphertext
  );

  const dec = new TextDecoder();
  return JSON.parse(dec.decode(decryptedBytes));
}

export const exportConnectionsToText = async (
  connectionIds?: string[],
  passphrase?: string
): Promise<string> => {
  if (!isTauriAvailable()) {
    const saved = localStorage.getItem('devdash_connections');
    const allConns = saved ? JSON.parse(saved) : [];
    const filtered = connectionIds
      ? allConns.filter((c: any) => connectionIds.includes(c.id))
      : allConns;
    const payload = {
      connections: filtered,
      saved_queries: [],
      exported_at: new Date().toISOString(),
      version: '1.0',
    };
    return await webAesEncrypt(payload, passphrase || '');
  }
  return await invoke<string>('export_connections_to_text', {
    connectionIds: connectionIds || null,
    passphrase: passphrase || '',
  });
};

export const importConnectionsFromText = async (
  encryptedPayload: string,
  passphrase?: string
): Promise<any> => {
  if (!isTauriAvailable()) {
    const payload = await webAesDecrypt(encryptedPayload, passphrase || '');
    if (payload?.connections && Array.isArray(payload.connections)) {
      const saved = localStorage.getItem('devdash_connections');
      const existing = saved ? JSON.parse(saved) : [];
      const merged = [...existing];
      for (const newConn of payload.connections) {
        if (!merged.some((c: any) => c.id === newConn.id || c.name === newConn.name)) {
          merged.push(newConn);
        }
      }
      localStorage.setItem('devdash_connections', JSON.stringify(merged));
    }
    return payload;
  }
  return await invoke<any>('import_connections_from_text', {
    encryptedPayload,
    passphrase: passphrase || '',
  });
};


