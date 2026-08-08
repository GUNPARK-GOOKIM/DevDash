import React, { useCallback, useEffect, useState } from 'react';
import {
  Camera, X, Trash2, GitCompare, RefreshCw, ChevronLeft, ChevronRight, AlertCircle,
} from 'lucide-react';
import {
  deleteResultSnapshot,
  diffResultSnapshots,
  listResultSnapshots,
  saveResultSnapshot,
  SnapshotDiffResult,
  SnapshotMeta,
} from '../services/tauriBridge';

interface ResultSnapshotsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Current result to save (optional — modal can still browse/compare). */
  capture?: {
    columns: string[];
    rows: unknown[][];
    sql: string;
    connectionId: string;
    connectionName: string;
  } | null;
}

export const ResultSnapshotsModal: React.FC<ResultSnapshotsModalProps> = ({
  isOpen,
  onClose,
  capture,
}) => {
  const [list, setList] = useState<SnapshotMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [leftId, setLeftId] = useState('');
  const [rightId, setRightId] = useState('');
  const [diff, setDiff] = useState<SnapshotDiffResult | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await listResultSnapshots(200);
      setList(items);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      refresh();
      setDiff(null);
      setPage(0);
      setName(
        capture
          ? `Result ${new Date().toLocaleString()}`
          : ''
      );
    }
  }, [isOpen, refresh, capture]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!capture || capture.rows.length === 0) {
      setError('No result set to capture. Run a query first.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await saveResultSnapshot({
        name: name.trim() || `Snapshot ${new Date().toISOString()}`,
        connectionId: capture.connectionId,
        connectionName: capture.connectionName,
        sqlText: capture.sql,
        columns: capture.columns,
        rows: capture.rows,
      });
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this snapshot permanently?')) return;
    setLoading(true);
    try {
      await deleteResultSnapshot(id);
      if (leftId === id) setLeftId('');
      if (rightId === id) setRightId('');
      setDiff(null);
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const runDiff = async (offset = 0) => {
    if (!leftId || !rightId) {
      setError('Select two different snapshots to compare.');
      return;
    }
    if (leftId === rightId) {
      setError('Choose two different snapshots.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await diffResultSnapshots(leftId, rightId, offset, pageSize);
      setDiff(result);
      setPage(Math.floor(offset / pageSize));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const cell = (v: unknown) => {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-[920px] max-w-[96vw] max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2 text-indigo-400">
            <Camera className="w-5 h-5" />
            <h3 className="text-sm font-semibold text-slate-100">Result Snapshots</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto flex-1 text-xs">
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Capture */}
          <section className="p-3 rounded-lg border border-slate-800 bg-slate-950/50 space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Save current result
            </div>
            {capture && capture.rows.length > 0 ? (
              <>
                <p className="text-slate-500">
                  {capture.rows.length.toLocaleString()} rows · {capture.columns.length} columns
                  {capture.sql ? (
                    <span className="block font-mono text-[10px] truncate mt-0.5 text-slate-400">
                      {capture.sql.slice(0, 120)}
                      {capture.sql.length > 120 ? '…' : ''}
                    </span>
                  ) : null}
                </p>
                <div className="flex gap-2">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Snapshot name"
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200"
                  />
                  <button
                    type="button"
                    disabled={loading}
                    onClick={handleSave}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium disabled:opacity-50"
                  >
                    Save snapshot
                  </button>
                </div>
              </>
            ) : (
              <p className="text-slate-500">
                No in-memory result. Run a query, then open this panel to capture it.
              </p>
            )}
          </section>

          {/* List */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Saved snapshots (metadata only)
              </div>
              <button
                type="button"
                onClick={refresh}
                className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                title="Refresh"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <div className="border border-slate-800 rounded-lg overflow-hidden max-h-40 overflow-y-auto">
              {list.length === 0 ? (
                <div className="p-4 text-slate-500 text-center">No snapshots yet.</div>
              ) : (
                <table className="w-full text-left">
                  <thead className="bg-slate-950 text-slate-500 sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">Name</th>
                      <th className="px-2 py-1.5 font-medium">Rows</th>
                      <th className="px-2 py-1.5 font-medium">When</th>
                      <th className="px-2 py-1.5 font-medium w-16" />
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((s) => (
                      <tr key={s.id} className="border-t border-slate-800/80 hover:bg-slate-800/40">
                        <td className="px-2 py-1.5 text-slate-200">
                          <div className="font-medium truncate max-w-[220px]">{s.name}</div>
                          <div className="text-[10px] text-slate-500 truncate max-w-[280px]">
                            {s.connection_name} · {s.sql_text.slice(0, 60)}
                          </div>
                        </td>
                        <td className="px-2 py-1.5 font-mono text-slate-400">
                          {s.row_count.toLocaleString()}
                        </td>
                        <td className="px-2 py-1.5 text-slate-500 whitespace-nowrap">
                          {new Date(s.created_at).toLocaleString()}
                        </td>
                        <td className="px-2 py-1.5">
                          <button
                            type="button"
                            onClick={() => handleDelete(s.id)}
                            className="p-1 rounded text-slate-500 hover:text-rose-400"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {/* Compare */}
          <section className="p-3 rounded-lg border border-slate-800 bg-slate-950/50 space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <GitCompare className="w-3.5 h-3.5" />
              Compare any two snapshots
            </div>
            <p className="text-[10px] text-slate-500">
              Rows are keyed by the first column (typically a PK). Diff is computed in Rust; only a page of
              added/removed/changed rows is returned.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={leftId}
                onChange={(e) => setLeftId(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-200"
              >
                <option value="">Left (baseline)…</option>
                {list.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.row_count} rows)
                  </option>
                ))}
              </select>
              <select
                value={rightId}
                onChange={(e) => setRightId(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-200"
              >
                <option value="">Right (new)…</option>
                {list.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.row_count} rows)
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              disabled={loading || !leftId || !rightId}
              onClick={() => runDiff(0)}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium disabled:opacity-50"
            >
              Run diff
            </button>

            {diff && (
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <div className="flex flex-wrap gap-3 text-[11px]">
                  <span className="text-emerald-400 font-semibold">+{diff.added} added</span>
                  <span className="text-rose-400 font-semibold">−{diff.removed} removed</span>
                  <span className="text-amber-400 font-semibold">~{diff.changed} changed</span>
                  <span className="text-slate-500">={diff.unchanged} unchanged</span>
                  <span className="text-slate-500 ml-auto">
                    Showing {diff.rows.length} of {diff.total_diff_rows} diff rows
                  </span>
                </div>
                <div className="border border-slate-800 rounded-lg overflow-auto max-h-56">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-slate-950 text-slate-500 sticky top-0">
                      <tr>
                        <th className="px-2 py-1">Kind</th>
                        <th className="px-2 py-1">Key</th>
                        <th className="px-2 py-1">Left</th>
                        <th className="px-2 py-1">Right</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diff.rows.map((r, i) => (
                        <tr
                          key={`${r.kind}-${r.row_key}-${i}`}
                          className={
                            r.kind === 'added'
                              ? 'bg-emerald-950/30'
                              : r.kind === 'removed'
                                ? 'bg-rose-950/30'
                                : 'bg-amber-950/20'
                          }
                        >
                          <td className="px-2 py-1 font-semibold uppercase text-[10px]">
                            {r.kind}
                          </td>
                          <td className="px-2 py-1 font-mono text-slate-300">{r.row_key}</td>
                          <td className="px-2 py-1 font-mono text-rose-300/90 max-w-[200px] truncate">
                            {r.left_row ? r.left_row.map(cell).join(' | ') : '—'}
                          </td>
                          <td className="px-2 py-1 font-mono text-emerald-300/90 max-w-[200px] truncate">
                            {r.right_row ? r.right_row.map(cell).join(' | ') : '—'}
                          </td>
                        </tr>
                      ))}
                      {diff.rows.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-2 py-3 text-center text-slate-500">
                            No differences on this page.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={page <= 0 || loading}
                    onClick={() => runDiff(Math.max(0, (page - 1) * pageSize))}
                    className="p-1 rounded border border-slate-700 disabled:opacity-40"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-slate-500">Page {page + 1}</span>
                  <button
                    type="button"
                    disabled={
                      loading ||
                      (page + 1) * pageSize >= diff.total_diff_rows
                    }
                    onClick={() => runDiff((page + 1) * pageSize)}
                    className="p-1 rounded border border-slate-700 disabled:opacity-40"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
