import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatShoppingAddSummary } from '../utils/shoppingListViewState';

const VOICE_GRACE_PERIOD_MS = 2000;
const VOICE_RESTART_DELAY_MS = 150;
const VOICE_EARLY_SESSION_MS = 6000;
const VOICE_MAX_RESTARTS = 4;
const SPACE_SPLIT_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'also',
  'buy',
  'for',
  'from',
  'get',
  'into',
  'my',
  'need',
  'needs',
  'our',
  'please',
  'plus',
  'put',
  'remember',
  'some',
  'the',
  'then',
  'to',
  'with',
]);
const KNOWN_GROCERY_PHRASES = [
  ['olive', 'oil'],
  ['ice', 'cream'],
  ['spring', 'onions'],
  ['spring', 'onion'],
  ['red', 'onion'],
  ['green', 'beans'],
  ['bell', 'pepper'],
  ['soy', 'sauce'],
  ['brown', 'bread'],
  ['white', 'bread'],
  ['coconut', 'milk'],
  ['peanut', 'butter'],
  ['tomato', 'sauce'],
  ['paper', 'towels'],
  ['toilet', 'roll'],
  ['kitchen', 'roll'],
  ['washing', 'up', 'liquid'],
];

const getSpeechRecognition = () => {
  if (typeof window === 'undefined') return null;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const recognition = new SR();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = navigator.languages?.[0] || navigator.language || 'en-GB';
  return recognition;
};

const hasVoiceSupport = () => (
  typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
);

const mergeKnownGroceryPhrases = (tokens = []) => {
  const merged = [];
  let index = 0;

  while (index < tokens.length) {
    const matchedPhrase = KNOWN_GROCERY_PHRASES.find((phrase) => (
      phrase.every((token, offset) => tokens[index + offset] === token)
    ));

    if (matchedPhrase) {
      merged.push(matchedPhrase.join(' '));
      index += matchedPhrase.length;
      continue;
    }

    merged.push(tokens[index]);
    index += 1;
  }

  return merged;
};

const splitVoiceTranscript = (value = '') => {
  const cleaned = String(value || '')
    .replace(/\b(add|and then|then|also)\b/gi, ',')
    .replace(/[;]+/g, ',')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!cleaned) {
    return { items: [], confident: true, reviewText: '' };
  }

  const commaItems = cleaned
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (commaItems.length > 1) {
    return { items: commaItems, confident: true, reviewText: cleaned };
  }

  const normalized = cleaned.replace(/[.?!]/g, ' ');
  const tokens = normalized
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z0-9'-]/g, ''))
    .filter(Boolean);

  const mergedTokens = mergeKnownGroceryPhrases(tokens);

  if (mergedTokens.length === 0) {
    return { items: [], confident: true, reviewText: cleaned };
  }

  const candidateItems = mergedTokens.filter((token) => !SPACE_SPLIT_STOPWORDS.has(token));

  if (candidateItems.length === 0) {
    return { items: [], confident: false, reviewText: cleaned };
  }

  if (candidateItems.length === 1) {
    return { items: [cleaned], confident: true, reviewText: cleaned };
  }

  if (candidateItems.length <= 4 && candidateItems.every((token) => token.length > 1)) {
    return {
      items: candidateItems.map((item) => item.replace(/\b\w/g, (char) => char.toUpperCase())),
      confident: true,
      reviewText: cleaned,
    };
  }

  return { items: [], confident: false, reviewText: cleaned };
};

