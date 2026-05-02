import React, { useEffect, useRef, useState } from 'react';
import { PROVIDERS, loadAiSettings, saveAiSettings, clearAiSettings, isAiConfigured, STORAGE_SCOPES } from '../utils/aiSettings';
import { supabase } from '../lib/supabase';

const AiSettingsModal = ({ onClose, onSettingsChange }) => {
  const [settings, setSettings] = useState(() => loadAiSettings());
  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState(null); // null | 'testing' | 'success' | 'error'
  const [testError, setTestError] = useState('');
  const closeButtonRef = useRef(null);

  const currentProvider = PROVIDERS[settings.provider];

  const handleProviderChange = (providerId) => {
    const provider = PROVIDERS[providerId];
    if (!provider) return;
    setSettings(prev => ({
      ...prev,
      provider: providerId,
      model: provider.defaultModel,
      apiKey: ''
    }));
    setTestStatus(null);
  };

  const handleModelChange = (modelId) => {
    setSettings(prev => ({ ...prev, model: modelId }));
  };

  const handleKeyChange = (value) => {
    setSettings(prev => ({ ...prev, apiKey: value }));
    setTestStatus(null);
  };

  const handleStorageScopeChange = (storageScope) => {
    setSettings(prev => ({ ...prev, storageScope }));
  };

  const handleSave = () => {
    const saved = saveAiSettings(settings);
    onSettingsChange?.(saved);
    onClose();
  };

  const handleClear = () => {
    const cleared = clearAiSettings();
    setSettings(cleared);
    setTestStatus(null);
    onSettingsChange?.(cleared);
  };

  const handleTest = async () => {
    if (!isAiConfigured(settings)) return;
    setTestStatus('testing');
    setTestError('');

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token || '';
      const response = await fetch('/api/ai-generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': settings.apiKey,
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
        },
        body: JSON.stringify({
          provider: settings.provider,
          model: settings.model,
          systemPrompt: 'Respond with exactly: OK',
          userMessage: 'Test connection. Respond with exactly one word: OK',
          maxTokens: 10,
          stream: false
        })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Status ${response.status}`);
      }

      const data = await response.json();
      if (data.text) {
        setTestStatus('success');
      } else {
        throw new Error('Empty response from provider');
      }
    } catch (err) {
      setTestStatus('error');
      setTestError(err.message || 'Connection failed');
    }
  };

  const canSave = settings.apiKey.trim().length > 0;
  const canTest = isAiConfigured(settings);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    const focusFrame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.cancelAnimationFrame(focusFrame);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 px-0 sm:items-center sm:px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-settings-title"
        className="flex max-h-[calc(100dvh-16px)] w-full max-w-md flex-col overflow-hidden rounded-t-xl border border-slate-200 bg-white shadow-xl sm:max-h-[90vh] sm:rounded-xl"
      >
        {/* Header */}
        <div className="shrink-0 border-b border-slate-100 px-5 pb-3 pt-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 id="ai-settings-title" className="text-[13px] font-bold text-slate-800">AI Configuration</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Bring Your Own Key — stored locally only</p>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="Close AI configuration"
              className="text-slate-400 hover:text-slate-600 text-lg leading-none p-1"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* Provider selector */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
              Provider
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {Object.values(PROVIDERS).map(p => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => handleProviderChange(p.id)}
                  className={`text-[11px] font-medium px-3 py-2 rounded-lg border transition-all ${
                    settings.provider === p.id
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                      : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Model selector */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
              Model
            </label>
            <select
              value={settings.model}
              onChange={(e) => handleModelChange(e.target.value)}
              className="w-full text-[12px] font-medium text-slate-700 bg-white border border-slate-200 px-3 py-2 rounded-lg outline-none focus:border-indigo-300 cursor-pointer"
            >
              {currentProvider?.models.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* API Key */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                API Key
              </label>
              {currentProvider?.docsUrl && (
                <a
                  href={currentProvider.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-indigo-500 hover:text-indigo-700 font-medium"
                >
                  Get a key →
                </a>
              )}
            </div>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={settings.apiKey}
                onChange={(e) => handleKeyChange(e.target.value)}
                placeholder={currentProvider?.keyPlaceholder || 'Paste your API key'}
                className="w-full text-[12px] text-slate-700 bg-white border border-slate-200 px-3 py-2 pr-16 rounded-lg outline-none focus:border-indigo-300 font-mono"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-medium text-slate-400 hover:text-slate-600 px-1.5 py-0.5"
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
              Your key stays in this browser only. Choose session-only storage for the safest default, or remember it on this device if you prefer convenience.
            </p>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
              Storage
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleStorageScopeChange(STORAGE_SCOPES.session)}
                className={`text-left rounded-lg border px-3 py-2 transition-all ${
                  settings.storageScope === STORAGE_SCOPES.session
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                    : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                }`}
              >
                <div className="text-[11px] font-medium">This session</div>
                <div className="text-[10px] mt-1 text-slate-400">
                  Recommended. Clears when this browser session ends.
                </div>
              </button>
              <button
                type="button"
                onClick={() => handleStorageScopeChange(STORAGE_SCOPES.local)}
                className={`text-left rounded-lg border px-3 py-2 transition-all ${
                  settings.storageScope === STORAGE_SCOPES.local
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                    : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                }`}
              >
                <div className="text-[11px] font-medium">Remember on this device</div>
                <div className="text-[10px] mt-1 text-slate-400">
                  More convenient, but stored persistently in this browser.
                </div>
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
              Your key is never stored in PM Workspace servers. It is sent to the selected AI provider through our proxy only for the requests you run.
            </p>
          </div>

          {/* Test connection */}
          {canTest && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleTest}
                disabled={testStatus === 'testing'}
                className={`text-[11px] font-medium px-3 py-1.5 rounded-md border transition-all ${
                  testStatus === 'testing'
                    ? 'text-slate-300 border-slate-200 bg-slate-50 cursor-not-allowed'
                    : 'text-slate-500 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
              </button>
              {testStatus === 'success' && (
                <span className="text-[11px] font-medium text-emerald-600">✓ Connected</span>
              )}
              {testStatus === 'error' && (
                <span className="break-words text-[11px] font-medium text-rose-600" title={testError}>
                  ✕ {testError.length > 50 ? testError.slice(0, 50) + '…' : testError}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] sm:pb-3">
          <button
            type="button"
            onClick={handleClear}
            className="text-[11px] font-medium text-rose-500 hover:text-rose-700 px-2 py-1"
          >
            Clear Key
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="text-[11px] font-medium text-slate-500 border border-slate-200 bg-white hover:bg-slate-50 px-3 py-1.5 rounded-md transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className={`text-[11px] font-medium px-3 py-1.5 rounded-md transition-all ${
                canSave
                  ? 'text-white bg-indigo-600 hover:bg-indigo-700'
                  : 'text-slate-300 bg-slate-100 cursor-not-allowed'
              }`}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AiSettingsModal;
