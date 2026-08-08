import React, { useState, useEffect } from 'react';
import {
  X, Sparkles, Sliders, Database, ShieldCheck, Keyboard, Check,
  Cpu, Globe, Key, Shield, RotateCcw, AlertTriangle
} from 'lucide-react';

export interface AiConfig {
  enabled: boolean;
  provider: 'ollama' | 'claude' | 'openai' | 'custom';
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface GeneralSettings {
  pageSize: number;
  fontSize: number;
  fontFamily: string;
  showRowCountInTab: boolean;
  autoReconnect: boolean;
  autoCapitalizeSql: boolean;
  queryTimeoutSec: number;
  safeModeDefaultProd: boolean;
  confirmDestructiveNoWhere: boolean;
  sshTimeoutSec: number;
  strictSslVerify: boolean;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  aiConfig: AiConfig;
  onAiConfigChange: (config: AiConfig) => void;
  generalSettings: GeneralSettings;
  onGeneralSettingsChange: (settings: GeneralSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  aiConfig,
  onAiConfigChange,
  generalSettings,
  onGeneralSettingsChange,
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'database' | 'ai' | 'security' | 'shortcuts'>('general');
  
  const [localSettings, setLocalSettings] = useState<GeneralSettings>(generalSettings);
  const [localAi, setLocalAi] = useState<AiConfig>(aiConfig);
  const [showApiKey, setShowApiKey] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Shortcut customization state
  const [shortcuts, setShortcuts] = useState([
    { id: 'ai_agent', action: 'AI Agent Prompt Bar', shortcut: 'Cmd+K' },
    { id: 'execute_query', action: 'Execute Selected Query', shortcut: 'Cmd+Enter' },
    { id: 'new_tab', action: 'New SQL Query Tab', shortcut: 'Cmd+T' },
    { id: 'staging_tab', action: 'Open Staging & Commit', shortcut: 'Cmd+Shift+C' },
    { id: 'history', action: 'Query History Log', shortcut: 'Cmd+H' },
    { id: 'save_query', action: 'Save Query to Project', shortcut: 'Cmd+S' },
    { id: 'open_settings', action: 'Open Preferences', shortcut: 'Cmd+,' },
  ]);
  const [editingShortcutId, setEditingShortcutId] = useState<string | null>(null);

  useEffect(() => {
    setLocalSettings(generalSettings);
    setLocalAi(aiConfig);
  }, [generalSettings, aiConfig]);

  if (!isOpen) return null;

  const handleProviderChange = (provider: AiConfig['provider']) => {
    let defaults = { provider, baseUrl: '', model: '' };
    if (provider === 'ollama') {
      defaults = { provider, baseUrl: 'http://localhost:11434', model: 'qwen2.5-coder' };
    } else if (provider === 'claude') {
      defaults = { provider, baseUrl: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4-6-20250514' };
    } else if (provider === 'openai') {
      defaults = { provider, baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' };
    } else if (provider === 'custom') {
      defaults = { provider, baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-coder' };
    }
    setLocalAi(prev => ({ ...prev, ...defaults }));
  };

  const handleSave = () => {
    onGeneralSettingsChange(localSettings);
    onAiConfigChange(localAi);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[99999]">
      <div className="bg-surface border border-border rounded-xl shadow-2xl w-[640px] max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-surface2/60">
          <div className="flex items-center space-x-2">
            <Sliders className="w-4 h-4 text-accent" />
            <span className="text-sm font-semibold text-text">Preferences & Settings</span>
          </div>
          <button onClick={onClose} className="text-textMuted hover:text-text transition-colors p-1 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex flex-1 min-h-[420px]">
          {/* Sidebar Tabs */}
          <div className="w-48 border-r border-border p-2 space-y-1 bg-surface2/30 shrink-0 select-none">
            <button
              onClick={() => setActiveTab('general')}
              className={`w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'general' ? 'bg-accent/15 text-accent font-semibold' : 'text-textMuted hover:text-text hover:bg-surface2'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>General</span>
            </button>

            <button
              onClick={() => setActiveTab('database')}
              className={`w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'database' ? 'bg-accent/15 text-accent font-semibold' : 'text-textMuted hover:text-text hover:bg-surface2'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>Database & SQL</span>
            </button>

            <button
              onClick={() => setActiveTab('ai')}
              className={`w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'ai' ? 'bg-accent/15 text-accent font-semibold' : 'text-textMuted hover:text-text hover:bg-surface2'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI Agent Engine</span>
            </button>

            <button
              onClick={() => setActiveTab('security')}
              className={`w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'security' ? 'bg-accent/15 text-accent font-semibold' : 'text-textMuted hover:text-text hover:bg-surface2'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Security & Drivers</span>
            </button>

            <button
              onClick={() => setActiveTab('shortcuts')}
              className={`w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'shortcuts' ? 'bg-accent/15 text-accent font-semibold' : 'text-textMuted hover:text-text hover:bg-surface2'
              }`}
            >
              <Keyboard className="w-3.5 h-3.5" />
              <span>Shortcuts</span>
            </button>
          </div>

          {/* Active Tab Panel */}
          <div className="flex-1 p-5 overflow-y-auto">
            {/* GENERAL TAB */}
            {activeTab === 'general' && (
              <div className="space-y-4 text-xs">
                <div>
                  <label className="block font-medium text-textMuted mb-1">Default Data Grid Page Size</label>
                  <select
                    value={localSettings.pageSize}
                    onChange={(e) => setLocalSettings({ ...localSettings, pageSize: Number(e.target.value) })}
                    className="w-full bg-surface2/60 border border-border rounded-lg px-3 py-1.5 text-text focus:border-accent/50 outline-none"
                  >
                    <option value={300}>300 rows</option>
                    <option value={1000}>1,000 rows (Recommended)</option>
                    <option value={5000}>5,000 rows</option>
                    <option value={10000}>10,000 rows</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-textMuted mb-1">SQL Editor Font Family</label>
                  <select
                    value={localSettings.fontFamily}
                    onChange={(e) => setLocalSettings({ ...localSettings, fontFamily: e.target.value })}
                    className="w-full bg-surface2/60 border border-border rounded-lg px-3 py-1.5 text-text focus:border-accent/50 outline-none font-mono text-xs"
                  >
                    <option value="'JetBrains Mono', monospace">JetBrains Mono (Default)</option>
                    <option value="'Fira Code', monospace">Fira Code</option>
                    <option value="'Consolas', monospace">Consolas</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-textMuted mb-1">SQL Editor Font Size ({localSettings.fontSize}px)</label>
                  <input
                    type="range"
                    min={11}
                    max={18}
                    value={localSettings.fontSize}
                    onChange={(e) => setLocalSettings({ ...localSettings, fontSize: Number(e.target.value) })}
                    className="w-full accent-accent cursor-pointer"
                  />
                </div>

                <div className="space-y-2 pt-2 border-t border-border/50">
                  <label className="flex items-center justify-between p-2.5 bg-surface2/30 rounded-lg cursor-pointer">
                    <span className="text-text">Show row counts in tab titles</span>
                    <input
                      type="checkbox"
                      checked={localSettings.showRowCountInTab}
                      onChange={(e) => setLocalSettings({ ...localSettings, showRowCountInTab: e.target.checked })}
                      className="w-4 h-4 accent-accent cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between p-2.5 bg-surface2/30 rounded-lg cursor-pointer">
                    <span className="text-text">Auto-reconnect on network drop</span>
                    <input
                      type="checkbox"
                      checked={localSettings.autoReconnect}
                      onChange={(e) => setLocalSettings({ ...localSettings, autoReconnect: e.target.checked })}
                      className="w-4 h-4 accent-accent cursor-pointer"
                    />
                  </label>
                </div>
              </div>
            )}

            {/* DATABASE & SQL TAB */}
            {activeTab === 'database' && (
              <div className="space-y-4 text-xs">
                <div>
                  <label className="block font-medium text-textMuted mb-1">Query Execution Timeout (Seconds)</label>
                  <input
                    type="number"
                    value={localSettings.queryTimeoutSec}
                    onChange={(e) => setLocalSettings({ ...localSettings, queryTimeoutSec: Number(e.target.value) })}
                    className="w-full bg-surface2/60 border border-border rounded-lg px-3 py-1.5 text-text focus:border-accent/50 outline-none"
                  />
                  <p className="text-[10px] text-textMuted mt-1">
                    Queries longer than this are aborted server-side (0 = no timeout). Backend cancel is best-effort on Postgres/MySQL.
                  </p>
                </div>

                <div className="space-y-2 pt-2 border-t border-border/50">
                  <label className="flex items-center justify-between p-2.5 bg-surface2/30 rounded-lg cursor-pointer">
                    <div>
                      <div className="text-text font-medium">Auto-Capitalize SQL Keywords</div>
                      <div className="text-[10px] text-textMuted">Automatically converts select, from, where to uppercase while typing</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={localSettings.autoCapitalizeSql}
                      onChange={(e) => setLocalSettings({ ...localSettings, autoCapitalizeSql: e.target.checked })}
                      className="w-4 h-4 accent-accent cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between p-2.5 bg-surface2/30 rounded-lg cursor-pointer">
                    <div>
                      <div className="text-text font-medium">Safe Mode ON by Default for Production DBs</div>
                      <div className="text-[10px] text-textMuted">Enforces confirmation prompts for prod/production/live connections</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={localSettings.safeModeDefaultProd}
                      onChange={(e) => setLocalSettings({ ...localSettings, safeModeDefaultProd: e.target.checked })}
                      className="w-4 h-4 accent-accent cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between p-2.5 bg-surface2/30 rounded-lg cursor-pointer">
                    <div>
                      <div className="text-text font-medium font-semibold text-warning">Confirm UPDATE / DELETE Without WHERE</div>
                      <div className="text-[10px] text-textMuted">Requires typing "I understand" before staging un-targeted queries</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={localSettings.confirmDestructiveNoWhere}
                      onChange={(e) => setLocalSettings({ ...localSettings, confirmDestructiveNoWhere: e.target.checked })}
                      className="w-4 h-4 accent-accent cursor-pointer"
                    />
                  </label>
                </div>
              </div>
            )}

            {/* AI TAB */}
            {activeTab === 'ai' && (
              <div className="space-y-4 text-xs">
                <div className="flex items-center justify-between p-3 bg-surface2/40 border border-border rounded-lg">
                  <div>
                    <div className="font-semibold text-text">Enable AI Agent Bar</div>
                    <div className="text-[11px] text-textMuted">Natural language SQL generation and query assistance</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={localAi.enabled}
                    onChange={(e) => setLocalAi({ ...localAi, enabled: e.target.checked })}
                    className="w-4 h-4 accent-accent cursor-pointer"
                  />
                </div>

                {localAi.enabled && (
                  <>
                    <div>
                      <label className="block font-medium text-textMuted mb-1.5">AI Provider</label>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { id: 'ollama', name: 'Ollama / Local', desc: 'Requires local Ollama running', icon: <Cpu className="w-3.5 h-3.5 text-success" /> },
                          { id: 'claude', name: 'Anthropic Claude', desc: 'Cloud API (network + key)', icon: <Sparkles className="w-3.5 h-3.5 text-accent" /> },
                          { id: 'openai', name: 'OpenAI', desc: 'Cloud API (network + key)', icon: <Globe className="w-3.5 h-3.5 text-blue-400" /> },
                          { id: 'custom', name: 'Custom OpenAI API', desc: 'Any OpenAI-compatible endpoint', icon: <Key className="w-3.5 h-3.5 text-warning" /> },
                        ].map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => handleProviderChange(p.id as any)}
                            className={`p-2.5 rounded-lg border text-left transition-all ${
                              localAi.provider === p.id
                                ? 'border-accent bg-accent/10 text-text'
                                : 'border-border bg-surface2/30 text-textMuted hover:border-textMuted/40'
                            }`}
                          >
                            <div className="flex items-center space-x-1.5 font-medium text-text">
                              {p.icon}
                              <span>{p.name}</span>
                            </div>
                            <div className="text-[10px] text-textMuted mt-0.5">{p.desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block font-medium text-textMuted mb-1">API Base URL</label>
                      <input
                        type="text"
                        value={localAi.baseUrl}
                        onChange={(e) => setLocalAi({ ...localAi, baseUrl: e.target.value })}
                        placeholder="e.g. http://localhost:11434"
                        className="w-full bg-surface2/60 border border-border rounded-lg px-3 py-1.5 text-text placeholder-textMuted focus:border-accent/50 outline-none font-mono"
                      />
                    </div>

                    <div>
                      <label className="block font-medium text-textMuted mb-1">Model Name</label>
                      <input
                        type="text"
                        value={localAi.model}
                        onChange={(e) => setLocalAi({ ...localAi, model: e.target.value })}
                        placeholder="e.g. qwen2.5-coder, claude-sonnet-4-6"
                        className="w-full bg-surface2/60 border border-border rounded-lg px-3 py-1.5 text-text placeholder-textMuted focus:border-accent/50 outline-none font-mono"
                      />
                    </div>

                    {localAi.provider !== 'ollama' && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="font-medium text-textMuted">API Key</label>
                          <button
                            type="button"
                            onClick={() => setShowApiKey(!showApiKey)}
                            className="text-[10px] text-accent hover:underline"
                          >
                            {showApiKey ? 'Hide' : 'Show'}
                          </button>
                        </div>
                        <input
                          type={showApiKey ? 'text' : 'password'}
                          value={localAi.apiKey}
                          onChange={(e) => setLocalAi({ ...localAi, apiKey: e.target.value })}
                          placeholder="sk-..."
                          className="w-full bg-surface2/60 border border-border rounded-lg px-3 py-1.5 text-text placeholder-textMuted focus:border-accent/50 outline-none font-mono"
                        />
                        <p className="text-[10px] text-textMuted mt-1 flex items-center space-x-1">
                          <Shield className="w-3 h-3 text-success" />
                          <span>Stored encrypted in local system OS Keychain.</span>
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* SECURITY & DRIVERS TAB */}
            {activeTab === 'security' && (
              <div className="space-y-4 text-xs">
                <div className="p-3 bg-surface2/40 border border-border rounded-lg space-y-1.5">
                  <div className="flex items-center space-x-2 font-medium text-text">
                    <Shield className="w-4 h-4 text-success" />
                    <span>OS Keychain Credential Protection</span>
                  </div>
                  <p className="text-[11px] text-textMuted">
                    All database passwords, SSH private key paths, and API keys are automatically encrypted using standard OS Keychain services (macOS Keychain, Windows Credential Manager, Linux Secret Service).
                  </p>
                </div>

                <div>
                  <label className="block font-medium text-textMuted mb-1">SSH Tunnel Connect Timeout (Seconds)</label>
                  <input
                    type="number"
                    value={localSettings.sshTimeoutSec}
                    onChange={(e) => setLocalSettings({ ...localSettings, sshTimeoutSec: Number(e.target.value) })}
                    className="w-full bg-surface2/60 border border-border rounded-lg px-3 py-1.5 text-text focus:border-accent/50 outline-none"
                  />
                </div>

                <div className="pt-2 border-t border-border/50">
                  <label className="flex items-center justify-between p-2.5 bg-surface2/30 rounded-lg cursor-pointer">
                    <div>
                      <div className="text-text font-medium">Strict TLS/SSL Certificate Verification</div>
                      <div className="text-[10px] text-textMuted">Reject self-signed certificates unless explicitly trusted</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={localSettings.strictSslVerify}
                      onChange={(e) => setLocalSettings({ ...localSettings, strictSslVerify: e.target.checked })}
                      className="w-4 h-4 accent-accent cursor-pointer"
                    />
                  </label>
                </div>
              </div>
            )}

            {/* SHORTCUTS TAB */}
            {activeTab === 'shortcuts' && (
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-textMuted">Customizable Keyboard Shortcuts</span>
                  <button
                    onClick={() => {
                      setShortcuts([
                        { id: 'ai_agent', action: 'AI Agent Prompt Bar', shortcut: 'Cmd+K' },
                        { id: 'execute_query', action: 'Execute Selected Query', shortcut: 'Cmd+Enter' },
                        { id: 'new_tab', action: 'New SQL Query Tab', shortcut: 'Cmd+T' },
                        { id: 'staging_tab', action: 'Open Staging & Commit', shortcut: 'Cmd+Shift+C' },
                        { id: 'history', action: 'Query History Log', shortcut: 'Cmd+H' },
                        { id: 'save_query', action: 'Save Query to Project', shortcut: 'Cmd+S' },
                        { id: 'open_settings', action: 'Open Preferences', shortcut: 'Cmd+,' },
                      ]);
                    }}
                    className="flex items-center space-x-1 text-[10px] text-accent hover:underline"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset Defaults</span>
                  </button>
                </div>

                <div className="space-y-1.5">
                  {shortcuts.map((s) => (
                    <div key={s.id} className="flex items-center justify-between p-2.5 bg-surface2/40 rounded-lg border border-border">
                      <span className="text-text font-medium">{s.action}</span>
                      {editingShortcutId === s.id ? (
                        <input
                          type="text"
                          autoFocus
                          value={s.shortcut}
                          onBlur={() => setEditingShortcutId(null)}
                          onChange={(e) => {
                            const val = e.target.value;
                            setShortcuts(prev => prev.map(item => item.id === s.id ? { ...item, shortcut: val } : item));
                          }}
                          className="bg-surface border border-accent rounded px-2 py-0.5 text-accent font-mono text-[11px] outline-none w-28 text-center"
                        />
                      ) : (
                        <button
                          onClick={() => setEditingShortcutId(s.id)}
                          className="bg-surface font-mono text-[10px] px-2.5 py-1 rounded border border-border text-accent font-semibold hover:border-accent transition-colors"
                        >
                          {s.shortcut}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-surface2/40">
          {savedSuccess ? (
            <span className="text-xs text-success flex items-center space-x-1 font-medium">
              <Check className="w-3.5 h-3.5" />
              <span>Settings saved!</span>
            </span>
          ) : <div />}
          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg border border-border text-xs text-textMuted hover:text-text hover:bg-surface2 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 rounded-lg bg-accent hover:bg-accentHover text-white text-xs font-medium transition-colors shadow"
            >
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
