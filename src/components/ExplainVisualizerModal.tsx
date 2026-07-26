import React from 'react';
import { Cpu, X, Zap, ArrowDown, Database } from 'lucide-react';

export interface PlanNode {
  nodeType: string;
  relationName?: string;
  startupCost: number;
  totalCost: number;
  planRows: number;
  planWidth: number;
  children?: PlanNode[];
}

interface ExplainVisualizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  sql: string;
  plan?: PlanNode;
}

export const ExplainVisualizerModal: React.FC<ExplainVisualizerModalProps> = ({
  isOpen,
  onClose,
  sql,
  plan = {
    nodeType: 'Limit',
    startupCost: 0.0,
    totalCost: 12.45,
    planRows: 50,
    planWidth: 128,
    children: [
      {
        nodeType: 'Index Scan',
        relationName: 'users',
        startupCost: 0.28,
        totalCost: 12.45,
        planRows: 50,
        planWidth: 128,
      },
    ],
  },
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-fadeIn select-none font-sans">
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-[700px] h-[480px] max-w-[95vw] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center space-x-2 text-indigo-400">
            <Cpu className="w-5 h-5" />
            <h3 className="text-sm font-semibold text-slate-100">SQL Execution Plan Visualizer (EXPLAIN)</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 bg-slate-950 p-5 overflow-auto space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded p-3 font-mono text-xs text-indigo-300">
            <span className="text-slate-500 block text-[10px] mb-1 font-sans uppercase">Target Query:</span>
            {sql}
          </div>

          <div className="space-y-3 font-mono text-xs">
            <h4 className="text-xs font-semibold text-slate-300 font-sans">Execution Node Graph:</h4>

            <div className="bg-slate-900/80 border border-indigo-500/30 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center space-x-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <strong className="text-slate-100">{plan.nodeType}</strong>
                </div>
                <div className="flex items-center space-x-3 text-[11px] text-slate-400">
                  <span>Cost: <strong className="text-indigo-400">{plan.totalCost}</strong></span>
                  <span>Rows: <strong className="text-purple-400">{plan.planRows}</strong></span>
                </div>
              </div>

              {plan.children?.map((child, idx) => (
                <div key={idx} className="pl-6 border-l-2 border-indigo-500/40 space-y-2 pt-2">
                  <div className="flex items-center space-x-1 text-slate-500">
                    <ArrowDown className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="text-[10px] font-sans">Child Operation</span>
                  </div>
                  <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Database className="w-4 h-4 text-indigo-400" />
                      <div>
                        <div className="font-semibold text-slate-200">{child.nodeType}</div>
                        {child.relationName && (
                          <div className="text-[10px] text-slate-400">Target Table: {child.relationName}</div>
                        )}
                      </div>
                    </div>
                    <div className="text-right text-[11px]">
                      <div className="text-indigo-300 font-bold">Cost: {child.totalCost}</div>
                      <div className="text-slate-500 text-[10px]">{child.planRows} rows estimated</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-end text-xs text-slate-400">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
