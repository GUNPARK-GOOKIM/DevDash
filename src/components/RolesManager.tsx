import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Users, ShieldCheck, Search, RefreshCw, Crown, UserCheck, AlertCircle,
  CheckCircle2, XCircle, Copy,
} from 'lucide-react';
import { runSqlQuery } from '../services/tauriBridge';

type PrivilegeLevel = 'GRANT' | 'REVOKE' | 'INHERITED' | 'NONE';

interface DbUser {
  name: string;
  isSuperuser: boolean;
  canLogin: boolean;
  canCreateDb: boolean;
  canCreateRole: boolean;
  connectionLimit: number;
  validUntil?: string;
  memberOf: string[];
}

interface DbRole {
  name: string;
  isSuperuser: boolean;
  isInheritable: boolean;
  members: string[];
  description?: string;
}

interface TablePrivilege {
  tableName: string;
  schema: string;
  select: PrivilegeLevel;
  insert: PrivilegeLevel;
  update: PrivilegeLevel;
  delete: PrivilegeLevel;
  truncate: PrivilegeLevel;
  references: PrivilegeLevel;
  trigger: PrivilegeLevel;
}

interface RolesManagerProps {
  connectionId: string;
  dbType: string;
  onExecuteSql?: (sql: string) => void;
}

const PrivilegeCell: React.FC<{ level: PrivilegeLevel }> = ({ level }) => {
  const config: Record<PrivilegeLevel, { icon: React.ReactNode; color: string; bg: string }> = {
    GRANT: {
      icon: <CheckCircle2 className="w-3 h-3" />,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
    },
    REVOKE: {
      icon: <XCircle className="w-3 h-3" />,
      color: 'text-red-400',
      bg: 'bg-red-500/10',
    },
    INHERITED: {
      icon: <CheckCircle2 className="w-3 h-3 opacity-50" />,
      color: 'text-sky-400',
      bg: 'bg-sky-500/10',
    },
    NONE: {
      icon: <span className="w-3 h-3 block rounded-full border border-border/50" />,
      color: 'text-textMuted',
      bg: '',
    },
  };
  const c = config[level];
  return (
    <span className={`inline-flex p-1.5 rounded-md ${c.bg} ${c.color}`} title={level}>
      {c.icon}
    </span>
  );
};

function colIdx(columns: { name: string }[], name: string): number {
  return columns.findIndex((c) => c.name.toLowerCase() === name.toLowerCase());
}

function cell(row: any[], columns: { name: string }[], name: string): unknown {
  const i = colIdx(columns, name);
  return i >= 0 ? row[i] : undefined;
}

function truthy(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const s = String(v ?? '').toLowerCase();
  return s === 't' || s === 'true' || s === 'y' || s === 'yes' || s === '1';
}

