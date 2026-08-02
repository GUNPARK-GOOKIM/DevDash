import React, { useState, useMemo, useCallback } from 'react';
import {
  Cpu, ArrowDown, Database, Zap, AlertTriangle, BarChart3, ChevronRight,
  ChevronDown, Search, Copy, Play, Clock, Layers, GitBranch, Eye,
  TrendingUp, Filter, ArrowRight,
} from 'lucide-react';
import { runSqlQuery } from '../services/tauriBridge';

// ─── Plan Node Types ────────────────────────────────────────────────
export interface ExplainNode {
  nodeType: string;
  relationName?: string;
  schema?: string;
  alias?: string;
  startupCost: number;
  totalCost: number;
  planRows: number;
  actualRows?: number;
  planWidth: number;
  actualTime?: number;
  startupTime?: number;
  loops?: number;
  strategy?: string;
  joinType?: string;
  indexName?: string;
  indexCondition?: string;
  filterCondition?: string;
  sortKey?: string[];
  hashCondition?: string;
  buffers?: { shared_hit?: number; shared_read?: number; shared_written?: number };
  children?: ExplainNode[];
}

interface ExplainVisualizerProps {
  connectionId: string;
  dbType: string;
  onRunExplain?: (sql: string) => void;
}

// ─── Node Type Classification ───────────────────────────────────────
type NodeSeverity = 'excellent' | 'good' | 'warning' | 'critical';

const classifyNode = (node: ExplainNode, maxCost: number): NodeSeverity => {
  const costRatio = node.totalCost / Math.max(maxCost, 1);
  if (node.nodeType.includes('Seq Scan') && node.planRows > 10000) return 'critical';
  if (node.nodeType.includes('Nested Loop') && node.planRows > 5000) return 'warning';
  if (costRatio > 0.7) return 'critical';
  if (costRatio > 0.4) return 'warning';
  if (costRatio > 0.15) return 'good';
  return 'excellent';
};

const severityColors: Record<NodeSeverity, { bg: string; border: string; text: string; badge: string; bar: string }> = {
  excellent: { bg: 'bg-emerald-500/5', border: 'border-emerald-500/30', text: 'text-emerald-400', badge: 'bg-emerald-500/20 text-emerald-400', bar: 'bg-emerald-500' },
  good: { bg: 'bg-sky-500/5', border: 'border-sky-500/30', text: 'text-sky-400', badge: 'bg-sky-500/20 text-sky-400', bar: 'bg-sky-500' },
  warning: { bg: 'bg-amber-500/5', border: 'border-amber-500/30', text: 'text-amber-400', badge: 'bg-amber-500/20 text-amber-400', bar: 'bg-amber-500' },
  critical: { bg: 'bg-red-500/5', border: 'border-red-500/30', text: 'text-red-400', badge: 'bg-red-500/20 text-red-400', bar: 'bg-red-500' },
};

const nodeTypeIcon = (type: string) => {
  if (type.includes('Scan')) return <Database className="w-3.5 h-3.5" />;
  if (type.includes('Join') || type.includes('Nested Loop')) return <GitBranch className="w-3.5 h-3.5" />;
  if (type.includes('Sort')) return <BarChart3 className="w-3.5 h-3.5" />;
  if (type.includes('Aggregate') || type.includes('Group')) return <Layers className="w-3.5 h-3.5" />;
  if (type.includes('Hash')) return <Filter className="w-3.5 h-3.5" />;
  if (type.includes('Limit')) return <ArrowRight className="w-3.5 h-3.5" />;
  return <Zap className="w-3.5 h-3.5" />;
};

// ─── Recursive Plan Node Component ──────────────────────────────────
interface PlanNodeCardProps {
  node: ExplainNode;
  depth: number;
  maxCost: number;
  totalTime?: number;
  onSelect: (node: ExplainNode) => void;
  selectedNode?: ExplainNode | null;
}

