import React, { useState } from 'react';
import { Download, Key, Shield, CheckCircle, AlertTriangle, X, Lock } from 'lucide-react';
import { importConnectionsFromText } from '../services/tauriBridge';

interface SecureImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: () => void;
}

export const SecureImportModal: React.FC<SecureImportModalProps> = ({
  isOpen,
  onClose,
  onImportSuccess,
}) => {
  const [encryptedPayload, setEncryptedPayload] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState<number | null>(null);

  if (!isOpen) return null;

  const handleImport = async () => {
    if (!encryptedPayload.trim()) {
      setError('Please paste the encrypted connection payload string.');
      return;
    }
    if (!passphrase.trim()) {
      setError('Please enter the decryption passphrase provided by your teammate.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await importConnectionsFromText(encryptedPayload, passphrase);
      const importedCount = result?.connections?.length || 0;
      setSuccessCount(importedCount);
      setTimeout(() => {
        onImportSuccess();
        onClose();
        setSuccessCount(null);
        setEncryptedPayload('');
        setPassphrase('');
      }, 1500);
    } catch (err: any) {
      setError(err?.message || 'Decryption failed. Please verify your passphrase.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-400">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                Import Shared Connection
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">
                  AES-256
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Paste an encrypted payload from Slack/Email to restore connection profiles.
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

        {/* Modal Body */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-sm flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {successCount !== null ? (
            <div className="p-6 text-center space-y-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
              <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto animate-bounce" />
              <h4 className="text-lg font-semibold text-slate-100">Import Successful!</h4>
              <p className="text-xs text-slate-300">
                Restored {successCount} connection profile(s) securely into local workspace storage.
              </p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Encrypted Payload (Paste Base64/JSON string)
                </label>
                <textarea
                  rows={5}
                  placeholder="Paste encrypted payload from Slack, Email, or QR scan..."
                  value={encryptedPayload}
                  onChange={(e) => setEncryptedPayload(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Shared Passphrase
                </label>
                <div className="relative">
                  <Key className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                  <input
                    type="password"
                    placeholder="Enter the passphrase provided by sender..."
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-lg text-xs text-slate-400 flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  Decryption occurs entirely offline in native Rust binaries. No keys leave your computer.
                </span>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-end space-x-3 bg-slate-950/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
          {successCount === null && (
            <button
              onClick={handleImport}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg transition-colors flex items-center space-x-2 shadow-lg shadow-indigo-600/20"
            >
              <Lock className="w-4 h-4" />
              <span>{loading ? 'Decrypting...' : 'Decrypt & Import Connection'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