export function useShoppingListVoiceCapture({ addItems, setDraftTitle, currentUserId = '', sessionKey = null }) {
  const scope = useMemo(() => ({ active: true }), [currentUserId, sessionKey]);
  const ownerRef = useRef(scope);
  ownerRef.current = scope;
  const isCurrent = useCallback(() => scope.active && ownerRef.current === scope, [scope]);
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [voiceMessage, setVoiceMessage] = useState('');
  const recognitionRef = useRef(null);
  const pendingVoiceTranscriptRef = useRef('');
  const voiceSessionActiveRef = useRef(false);
  const manualVoiceStopRef = useRef(false);
  const voiceFinalizeTimeoutRef = useRef(null);
  const voiceRestartTimeoutRef = useRef(null);
  const lastVoiceActivityAtRef = useRef(0);
  const voiceSessionStartedAtRef = useRef(0);
  const voiceRestartCountRef = useRef(0);
  const voiceSupported = hasVoiceSupport();

  const clearVoiceTimers = useCallback(() => {
    if (voiceFinalizeTimeoutRef.current) {
      window.clearTimeout(voiceFinalizeTimeoutRef.current);
      voiceFinalizeTimeoutRef.current = null;
    }
    if (voiceRestartTimeoutRef.current) {
      window.clearTimeout(voiceRestartTimeoutRef.current);
      voiceRestartTimeoutRef.current = null;
    }
  }, []);

  const handleVoiceItems = useCallback(async (transcript) => {
    if (!isCurrent()) return;
    const { items, confident, reviewText } = splitVoiceTranscript(transcript);
    if (items.length === 0) {
      setDraftTitle(transcript);
      setVoiceMessage('Voice captured. Review it and tap Add.');
      return;
    }

    if (!confident) {
      setDraftTitle(reviewText);
      setVoiceMessage('I heard a longer grocery note. Please review it and split it before adding.');
      return;
    }

    const summary = await addItems(items);
    if (!isCurrent() || summary?.cancelled) return;
    setVoiceMessage(summary ? formatShoppingAddSummary(summary) : 'Unable to add these groceries. Please review the entry box.');
  }, [addItems, setDraftTitle, isCurrent]);

  const finalizeVoiceCapture = useCallback(async () => {
    if (!isCurrent()) return;
    clearVoiceTimers();
    recognitionRef.current = null;
    voiceSessionActiveRef.current = false;
    manualVoiceStopRef.current = false;
    voiceRestartCountRef.current = 0;
    setIsListening(false);
    setInterimText('');

    const transcript = pendingVoiceTranscriptRef.current.trim();
    pendingVoiceTranscriptRef.current = '';

    if (transcript) {
      await handleVoiceItems(transcript);
    } else if (!voiceMessage) {
      setVoiceMessage('Voice input stopped.');
    }
  }, [clearVoiceTimers, handleVoiceItems, voiceMessage, isCurrent]);

  const scheduleVoiceFinalize = useCallback(() => {
    if (!isCurrent()) return;
    if (!voiceSessionActiveRef.current) return;
    if (voiceFinalizeTimeoutRef.current) {
      window.clearTimeout(voiceFinalizeTimeoutRef.current);
    }
    voiceFinalizeTimeoutRef.current = window.setTimeout(() => {
      void finalizeVoiceCapture();
    }, VOICE_GRACE_PERIOD_MS);
  }, [finalizeVoiceCapture, isCurrent]);

  const startRecognitionSession = useCallback(() => {
    if (!isCurrent()) return false;
    const recognition = getSpeechRecognition();
    if (!recognition) return false;

    recognition.continuous = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onresult = (event) => {
      if (!isCurrent()) return;
      let interim = '';
      let finalTranscript = '';

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index][0]?.transcript || '';
        if (event.results[index].isFinal) {
          finalTranscript += ` ${transcript}`;
        } else {
          interim += transcript;
        }
      }

      if (finalTranscript.trim()) {
        pendingVoiceTranscriptRef.current = `${pendingVoiceTranscriptRef.current} ${finalTranscript}`.trim();
      }

      setInterimText(interim.trim() ? interim.trim() : '');

      if (finalTranscript.trim() || interim.trim()) {
        lastVoiceActivityAtRef.current = Date.now();
        voiceRestartCountRef.current = 0;
        scheduleVoiceFinalize();
      }
    };

    recognition.onerror = (event) => {
      if (!isCurrent()) return;
      if (manualVoiceStopRef.current || !voiceSessionActiveRef.current) {
        return;
      }

      const isRecoverable = event?.error === 'no-speech' || event?.error === 'aborted' || event?.error === 'audio-capture';
      if (!isRecoverable) {
        setVoiceMessage('Voice input is unavailable right now. Please try again.');
        void finalizeVoiceCapture();
      }
    };

    recognition.onend = () => {
      if (!isCurrent()) return;
      recognitionRef.current = null;

      if (manualVoiceStopRef.current || !voiceSessionActiveRef.current) {
        void finalizeVoiceCapture();
        return;
      }

      const now = Date.now();
      const hasBufferedTranscript = pendingVoiceTranscriptRef.current.trim().length > 0;
      const hasRecentSpeech = now - lastVoiceActivityAtRef.current < VOICE_GRACE_PERIOD_MS;
      const isEarlySession = now - voiceSessionStartedAtRef.current < VOICE_EARLY_SESSION_MS;
      const canRestart = voiceRestartCountRef.current < VOICE_MAX_RESTARTS
        && (hasRecentSpeech || (!hasBufferedTranscript && isEarlySession));

      if (canRestart) {
        voiceRestartCountRef.current += 1;
        voiceRestartTimeoutRef.current = window.setTimeout(() => {
          if (voiceSessionActiveRef.current && !manualVoiceStopRef.current) {
            startRecognitionSession();
          }
        }, VOICE_RESTART_DELAY_MS);
        return;
      }

      if (hasBufferedTranscript) {
        scheduleVoiceFinalize();
        return;
      }

      void finalizeVoiceCapture();
    };

    try {
      recognition.start();
      return true;
    } catch {
      return false;
    }
  }, [finalizeVoiceCapture, scheduleVoiceFinalize, isCurrent]);

  const startListening = useCallback(() => {
    if (!isCurrent()) return;
    clearVoiceTimers();
    pendingVoiceTranscriptRef.current = '';
    manualVoiceStopRef.current = false;
    voiceSessionActiveRef.current = true;
    voiceSessionStartedAtRef.current = Date.now();
    lastVoiceActivityAtRef.current = Date.now();
    voiceRestartCountRef.current = 0;
    setIsListening(true);
    setInterimText('');
    setVoiceMessage('Listening… keep talking, and I will wait a little before adding the items.');

    const started = startRecognitionSession();
    if (!started) {
      voiceSessionActiveRef.current = false;
      setIsListening(false);
      setVoiceMessage('Voice input is unavailable right now. Please try again.');
    }
  }, [clearVoiceTimers, startRecognitionSession, isCurrent]);

  const stopListening = useCallback(() => {
    if (!isCurrent()) return;
    manualVoiceStopRef.current = true;
    clearVoiceTimers();
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    } else {
      void finalizeVoiceCapture();
    }
    setVoiceMessage('Voice input stopped.');
  }, [clearVoiceTimers, finalizeVoiceCapture, isCurrent]);

  useEffect(() => {
    scope.active = true;
    setIsListening(false);
    setInterimText('');
    setVoiceMessage('');
    return () => {
      scope.active = false;
      if (recognitionRef.current) {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
      }
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      pendingVoiceTranscriptRef.current = '';
      voiceSessionActiveRef.current = false;
      clearVoiceTimers();
    };
  }, [clearVoiceTimers, scope]);

  return {
    isListening,
    interimText,
    voiceMessage,
    setVoiceMessage,
    voiceSupported,
    startListening,
    stopListening,
  };
}
