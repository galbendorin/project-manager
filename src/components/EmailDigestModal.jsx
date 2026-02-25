import React, { useState, useRef, useCallback } from 'react';

const EmailDigestModal = ({ onClose, onGenerate, projectName }) => {
  const [status, setStatus] = useState('idle'); // idle | generating | done | error
  const [emailText, setEmailText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const abortRef = useRef(null);

  const handleGenerate = useCallback(async () => {
    setStatus('generating');
    setEmailText('');
    setErrorMsg('');

    const controller = new AbortController();
    abortRef.current = controller;

    const result = await onGenerate({
      signal: controller.signal,
      onChunk: (_chunk, fullText) => {
        setEmailText(fullText);
      }
    });

    abortRef.current = null;

    if (result?.ok) {
      setEmailText(result.text || '');
      setStatus('done');
    } else {
      setErrorMsg(result?.error || 'Generation failed');
      setStatus(result?.error === 'Request cancelled' ? 'idle' : 'error');
    }
  }, [onGenerate]);

  const handleCancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus('idle');
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(emailText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* silent */ }
  };

  const handleOpenMail = () => {
    // Extract subject line and body
    const lines = emailText.split('\n');
    let subject = `${projectName || 'Project'} — Weekly Status Update`;
    let bodyStart = 0;

    if (lines[0]?.toLowerCase().startsWith('subject:')) {
      subject = lines[0].replace(/^subject:\s*/i, '').trim();
      bodyStart = 1;
      // Skip blank line after subject
      if (lines[bodyStart]?.trim() === '') bodyStart++;
    }

    const body = lines.slice(bodyStart).join('\n').trim();
    const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailto, '_blank');
  };

  const isGenerating = status === 'generating';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-xl mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
          <div>
            <h2 className="text-[13px] font-bold text-slate-800">Email Digest for SLT</h2>
            <p className="text-[10px] text-slate-400 mt-0.5">AI-generated executive summary email</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-lg leading-none p-1"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto px-5 py-4">
          {/* Idle — show generate button */}
          {status === 'idle' && (
            <div className="text-center py-6">
              <div className="text-3xl mb-3">📧</div>
              <p className="text-[12px] text-slate-500 leading-relaxed max-w-xs mx-auto mb-4">
                Generate a concise executive status email from your current project data. Ready to send to senior leadership.
              </p>
              <button
                onClick={handleGenerate}
                className="text-[12px] font-medium text-white bg-indigo-600 hover:bg-indigo-700 px-5 py-2.5 rounded-lg transition-all"
              >
                Generate Email
              </button>
            </div>
          )}

          {/* Error */}
          {status === 'error' && (
            <div className="space-y-3">
              <div className="text-[11px] text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                {errorMsg}
              </div>
              <button
                onClick={handleGenerate}
                className="text-[12px] font-medium text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg transition-all"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Generating */}
          {isGenerating && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                <span className="text-[11px] text-slate-500 font-medium">Writing email…</span>
                <button
                  onClick={handleCancel}
                  className="ml-auto text-[11px] font-medium text-slate-400 hover:text-rose-500 transition-colors"
                >
                  Cancel
                </button>
              </div>
              {emailText && (
                <div className="bg-slate-50 rounded-lg border border-slate-100 px-4 py-3">
                  <pre className="text-[12px] text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
                    {emailText}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Done — show email with actions */}
          {status === 'done' && emailText && (
            <div className="space-y-3">
              <div className="bg-slate-50 rounded-lg border border-slate-100 px-4 py-3">
                <pre className="text-[12px] text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
                  {emailText}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions — visible when done */}
        {status === 'done' && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200">
            <button
              onClick={() => { setStatus('idle'); setEmailText(''); }}
              className="text-[11px] font-medium text-slate-400 hover:text-slate-600 transition-colors"
            >
              Regenerate
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="text-[11px] font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded-md transition-all"
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
              <button
                onClick={handleOpenMail}
                className="text-[11px] font-medium text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="M22 7l-10 7L2 7" />
                </svg>
                Open in Mail
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EmailDigestModal;
