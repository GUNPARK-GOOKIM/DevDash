import React, { useEffect, useState } from 'react';
import { Shield, Key, Copy, Check, Lock, Share2, X, AlertTriangle, QrCode } from 'lucide-react';
import { exportConnectionsToText } from '../services/tauriBridge';
import { canEncodeAsQr, encodePayloadToQrDataUrl } from '../utils/qrShare';

interface SecureShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  connections: Array<{ id: string; name: string; db_type: string; host: string; database: string }>;
  initialSelectedId?: string;
}

export const SecureShareModal: React.FC<SecureShareModalProps> = ({
  isOpen,
  onClose,
  connections,
  initialSelectedId,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>(
    initialSelectedId ? [initialSelectedId] : connections.map((c) => c.id)
  );
  const [passphrase, setPassphrase] = useState('');
  const [encryptedOutput, setEncryptedOutput] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [view, setView] = useState<'text' | 'qr'>('text');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!encryptedOutput) {
        setQrDataUrl(null);
        setQrError(null);
        return;
      }
      if (!canEncodeAsQr(encryptedOutput)) {
        setQrDataUrl(null);
        setQrError(
          `Payload too large for QR (${encryptedOutput.length} chars). Use the text tab or select fewer profiles.`
        );
        return;
      }
      try {
        const url = await encodePayloadToQrDataUrl(encryptedOutput);
        if (!cancelled) {
          setQrDataUrl(url);
          setQrError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setQrDataUrl(null);
          setQrError(String(e instanceof Error ? e.message : e));
        }
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [encryptedOutput]);

  if (!isOpen) return null;

  const handleToggleConnection = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((item) => item !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleGenerateSharePayload = async () => {
    if (!passphrase.trim()) {
      setError('Please set an encryption passphrase to secure the share payload.');
      return;
    }
    if (selectedIds.length === 0) {
      setError('Select at least one connection profile to share.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const output = await exportConnectionsToText(selectedIds, passphrase);
      setEncryptedOutput(output);
      setView(canEncodeAsQr(output) ? 'qr' : 'text');
    } catch (err: any) {
      setError(err?.message || 'Failed to encrypt and export connections.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!encryptedOutput) return;
    navigator.clipboard.writeText(encryptedOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-400">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                Encrypted Connection Share
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                  AES-256-GCM
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Encrypt profiles to a passphrase-protected payload. Share as text or scan a real QR code.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {error && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-sm flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {!encryptedOutput ? (
            <>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Select Profiles to Package
                </label>
                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {connections.map((conn) => (
                    <label
                      key={conn.id}
                      className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedIds.includes(conn.id)
                          ? 'bg-indigo-500/10 border-indigo-500/30 text-slate-100'
                          : 'bg-slate-950/40 border-slate-800/80 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(conn.id)}
                          onChange={() => handleToggleConnection(conn.id)}
                          className="rounded border-slate-700 bg-slate-900 text-indigo-500 focus:ring-indigo-500/20"
                        />
                        <div>
                          <p className="text-sm font-medium text-slate-200">{conn.name}</p>
                          <p className="text-xs text-slate-400">
                            {conn.db_type} &bull; {conn.host} &bull; {conn.database}
                          </p>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Set Shared Encryption Passphrase
                </label>
                <div className="relative">
                  <Key className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                  <input
                    type="password"
                    placeholder="Enter a secret key your teammate knows..."
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-lg text-xs text-slate-400 space-y-1">
                <div className="flex items-center text-slate-300 font-medium gap-1.5">
                  <Shield className="w-4 h-4 text-emerald-400" /> Passphrase + AES-256-GCM + optional QR
                </div>
                <p>
                  Large multi-profile payloads may exceed QR capacity; text copy always works.
                </p>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex border-b border-slate-800">
                <button
                  type="button"
                  onClick={() => setView('text')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                    view === 'text'
                      ? 'border-indigo-500 text-indigo-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Copy className="w-4 h-4" /> Text
                </button>
                <button
                  type="button"
                  onClick={() => setView('qr')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                    view === 'qr'
                      ? 'border-indigo-500 text-indigo-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <QrCode className="w-4 h-4" /> QR Code
                </button>
              </div>

              {view === 'text' ? (
                <div>
                  <div className="relative">
                    <textarea
                      readOnly
                      rows={6}
                      value={encryptedOutput}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-indigo-300/90 focus:outline-none resize-none"
                    />
                    <button
                      onClick={handleCopy}
                      className="absolute top-3 right-3 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-xs font-medium flex items-center gap-1.5 shadow-md transition-colors"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-300" /> Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" /> Copy Text
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 mt-2">
                    Paste this encrypted blob into Slack, Teams, or Email.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-4 bg-slate-950 rounded-lg border border-slate-800 space-y-3">
                  {qrDataUrl ? (
                    <>
                      <img
                        src={qrDataUrl}
                        alt="Encrypted connection share QR code"
                        className="w-64 h-64 rounded-lg bg-white p-2 shadow-lg"
                      />
                      <p className="text-xs text-slate-400 text-center">
                        Scan with DevDash import (image) or any QR reader that returns the text payload.
                      </p>
                    </>
                  ) : (
                    <div className="text-center text-xs text-amber-300/90 space-y-2 p-4">
                      <AlertTriangle className="w-8 h-8 mx-auto text-amber-400" />
                      <p>{qrError || 'Generating QR…'}</p>
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={() => {
                  setEncryptedOutput(null);
                  setQrDataUrl(null);
                  setQrError(null);
                  setView('text');
                }}
                className="text-xs text-slate-400 hover:text-slate-200 underline"
              >
                &larr; Re-encrypt with different passphrase or profiles
              </button>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-end space-x-3 bg-slate-950/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
          {!encryptedOutput && (
            <button
              onClick={handleGenerateSharePayload}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg transition-colors flex items-center space-x-2 shadow-lg shadow-indigo-600/20"
            >
              <Lock className="w-4 h-4" />
              <span>{loading ? 'Encrypting Payload...' : 'Generate Encrypted Share'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
