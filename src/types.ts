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
  | 'duckdb';

export interface ConnectionConfig {
  id: string;
  name: string;
  db_type: DbKind;
  host: string;
  port: number;
  user: string;
  database: string;
  project_path?: string;
  is_connected?: boolean;
  is_read_only?: boolean;
  ssh_config?: {
    enabled: boolean;
    host: string;
    port: number;
    user: string;
    key_path?: string;
  };
}

export interface TableItem {
  name: string;
  table_type: string;
}

export interface ColumnItem {
  name: string;
  data_type: string;
  is_nullable: boolean;
  is_primary_key: boolean;
}

export interface PkInfo {
  has_single_pk: boolean;
  pk_column_name?: string;
  is_read_only: boolean;
  read_only_reason?: string;
}

export interface StagedCellEdit {
  rowId: string | number;
  columnName: string;
  oldValue: any;
  newValue: any;
}

export interface SavedQuery {
  id: string;
  name: string;
  sql_content: string;
  project_path: string;
  created_at: string;
}

export interface WorkspaceTab {
  id: string;
  title: string;
  type: 'table' | 'query' | 'structure';
  tableName?: string;
  sql?: string;
}