const PlanNodeCard: React.FC<PlanNodeCardProps> = ({ node, depth, maxCost, totalTime, onSelect, selectedNode }) => {
  const [expanded, setExpanded] = useState(true);
  const severity = classifyNode(node, maxCost);
  const colors = severityColors[severity];
  const costPct = maxCost > 0 ? (node.totalCost / maxCost) * 100 : 0;
  const timePct = totalTime && node.actualTime ? (node.actualTime / totalTime) * 100 : 0;
  const isSelected = selectedNode === node;
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div className="relative">
      {/* Connector line */}
      {depth > 0 && (
        <div className="absolute left-4 -top-3 w-px h-3 bg-border/40" />
      )}

      <div
        className={`rounded-xl border transition-all cursor-pointer ${colors.bg} ${colors.border} ${
          isSelected ? 'ring-2 ring-accent/50 shadow-lg shadow-accent/10' : 'hover:shadow-md'
        }`}
        onClick={() => onSelect(node)}
      >
        {/* Node Header */}
        <div className="px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {hasChildren && (
              <button
                onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                className="p-0.5 rounded hover:bg-surface2/50 text-textMuted"
              >
                {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </button>
            )}
            <span className={colors.text}>{nodeTypeIcon(node.nodeType)}</span>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-[12px] font-semibold text-text">{node.nodeType}</span>
                {node.strategy && <span className="text-[9px] px-1.5 py-0.5 bg-surface2 rounded text-textMuted">{node.strategy}</span>}
              </div>
              {node.relationName && (
                <span className="text-[10px] text-textMuted font-mono">on {node.schema ? `${node.schema}.` : ''}{node.relationName}{node.alias ? ` as ${node.alias}` : ''}</span>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Cost */}
            <div className="text-right">
              <div className="text-[10px] text-textMuted">Cost</div>
              <div className={`text-[11px] font-mono font-bold ${colors.text}`}>{node.totalCost.toFixed(2)}</div>
            </div>
            {/* Rows */}
            <div className="text-right">
              <div className="text-[10px] text-textMuted">Rows</div>
              <div className="text-[11px] font-mono font-bold text-text">
                {node.planRows.toLocaleString()}
                {node.actualRows !== undefined && node.actualRows !== node.planRows && (
                  <span className={`ml-1 text-[9px] ${node.actualRows > node.planRows * 10 ? 'text-red-400' : 'text-textMuted'}`}>
                    (actual: {node.actualRows.toLocaleString()})
                  </span>
                )}
              </div>
            </div>
            {/* Actual Time */}
            {node.actualTime !== undefined && (
              <div className="text-right">
                <div className="text-[10px] text-textMuted">Time</div>
                <div className="text-[11px] font-mono font-bold text-amber-400">{node.actualTime.toFixed(2)}ms</div>
              </div>
            )}
            {/* Severity Badge */}
            <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${colors.badge}`}>
              {severity === 'critical' && <AlertTriangle className="w-2.5 h-2.5 inline mr-0.5" />}
              {severity}
            </span>
          </div>
        </div>

        {/* Cost Bar */}
        <div className="px-4 pb-2">
          <div className="h-1.5 bg-surface2/50 rounded-full overflow-hidden">
            <div className={`h-full ${colors.bar} rounded-full transition-all duration-500`} style={{ width: `${costPct}%` }} />
          </div>
          <div className="flex justify-between mt-0.5">
            <span className="text-[8px] text-textMuted">{costPct.toFixed(1)}% of total cost</span>
            {timePct > 0 && <span className="text-[8px] text-textMuted">{timePct.toFixed(1)}% of execution time</span>}
          </div>
        </div>

        {/* Index / Filter Info */}
        {(node.indexName || node.filterCondition || node.indexCondition) && (
          <div className="px-4 pb-2.5 space-y-1">
            {node.indexName && (
              <div className="flex items-center space-x-1.5 text-[10px]">
                <Search className="w-2.5 h-2.5 text-emerald-400" />
                <span className="text-textMuted">Index:</span>
                <span className="text-emerald-400 font-mono">{node.indexName}</span>
              </div>
            )}
            {node.indexCondition && (
              <div className="flex items-start space-x-1.5 text-[10px]">
                <Filter className="w-2.5 h-2.5 text-sky-400 mt-0.5 shrink-0" />
                <span className="text-textMuted shrink-0">Cond:</span>
                <span className="text-sky-400 font-mono break-all">{node.indexCondition}</span>
              </div>
            )}
            {node.filterCondition && (
              <div className="flex items-start space-x-1.5 text-[10px]">
                <Filter className="w-2.5 h-2.5 text-amber-400 mt-0.5 shrink-0" />
                <span className="text-textMuted shrink-0">Filter:</span>
                <span className="text-amber-400 font-mono break-all">{node.filterCondition}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Children */}
      {hasChildren && expanded && (
        <div className="pl-8 mt-2 space-y-2 relative">
          <div className="absolute left-4 top-0 bottom-0 w-px bg-border/30" />
          {node.children!.map((child, idx) => (
            <PlanNodeCard
              key={idx}
              node={child}
              depth={depth + 1}
              maxCost={maxCost}
              totalTime={totalTime}
              onSelect={onSelect}
              selectedNode={selectedNode}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Main Explain Visualizer Component ──────────────────────────────
export const ExplainVisualizer: React.FC<ExplainVisualizerProps> = ({ connectionId, dbType, onRunExplain }) => {
  const [sqlInput, setSqlInput] = useState('SELECT u.email, COUNT(o.id) AS order_count\nFROM users u\nJOIN orders o ON o.user_id = u.id\nWHERE u.created_at > \'2026-01-01\'\nGROUP BY u.email\nORDER BY order_count DESC\nLIMIT 50;');
  const [selectedNode, setSelectedNode] = useState<ExplainNode | null>(null);

  // Demo / Live plan tree
  const [plan, setPlan] = useState<ExplainNode>({
    nodeType: 'Limit',
    startupCost: 142.58,
    totalCost: 142.71,
    planRows: 50,
    planWidth: 48,
    actualRows: 50,
    actualTime: 12.84,
    startupTime: 12.70,
    children: [
      {
        nodeType: 'Sort',
        startupCost: 142.58,
        totalCost: 145.08,
        planRows: 1000,
        planWidth: 48,
        actualRows: 50,
        actualTime: 12.82,
        strategy: 'Top-N Heapsort',
        sortKey: ['order_count DESC'],
        children: [
          {
            nodeType: 'HashAggregate',
            startupCost: 120.50,
            totalCost: 130.50,
            planRows: 1000,
            planWidth: 48,
            actualRows: 872,
            actualTime: 11.45,
            strategy: 'Hashed',
            children: [
              {
                nodeType: 'Hash Join',
                startupCost: 25.00,
                totalCost: 110.00,
                planRows: 4500,
                planWidth: 40,
                actualRows: 4320,
                actualTime: 8.92,
                joinType: 'Inner',
                hashCondition: '(o.user_id = u.id)',
                children: [
                  {
                    nodeType: 'Seq Scan',
                    relationName: 'orders',
                    schema: 'public',
                    startupCost: 0.00,
                    totalCost: 65.00,
                    planRows: 4500,
                    planWidth: 12,
                    actualRows: 4500,
                    actualTime: 3.21,
                    buffers: { shared_hit: 45, shared_read: 12 },
                  },
                  {
                    nodeType: 'Hash',
                    startupCost: 22.50,
                    totalCost: 22.50,
                    planRows: 800,
                    planWidth: 36,
                    actualRows: 872,
                    actualTime: 2.15,
                    children: [
                      {
                        nodeType: 'Index Scan',
                        relationName: 'users',
                        schema: 'public',
                        startupCost: 0.28,
                        totalCost: 22.50,
                        planRows: 800,
                        planWidth: 36,
                        actualRows: 872,
                        actualTime: 1.85,
                        indexName: 'idx_users_created_at',
                        indexCondition: "(created_at > '2026-01-01'::timestamp)",
                        buffers: { shared_hit: 12, shared_read: 3 },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  });

  const maxCost = useMemo(() => plan.totalCost, [plan]);
  const totalTime = useMemo(() => plan.actualTime || 0, [plan]);

  // Flatten tree to count nodes and collect stats
  const stats = useMemo(() => {
    let nodeCount = 0;
    let seqScans = 0;
    let indexScans = 0;
    let totalBufferHits = 0;
    let totalBufferReads = 0;

    const walk = (n: ExplainNode) => {
      nodeCount++;
      if (n.nodeType.includes('Seq Scan')) seqScans++;
      if (n.nodeType.includes('Index Scan') || n.nodeType.includes('Index Only Scan') || n.nodeType.includes('Bitmap Index Scan')) indexScans++;
      if (n.buffers) {
        totalBufferHits += n.buffers.shared_hit || 0;
        totalBufferReads += n.buffers.shared_read || 0;
      }
      n.children?.forEach(walk);
    };
    walk(plan);

    return { nodeCount, seqScans, indexScans, totalBufferHits, totalBufferReads };
  }, [plan]);

  const copyPlan = useCallback(() => {
    navigator.clipboard.writeText(JSON.stringify(plan, null, 2));
  }, [plan]);

  const handleExecuteExplain = useCallback(async () => {
    if (!sqlInput.trim() || !connectionId) return;
    try {
      const isMysql = dbType.toLowerCase().includes('mysql') || dbType.toLowerCase().includes('maria');
      const isSqlite = dbType.toLowerCase().includes('sqlite');
      const explainQuery = isSqlite
        ? `EXPLAIN QUERY PLAN ${sqlInput.trim()};`
        : isMysql
        ? `EXPLAIN FORMAT=JSON ${sqlInput.trim()};`
        : `EXPLAIN (FORMAT JSON) ${sqlInput.trim()};`;

      const result = await runSqlQuery(connectionId, explainQuery);
      if (result && result.rows && result.rows.length > 0) {
        const rawOutput = result.rows[0][0];
        let parsedPlan: any = null;
        if (typeof rawOutput === 'string') {
          try {
            const json = JSON.parse(rawOutput);
            parsedPlan = Array.isArray(json) ? json[0]?.Plan || json[0] : json.Plan || json;
          } catch {
            parsedPlan = null;
          }
        } else if (typeof rawOutput === 'object') {
          parsedPlan = rawOutput?.Plan || rawOutput;
        }

        if (parsedPlan) {
          const mapRawNode = (n: any): ExplainNode => ({
            nodeType: n['Node Type'] || n['node_type'] || 'Query Node',
            relationName: n['Relation Name'] || n['table'],
            startupCost: n['Startup Cost'] || 0,
            totalCost: n['Total Cost'] || n['query_cost'] || 1,
            planRows: n['Plan Rows'] || n['rows'] || 1,
            actualRows: n['Actual Rows'],
            planWidth: n['Plan Width'] || 0,
            actualTime: n['Actual Total Time'],
            indexName: n['Index Name'] || n['key'],
            children: n.Plans ? n.Plans.map(mapRawNode) : undefined,
          });
          setPlan(mapRawNode(parsedPlan));
        }
      }
    } catch (err) {
      console.warn('Failed to run EXPLAIN query:', err);
    }
  }, [sqlInput, connectionId, dbType]);

  return (
    <div className="flex flex-col h-full bg-base text-text font-sans select-none">
      {/* Header */}
      <div className="h-10 bg-surface border-b border-border flex items-center px-4 justify-between shrink-0">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 rounded-lg bg-indigo-500/20 flex items-center justify-center">
            <Cpu className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <h2 className="text-sm font-semibold text-text">Query Execution Plan Visualizer</h2>
          <span className="text-[10px] text-textMuted bg-surface2 px-2 py-0.5 rounded-full">EXPLAIN ANALYZE</span>
        </div>
        <div className="flex items-center space-x-2">
          <button onClick={copyPlan} className="p-1.5 rounded-md hover:bg-surface2 text-textMuted hover:text-text transition-colors" title="Copy Plan JSON">
            <Copy className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* SQL Input */}
      <div className="border-b border-border bg-surface/30 p-3">
        <div className="flex items-start space-x-2">
          <textarea
            value={sqlInput}
            onChange={(e) => setSqlInput(e.target.value)}
            className="flex-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-xs font-mono text-text placeholder:text-textMuted/50 outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 resize-none transition-all"
            rows={3}
            placeholder="Enter SQL query to analyze…"
          />
          <button
            onClick={handleExecuteExplain}
            className="px-3 py-2 bg-accent/20 text-accent border border-accent/30 rounded-lg text-xs font-semibold hover:bg-accent/30 transition-colors flex items-center space-x-1.5 shrink-0"
          >
            <Play className="w-3 h-3" />
            <span>Run EXPLAIN</span>
          </button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="px-4 py-2.5 border-b border-border bg-surface/20 flex items-center space-x-6">
        <div className="flex items-center space-x-1.5">
          <Clock className="w-3 h-3 text-amber-400" />
          <span className="text-[10px] text-textMuted">Total Time:</span>
          <span className="text-[11px] font-mono font-bold text-amber-400">{totalTime.toFixed(2)}ms</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <Cpu className="w-3 h-3 text-indigo-400" />
          <span className="text-[10px] text-textMuted">Total Cost:</span>
          <span className="text-[11px] font-mono font-bold text-indigo-400">{maxCost.toFixed(2)}</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <Layers className="w-3 h-3 text-purple-400" />
          <span className="text-[10px] text-textMuted">Nodes:</span>
          <span className="text-[11px] font-mono font-bold text-text">{stats.nodeCount}</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <Database className="w-3 h-3 text-emerald-400" />
          <span className="text-[10px] text-textMuted">Index Scans:</span>
          <span className="text-[11px] font-mono font-bold text-emerald-400">{stats.indexScans}</span>
        </div>
        {stats.seqScans > 0 && (
          <div className="flex items-center space-x-1.5">
            <AlertTriangle className="w-3 h-3 text-red-400" />
            <span className="text-[10px] text-textMuted">Seq Scans:</span>
            <span className="text-[11px] font-mono font-bold text-red-400">{stats.seqScans}</span>
          </div>
        )}
        {stats.totalBufferHits > 0 && (
          <div className="flex items-center space-x-1.5">
            <TrendingUp className="w-3 h-3 text-sky-400" />
            <span className="text-[10px] text-textMuted">Cache Hit:</span>
            <span className="text-[11px] font-mono font-bold text-sky-400">
              {((stats.totalBufferHits / (stats.totalBufferHits + stats.totalBufferReads)) * 100).toFixed(1)}%
            </span>
          </div>
        )}
      </div>

      {/* Plan Tree */}
      <div className="flex-1 overflow-auto p-4">
        <PlanNodeCard
          node={plan}
          depth={0}
          maxCost={maxCost}
          totalTime={totalTime}
          onSelect={setSelectedNode}
          selectedNode={selectedNode}
        />
      </div>

      {/* Selected Node Detail Panel */}
      {selectedNode && (
        <div className="border-t border-border bg-surface/50 px-4 py-3 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <Eye className="w-3.5 h-3.5 text-accent" />
              <span className="text-xs font-semibold text-text">Node Detail: {selectedNode.nodeType}</span>
            </div>
            <button onClick={() => setSelectedNode(null)} className="text-textMuted hover:text-text text-xs">✕</button>
          </div>
          <div className="grid grid-cols-4 gap-3 text-[10px]">
            <div><span className="text-textMuted block">Startup Cost</span><span className="font-mono text-text">{selectedNode.startupCost.toFixed(2)}</span></div>
            <div><span className="text-textMuted block">Total Cost</span><span className="font-mono text-text">{selectedNode.totalCost.toFixed(2)}</span></div>
            <div><span className="text-textMuted block">Plan Rows</span><span className="font-mono text-text">{selectedNode.planRows.toLocaleString()}</span></div>
            <div><span className="text-textMuted block">Plan Width</span><span className="font-mono text-text">{selectedNode.planWidth} bytes</span></div>
            {selectedNode.actualRows !== undefined && <div><span className="text-textMuted block">Actual Rows</span><span className="font-mono text-text">{selectedNode.actualRows.toLocaleString()}</span></div>}
            {selectedNode.actualTime !== undefined && <div><span className="text-textMuted block">Actual Time</span><span className="font-mono text-amber-400">{selectedNode.actualTime.toFixed(2)}ms</span></div>}
            {selectedNode.loops && <div><span className="text-textMuted block">Loops</span><span className="font-mono text-text">{selectedNode.loops}</span></div>}
            {selectedNode.buffers && (
              <div>
                <span className="text-textMuted block">Buffers</span>
                <span className="font-mono text-sky-400">
                  hit={selectedNode.buffers.shared_hit || 0} read={selectedNode.buffers.shared_read || 0}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
