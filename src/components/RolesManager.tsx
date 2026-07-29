import React, { useState, useMemo, useCallback } from 'react';
import {
  Users, ShieldCheck, Shield, ShieldAlert, Search, Plus, Trash2,
  Edit3, Copy, ChevronRight, ChevronDown, Key, Lock, Unlock,
  CheckCircle2, XCircle, Database, Eye, Settings2, UserPlus,
  Crown, UserCheck, AlertTriangle,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────
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
  ownedSchemas: string[];
  created: string;
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

// ─── Privilege Cell ─────────────────────────────────────────────────
const PrivilegeCell: React.FC<{ level: PrivilegeLevel; onToggle?: () => void }> = ({ level, onToggle }) => {
  const config: Record<PrivilegeLevel, { icon: React.ReactNode; color: string; bg: string }> = {
    GRANT: { icon: <CheckCircle2 className="w-3 h-3" />, color: 'text-emerald-400', bg: 'bg-emerald-500/10 hover:bg-emerald-500/20' },
    REVOKE: { icon: <XCircle className="w-3 h-3" />, color: 'text-red-400', bg: 'bg-red-500/10 hover:bg-red-500/20' },
    INHERITED: { icon: <CheckCircle2 className="w-3 h-3 opacity-50" />, color: 'text-sky-400', bg: 'bg-sky-500/10 hover:bg-sky-500/20' },
    NONE: { icon: <span className="w-3 h-3 block rounded-full border border-border/50" />, color: 'text-textMuted', bg: 'hover:bg-surface2/50' },
  };
  const c = config[level];
  return (
    <button
      onClick={onToggle}
      className={`p-1.5 rounded-md transition-colors cursor-pointer ${c.bg} ${c.color}`}
      title={level}
    >
      {c.icon}
    </button>
  );
};

// ─── Main Component ─────────────────────────────────────────────────
export const RolesManager: React.FC<RolesManagerProps> = ({ connectionId, dbType, onExecuteSql }) => {
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'users' | 'roles'>('users');
  const [showGrantSql, setShowGrantSql] = useState(false);

  // ─── Demo Users ───────────────────────────────────────────────
  const [users] = useState<DbUser[]>([
    {
      name: 'postgres',
      isSuperuser: true,
      canLogin: true,
      canCreateDb: true,
      canCreateRole: true,
      connectionLimit: -1,
      memberOf: [],
      ownedSchemas: ['public', 'pg_catalog'],
      created: '2026-01-01T00:00:00Z',
    },
    {
      name: 'app_user',
      isSuperuser: false,
      canLogin: true,
      canCreateDb: false,
      canCreateRole: false,
      connectionLimit: 100,
      validUntil: '2027-01-01',
      memberOf: ['app_readwrite'],
      ownedSchemas: [],
      created: '2026-02-15T10:30:00Z',
    },
    {
      name: 'readonly_user',
      isSuperuser: false,
      canLogin: true,
      canCreateDb: false,
      canCreateRole: false,
      connectionLimit: 50,
      memberOf: ['app_readonly'],
      ownedSchemas: [],
      created: '2026-03-10T14:00:00Z',
    },
    {
      name: 'analytics_bot',
      isSuperuser: false,
      canLogin: true,
      canCreateDb: false,
      canCreateRole: false,
      connectionLimit: 10,
      validUntil: '2026-12-31',
      memberOf: ['app_readonly', 'analytics_role'],
      ownedSchemas: ['analytics'],
      created: '2026-04-20T09:00:00Z',
    },
    {
      name: 'migration_runner',
      isSuperuser: false,
      canLogin: true,
      canCreateDb: true,
      canCreateRole: false,
      connectionLimit: 5,
      memberOf: ['app_readwrite', 'schema_admin'],
      ownedSchemas: [],
      created: '2026-05-05T16:00:00Z',
    },
  ]);

  // ─── Demo Roles ───────────────────────────────────────────────
  const [roles] = useState<DbRole[]>([
    { name: 'app_readonly', isSuperuser: false, isInheritable: true, members: ['readonly_user', 'analytics_bot'], description: 'Read-only access to application tables' },
    { name: 'app_readwrite', isSuperuser: false, isInheritable: true, members: ['app_user', 'migration_runner'], description: 'Full CRUD access to application tables' },
    { name: 'schema_admin', isSuperuser: false, isInheritable: true, members: ['migration_runner'], description: 'DDL permissions for schema migrations' },
    { name: 'analytics_role', isSuperuser: false, isInheritable: true, members: ['analytics_bot'], description: 'Access to analytics schema and materialized views' },
  ]);

  // ─── Demo Table Privileges ────────────────────────────────────
  const [tablePrivileges] = useState<Record<string, TablePrivilege[]>>({
    'app_user': [
      { tableName: 'users', schema: 'public', select: 'GRANT', insert: 'GRANT', update: 'GRANT', delete: 'GRANT', truncate: 'REVOKE', references: 'NONE', trigger: 'REVOKE' },
      { tableName: 'orders', schema: 'public', select: 'GRANT', insert: 'GRANT', update: 'GRANT', delete: 'GRANT', truncate: 'REVOKE', references: 'GRANT', trigger: 'REVOKE' },
      { tableName: 'products', schema: 'public', select: 'GRANT', insert: 'GRANT', update: 'GRANT', delete: 'REVOKE', truncate: 'REVOKE', references: 'NONE', trigger: 'NONE' },
      { tableName: 'audit_log', schema: 'public', select: 'GRANT', insert: 'GRANT', update: 'REVOKE', delete: 'REVOKE', truncate: 'REVOKE', references: 'NONE', trigger: 'NONE' },
    ],
    'readonly_user': [
      { tableName: 'users', schema: 'public', select: 'INHERITED', insert: 'REVOKE', update: 'REVOKE', delete: 'REVOKE', truncate: 'REVOKE', references: 'NONE', trigger: 'REVOKE' },
      { tableName: 'orders', schema: 'public', select: 'INHERITED', insert: 'REVOKE', update: 'REVOKE', delete: 'REVOKE', truncate: 'REVOKE', references: 'NONE', trigger: 'REVOKE' },
      { tableName: 'products', schema: 'public', select: 'INHERITED', insert: 'REVOKE', update: 'REVOKE', delete: 'REVOKE', truncate: 'REVOKE', references: 'NONE', trigger: 'NONE' },
    ],
    'analytics_bot': [
      { tableName: 'users', schema: 'public', select: 'INHERITED', insert: 'REVOKE', update: 'REVOKE', delete: 'REVOKE', truncate: 'REVOKE', references: 'NONE', trigger: 'REVOKE' },
      { tableName: 'orders', schema: 'public', select: 'INHERITED', insert: 'REVOKE', update: 'REVOKE', delete: 'REVOKE', truncate: 'REVOKE', references: 'NONE', trigger: 'REVOKE' },
      { tableName: 'analytics_summary', schema: 'analytics', select: 'GRANT', insert: 'GRANT', update: 'GRANT', delete: 'REVOKE', truncate: 'REVOKE', references: 'NONE', trigger: 'NONE' },
    ],
  });

  const filteredUsers = useMemo(() => {
    if (!searchFilter) return users;
    return users.filter(u => u.name.toLowerCase().includes(searchFilter.toLowerCase()));
  }, [users, searchFilter]);

  const filteredRoles = useMemo(() => {
    if (!searchFilter) return roles;
    return roles.filter(r => r.name.toLowerCase().includes(searchFilter.toLowerCase()));
  }, [roles, searchFilter]);

  const selected = useMemo(() => users.find(u => u.name === selectedUser), [users, selectedUser]);
  const selectedPrivileges = useMemo(() => tablePrivileges[selectedUser || ''] || [], [tablePrivileges, selectedUser]);

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
  }, []);

  const generateGrantSql = useCallback(() => {
    if (!selected) return '';
    const grants = selectedPrivileges.flatMap(tp => {
      const privs: string[] = [];
      if (tp.select === 'GRANT') privs.push('SELECT');
      if (tp.insert === 'GRANT') privs.push('INSERT');
      if (tp.update === 'GRANT') privs.push('UPDATE');
      if (tp.delete === 'GRANT') privs.push('DELETE');
      if (tp.truncate === 'GRANT') privs.push('TRUNCATE');
      if (tp.references === 'GRANT') privs.push('REFERENCES');
      if (tp.trigger === 'GRANT') privs.push('TRIGGER');
      if (privs.length === 0) return [];
      return [`GRANT ${privs.join(', ')} ON ${tp.schema}.${tp.tableName} TO ${selected.name};`];
    });
    return grants.join('\n');
  }, [selected, selectedPrivileges]);

  return (
    <div className="flex flex-col h-full bg-base text-text font-sans select-none">
      {/* Header */}
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
        <button className="px-2.5 py-1 bg-accent/15 text-accent border border-accent/30 rounded-lg text-[11px] font-medium hover:bg-accent/25 transition-colors flex items-center space-x-1">
          <UserPlus className="w-3 h-3" />
          <span>Create User</span>
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel */}
        <div className="w-[260px] border-r border-border flex flex-col bg-surface/30 shrink-0">
          {/* Tab Selector */}
          <div className="flex border-b border-border">
            {(['users', 'roles'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); setSelectedUser(null); }}
                className={`flex-1 py-2 text-[11px] font-medium text-center transition-colors border-b-2 ${
                  activeTab === tab ? 'border-accent text-accent bg-accent/5' : 'border-transparent text-textMuted hover:text-text'
                }`}
              >
                {tab === 'users' ? `Users (${users.length})` : `Roles (${roles.length})`}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-textMuted" />
              <input
                type="text"
                placeholder={`Filter ${activeTab}…`}
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full bg-surface2 border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-text placeholder:text-textMuted/50 outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all"
              />
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-auto">
            {activeTab === 'users' ? (
              filteredUsers.map(user => (
                <button
                  key={user.name}
                  onClick={() => setSelectedUser(user.name)}
                  className={`w-full px-3 py-2.5 text-left border-b border-border/20 transition-colors ${
                    selectedUser === user.name ? 'bg-accent/10 border-l-2 border-l-accent' : 'hover:bg-surface2/40'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    {user.isSuperuser ? (
                      <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    ) : user.canLogin ? (
                      <UserCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <Users className="w-3.5 h-3.5 text-textMuted shrink-0" />
                    )}
                    <span className="text-[11px] font-mono font-medium text-text">{user.name}</span>
                  </div>
                  <div className="flex items-center space-x-2 mt-1 pl-5">
                    {user.isSuperuser && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 font-bold">SUPER</span>}
                    {user.canLogin && <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">LOGIN</span>}
                    {user.memberOf.length > 0 && <span className="text-[9px] text-textMuted">{user.memberOf.length} roles</span>}
                  </div>
                </button>
              ))
            ) : (
              filteredRoles.map(role => (
                <button
                  key={role.name}
                  onClick={() => setSelectedUser(null)}
                  className="w-full px-3 py-2.5 text-left border-b border-border/20 transition-colors hover:bg-surface2/40"
                >
                  <div className="flex items-center space-x-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span className="text-[11px] font-mono font-medium text-text">{role.name}</span>
                  </div>
                  <div className="mt-1 pl-5 space-y-0.5">
                    {role.description && <p className="text-[10px] text-textMuted truncate">{role.description}</p>}
                    <div className="flex items-center space-x-2">
                      <span className="text-[9px] text-textMuted">{role.members.length} members</span>
                      {role.isInheritable && <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400 border border-sky-500/30">INHERIT</span>}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right Panel: Privilege Matrix */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selected ? (
            <>
              {/* User Header */}
              <div className="px-4 py-3 border-b border-border bg-surface/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    {selected.isSuperuser ? <Crown className="w-4 h-4 text-amber-400" /> : <UserCheck className="w-4 h-4 text-emerald-400" />}
                    <span className="text-sm font-semibold font-mono text-text">{selected.name}</span>
                    {selected.isSuperuser && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">SUPERUSER</span>}
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <button
                      onClick={() => setShowGrantSql(!showGrantSql)}
                      className="px-2.5 py-1 bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 rounded-lg text-[11px] font-medium hover:bg-indigo-500/25 transition-colors"
                    >
                      {showGrantSql ? 'Hide SQL' : 'Show GRANT SQL'}
                    </button>
                    <button className="p-1.5 rounded-md hover:bg-surface2 text-textMuted hover:text-text transition-colors" title="Edit User">
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button className="p-1.5 rounded-md hover:bg-red-500/20 text-textMuted hover:text-red-400 transition-colors" title="Drop User">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* User Properties */}
                <div className="grid grid-cols-4 gap-3 mt-3 text-[10px]">
                  <div className="flex items-center space-x-1.5">
                    {selected.canLogin ? <Unlock className="w-3 h-3 text-emerald-400" /> : <Lock className="w-3 h-3 text-red-400" />}
                    <span className="text-textMuted">Login:</span>
                    <span className={selected.canLogin ? 'text-emerald-400' : 'text-red-400'}>{selected.canLogin ? 'Yes' : 'No'}</span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <Database className="w-3 h-3 text-textMuted" />
                    <span className="text-textMuted">Create DB:</span>
                    <span className={selected.canCreateDb ? 'text-emerald-400' : 'text-textMuted'}>{selected.canCreateDb ? 'Yes' : 'No'}</span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <Key className="w-3 h-3 text-textMuted" />
                    <span className="text-textMuted">Conn Limit:</span>
                    <span className="text-text font-mono">{selected.connectionLimit === -1 ? '∞' : selected.connectionLimit}</span>
                  </div>
                  {selected.validUntil && (
                    <div className="flex items-center space-x-1.5">
                      <AlertTriangle className="w-3 h-3 text-amber-400" />
                      <span className="text-textMuted">Expires:</span>
                      <span className="text-amber-400 font-mono">{selected.validUntil}</span>
                    </div>
                  )}
                </div>

                {/* Role Memberships */}
                {selected.memberOf.length > 0 && (
                  <div className="flex items-center space-x-2 mt-2">
                    <span className="text-[10px] text-textMuted">Member of:</span>
                    {selected.memberOf.map(r => (
                      <span key={r} className="text-[9px] px-1.5 py-0.5 bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 rounded font-mono">{r}</span>
                    ))}
                  </div>
                )}
              </div>

              {/* GRANT SQL Panel */}
              {showGrantSql && (
                <div className="border-b border-border bg-surface2/20 px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-semibold text-textMuted uppercase tracking-wider">Generated GRANT Statements</span>
                    <button onClick={() => copyToClipboard(generateGrantSql())} className="p-1 rounded hover:bg-surface2 text-textMuted hover:text-text transition-colors">
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                  <pre className="font-mono text-[11px] text-indigo-400 whitespace-pre-wrap max-h-[120px] overflow-auto">{generateGrantSql() || '-- No direct grants (all inherited from roles)'}</pre>
                </div>
              )}

              {/* Privilege Matrix */}
              <div className="flex-1 overflow-auto">
                <div className="p-4">
                  <h4 className="text-[10px] font-semibold text-textMuted uppercase tracking-wider mb-3">Table Privilege Matrix</h4>
                  {selectedPrivileges.length > 0 ? (
                    <div className="bg-surface border border-border rounded-xl overflow-hidden">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-surface2/30 border-b border-border">
                            <th className="text-left px-3 py-2 text-[10px] font-semibold text-textMuted uppercase tracking-wider">Table</th>
                            <th className="text-center px-2 py-2 text-[10px] font-semibold text-textMuted uppercase">SEL</th>
                            <th className="text-center px-2 py-2 text-[10px] font-semibold text-textMuted uppercase">INS</th>
                            <th className="text-center px-2 py-2 text-[10px] font-semibold text-textMuted uppercase">UPD</th>
                            <th className="text-center px-2 py-2 text-[10px] font-semibold text-textMuted uppercase">DEL</th>
                            <th className="text-center px-2 py-2 text-[10px] font-semibold text-textMuted uppercase">TRUNC</th>
                            <th className="text-center px-2 py-2 text-[10px] font-semibold text-textMuted uppercase">REF</th>
                            <th className="text-center px-2 py-2 text-[10px] font-semibold text-textMuted uppercase">TRIG</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedPrivileges.map((tp) => (
                            <tr key={`${tp.schema}.${tp.tableName}`} className="border-b border-border/30 hover:bg-surface2/20 transition-colors">
                              <td className="px-3 py-2">
                                <div className="flex items-center space-x-1.5">
                                  <Database className="w-3 h-3 text-accent shrink-0" />
                                  <span className="text-[11px] font-mono text-text">{tp.schema}.{tp.tableName}</span>
                                </div>
                              </td>
                              <td className="text-center px-2 py-1"><PrivilegeCell level={tp.select} /></td>
                              <td className="text-center px-2 py-1"><PrivilegeCell level={tp.insert} /></td>
                              <td className="text-center px-2 py-1"><PrivilegeCell level={tp.update} /></td>
                              <td className="text-center px-2 py-1"><PrivilegeCell level={tp.delete} /></td>
                              <td className="text-center px-2 py-1"><PrivilegeCell level={tp.truncate} /></td>
                              <td className="text-center px-2 py-1"><PrivilegeCell level={tp.references} /></td>
                              <td className="text-center px-2 py-1"><PrivilegeCell level={tp.trigger} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {/* Legend */}
                      <div className="px-3 py-2 bg-surface2/20 border-t border-border flex items-center space-x-4 text-[9px] text-textMuted">
                        <span className="flex items-center space-x-1"><CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" /><span>Granted</span></span>
                        <span className="flex items-center space-x-1"><XCircle className="w-2.5 h-2.5 text-red-400" /><span>Revoked</span></span>
                        <span className="flex items-center space-x-1"><CheckCircle2 className="w-2.5 h-2.5 text-sky-400 opacity-50" /><span>Inherited from role</span></span>
                        <span className="flex items-center space-x-1"><span className="w-2.5 h-2.5 rounded-full border border-border/50 inline-block" /><span>Not set</span></span>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-surface border border-border rounded-xl p-8 text-center">
                      <ShieldCheck className="w-8 h-8 mx-auto text-textMuted/30 mb-2" />
                      <p className="text-xs text-textMuted">{selected.isSuperuser ? 'Superuser — has unrestricted access to all objects' : 'No direct table privileges found'}</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-textMuted">
              <div className="text-center space-y-2">
                <Shield className="w-10 h-10 mx-auto opacity-20" />
                <p className="text-sm">Select a user to view their permission matrix</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
