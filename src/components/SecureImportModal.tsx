import React, { useEffect, useRef, useState } from 'react';
import {
  Download, Key, Shield, CheckCircle, AlertTriangle, X, Lock, FileText, Camera, QrCode,
} from 'lucide-react';
import { importConnectionsFromText } from '../services/tauriBridge';
import { decodeQrFromImageData, decodeQrFromImageFile } from '../utils/qrShare';

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
  const [scanning, setScanning] = useState(false);
  const textFileRef = useRef<HTMLInputElement>(null);
  const imageFileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);

  const stopCamera = () => {
    if (scanTimerRef.current != null) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  };

  useEffect(() => {
    if (!isOpen) stopCamera();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTextFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const resultStr = (event.target?.result as string) || '';
      setEncryptedPayload(resultStr.trim());
      setError(null);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleQrImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const data = await decodeQrFromImageFile(file);
      setEncryptedPayload(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to decode QR from image');
    } finally {
      setLoading(false);
    }
  };

  const startCameraScan = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      setScanning(true);
      // Wait for video element mount
      requestAnimationFrame(() => {
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        video.play().catch(() => undefined);
        scanTimerRef.current = window.setInterval(() => {
          const v = videoRef.current;
          if (!v || v.readyState < 2) return;
          const canvas = document.createElement('canvas');
          canvas.width = v.videoWidth;
          canvas.height = v.videoHeight;
          if (canvas.width < 8 || canvas.height < 8) return;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          ctx.drawImage(v, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = decodeQrFromImageData(imageData);
          if (data) {
            setEncryptedPayload(data);
            setError(null);
            stopCamera();
          }
        }, 400);
      });
    } catch (err: any) {
      setScanning(false);
      setError(
        err?.message ||
          'Camera access denied or unavailable. Use QR image file or paste text instead.'
      );
    }
  };

  const handleImport = async () => {
    if (!encryptedPayload.trim()) {
      setError('Please paste the encrypted payload, load a file, or scan a QR code.');
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
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
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
                Paste encrypted text, load a file, or scan a QR code from image/camera.
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
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
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Encrypted Payload
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    <input
                      type="file"
                      ref={textFileRef}
                      accept=".json,.txt,.devdash,text/*"
                      className="hidden"
                      onChange={handleTextFile}
                    />
                    <input
                      type="file"
                      ref={imageFileRef}
                      accept="image/*"
                      className="hidden"
                      onChange={handleQrImage}
                    />
                    <button
                      type="button"
                      onClick={() => textFileRef.current?.click()}
                      className="flex items-center space-x-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-[11px] font-medium"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Text file</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => imageFileRef.current?.click()}
                      className="flex items-center space-x-1 px-2 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded-lg text-[11px] font-medium"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>QR image</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => (scanning ? stopCamera() : startCameraScan())}
                      className="flex items-center space-x-1 px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-[11px] font-medium"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>{scanning ? 'Stop camera' : 'Camera scan'}</span>
                    </button>
                  </div>
                </div>
                <textarea
                  rows={4}
                  placeholder="Paste encrypted payload, or scan a QR…"
                  value={encryptedPayload}
                  onChange={(e) => setEncryptedPayload(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {scanning && (
                <div className="rounded-lg overflow-hidden border border-slate-700 bg-black">
                  <video ref={videoRef} className="w-full max-h-48 object-cover" muted playsInline />
                  <p className="text-[10px] text-center text-slate-400 py-1.5 bg-slate-950">
                    Point the camera at a DevDash share QR code…
                  </p>
                </div>
              )}

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
                  Decryption is local. Do not share the passphrase in the same channel as the QR/text payload.
                </span>
              </div>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-end space-x-3 bg-slate-950/50">
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
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
              <span>{loading ? 'Working…' : 'Decrypt & Import Connection'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
