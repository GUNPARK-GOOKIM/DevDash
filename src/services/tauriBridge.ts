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
  if (!isTauriAvailable()) return [];

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
  if (!isTauriAvailable()) return [];

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
    // Return mock payload for browser mode
    return {
      columns: [
        { name: 'id', type_name: 'INTEGER' },
        { name: 'statement', type_name: 'TEXT' },
        { name: 'status', type_name: 'VARCHAR' },
      ],
      rows: [[1, sql, 'EXECUTED (BROWSER MOCK)']],
      execution_time_ms: 12,
      affected_rows: 1,
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

  await invoke('stream_sql_query', {
    connectionId,
    queryId,
    sql,
    chunkSize: 500,
  });
};

