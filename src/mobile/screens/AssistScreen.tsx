import React from 'react';
import { Sparkles, Stethoscope, Camera, Play } from 'lucide-react';
import { ConnectionConfig } from '../../types';
import {
  AiAssistResponsePayload,
  ConnectionDiagnostics,
  SnapshotMeta,
} from '../../services/tauriBridge';

interface AssistScreenProps {
  connection: ConnectionConfig | null;
  prompt: string;
  onPromptChange: (v: string) => void;
  onGenerate: () => void;
  onRunGenerated: () => void;
  aiLoading: boolean;
  aiResult: AiAssistResponsePayload | null;
  aiError?: string | null;
  onDiagnose: () => void;
  diagLoading: boolean;
  diagnostics: ConnectionDiagnostics | null;
  snapshots: SnapshotMeta[];
  onSaveSnapshot: () => void;
  snapshotBusy?: boolean;
}

export const AssistScreen: React.FC<AssistScreenProps> = ({
  connection,
  prompt,
  onPromptChange,
  onGenerate,
  onRunGenerated,
  aiLoading,
  aiResult,
  aiError,
  onDiagnose,
  diagLoading,
  diagnostics,
  snapshots,
  onSaveSnapshot,
  snapshotBusy,
}) => {
  if (!connection) {
    return (
      <div className="h-full flex items-center justify-center px-6 text-center text-sm text-slate-400">
        Connect first. AI assist, diagnostics, and snapshots use the shared Rust core.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-3 py-3 space-y-4">
      <section className="space-y-2">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-400" />
          AI SQL
        </h2>
        <p className="text-[11px] text-slate-400">
          Same schema-aware prompt path as Desktop and `devdash ai`. Ollama can stay fully local.
        </p>
        <textarea
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder="Show me orders from last week…"
          className="w-full h-24 rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500/50"
        />
        <button
          type="button"
          onClick={onGenerate}
          disabled={aiLoading || !prompt.trim()}
          className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold disabled:opacity-50"
        >
          {aiLoading ? 'Generating…' : 'Generate SQL'}
        </button>
        {aiError && (
          <div className="text-xs text-rose-300 bg-rose-950/40 border border-rose-900/50 rounded-xl px-3 py-2">
            {aiError}
          </div>
        )}
        {aiResult && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-2">
            <pre className="text-[11px] font-mono text-slate-100 whitespace-pre-wrap break-words">
              {aiResult.sql}
            </pre>
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span>
                {aiResult.provider}/{aiResult.model}
                {aiResult.is_write ? ' · write' : ' · read'}
              </span>
              <button
                type="button"
                onClick={onRunGenerated}
                className="inline-flex items-center gap-1 text-indigo-300 font-semibold"
              >
                <Play className="w-3 h-3" />
                Open in Query
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Stethoscope className="w-4 h-4 text-emerald-400" />
          Diagnostics
        </h2>
        <button
          type="button"
          onClick={onDiagnose}
          disabled={diagLoading}
          className="w-full py-2.5 rounded-xl bg-slate-800 text-slate-100 text-xs font-semibold disabled:opacity-50"
        >
          {diagLoading ? 'Running checks…' : 'Run connection diagnostics'}
        </button>
        {diagnostics && (
          <div className="rounded-xl border border-slate-800 p-3 space-y-1.5 text-[11px]">
            <Row k="status" v={diagnostics.success ? 'ok' : 'fail'} />
            <Row k="latency" v={`${diagnostics.latency_ms} ms`} />
            <Row k="server" v={diagnostics.server_version || '—'} />
            <Row k="database" v={diagnostics.current_database || '—'} />
            <Row k="user" v={diagnostics.current_user || '—'} />
            {diagnostics.checks?.map((c) => (
              <div key={c.name} className="flex justify-between gap-2">
                <span className="text-slate-400">{c.name}</span>
                <span className={c.ok ? 'text-emerald-400' : 'text-rose-400'}>
                  {c.ok ? 'ok' : c.detail}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2 pb-4">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Camera className="w-4 h-4 text-amber-400" />
          Snapshots
        </h2>
        <p className="text-[11px] text-slate-400">
          Local result captures (same AppStorage as Desktop/CLI). Row bodies stay on this device.
        </p>
        <button
          type="button"
          onClick={onSaveSnapshot}
          disabled={snapshotBusy}
          className="w-full py-2.5 rounded-xl bg-slate-800 text-slate-100 text-xs font-semibold disabled:opacity-50"
        >
          Save last query result
        </button>
        {snapshots.length === 0 ? (
          <p className="text-[11px] text-slate-500">No snapshots yet.</p>
        ) : (
          <div className="space-y-1.5">
            {snapshots.map((s) => (
              <div
                key={s.id}
                className="rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2"
              >
                <div className="text-xs font-semibold text-slate-100 truncate">{s.name}</div>
                <div className="text-[10px] text-slate-400 truncate">
                  {s.row_count} rows · {s.connection_name} · {s.created_at.slice(0, 19)}
                </div>
                <div className="text-[10px] text-slate-500 font-mono truncate mt-0.5">
                  {s.sql_text}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

const Row: React.FC<{ k: string; v: string }> = ({ k, v }) => (
  <div className="flex justify-between gap-2">
    <span className="text-slate-400">{k}</span>
    <span className="text-slate-200 truncate">{v}</span>
  </div>
);
