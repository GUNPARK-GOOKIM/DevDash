import React, { useState } from 'react';
import { ColumnItem } from '../types';
import { Filter, ArrowUpDown, Plus, X, Search } from 'lucide-react';

export interface FilterCondition {
  id: string;
  column: string;
  operator: '=' | '!=' | 'LIKE' | '>' | '<' | 'IS NULL' | 'IS NOT NULL';
  value: string;
}

export interface SortCondition {
  column: string;
  direction: 'ASC' | 'DESC';
}

interface FilterBarProps {
  columns: ColumnItem[];
  onApplyFilter: (whereClause: string, sortClause: string) => void;
  onClearFilter: () => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  columns,
  onApplyFilter,
  onClearFilter,
}) => {
  const [conditions, setConditions] = useState<FilterCondition[]>([]);
  const [sort, setSort] = useState<SortCondition | null>(null);

  const addCondition = () => {
    if (columns.length === 0) return;
    const newCond: FilterCondition = {
      id: `filter-${Date.now()}`,
      column: columns[0].name,
      operator: '=',
      value: '',
    };
    setConditions([...conditions, newCond]);
  };

  const removeCondition = (id: string) => {
    setConditions(conditions.filter((c) => c.id !== id));
  };

  /** Quote a simple SQL identifier; reject anything that is not a safe name. */
  const quoteIdent = (name: string): string | null => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || name.length > 128) return null;
    // Double-quote works for Postgres/SQLite; MySQL also accepts ANSI_QUOTES or we use backticks
    // for common cases — use double quotes as the cross-dialect default used elsewhere.
    return `"${name.replace(/"/g, '""')}"`;
  };

  const handleApply = () => {
    const whereParts: string[] = [];
    for (const c of conditions) {
      if (c.operator !== 'IS NULL' && c.operator !== 'IS NOT NULL' && c.value.trim() === '') {
        continue;
      }
      const col = quoteIdent(c.column);
      if (!col) {
        alert(`Invalid column name for filter: ${c.column}`);
        return;
      }
      if (c.operator === 'IS NULL' || c.operator === 'IS NOT NULL') {
        whereParts.push(`${col} ${c.operator}`);
      } else if (c.operator === 'LIKE') {
        whereParts.push(`${col} LIKE '%${c.value.replace(/'/g, "''")}%'`);
      } else {
        whereParts.push(`${col} ${c.operator} '${c.value.replace(/'/g, "''")}'`);
      }
    }

    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
    let sortClause = '';
    if (sort) {
      const sortCol = quoteIdent(sort.column);
      if (!sortCol) {
        alert(`Invalid column name for sort: ${sort.column}`);
        return;
      }
      const dir = sort.direction === 'DESC' ? 'DESC' : 'ASC';
      sortClause = `ORDER BY ${sortCol} ${dir}`;
    }

    onApplyFilter(whereClause, sortClause);
  };

  return (
    <div className="bg-surface border-b border-border px-3 py-2 flex flex-wrap items-center gap-2 text-xs font-sans text-text shrink-0">
      <div className="flex items-center space-x-1.5 text-textMuted font-medium mr-1 select-none">
        <Filter className="w-3.5 h-3.5 text-accent" />
        <span>Filter:</span>
      </div>

      {conditions.map((cond) => (
        <div
          key={cond.id}
          className="flex items-center space-x-1.5 bg-surface2/50 border border-border rounded-md px-2 py-1 shadow-sm"
        >
          {/* Column select */}
          <select
            value={cond.column}
            onChange={(e) => {
              const val = e.target.value;
              setConditions(conditions.map((c) => (c.id === cond.id ? { ...c, column: val } : c)));
            }}
            className="bg-transparent text-text outline-none font-sans text-[11px] focus-visible:ring-1 focus-visible:ring-accent/30 rounded"
          >
            {columns.map((col) => (
              <option key={col.name} value={col.name} className="bg-surface text-text">
                {col.name}
              </option>
            ))}
          </select>

          {/* Operator select */}
          <select
            value={cond.operator}
            onChange={(e) => {
              const val = e.target.value as any;
              setConditions(conditions.map((c) => (c.id === cond.id ? { ...c, operator: val } : c)));
            }}
            className="bg-transparent text-accent outline-none font-sans text-[11px] focus-visible:ring-1 focus-visible:ring-accent/30 rounded font-semibold"
          >
            <option value="=" className="bg-surface text-text">=</option>
            <option value="!=" className="bg-surface text-text">!=</option>
            <option value="LIKE" className="bg-surface text-text">LIKE</option>
            <option value=">" className="bg-surface text-text">&gt;</option>
            <option value="<" className="bg-surface text-text">&lt;</option>
            <option value="IS NULL" className="bg-surface text-text">IS NULL</option>
            <option value="IS NOT NULL" className="bg-surface text-text">IS NOT NULL</option>
          </select>

          {/* Value input */}
          {cond.operator !== 'IS NULL' && cond.operator !== 'IS NOT NULL' && (
            <input
              type="text"
              placeholder="Value..."
              value={cond.value}
              onChange={(e) => {
                const val = e.target.value;
                setConditions(conditions.map((c) => (c.id === cond.id ? { ...c, value: val } : c)));
              }}
              className="bg-base border border-border rounded px-1.5 py-0.5 text-text font-mono text-[11px] outline-none w-24 focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2"
            />
          )}

          <button
            onClick={() => removeCondition(cond.id)}
            className="text-textMuted hover:text-error transition-colors ml-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}

      <button
        onClick={addCondition}
        className="px-2.5 py-1 rounded border border-[rgba(255,255,255,0.12)] bg-transparent hover:bg-[rgba(255,255,255,0.06)] text-text flex items-center space-x-1 text-[11px] transition-colors font-sans outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2"
      >
        <Plus className="w-3 h-3 text-accent" />
        <span>Add Filter</span>
      </button>

      {/* Sort By Dropdown */}
      <div className="flex items-center space-x-1.5 bg-surface2/50 border border-border rounded-md px-2 py-1 ml-auto">
        <ArrowUpDown className="w-3 h-3 text-accent" />
        <select
          value={sort ? `${sort.column}:${sort.direction}` : ''}
          onChange={(e) => {
            if (!e.target.value) {
              setSort(null);
            } else {
              const [col, dir] = e.target.value.split(':');
              setSort({ column: col, direction: dir as any });
            }
          }}
          className="bg-transparent text-text outline-none font-sans text-[11px] focus-visible:ring-1 focus-visible:ring-accent/30 rounded"
        >
          <option value="" className="bg-surface text-textMuted">No Sort</option>
          {columns.map((col) => (
            <React.Fragment key={col.name}>
              <option value={`${col.name}:ASC`} className="bg-surface text-text">
                {col.name} (ASC)
              </option>
              <option value={`${col.name}:DESC`} className="bg-surface text-text">
                {col.name} (DESC)
              </option>
            </React.Fragment>
          ))}
        </select>
      </div>

      <button
        onClick={handleApply}
        className="px-3 py-1 rounded bg-accent hover:bg-accentHover text-white font-medium flex items-center space-x-1 text-[11px] shadow transition-all font-sans outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2"
      >
        <Search className="w-3 h-3" />
        <span>Apply</span>
      </button>

      {(conditions.length > 0 || sort) && (
        <button
          onClick={() => {
            setConditions([]);
            setSort(null);
            onClearFilter();
          }}
          className="px-2.5 py-1 rounded border border-[rgba(255,255,255,0.12)] bg-transparent hover:bg-[rgba(255,255,255,0.06)] text-textMuted hover:text-text text-[11px] transition-colors font-sans outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2"
        >
          Clear
        </button>
      )}
    </div>
  );
};
