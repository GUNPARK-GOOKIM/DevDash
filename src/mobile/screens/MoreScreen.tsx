import React from 'react';
import { Clock, RefreshCw, Settings, WifiOff } from 'lucide-react';
import {
  MergeReport,
  PersistedQueryHistoryItem,
  SyncStatus,
} from '../../services/tauriBridge';

interface MoreScreenProps {
  history: PersistedQueryHistoryItem[];
  onLoadHistory: (sql: string) => void;
  syncStatus: SyncStatus | null;
  passphrase: string;
  onPassphraseChange: (v: string) => void;
  includeSecrets: boolean;
  onIncludeSecretsChange: (v: boolean) => void;
  importText: string;
  onImportTextChange: (v: string) => void;
  onExport: () => void;
  onImport: () => void;
  onRefreshStatus: () => void;
  syncBusy?: boolean;
  syncMessage?: string | null;
  lastReport?: MergeReport | null;
  onOpenSettings: () => void;
}

export const MoreScreen: React.FC<MoreScreenProps> = ({
  history,
  onLoadHistory,
  syncStatus,
  passphrase,
  onPassphraseChange,
  includeSecrets,
  onIncludeSecretsChange,
  importText,
  onImportTextChange,
  onExport,
  onImport,
  onRefreshStatus,
  syncBusy,
  syncMessage,
  lastReport,
  onOpenSettings,
}) => {
  return (
    <div className="h-full overflow-y-auto px-3 py-3 space-y-5">
      <section className="rounded-2xl border border-emerald-900/40 bg-emerald-950/20 p-3 flex gap-2">
        <WifiOff className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-emerald-100/90 leading-relaxed">
          Offline-first: catalog, history, snapshots, and AI-via-Ollama work without a DevDash
          cloud. Remote databases still need a network path to the database itself. Sync is
          optional and end-to-end encrypted.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Clock className="w-4 h-4 text-slate-400" />
          History
        </h2>
        {history.length === 0 ? (
          <p className="text-[11px] text-slate-500">No persisted history yet.</p>
        ) : (
          <div className="space-y-1.5">
            {history.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => onLoadHistory(h.query_text)}
                className="w-full text-left rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2 active:scale-[0.99]"
              >
                <div className="text-[11px] font-mono text-slate-100 truncate">{h.query_text}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  {h.execution_time_ms.toFixed(0)} ms · {h.row_count} rows · {h.timestamp.slice(0, 19)}
                  {h.error ? ' · error' : ''}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-indigo-400" />
            Device sync
          </h2>
          <button type="button" onClick={onRefreshStatus} className="text-[11px] text-indigo-300">
            Refresh
          </button>
        </div>
        {syncStatus && (
          <div className="text-[11px] text-slate-400 space-y-0.5">
            <div>
              Device {syncStatus.device.name} · {syncStatus.device.platform} ·{' '}
              {syncStatus.device.id.slice(0, 8)}
            </div>
            <div>
              Catalog {syncStatus.catalog_count} · queries {syncStatus.saved_query_count}
            </div>
            <div className="truncate">File {syncStatus.catalog_path}</div>
          </div>
        )}
        <input
          type="password"
          value={passphrase}
          onChange={(e) => onPassphraseChange(e.target.value)}
          placeholder="Passphrase (≥ 8 chars)"
          className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-slate-100"
        />
        <label className="flex items-center gap-2 text-[11px] text-slate-300">
          <input
            type="checkbox"
            checked={includeSecrets}
            onChange={(e) => onIncludeSecretsChange(e.target.checked)}
          />
          Include passwords inside the encrypted bundle
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={syncBusy}
            onClick={onExport}
            className="py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold disabled:opacity-50"
          >
            Export
          </button>
          <button
            type="button"
            disabled={syncBusy}
            onClick={onImport}
            className="py-2.5 rounded-xl bg-slate-800 text-slate-100 text-xs font-semibold disabled:opacity-50"
          >
            Import
          </button>
        </div>
        <textarea
          value={importText}
          onChange={(e) => onImportTextChange(e.target.value)}
          placeholder="Paste encrypted .ddsync JSON to import, or leave empty to use the last export ciphertext."
          className="w-full h-24 rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 text-[10px] font-mono text-slate-300"
        />
        {syncMessage && <p className="text-[11px] text-slate-300">{syncMessage}</p>}
        {lastReport && (
          <div className="text-[11px] text-slate-400">
            +{lastReport.connections_added} / ~{lastReport.connections_updated} kept{' '}
            {lastReport.connections_kept_local} · queries {lastReport.queries_upserted} · conflicts{' '}
            {lastReport.conflicts.length}
          </div>
        )}
      </section>

      <button
        type="button"
        onClick={onOpenSettings}
        className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-800 text-xs font-semibold text-slate-200"
      >
        <Settings className="w-4 h-4" />
        AI & general settings
      </button>
    </div>
  );
};
