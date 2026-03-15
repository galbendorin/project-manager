import React, { useState, useRef, useCallback } from 'react';

/**
 * Parse AI markdown output into sections based on ## headers
 */
const parseSections = (text) => {
  if (!text) return [];
  const sections = [];
  const lines = text.split('\n');
  let currentSection = null;
  let currentContent = [];

  for (const line of lines) {
    const headerMatch = line.match(/^##\s+(.+)/);
    if (headerMatch) {
      if (currentSection) {
        sections.push({ title: currentSection, content: currentContent.join('\n').trim() });
      }
      currentSection = headerMatch[1].trim();
      currentContent = [];
    } else if (currentSection) {
      currentContent.push(line);
    }
  }
  if (currentSection) {
    sections.push({ title: currentSection, content: currentContent.join('\n').trim() });
  }
  if (sections.length === 0 && text.trim()) {
    sections.push({ title: 'Report', content: text.trim() });
  }
  return sections;
};

const AiReportPanel = ({
  isConfigured,
  onOpenSettings,
  onGenerate,
  dateFrom,
  dateTo,
  canUseAiReport = true,
  aiReportsRemaining = null,
  aiReportsLimit = null,
  usePlatformKey = false
}) => {
  const [status, setStatus] = useState('idle'); // idle | generating | done | error
  const [streamText, setStreamText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [userNotes, setUserNotes] = useState('');
  const [copied, setCopied] = useState(false);
  const abortRef = useRef(null);

  const handleGenerate = useCallback(async () => {
    if (!onGenerate) return;
    setStatus('generating');
    setStreamText('');
    setErrorMsg('');

    const controller = new AbortController();
    abortRef.current = controller;

    const result = await onGenerate({
      dateFrom,
      dateTo,
      userNotes: userNotes.trim(),
      signal: controller.signal,
      onChunk: (_chunk, fullText) => {
        setStreamText(fullText);
      }
    });

    abortRef.current = null;

    if (result?.ok) {
      setStreamText(result.text || '');
      setStatus('done');
    } else {
      setErrorMsg(result?.error || 'Generation failed');
      setStatus(result?.error === 'Request cancelled' ? 'idle' : 'error');
    }
  }, [onGenerate, dateFrom, dateTo, userNotes]);

  const handleCancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus('idle');
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(streamText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // silent
    }
  };

  const handleReset = () => {
    setStatus('idle');
    setStreamText('');
    setErrorMsg('');
  };

  const showPayloadHint = /request too large|payload|body too large/i.test(errorMsg || '');
  const showOwnKeyHint = usePlatformKey && /trial ai|quota|billing|temporarily unavailable|busy right now/i.test(errorMsg || '');

  // Not configured — show setup prompt
  if (!isConfigured) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
          AI Report Generation
        </div>
        <p className="text-[12px] text-slate-500 leading-relaxed mb-3">
          Generate a status report narrative using AI. Connect your own API key to get started — your key stays in your browser and is never stored on our servers.
        </p>
        <button
          onClick={onOpenSettings}
          className="text-[11px] font-medium text-indigo-600 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-md transition-all"
        >
          Configure AI Provider
        </button>
      </div>
    );
  }

  const sections = parseSections(streamText);
  const isGenerating = status === 'generating';

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            AI Report Generation
          </div>
          {usePlatformKey && (
            <span className="text-[9px] font-medium text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded">
              Trial — Powered by Gemini
            </span>
          )}
        </div>
        <button
          onClick={onOpenSettings}
          className="text-[10px] text-slate-400 hover:text-indigo-600 font-medium transition-colors"
        >
          {usePlatformKey ? 'Use Your Own Key' : 'Settings'}
        </button>
      </div>

      {/* Input area — show when idle or error */}
      {(status === 'idle' || status === 'error') && (
        <div className="space-y-3">
          {/* AI usage badge */}
          {aiReportsLimit != null && (
            <div className={`flex items-center gap-2 text-[11px] px-3 py-1.5 rounded-lg border ${
              canUseAiReport
                ? aiReportsRemaining <= 2
                  ? 'text-amber-700 bg-amber-50 border-amber-200'
                  : 'text-emerald-700 bg-emerald-50 border-emerald-200'
                : 'text-rose-700 bg-rose-50 border-rose-200'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                canUseAiReport
                  ? aiReportsRemaining <= 2 ? 'bg-amber-500' : 'bg-emerald-500'
                  : 'bg-rose-500'
              }`} />
              {aiReportsLimit >= 999
                ? <span>AI Reports: <strong>Unlimited</strong></span>
                : <span>AI Reports: <strong>{aiReportsRemaining}</strong> of {aiReportsLimit} remaining this month</span>
              }
            </div>
          )}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
              Context Notes (Optional)
            </label>
            <textarea
              value={userNotes}
              onChange={(e) => setUserNotes(e.target.value)}
              maxLength={600}
              placeholder="E.g., Focus on vendor risk, highlight UAT progress"
              className="w-full h-16 border border-slate-200 rounded-lg px-3 py-2 text-[12px] text-slate-700 outline-none focus:border-indigo-300 resize-none"
            />
          </div>
          {status === 'error' && (
            <div className="text-[11px] text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              {errorMsg}
            </div>
          )}
          {status === 'error' && showOwnKeyHint && (
            <div className="text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 flex items-center justify-between gap-3">
              <span>Add your own Gemini, OpenAI, or Anthropic key to keep generating reports.</span>
              <button
                onClick={onOpenSettings}
                className="shrink-0 rounded-md bg-white border border-indigo-200 px-2.5 py-1 text-[10px] font-semibold text-indigo-700 hover:bg-indigo-100 transition-all"
              >
                Open AI Settings
              </button>
            </div>
          )}
          {status === 'error' && showPayloadHint && (
            <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Tip: reduce the reporting date range and keep notes shorter, then retry.
            </div>
          )}
          <button
            onClick={handleGenerate}
            disabled={!canUseAiReport}
            className={`text-[11px] font-medium px-4 py-2 rounded-md transition-all ${
              canUseAiReport
                ? 'text-white bg-indigo-600 hover:bg-indigo-700'
                : 'text-slate-400 bg-slate-100 border border-slate-200 cursor-not-allowed'
            }`}
          >
            {canUseAiReport ? 'Generate Report' : 'Report Limit Reached'}
          </button>
        </div>
      )}

      {/* Streaming / generating state */}
      {isGenerating && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
            <span className="text-[11px] text-slate-500 font-medium">Generating report…</span>
            <button
              onClick={handleCancel}
              className="ml-auto text-[11px] font-medium text-slate-400 hover:text-rose-500 transition-colors"
            >
              Cancel
            </button>
          </div>
          {streamText && (
            <div className="bg-slate-50 rounded-lg border border-slate-100 px-4 py-3 max-h-80 overflow-auto">
              <pre className="text-[12px] text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
                {streamText}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Done — show parsed sections */}
      {status === 'done' && sections.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-medium text-emerald-600">✓ Report generated</span>
            <div className="flex items-center gap-1.5 ml-auto">
              <button
                onClick={handleCopy}
                className="text-[11px] font-medium text-slate-500 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 px-2.5 py-1 rounded-md transition-all"
              >
                {copied ? '✓ Copied' : 'Copy All'}
              </button>
              <button
                onClick={handleReset}
                className="text-[11px] font-medium text-slate-400 hover:text-slate-600 px-2 py-1 transition-colors"
              >
                New Report
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {sections.map((section, idx) => (
              <div key={idx} className="bg-slate-50 rounded-lg border border-slate-100 px-4 py-3">
                <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5">
                  {section.title}
                </div>
                <div className="text-[12px] text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {section.content || <span className="text-slate-400 italic">No items to report.</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AiReportPanel;
