import React, { useState, useMemo, useCallback } from 'react';
import {
  Wand2, Table as TableIcon, Plus, Trash2, Play, Copy, Filter, ArrowDownUp,
  Layers, Check, ChevronRight, Sparkles, Code2, Database, Shield,
} from 'lucide-react';
import { TableItem, ColumnItem } from '../types';

interface QueryFilter {
  id: string;
  column: string;
  operator: '=' | '!=' | '>' | '<' | 'LIKE' | 'IN' | 'IS NULL';
  value: string;
}

interface QueryJoin {
  id: string;
  joinType: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
  targetTable: string;
  leftColumn: string;
  rightColumn: string;
}

interface VisualQueryBuilderProps {
  tables: TableItem[];
  columns: ColumnItem[];
  activeTable?: string;
  onExecuteQuery: (sql: string) => void;
}

export const VisualQueryBuilder: React.FC<VisualQueryBuilderProps> = ({
  tables,
  columns,
  activeTable = 'products',
  onExecuteQuery,
}) => {
  const [selectedTable, setSelectedTable] = useState<string>(activeTable);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [filters, setFilters] = useState<QueryFilter[]>([]);
  const [joins, setJoins] = useState<QueryJoin[]>([]);
  const [groupBy, setGroupBy] = useState<string[]>([]);
  const [orderBy, setOrderBy] = useState<string>('');
  const [orderDir, setOrderDir] = useState<'ASC' | 'DESC'>('ASC');
  const [limit, setLimit] = useState<number>(100);

  // Toggle column selection
  const toggleColumn = (colName: string) => {
    setSelectedColumns((prev) =>
      prev.includes(colName) ? prev.filter((c) => c !== colName) : [...prev, colName]
    );
  };

  // Select all columns
  const selectAllColumns = () => {
    setSelectedColumns(columns.map((c) => c.name));
  };

  // Add filter
  const addFilter = () => {
    setFilters((prev) => [
      ...prev,
      { id: `filter-${Date.now()}`, column: columns[0]?.name || 'id', operator: '=', value: '' },
    ]);
  };

  // Remove filter
  const removeFilter = (id: string) => {
    setFilters((prev) => prev.filter((f) => f.id !== id));
  };

  // Add join
  const addJoin = () => {
    const nextTable = tables.find((t) => t.name !== selectedTable)?.name || 'users';
    setJoins((prev) => [
      ...prev,
      { id: `join-${Date.now()}`, joinType: 'INNER', targetTable: nextTable, leftColumn: 'id', rightColumn: 'user_id' },
    ]);
  };

  // Remove join
  const removeJoin = (id: string) => {
    setJoins((prev) => prev.filter((j) => j.id !== id));
  };

  // Build SQL string dynamically
  const generatedSql = useMemo(() => {
    const colsStr = selectedColumns.length > 0 ? selectedColumns.map((c) => `${selectedTable}.${c}`).join(', ') : '*';
    let sql = `SELECT ${colsStr}\nFROM ${selectedTable}`;

    // Add Joins
    joins.forEach((j) => {
      sql += `\n${j.joinType} JOIN ${j.targetTable} ON ${selectedTable}.${j.leftColumn} = ${j.targetTable}.${j.rightColumn}`;
    });

    // Add Filters
    if (filters.length > 0) {
      const whereClauses = filters.map((f) => {
        if (f.operator === 'IS NULL') return `${selectedTable}.${f.column} IS NULL`;
        const val = isNaN(Number(f.value)) ? `'${f.value}'` : f.value;
        return `${selectedTable}.${f.column} ${f.operator} ${val}`;
      });
      sql += `\nWHERE ${whereClauses.join(' AND ')}`;
    }

    // Add Group By
    if (groupBy.length > 0) {
      sql += `\nGROUP BY ${groupBy.map((g) => `${selectedTable}.${g}`).join(', ')}`;
    }

    // Add Order By
    if (orderBy) {
      sql += `\nORDER BY ${selectedTable}.${orderBy} ${orderDir}`;
    }

    // Add Limit
    if (limit > 0) {
      sql += `\nLIMIT ${limit};`;
    }

    return sql;
  }, [selectedTable, selectedColumns, filters, joins, groupBy, orderBy, orderDir, limit]);

  const copyToClipboard = useCallback(() => {
    navigator.clipboard.writeText(generatedSql);
  }, [generatedSql]);

  return (
    <div className="flex flex-col h-full bg-base text-text font-sans select-none">
      {/* Header */}
      <div className="h-10 bg-surface border-b border-border flex items-center px-4 justify-between shrink-0">
        <div className="flex items-center space-x-2 text-accent font-semibold text-sm">
          <Wand2 className="w-4 h-4 text-purple-400" />
          <span className="text-text">Visual No-Code Query Builder</span>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={copyToClipboard}
            className="px-2.5 py-1 bg-surface2 hover:bg-surface2/80 text-textMuted hover:text-text rounded-lg text-xs font-medium transition-colors flex items-center space-x-1"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copy SQL</span>
          </button>
          <button
            onClick={() => onExecuteQuery(generatedSql)}
            className="px-3 py-1 bg-accent hover:bg-accentHover text-white rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1.5 shadow"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Execute Query</span>
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Config Panel */}
        <div className="w-[380px] border-r border-border bg-surface/30 p-4 space-y-5 overflow-auto shrink-0">
          {/* Table Picker */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-textMuted uppercase tracking-wider block">Source Table:</label>
            <select
              value={selectedTable}
              onChange={(e) => {
                setSelectedTable(e.target.value);
                setSelectedColumns([]);
              }}
              className="w-full bg-surface2 border border-border rounded-lg px-3 py-1.5 text-xs text-text outline-none focus:border-accent"
            >
              {tables.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Columns Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-textMuted uppercase tracking-wider">Columns ({selectedColumns.length}/{columns.length}):</label>
              <button onClick={selectAllColumns} className="text-[10px] text-accent hover:underline">Select All</button>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-[140px] overflow-auto p-2 bg-base border border-border/40 rounded-lg">
              {columns.map((col) => {
                const isSelected = selectedColumns.includes(col.name);
                return (
                  <button
                    key={col.name}
                    onClick={() => toggleColumn(col.name)}
                    className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors border ${
                      isSelected ? 'bg-accent/20 border-accent text-accent font-bold' : 'border-border text-textMuted hover:text-text hover:bg-surface2'
                    }`}
                  >
                    {col.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Joins */}
          <div className="space-y-2 border-t border-border/50 pt-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-textMuted uppercase tracking-wider">Joins:</label>
              <button onClick={addJoin} className="text-[11px] text-accent hover:underline flex items-center space-x-1">
                <Plus className="w-3 h-3" />
                <span>Add Join</span>
              </button>
            </div>
            {joins.map((j) => (
              <div key={j.id} className="p-2.5 bg-base border border-border/50 rounded-lg space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <select
                    value={j.joinType}
                    onChange={(e) => setJoins((prev) => prev.map((item) => (item.id === j.id ? { ...item, joinType: e.target.value as any } : item)))}
                    className="bg-surface2 border border-border rounded px-2 py-1 text-[11px] font-bold text-accent"
                  >
                    <option value="INNER">INNER JOIN</option>
                    <option value="LEFT">LEFT JOIN</option>
                    <option value="RIGHT">RIGHT JOIN</option>
                  </select>
                  <button onClick={() => removeJoin(j.id)} className="text-textMuted hover:text-red-400">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center space-x-1.5 font-mono text-[11px]">
                  <span>{selectedTable}.</span>
                  <input
                    type="text"
                    value={j.leftColumn}
                    onChange={(e) => setJoins((prev) => prev.map((item) => (item.id === j.id ? { ...item, leftColumn: e.target.value } : item)))}
                    className="w-20 bg-surface2 border border-border rounded px-1.5 py-0.5 text-text"
                  />
                  <span>=</span>
                  <input
                    type="text"
                    value={j.targetTable}
                    onChange={(e) => setJoins((prev) => prev.map((item) => (item.id === j.id ? { ...item, targetTable: e.target.value } : item)))}
                    className="w-20 bg-surface2 border border-border rounded px-1.5 py-0.5 text-emerald-400"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Filters (WHERE) */}
          <div className="space-y-2 border-t border-border/50 pt-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-textMuted uppercase tracking-wider">Filters (WHERE):</label>
              <button onClick={addFilter} className="text-[11px] text-accent hover:underline flex items-center space-x-1">
                <Plus className="w-3 h-3" />
                <span>Add Filter</span>
              </button>
            </div>
            {filters.map((f) => (
              <div key={f.id} className="flex items-center space-x-1.5 bg-base p-2 border border-border/50 rounded-lg text-xs">
                <select
                  value={f.column}
                  onChange={(e) => setFilters((prev) => prev.map((item) => (item.id === f.id ? { ...item, column: e.target.value } : item)))}
                  className="bg-surface2 border border-border rounded px-1.5 py-1 text-[11px] font-mono text-text flex-1"
                >
                  {columns.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select
                  value={f.operator}
                  onChange={(e) => setFilters((prev) => prev.map((item) => (item.id === f.id ? { ...item, operator: e.target.value as any } : item)))}
                  className="bg-surface2 border border-border rounded px-1.5 py-1 text-[11px] font-mono text-accent"
                >
                  <option value="=">=</option>
                  <option value="!=">!=</option>
                  <option value=">">&gt;</option>
                  <option value="<">&lt;</option>
                  <option value="LIKE">LIKE</option>
                  <option value="IS NULL">IS NULL</option>
                </select>
                {f.operator !== 'IS NULL' && (
                  <input
                    type="text"
                    placeholder="value"
                    value={f.value}
                    onChange={(e) => setFilters((prev) => prev.map((item) => (item.id === f.id ? { ...item, value: e.target.value } : item)))}
                    className="w-20 bg-surface2 border border-border rounded px-1.5 py-1 text-[11px] font-mono text-text"
                  />
                )}
                <button onClick={() => removeFilter(f.id)} className="text-textMuted hover:text-red-400">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Right Generated SQL Preview */}
        <div className="flex-1 flex flex-col bg-base p-5">
          <div className="flex items-center space-x-2 text-xs font-semibold text-textMuted uppercase tracking-wider mb-2">
            <Code2 className="w-4 h-4 text-accent" />
            <span>Generated Live SQL Query</span>
          </div>
          <div className="flex-1 bg-surface border border-border rounded-xl p-4 font-mono text-sm text-accent leading-relaxed overflow-auto">
            <pre>{generatedSql}</pre>
          </div>
        </div>
      </div>
    </div>
  );
};