export const RolesManager: React.FC<RolesManagerProps> = ({
  connectionId,
  dbType,
  onExecuteSql,
}) => {
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'users' | 'roles'>('users');
  const [users, setUsers] = useState<DbUser[]>([]);
  const [roles, setRoles] = useState<DbRole[]>([]);
  const [tablePrivileges, setTablePrivileges] = useState<TablePrivilege[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCatalog = useCallback(async () => {
    if (!connectionId) {
      setError('No active connection');
      return;
    }
    const kind = dbType.toLowerCase();
    if (kind === 'sqlite') {
      setUsers([]);
      setRoles([]);
      setError('SQLite has no server role/privilege model. Access is controlled by filesystem permissions.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (kind === 'postgres' || kind === 'postgresql' || kind === 'cockroachdb' || kind === 'redshift') {
        const rolesRes = await runSqlQuery(
          connectionId,
          `SELECT rolname, rolsuper, rolcanlogin, rolcreatedb, rolcreaterole, rolconnlimit,
                  rolvaliduntil::text AS valid_until, rolinherit
           FROM pg_roles
           ORDER BY rolname
           LIMIT 500;`
        );

        const memberRes = await runSqlQuery(
          connectionId,
          `SELECT r.rolname AS role_name, m.rolname AS member_name
           FROM pg_auth_members am
           JOIN pg_roles r ON r.oid = am.roleid
           JOIN pg_roles m ON m.oid = am.member;`
        ).catch(() => ({ columns: [], rows: [] as any[][] }));

        const memberships: Record<string, string[]> = {};
        const roleMembers: Record<string, string[]> = {};
        for (const row of memberRes.rows) {
          const roleName = String(cell(row, memberRes.columns, 'role_name') ?? '');
          const memberName = String(cell(row, memberRes.columns, 'member_name') ?? '');
          if (!memberships[memberName]) memberships[memberName] = [];
          memberships[memberName].push(roleName);
          if (!roleMembers[roleName]) roleMembers[roleName] = [];
          roleMembers[roleName].push(memberName);
        }

        const userList: DbUser[] = [];
        const roleList: DbRole[] = [];
        for (const row of rolesRes.rows) {
          const name = String(cell(row, rolesRes.columns, 'rolname') ?? '');
          const canLogin = truthy(cell(row, rolesRes.columns, 'rolcanlogin'));
          const isSuper = truthy(cell(row, rolesRes.columns, 'rolsuper'));
          const entry: DbUser = {
            name,
            isSuperuser: isSuper,
            canLogin,
            canCreateDb: truthy(cell(row, rolesRes.columns, 'rolcreatedb')),
            canCreateRole: truthy(cell(row, rolesRes.columns, 'rolcreaterole')),
            connectionLimit: Number(cell(row, rolesRes.columns, 'rolconnlimit') ?? -1),
            validUntil: String(cell(row, rolesRes.columns, 'valid_until') || '') || undefined,
            memberOf: memberships[name] || [],
          };
          if (canLogin) userList.push(entry);
          roleList.push({
            name,
            isSuperuser: isSuper,
            isInheritable: truthy(cell(row, rolesRes.columns, 'rolinherit')),
            members: roleMembers[name] || [],
          });
        }
        setUsers(userList);
        setRoles(roleList);
        setSelectedUser((prev) => {
          if (prev && userList.some((u) => u.name === prev)) return prev;
          return userList[0]?.name ?? null;
        });
      } else if (kind === 'mysql' || kind === 'mariadb') {
        // Prefer mysql.user when permitted; fall back to current_user only
        let userList: DbUser[] = [];
        try {
          const res = await runSqlQuery(
            connectionId,
            `SELECT User AS user_name, Host AS host,
                    Super_priv, Create_priv, Create_user_priv, max_user_connections
             FROM mysql.user
             ORDER BY User
             LIMIT 500;`
          );
          userList = res.rows.map((row) => {
            const name = `${cell(row, res.columns, 'user_name')}@${cell(row, res.columns, 'host')}`;
            return {
              name,
              isSuperuser: String(cell(row, res.columns, 'Super_priv') || '').toUpperCase() === 'Y',
              canLogin: true,
              canCreateDb: String(cell(row, res.columns, 'Create_priv') || '').toUpperCase() === 'Y',
              canCreateRole: String(cell(row, res.columns, 'Create_user_priv') || '').toUpperCase() === 'Y',
              connectionLimit: Number(cell(row, res.columns, 'max_user_connections') ?? 0) || -1,
              memberOf: [],
            };
          });
        } catch {
          const res = await runSqlQuery(connectionId, `SELECT CURRENT_USER() AS user_name;`);
          userList = res.rows.map((row) => ({
            name: String(cell(row, res.columns, 'user_name') ?? 'current_user'),
            isSuperuser: false,
            canLogin: true,
            canCreateDb: false,
            canCreateRole: false,
            connectionLimit: -1,
            memberOf: [],
          }));
        }
        setUsers(userList);
        setRoles([]);
        setSelectedUser((prev) => {
          if (prev && userList.some((u) => u.name === prev)) return prev;
          return userList[0]?.name ?? null;
        });
      } else {
        setError(`Roles manager is not supported for engine "${dbType}".`);
        setUsers([]);
        setRoles([]);
      }
    } catch (err) {
      setError(String(err));
      setUsers([]);
      setRoles([]);
    } finally {
      setLoading(false);
    }
  }, [connectionId, dbType]);

  const loadPrivileges = useCallback(
    async (userName: string) => {
      if (!connectionId || !userName) {
        setTablePrivileges([]);
        return;
      }
      const kind = dbType.toLowerCase();
      try {
        if (kind === 'postgres' || kind === 'postgresql' || kind === 'cockroachdb' || kind === 'redshift') {
          // Strip role attributes — grantee is role name
          const grantee = userName.replace(/@.*/, '');
          const sql = `
            SELECT table_schema, table_name, privilege_type, is_grantable
            FROM information_schema.role_table_grants
            WHERE grantee = '${grantee.replace(/'/g, "''")}'
            ORDER BY table_schema, table_name
            LIMIT 500;
          `;
          const res = await runSqlQuery(connectionId, sql);
          const byTable = new Map<string, TablePrivilege>();
          for (const row of res.rows) {
            const schema = String(cell(row, res.columns, 'table_schema') ?? 'public');
            const tableName = String(cell(row, res.columns, 'table_name') ?? '');
            const key = `${schema}.${tableName}`;
            const priv = String(cell(row, res.columns, 'privilege_type') ?? '').toUpperCase();
            if (!byTable.has(key)) {
              byTable.set(key, {
                tableName,
                schema,
                select: 'NONE',
                insert: 'NONE',
                update: 'NONE',
                delete: 'NONE',
                truncate: 'NONE',
                references: 'NONE',
                trigger: 'NONE',
              });
            }
            const entry = byTable.get(key)!;
            const level: PrivilegeLevel = 'GRANT';
            if (priv === 'SELECT') entry.select = level;
            else if (priv === 'INSERT') entry.insert = level;
            else if (priv === 'UPDATE') entry.update = level;
            else if (priv === 'DELETE') entry.delete = level;
            else if (priv === 'TRUNCATE') entry.truncate = level;
            else if (priv === 'REFERENCES') entry.references = level;
            else if (priv === 'TRIGGER') entry.trigger = level;
          }
          setTablePrivileges(Array.from(byTable.values()));
        } else if (kind === 'mysql' || kind === 'mariadb') {
          const res = await runSqlQuery(
            connectionId,
            `SELECT TABLE_SCHEMA AS table_schema, TABLE_NAME AS table_name,
                    PRIVILEGE_TYPE AS privilege_type
             FROM information_schema.TABLE_PRIVILEGES
             WHERE GRANTEE LIKE '%${userName.split('@')[0].replace(/'/g, "''")}%'
             LIMIT 500;`
          );
          const byTable = new Map<string, TablePrivilege>();
          for (const row of res.rows) {
            const schema = String(cell(row, res.columns, 'table_schema') ?? '');
            const tableName = String(cell(row, res.columns, 'table_name') ?? '');
            const key = `${schema}.${tableName}`;
            const priv = String(cell(row, res.columns, 'privilege_type') ?? '').toUpperCase();
            if (!byTable.has(key)) {
              byTable.set(key, {
                tableName,
                schema,
                select: 'NONE',
                insert: 'NONE',
                update: 'NONE',
                delete: 'NONE',
                truncate: 'NONE',
                references: 'NONE',
                trigger: 'NONE',
              });
            }
            const entry = byTable.get(key)!;
            if (priv === 'SELECT') entry.select = 'GRANT';
            else if (priv === 'INSERT') entry.insert = 'GRANT';
            else if (priv === 'UPDATE') entry.update = 'GRANT';
            else if (priv === 'DELETE') entry.delete = 'GRANT';
            else if (priv === 'REFERENCES') entry.references = 'GRANT';
            else if (priv === 'TRIGGER') entry.trigger = 'GRANT';
          }
          setTablePrivileges(Array.from(byTable.values()));
        } else {
          setTablePrivileges([]);
        }
      } catch {
        setTablePrivileges([]);
      }
    },
    [connectionId, dbType]
  );

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    if (selectedUser) loadPrivileges(selectedUser);
  }, [selectedUser, loadPrivileges]);

  const filteredUsers = useMemo(() => {
    if (!searchFilter) return users;
    return users.filter((u) => u.name.toLowerCase().includes(searchFilter.toLowerCase()));
  }, [users, searchFilter]);

  const filteredRoles = useMemo(() => {
    if (!searchFilter) return roles;
    return roles.filter((r) => r.name.toLowerCase().includes(searchFilter.toLowerCase()));
  }, [roles, searchFilter]);

  const selected = useMemo(() => users.find((u) => u.name === selectedUser), [users, selectedUser]);

  const generateGrantSql = useCallback(() => {
    if (!selected) return '';
    return tablePrivileges
      .flatMap((tp) => {
        const privs: string[] = [];
        if (tp.select === 'GRANT') privs.push('SELECT');
        if (tp.insert === 'GRANT') privs.push('INSERT');
        if (tp.update === 'GRANT') privs.push('UPDATE');
        if (tp.delete === 'GRANT') privs.push('DELETE');
        if (tp.truncate === 'GRANT') privs.push('TRUNCATE');
        if (tp.references === 'GRANT') privs.push('REFERENCES');
        if (tp.trigger === 'GRANT') privs.push('TRIGGER');
        if (privs.length === 0) return [];
        return [`GRANT ${privs.join(', ')} ON ${tp.schema}.${tp.tableName} TO ${selected.name.split('@')[0]};`];
      })
      .join('\n');
  }, [selected, tablePrivileges]);

  return (
    <div className="flex flex-col h-full bg-base text-text font-sans select-none">
      <div className="h-10 bg-surface border-b border-border flex items-center px-4 justify-between shrink-0">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 rounded-lg bg-sky-500/20 flex items-center justify-center">
            <Users className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <h2 className="text-sm font-semibold text-text">User, Role & Permission Manager</h2>
          <span className="text-[10px] text-textMuted bg-surface2 px-2 py-0.5 rounded-full">
            {users.length} users · {roles.length} roles
          </span>
        </div>
        <button
          onClick={loadCatalog}
          disabled={loading}
          className="px-2.5 py-1 bg-surface2 border border-border rounded-lg text-[11px] text-textMuted hover:text-text flex items-center space-x-1"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/30 text-xs text-amber-300 flex items-start space-x-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="w-[260px] border-r border-border flex flex-col bg-surface/30 shrink-0">
          <div className="flex border-b border-border">
            {(['users', 'roles'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2 text-[11px] font-medium text-center transition-colors border-b-2 ${
                  activeTab === tab
                    ? 'border-accent text-accent bg-accent/5'
                    : 'border-transparent text-textMuted hover:text-text'
                }`}
              >
                {tab === 'users' ? `Users (${users.length})` : `Roles (${roles.length})`}
              </button>
            ))}
          </div>

          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-textMuted" />
              <input
                type="text"
                placeholder={`Filter ${activeTab}…`}
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full bg-surface2 border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-text outline-none focus:border-accent/50"
              />
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            {loading && users.length === 0 && roles.length === 0 && (
              <div className="p-4 text-xs text-textMuted text-center">Loading catalog…</div>
            )}
            {activeTab === 'users'
              ? filteredUsers.map((user) => (
                  <button
                    key={user.name}
                    onClick={() => setSelectedUser(user.name)}
                    className={`w-full px-3 py-2.5 text-left border-b border-border/20 transition-colors ${
                      selectedUser === user.name
                        ? 'bg-accent/10 border-l-2 border-l-accent'
                        : 'hover:bg-surface2/40'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      {user.isSuperuser ? (
                        <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      ) : (
                        <UserCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      )}
                      <span className="text-[11px] font-mono font-medium text-text truncate">{user.name}</span>
                    </div>
                    <div className="flex items-center space-x-2 mt-1 pl-5">
                      {user.isSuperuser && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 font-bold">
                          SUPER
                        </span>
                      )}
                      {user.canLogin && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          LOGIN
                        </span>
                      )}
                    </div>
                  </button>
                ))
              : filteredRoles.map((role) => (
                  <div
                    key={role.name}
                    className="w-full px-3 py-2.5 text-left border-b border-border/20 hover:bg-surface2/40"
                  >
                    <div className="flex items-center space-x-2">
                      <ShieldCheck className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      <span className="text-[11px] font-mono font-medium text-text">{role.name}</span>
                    </div>
                    <div className="mt-1 pl-5">
                      <span className="text-[9px] text-textMuted">{role.members.length} members</span>
                      {role.isSuperuser && (
                        <span className="ml-2 text-[9px] text-amber-400 font-bold">SUPER</span>
                      )}
                    </div>
                  </div>
                ))}
          </div>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          {selected && activeTab === 'users' ? (
            <>
              <div className="px-4 py-3 border-b border-border bg-surface/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold font-mono">{selected.name}</span>
                  <button
                    onClick={() => {
                      const sql = generateGrantSql();
                      if (sql) navigator.clipboard.writeText(sql);
                    }}
                    className="p-1.5 rounded hover:bg-surface2 text-textMuted hover:text-text"
                    title="Copy GRANT SQL"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 text-[10px] text-textMuted">
                  <span>
                    Superuser: <strong className="text-text">{selected.isSuperuser ? 'yes' : 'no'}</strong>
                  </span>
                  <span>
                    Create DB: <strong className="text-text">{selected.canCreateDb ? 'yes' : 'no'}</strong>
                  </span>
                  <span>
                    Create Role: <strong className="text-text">{selected.canCreateRole ? 'yes' : 'no'}</strong>
                  </span>
                  <span>
                    Conn limit:{' '}
                    <strong className="text-text">
                      {selected.connectionLimit < 0 ? 'unlimited' : selected.connectionLimit}
                    </strong>
                  </span>
                  {selected.memberOf.length > 0 && (
                    <span>
                      Roles: <strong className="text-text font-mono">{selected.memberOf.join(', ')}</strong>
                    </span>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-auto p-3">
                <div className="text-[10px] font-semibold uppercase text-textMuted mb-2">
                  Table privileges ({tablePrivileges.length})
                </div>
                {tablePrivileges.length === 0 ? (
                  <p className="text-xs text-textMuted">
                    No table-level grants visible for this principal (or insufficient privileges to read the catalog).
                  </p>
                ) : (
                  <table className="w-full text-[11px] font-mono border-collapse">
                    <thead className="sticky top-0 bg-surface border-b border-border text-textMuted">
                      <tr>
                        <th className="text-left px-2 py-1.5">Table</th>
                        <th className="px-1 py-1.5">SEL</th>
                        <th className="px-1 py-1.5">INS</th>
                        <th className="px-1 py-1.5">UPD</th>
                        <th className="px-1 py-1.5">DEL</th>
                        <th className="px-1 py-1.5">TRU</th>
                        <th className="px-1 py-1.5">REF</th>
                        <th className="px-1 py-1.5">TRG</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tablePrivileges.map((tp) => (
                        <tr key={`${tp.schema}.${tp.tableName}`} className="border-b border-border/30">
                          <td className="px-2 py-1.5 text-text">
                            {tp.schema}.{tp.tableName}
                          </td>
                          <td className="text-center"><PrivilegeCell level={tp.select} /></td>
                          <td className="text-center"><PrivilegeCell level={tp.insert} /></td>
                          <td className="text-center"><PrivilegeCell level={tp.update} /></td>
                          <td className="text-center"><PrivilegeCell level={tp.delete} /></td>
                          <td className="text-center"><PrivilegeCell level={tp.truncate} /></td>
                          <td className="text-center"><PrivilegeCell level={tp.references} /></td>
                          <td className="text-center"><PrivilegeCell level={tp.trigger} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {onExecuteSql && generateGrantSql() && (
                  <button
                    onClick={() => onExecuteSql(generateGrantSql())}
                    className="mt-3 px-3 py-1.5 text-xs bg-accent/15 text-accent border border-accent/30 rounded"
                  >
                    Open GRANT SQL in console
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-textMuted">
              {activeTab === 'roles'
                ? 'Select the Users tab to inspect privileges, or browse role memberships on the left.'
                : 'Select a user to inspect privileges'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
