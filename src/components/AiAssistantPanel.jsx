import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPlan, editPlan, describeChanges } from '../utils/aiPlanAssistant';
import { isAiConfigured } from '../utils/aiSettings';

// ── Voice recognition setup ──────────────────────────────────────────

const getSpeechRecognition = () => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const recognition = new SR();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-GB';
  return recognition;
};

const hasVoiceSupport = !!(window.SpeechRecognition || window.webkitSpeechRecognition);

// ── Chat message component ───────────────────────────────────────────

const ChatMessage = ({ msg }) => {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end mb-3">
        <div className="max-w-[85%] bg-indigo-600 text-white text-[12px] leading-relaxed px-3.5 py-2.5 rounded-xl rounded-br-sm">
          {msg.text}
        </div>
      </div>
    );
  }

  if (msg.role === 'system') {
    return (
      <div className="flex justify-center mb-3">
        <div className="text-[11px] text-slate-400 italic">{msg.text}</div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="flex justify-start mb-3">
      <div className="max-w-[85%]">
        <div className="bg-slate-100 text-slate-700 text-[12px] leading-relaxed px-3.5 py-2.5 rounded-xl rounded-bl-sm whitespace-pre-wrap">
          {msg.text}
        </div>
        {msg.changes && (
          <div className="mt-1.5 text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            <span className="font-medium">Changes: </span>{msg.changes}
          </div>
        )}
        {msg.showApply && (
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={msg.onApply}
              className="text-[11px] font-medium text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-md transition-all"
            >
              Apply to Plan
            </button>
            <button
              onClick={msg.onDiscard}
              className="text-[11px] font-medium text-slate-500 border border-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded-md transition-all"
            >
              Discard
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Main component ───────────────────────────────────────────────────

const AiAssistantPanel = ({ isOpen, onClose, aiSettings, currentTasks, onApplyTasks, onOpenSettings }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [pendingTasks, setPendingTasks] = useState(null);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);
  const abortRef = useRef(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessing]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen]);

  // Cleanup recognition on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      abortRef.current?.abort();
    };
  }, []);

  const configured = isAiConfigured(aiSettings);
  const hasTasks = currentTasks && currentTasks.length > 0;

  const addMessage = useCallback((msg) => {
    setMessages(prev => [...prev, { ...msg, id: Date.now() + Math.random() }]);
  }, []);

  // ── Voice input ────────────────────────────────────────────────────

  const startListening = useCallback(() => {
    const recognition = getSpeechRecognition();
    if (!recognition) return;

    recognitionRef.current = recognition;
    setIsListening(true);
    setInterimText('');

    recognition.onresult = (event) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }
      if (final) {
        setInput(prev => (prev ? prev + ' ' : '') + final);
        setInterimText('');
      } else {
        setInterimText(interim);
      }
    };

    recognition.onerror = () => {
      setIsListening(false);
      setInterimText('');
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimText('');
    };

    recognition.start();
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
    setInterimText('');
  }, []);

  // ── Send message ───────────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isProcessing) return;

    setInput('');
    setInterimText('');
    addMessage({ role: 'user', text });
    setIsProcessing(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      let result;

      if (hasTasks) {
        // Edit mode — send current tasks + user request
        result = await editPlan({
          tasks: currentTasks,
          userRequest: text,
          settings: aiSettings,
          signal: controller.signal
        });
      } else {
        // Create mode — generate new plan from description
        result = await createPlan({
          description: text,
          settings: aiSettings,
          signal: controller.signal
        });
      }

      if (!result.ok) {
        addMessage({ role: 'assistant', text: `Error: ${result.error}` });
      } else {
        const newTasks = result.tasks;
        setPendingTasks(newTasks);

        if (hasTasks) {
          const diff = describeChanges(currentTasks, newTasks);
          addMessage({
            role: 'assistant',
            text: `I've prepared the changes. Here's a summary:`,
            changes: diff.summary,
            showApply: true,
            onApply: () => handleApply(newTasks),
            onDiscard: () => handleDiscard()
          });
        } else {
          addMessage({
            role: 'assistant',
            text: `I've created a plan with ${newTasks.length} tasks. Review and apply it:`,
            showApply: true,
            onApply: () => handleApply(newTasks),
            onDiscard: () => handleDiscard()
          });
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        addMessage({ role: 'assistant', text: `Error: ${err.message}` });
      }
    }

    abortRef.current = null;
    setIsProcessing(false);
  }, [input, isProcessing, hasTasks, currentTasks, aiSettings, addMessage]);

  const handleApply = useCallback((tasks) => {
    onApplyTasks(tasks);
    setPendingTasks(null);
    // Remove the apply/discard buttons from the last message
    setMessages(prev => prev.map((msg, idx) =>
      idx === prev.length - 1 ? { ...msg, showApply: false, onApply: undefined, onDiscard: undefined } : msg
    ));
    addMessage({ role: 'system', text: '✓ Changes applied to your project plan.' });
  }, [onApplyTasks, addMessage]);

  const handleDiscard = useCallback(() => {
    setPendingTasks(null);
    setMessages(prev => prev.map((msg, idx) =>
      idx === prev.length - 1 ? { ...msg, showApply: false, onApply: undefined, onDiscard: undefined } : msg
    ));
    addMessage({ role: 'system', text: 'Changes discarded.' });
  }, [addMessage]);

  const handleCancel = () => {
    abortRef.current?.abort();
    setIsProcessing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-900/30" onClick={onClose} />

      {/* Drawer */}
      <div className="relative ml-auto w-full max-w-md bg-white border-l border-slate-200 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex-none px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-[13px] font-bold text-slate-800">AI Plan Assistant</h2>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {hasTasks ? 'Describe changes to your plan' : 'Describe your project to generate a plan'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-lg leading-none p-1"
          >
            ✕
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-auto px-4 py-3">
          {!configured && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-3">
              <p className="text-[12px] text-amber-800 mb-2">
                Connect your AI provider to use the plan assistant.
              </p>
              <button
                onClick={onOpenSettings}
                className="text-[11px] font-medium text-amber-700 border border-amber-300 bg-white hover:bg-amber-50 px-3 py-1.5 rounded-md transition-all"
              >
                Configure AI Provider
              </button>
            </div>
          )}

          {configured && messages.length === 0 && (
            <div className="text-center py-8">
              <div className="text-3xl mb-3">{hasTasks ? '✏️' : '🏗️'}</div>
              <p className="text-[12px] text-slate-500 leading-relaxed max-w-xs mx-auto">
                {hasTasks
                  ? 'Tell me what to change. For example: "Add a 3-day testing phase after development", "Make task 5 depend on task 3", or "Extend the design phase by a week".'
                  : 'Describe your project and I\'ll generate a plan. For example: "Build a mobile app with design, development, testing, and launch phases. 3-month timeline, team of 5."'}
              </p>
              {hasVoiceSupport && (
                <p className="text-[11px] text-slate-400 mt-3">
                  🎤 Voice input available — click the microphone to speak
                </p>
              )}
            </div>
          )}

          {messages.map((msg) => (
            <ChatMessage key={msg.id} msg={msg} />
          ))}

          {isProcessing && (
            <div className="flex justify-start mb-3">
              <div className="bg-slate-100 text-slate-500 text-[12px] px-3.5 py-2.5 rounded-xl rounded-bl-sm flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                <span>Thinking…</span>
                <button onClick={handleCancel} className="text-[10px] text-slate-400 hover:text-rose-500 ml-2">Cancel</button>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input area */}
        {configured && (
          <div className="flex-none border-t border-slate-200 px-4 py-3">
            {/* Interim voice text */}
            {interimText && (
              <div className="text-[11px] text-slate-400 italic mb-2 px-1">
                {interimText}…
              </div>
            )}

            <div className="flex items-end gap-2">
              {/* Voice button */}
              {hasVoiceSupport && (
                <button
                  onClick={isListening ? stopListening : startListening}
                  disabled={isProcessing}
                  className={`flex-none w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                    isListening
                      ? 'bg-rose-500 text-white animate-pulse'
                      : isProcessing
                        ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'
                  }`}
                  title={isListening ? 'Stop recording' : 'Voice input'}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                </button>
              )}

              {/* Text input */}
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={hasTasks ? 'Describe a change…' : 'Describe your project…'}
                disabled={isProcessing}
                rows={1}
                className="flex-1 min-h-[36px] max-h-24 border border-slate-200 rounded-lg px-3 py-2 text-[12px] text-slate-700 outline-none focus:border-indigo-300 resize-none disabled:bg-slate-50 disabled:text-slate-400"
              />

              {/* Send button */}
              <button
                onClick={handleSend}
                disabled={!input.trim() || isProcessing}
                className={`flex-none w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                  !input.trim() || isProcessing
                    ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                }`}
                title="Send"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AiAssistantPanel;
