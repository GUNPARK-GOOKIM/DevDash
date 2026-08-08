import React, { useState } from 'react';
import { EyeOff, ShieldCheck, X, Plus, Trash2, Lock, Check } from 'lucide-react';

export interface PiiMaskRule {
  id: string;
  fieldPattern: string;
  maskType: 'FULL' | 'PARTIAL_EMAIL' | 'LAST_FOUR' | 'HASH_SHA256';
  enabled: boolean;
}

interface PiiMaskingConfigProps {
  isOpen: boolean;
  onClose: () => void;
  rules?: PiiMaskRule[];
  onSaveRules?: (rules: PiiMaskRule[]) => void;
}

export const PiiMaskingConfig: React.FC<PiiMaskingConfigProps> = ({
  isOpen,
  onClose,
  rules = [
    { id: 'pii-1', fieldPattern: 'ssn', maskType: 'LAST_FOUR', enabled: true },
    { id: 'pii-2', fieldPattern: 'credit_card', maskType: 'LAST_FOUR', enabled: true },
    { id: 'pii-3', fieldPattern: 'password', maskType: 'FULL', enabled: true },
    { id: 'pii-4', fieldPattern: 'email', maskType: 'PARTIAL_EMAIL', enabled: false },
    { id: 'pii-5', fieldPattern: 'phone', maskType: 'LAST_FOUR', enabled: true },
  ],
  onSaveRules,
}) => {
  const [activeRules, setActiveRules] = useState<PiiMaskRule[]>(rules);

  if (!isOpen) return null;

  const toggleRule = (id: string) => {
    setActiveRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));
  };

  const addRule = () => {
    setActiveRules((prev) => [
      ...prev,
      { id: `pii-${Date.now()}`, fieldPattern: 'secret_key', maskType: 'FULL', enabled: true },
    ]);
  };

  const deleteRule = (id: string) => {
    setActiveRules((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-fadeIn select-none font-sans">
      <div className="bg-surface border border-border rounded-xl shadow-2xl w-[560px] max-w-[95vw] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between bg-surface/90">
          <div className="flex items-center space-x-2 text-indigo-400 font-semibold text-sm">
            <EyeOff className="w-4 h-4" />
            <span className="text-text">Data Masking Rules (local display / export)</span>
          </div>
          <button onClick={onClose} className="p-1 rounded text-textMuted hover:text-text hover:bg-surface2 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 bg-base">
          <div className="flex items-center justify-between">
            <span className="text-xs text-textMuted font-medium">Automatic Field Masking Rules:</span>
            <button
              onClick={addRule}
              className="text-xs text-accent hover:underline flex items-center space-x-1 font-semibold"
            >
              <Plus className="w-3 h-3" />
              <span>Add Pattern Rule</span>
            </button>
          </div>

          <div className="space-y-2 max-h-[260px] overflow-auto">
            {activeRules.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between p-3 bg-surface border border-border/60 rounded-lg text-xs font-mono"
              >
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={r.enabled}
                    onChange={() => toggleRule(r.id)}
                    className="accent-accent cursor-pointer"
                  />
                  <span className="text-text font-bold">{r.fieldPattern}</span>
                </div>
                <div className="flex items-center space-x-3">
                  <select
                    value={r.maskType}
                    onChange={(e) =>
                      setActiveRules((prev) =>
                        prev.map((item) => (item.id === r.id ? { ...item, maskType: e.target.value as any } : item))
                      )
                    }
                    className="bg-surface2 border border-border rounded px-2 py-1 text-[11px] text-accent font-sans"
                  >
                    <option value="FULL">•••••••• (FULL)</option>
                    <option value="LAST_FOUR">••••-••••-1234 (LAST 4)</option>
                    <option value="PARTIAL_EMAIL">a***e@example.com</option>
                    <option value="HASH_SHA256">Stable fingerprint (not crypto SHA-256)</option>
                  </select>
                  <button onClick={() => deleteRule(r.id)} className="text-textMuted hover:text-red-400">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-surface border-t border-border flex items-center justify-between text-xs text-textMuted">
          <span className="text-[10px]">Masking is applied locally prior to rendering</span>
          <div className="flex items-center space-x-2">
            <button onClick={onClose} className="px-3 py-1.5 rounded hover:bg-surface2">Cancel</button>
            <button
              onClick={() => {
                if (onSaveRules) onSaveRules(activeRules);
                onClose();
              }}
              className="px-4 py-1.5 bg-accent hover:bg-accentHover text-white font-semibold rounded shadow"
            >
              Save Active Rules
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
