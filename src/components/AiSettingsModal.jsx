import React, { useState } from 'react';
import { PROVIDERS, loadAiSettings, saveAiSettings, clearAiSettings, maskApiKey, isAiConfigured } from '../utils/aiSettings';

const AiSettingsModal = ({ onClose, onSettingsChange }) => {
  const [settings, setSettings] = useState(() => loadAiSettings());
  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState(null); // null | 'testing' | 'success' | 'error'
  const [testError, setTestError] = useState('');

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
      const response = await fetch('/api/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: settings.provider,
          apiKey: settings.apiKey,
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

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-xl">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[13px] font-bold text-slate-800">AI Configuration</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Bring Your Own Key — stored locally only</p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 text-lg leading-none p-1"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Provider selector */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
              Provider
            </label>
            <div className="flex gap-2">
              {Object.values(PROVIDERS).map(p => (
                <button
                  key={p.id}
                  onClick={() => handleProviderChange(p.id)}
                  className={`flex-1 text-[11px] font-medium px-3 py-2 rounded-lg border transition-all ${
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
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-medium text-slate-400 hover:text-slate-600 px-1.5 py-0.5"
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
              Your key is stored in this browser's localStorage only. It is sent to the LLM provider through our proxy but is never stored on any server.
            </p>
          </div>

          {/* Test connection */}
          {canTest && (
            <div className="flex items-center gap-2">
              <button
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
                <span className="text-[11px] font-medium text-rose-600" title={testError}>
                  ✕ {testError.length > 50 ? testError.slice(0, 50) + '…' : testError}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
          <button
            onClick={handleClear}
            className="text-[11px] font-medium text-rose-500 hover:text-rose-700 px-2 py-1"
          >
            Clear Key
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="text-[11px] font-medium text-slate-500 border border-slate-200 bg-white hover:bg-slate-50 px-3 py-1.5 rounded-md transition-all"
            >
              Cancel
            </button>
            <button
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
