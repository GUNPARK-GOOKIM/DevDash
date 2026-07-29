import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  Handle,
  Position,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ColumnItem } from '../types';
import { Key, Link2, Search, ZoomIn, ZoomOut, Maximize } from 'lucide-react';

interface SchemaTable {
  name: string;
  columns: ColumnItem[];
}

interface SchemaVisualizerProps {
  tables: SchemaTable[];
  onSelectTable?: (name: string) => void;
}

// Custom Table Node
const TableNode: React.FC<{ data: { label: string; columns: ColumnItem[]; selected: boolean } }> = ({ data }) => {
  return (
    <div className={`bg-surface border rounded-lg shadow-lg min-w-[200px] overflow-hidden ${data.selected ? 'border-accent' : 'border-border'}`}>
      <Handle type="target" position={Position.Top} className="!bg-accent !w-2 !h-2" />
      <Handle type="target" position={Position.Left} className="!bg-accent !w-2 !h-2" />
      <Handle type="source" position={Position.Bottom} className="!bg-accent !w-2 !h-2" />
      <Handle type="source" position={Position.Right} className="!bg-accent !w-2 !h-2" />
      
      {/* Table Header */}
      <div className="bg-surface2 px-3 py-2 border-b border-border">
        <span className="text-xs font-semibold text-text">{data.label}</span>
      </div>
      
      {/* Columns */}
      <div className="px-2 py-1">
        {data.columns.map((col) => (
          <div key={col.name} className="flex items-center justify-between px-1 py-0.5 text-[11px] group">
            <div className="flex items-center space-x-1.5">
              {col.is_primary_key ? (
                <Key className="w-3 h-3 text-accent shrink-0" />
              ) : col.is_foreign_key ? (
                <Link2 className="w-3 h-3 text-blue-400 shrink-0" />
              ) : (
                <span className="w-3 shrink-0" />
              )}
              <span className={`${col.is_primary_key ? 'text-accent font-medium' : col.is_foreign_key ? 'text-blue-400' : 'text-text/80'}`}>
                {col.is_primary_key && 'PK '}
                {col.is_foreign_key && 'FK '}
                {col.name}
              </span>
            </div>
            <span className="text-textMuted text-[10px] ml-3">({col.data_type})</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const nodeTypes = { tableNode: TableNode };

export const SchemaVisualizer: React.FC<SchemaVisualizerProps> = ({ tables, onSelectTable }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  // Generate nodes from tables
  const initialNodes: Node[] = useMemo(() => {
    const cols = 3;
    return tables.map((table, i) => ({
      id: table.name,
      type: 'tableNode',
      position: { x: (i % cols) * 280 + 40, y: Math.floor(i / cols) * 250 + 40 },
      data: {
        label: table.name,
        columns: table.columns,
        selected: table.name === selectedTable,
      },
    }));
  }, [tables, selectedTable]);

  // Generate edges from FK relationships
  const initialEdges: Edge[] = useMemo(() => {
    const edges: Edge[] = [];
    tables.forEach(table => {
      table.columns.forEach(col => {
        if (col.is_foreign_key && col.fk_references) {
          edges.push({
            id: `${table.name}-${col.name}-${col.fk_references.table}`,
            source: table.name,
            target: col.fk_references.table,
            type: 'smoothstep',
            animated: true,
            style: { stroke: '#6366F1', strokeWidth: 1.5 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#6366F1' },
            label: 'n',
            labelStyle: { fill: '#6B6B70', fontSize: 10 },
          });
        }
      });
    });
    return edges;
  }, [tables]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update nodes when selection or search changes
  useEffect(() => {
    setNodes(nds => nds.map(n => ({
      ...n,
      data: { ...n.data, selected: n.id === selectedTable },
      style: searchTerm && !n.id.toLowerCase().includes(searchTerm.toLowerCase()) 
        ? { opacity: 0.3 } 
        : { opacity: 1 },
    })));
  }, [selectedTable, searchTerm, setNodes]);

  const handleNodeClick = useCallback((_: any, node: Node) => {
    setSelectedTable(node.id);
    onSelectTable?.(node.id);
  }, [onSelectTable]);

  // Detail panel for selected table
  const selectedTableData = useMemo(() => 
    tables.find(t => t.name === selectedTable), 
    [tables, selectedTable]
  );

  return (
    <div className="flex h-full bg-base">
      {/* Main Canvas */}
      <div className="flex-1 relative">
        {/* Toolbar */}
        <div className="absolute top-3 left-3 z-10 flex items-center space-x-2">
          <div className="flex items-center bg-surface border border-border rounded-lg px-2 py-1">
            <Search className="w-3.5 h-3.5 text-textMuted mr-1.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Table search..."
              className="bg-transparent text-xs text-text placeholder-textMuted outline-none w-32"
            />
          </div>

          <button
            onClick={() => {
              // Auto-layout algorithm: topological level calculation
              const levelMap: Record<string, number> = {};
              tables.forEach((t) => {
                let lvl = 0;
                t.columns.forEach((c) => {
                  if (c.is_foreign_key && c.fk_references) lvl += 1;
                });
                levelMap[t.name] = lvl;
              });

              const levelGroups: Record<number, string[]> = {};
              tables.forEach((t) => {
                const lvl = levelMap[t.name] || 0;
                if (!levelGroups[lvl]) levelGroups[lvl] = [];
                levelGroups[lvl].push(t.name);
              });

              setNodes((prevNodes) =>
                prevNodes.map((n) => {
                  const lvl = levelMap[n.id] || 0;
                  const idxInLvl = levelGroups[lvl]?.indexOf(n.id) || 0;
                  return {
                    ...n,
                    position: {
                      x: idxInLvl * 300 + 40,
                      y: lvl * 280 + 40,
                    },
                  };
                })
              );
            }}
            className="px-2.5 py-1 bg-surface border border-border rounded-lg text-xs font-medium text-text hover:bg-surface2 transition-colors flex items-center space-x-1"
          >
            <Maximize className="w-3.5 h-3.5 text-accent" />
            <span>Auto Layout</span>
          </button>

          <button
            onClick={() => {
              // Generate full DDL dump
              const ddlStatements = tables.map((t) => {
                const colDefs = t.columns.map((c) => {
                  let line = `  ${c.name} ${c.data_type.toUpperCase()}`;
                  if (!c.is_nullable) line += ' NOT NULL';
                  if (c.is_primary_key) line += ' PRIMARY KEY';
                  return line;
                });
                t.columns.forEach((c) => {
                  if (c.is_foreign_key && c.fk_references) {
                    colDefs.push(`  FOREIGN KEY (${c.name}) REFERENCES ${c.fk_references.table}(${c.fk_references.column})`);
                  }
                });
                return `CREATE TABLE ${t.name} (\n${colDefs.join(',\n')}\n);`;
              }).join('\n\n');

              const blob = new Blob([ddlStatements], { type: 'text/plain;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `schema_ddl_export_${Date.now()}.sql`;
              a.click();
            }}
            className="px-2.5 py-1 bg-accent text-white rounded-lg text-xs font-medium hover:bg-accentHover shadow-md shadow-accent/20 transition-all flex items-center space-x-1"
          >
            <span>Export Schema DDL</span>
          </button>
        </div>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          nodeTypes={nodeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
          className="bg-base"
        >
          <Background color="rgba(255,255,255,0.03)" gap={20} />
          <MiniMap
            nodeStrokeColor="#6366F1"
            nodeColor="#1A1A1C"
            nodeBorderRadius={4}
            maskColor="rgba(0,0,0,0.7)"
            className="!bg-surface !border !border-border !rounded-lg"
            style={{ bottom: 10, left: 10 }}
          />
          <Controls
            className="!bg-surface !border !border-border !rounded-lg [&>button]:!bg-surface [&>button]:!border-border [&>button]:!text-text [&>button:hover]:!bg-surface2"
            style={{ bottom: 10, right: 10 }}
          />
        </ReactFlow>
      </div>

      {/* Right Detail Panel */}
      {selectedTableData && (
        <div className="w-64 bg-surface border-l border-border p-3 overflow-auto">
          <h3 className="text-xs font-semibold text-text mb-3">{selectedTableData.name}</h3>
          
          <div className="mb-3">
            <h4 className="text-[10px] font-medium text-textMuted mb-1.5 flex items-center space-x-1">
              <span>▸ Indexes</span>
            </h4>
            <div className="space-y-1">
              {selectedTableData.columns.filter(c => c.is_primary_key || c.is_unique || c.is_indexed).map(col => (
                <div key={col.name} className="flex items-center justify-between text-[10px] bg-base rounded px-2 py-1">
                  <span className="text-text">{selectedTableData.name}_{col.name}{col.is_primary_key ? '_pkey' : col.is_unique ? '_key' : '_idx'}</span>
                  <span className={`px-1 py-0.5 rounded text-[9px] font-medium ${
                    col.is_primary_key ? 'bg-accent/20 text-accent' : col.is_foreign_key ? 'bg-blue-500/20 text-blue-400' : 'bg-surface2 text-textMuted'
                  }`}>
                    {col.is_primary_key ? 'PK' : col.is_foreign_key ? 'FK' : 'IDX'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-[10px] font-medium text-textMuted mb-1.5 flex items-center space-x-1">
              <span>▸ Constraints</span>
            </h4>
            <div className="space-y-1 text-[10px]">
              {selectedTableData.columns.filter(c => c.is_foreign_key).map(col => (
                <div key={col.name} className="bg-base rounded px-2 py-1 text-textMuted">
                  {col.name} → {col.fk_references?.table}.{col.fk_references?.column}
                </div>
              ))}
              {selectedTableData.columns.filter(c => !c.is_nullable).map(col => (
                <div key={col.name} className="bg-base rounded px-2 py-1 text-textMuted">
                  {col.name} NOT NULL
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
