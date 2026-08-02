export type DbKind = 
  | 'postgres' 
  | 'mysql' 
  | 'mariadb' 
  | 'sqlite' 
  | 'mssql' 
  | 'cockroachdb' 
  | 'redshift' 
  | 'oracle' 
  | 'snowflake' 
  | 'redis' 
  | 'mongodb' 
  | 'cassandra' 
  | 'clickhouse' 
  | 'duckdb'
  | 'bigquery'
  | 'turso';

export interface ConnectionConfig {
  id: string;
  name: string;
  db_type: DbKind;
  host: string;
  port: number;
  user: string;
  database: string;
  ssl_mode?: string;
  project_path?: string;
  is_connected?: boolean;
  is_read_only?: boolean;
  group_id?: string;
  ssh_config?: {
    enabled: boolean;
    host: string;
    port: number;
    user: string;
    key_path?: string;
  };
  tls_config?: {
    require_ssl: boolean;
    ca_cert_path?: string;
    client_cert_path?: string;
    client_key_path?: string;
  };
}

export interface TableItem {
  /** Bare object name */
  name: string;
  /** Schema / namespace (public, main, analytics, …) */
  schema?: string;
  /** BASE TABLE | VIEW | … */
  table_type: string;
  /** schema.name when multi-schema; bare name otherwise */
  qualified_name?: string;
}

/** Prefer qualified_name for SQL; fall back to name. */
export function objectKey(t: TableItem | string): string {
  if (typeof t === 'string') return t;
  return t.qualified_name || (t.schema && t.schema !== 'main' ? `${t.schema}.${t.name}` : t.name);
}

export function isViewObject(t: TableItem): boolean {
  const ty = (t.table_type || '').toUpperCase();
  return ty.includes('VIEW');
}

export interface ColumnItem {
  name: string;
  data_type: string;
  is_nullable: boolean;
  is_primary_key: boolean;
  is_foreign_key?: boolean;
  fk_references?: { table: string; column: string };
  default_value?: string;
  is_unique?: boolean;
  is_indexed?: boolean;
}

export interface PkInfo {
  has_single_pk: boolean;
  pk_column_name?: string;
  pk_columns?: string[];
  is_read_only: boolean;
  read_only_reason?: string;
}

export interface StagedChange {
  id: string;
  tableName: string;
  changeType: 'update' | 'insert' | 'delete';
  identifier: string;
  diff: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  rowId: string | number;
  columnName?: string;
  checked: boolean;
  sql?: string;
}

// Legacy alias
export interface StagedCellEdit {
  rowId: string | number;
  columnName: string;
  oldValue: any;
  newValue: any;
  tableName?: string;
}

export interface SavedQuery {
  id: string;
  name: string;
  sql_content: string;
  project_path: string;
  created_at: string;
}

export interface QueryHistoryEntry {
  id: string;
  sql: string;
  connectionName: string;
  engine: string;
  timestamp: string;
  executionTimeMs: number;
  rowCount: number;
  status: 'success' | 'error';
  errorMessage?: string;
}

export type TabType = 'browser' | 'query' | 'staging' | 'console' | 'structure' | 'erd' | 'health' | 'nosql' | 'explain' | 'routines' | 'roles' | 'builder' | 'mockseed';

export interface WorkspaceTab {
  id: string;
  title: string;
  type: TabType;
  tableName?: string;
  sql?: string;
  /** Bound connection for multi-connection workspaces */
  connectionId?: string;
}

export interface ConnectionGroup {
  id: string;
  name: string;
  color: string;
  connectionIds: string[];
  collapsed: boolean;
}
