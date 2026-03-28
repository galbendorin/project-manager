import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { usePlan } from '../contexts/PlanContext';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { createEmptyProjectSnapshot } from '../hooks/projectData/defaults';
import {
  MANUAL_TODO_SELECT,
  isMissingRelationError as isMissingTodoRelationError,
  mapManualTodoRow,
} from '../hooks/projectData/manualTodoUtils';
import { normalizeProjectRecord } from '../utils/projectSharing';
import ProjectShareModal from './ProjectShareModal';

const SHOPPING_PROJECT_NAME = 'Shopping List';
const VOICE_GRACE_PERIOD_MS = 2000;
const VOICE_RESTART_DELAY_MS = 150;
const VOICE_EARLY_SESSION_MS = 6000;
const VOICE_MAX_RESTARTS = 4;
const SHOPPING_REFRESH_POLL_MS = 3000;
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

const IconBase = ({ children, className = '', viewBox = '0 0 24 24' }) => (
  <svg
    className={className}
    viewBox={viewBox}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const Check = ({ className = '' }) => (
  <IconBase className={className}>
    <path d="M5 12.5 9.2 16.7 19 7.5" />
  </IconBase>
);

const ListChecks = ({ className = '' }) => (
  <IconBase className={className}>
    <path d="M10 6h10" />
    <path d="M10 12h10" />
    <path d="M10 18h10" />
    <path d="m4.5 6 1.5 1.5L8.5 5" />
    <path d="m4.5 12 1.5 1.5L8.5 11" />
    <path d="m4.5 18 1.5 1.5L8.5 17" />
  </IconBase>
);

const Loader2 = ({ className = '' }) => (
  <IconBase className={className}>
    <path d="M12 3a9 9 0 1 0 9 9" />
  </IconBase>
);

const Mic = ({ className = '' }) => (
  <IconBase className={className}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M6 11a6 6 0 0 0 12 0" />
    <path d="M12 17v4" />
  </IconBase>
);

const MicOff = ({ className = '' }) => (
  <IconBase className={className}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M6 11a6 6 0 0 0 6 6" />
    <path d="M12 17v4" />
    <path d="M4 4 20 20" />
  </IconBase>
);

const Plus = ({ className = '' }) => (
  <IconBase className={className}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </IconBase>
);

const Share2 = ({ className = '' }) => (
  <IconBase className={className}>
    <circle cx="18" cy="5" r="2.5" />
    <circle cx="6" cy="12" r="2.5" />
    <circle cx="18" cy="19" r="2.5" />
    <path d="M8.2 11 15.6 6.1" />
    <path d="M8.2 13 15.6 17.9" />
  </IconBase>
);

const ShoppingBasket = ({ className = '' }) => (
  <IconBase className={className}>
    <path d="M5 10h14l-1.2 8.2A2 2 0 0 1 15.8 20H8.2a2 2 0 0 1-1.98-1.8Z" />
    <path d="M9 10 12 5l3 5" />
  </IconBase>
);

const Sparkles = ({ className = '' }) => (
  <IconBase className={className}>
    <path d="m12 3 1.4 3.6L17 8l-3.6 1.4L12 13l-1.4-3.6L7 8l3.6-1.4Z" />
    <path d="m18.5 14 .8 2.1 2.2.9-2.2.8-.8 2.2-.9-2.2-2.1-.8 2.1-.9Z" />
    <path d="m5.5 15 .8 2.1 2.2.9-2.2.8-.8 2.2-.9-2.2-2.1-.8 2.1-.9Z" />
  </IconBase>
);

const Trash2 = ({ className = '' }) => (
  <IconBase className={className}>
    <path d="M4 7h16" />
    <path d="M10 11v5" />
    <path d="M14 11v5" />
    <path d="M6 7l1 11a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-11" />
    <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </IconBase>
);

const generateProjectId = () => {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return '';
};

const getSpeechRecognition = () => {
  if (typeof window === 'undefined') return null;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const recognition = new SR();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-GB';
  return recognition;
};

const hasVoiceSupport = () => (
  typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
);

const isProjectRelationMissingError = (error, relationName) => {
  const msg = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return msg.includes(relationName.toLowerCase()) && (msg.includes('relation') || msg.includes('relationship'));
};

const isRowLevelSecurityError = (error, tableName = '') => {
  const msg = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return msg.includes('row-level security')
    && (!tableName || msg.includes(tableName.toLowerCase()));
};

const sortTodos = (items = []) => (
  [...items].sort((left, right) => {
    if (left.status !== right.status) {
      return left.status === 'Done' ? 1 : -1;
    }
    return new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime();
  })
);

const mergeKnownGroceryPhrases = (tokens = []) => {
  const merged = [];
  let index = 0;

  while (index < tokens.length) {
    let matchedPhrase = null;

    for (const phrase of KNOWN_GROCERY_PHRASES) {
      const slice = tokens.slice(index, index + phrase.length);
      if (slice.length === phrase.length && slice.every((token, tokenIndex) => token.toLowerCase() === phrase[tokenIndex])) {
        matchedPhrase = slice.join(' ');
        index += phrase.length;
        break;
      }
    }

    if (matchedPhrase) {
      merged.push(matchedPhrase);
      continue;
    }

    merged.push(tokens[index]);
    index += 1;
  }

  return merged;
};

const splitVoiceTranscript = (value = '') => {
  const cleaned = String(value || '')
    .replace(/^(add|put|remember|buy|get)\s+/i, '')
    .replace(/\.$/, '')
    .trim();

  if (!cleaned) return [];

  const normalized = cleaned
    .replace(/\s+(and then|then|plus|also)\s+/gi, ', ')
    .replace(/\s+and\s+/gi, ', ')
    .replace(/\s*\n+\s*/g, ', ');
  const items = normalized
    .split(/\s*[,;]\s*/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (items.length > 1) {
    return items;
  }

  const bareTokens = normalized
    .split(/\s+/)
    .map((token) => token.trim().replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, ''))
    .filter(Boolean);
  const canFallbackSplitBySpaces = bareTokens.length >= 3
    && bareTokens.length <= 8
    && bareTokens.every((token) => /^[a-zA-Z][a-zA-Z'-]*$/.test(token) && !SPACE_SPLIT_STOPWORDS.has(token.toLowerCase()));

  if (canFallbackSplitBySpaces) {
    return mergeKnownGroceryPhrases(bareTokens);
  }

  return items.length > 0 ? items : [cleaned];
};

const describeShoppingProject = (project, index) => {
  if (project.isOwned) return 'Your Shopping List';
  const createdAt = project.created_at ? new Date(project.created_at) : null;
  if (createdAt && !Number.isNaN(createdAt.getTime())) {
    return `Shared List · ${createdAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
  }
  return `Shared List ${index + 1}`;
};

export default function ShoppingListView({ currentUserId }) {
  const { canCreateProject, limits, refreshProjectCount } = usePlan();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [projectError, setProjectError] = useState('');
  const [todos, setTodos] = useState([]);
  const [loadingTodos, setLoadingTodos] = useState(false);
  const [todoError, setTodoError] = useState('');
  const [draftTitle, setDraftTitle] = useState('');
  const [savingItems, setSavingItems] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [voiceMessage, setVoiceMessage] = useState('');
  const [pendingCompleteId, setPendingCompleteId] = useState('');
  const [pendingCompleteSeconds, setPendingCompleteSeconds] = useState(2);
  const supportsProjectMembersRef = useRef(true);
  const ensuringProjectRef = useRef(false);
  const recognitionRef = useRef(null);
  const pendingVoiceTranscriptRef = useRef('');
  const voiceSessionActiveRef = useRef(false);
  const manualVoiceStopRef = useRef(false);
  const voiceFinalizeTimeoutRef = useRef(null);
  const voiceRestartTimeoutRef = useRef(null);
  const lastVoiceActivityAtRef = useRef(0);
  const voiceSessionStartedAtRef = useRef(0);
  const voiceRestartCountRef = useRef(0);
  const completionTimeoutRef = useRef(null);
  const completionIntervalRef = useRef(null);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) || null,
    [projects, selectedProjectId]
  );
  const openTodos = useMemo(() => todos.filter((todo) => todo.status !== 'Done'), [todos]);
  const completedTodos = useMemo(() => todos.filter((todo) => todo.status === 'Done'), [todos]);
  const canShareProject = Boolean(selectedProject?.isOwned && supportsProjectMembersRef.current);

  const createShoppingProject = useCallback(async () => {
    const projectPayload = {
      id: generateProjectId(),
      user_id: currentUserId,
      name: SHOPPING_PROJECT_NAME,
      ...createEmptyProjectSnapshot(),
    };

    let { data, error } = await supabase
      .from('projects')
      .insert(projectPayload)
      .select('id, user_id, name, created_at, updated_at')
      .single();

    if (error && projectPayload.id && isRowLevelSecurityError(error, 'projects')) {
      const { error: insertError } = await supabase
        .from('projects')
        .insert(projectPayload);

      if (!insertError) {
        ({ data, error } = await supabase
          .from('projects')
          .select(supportsProjectMembersRef.current
            ? 'id, user_id, name, created_at, updated_at, project_members(id, user_id, member_email, role, invited_by_user_id, created_at)'
            : 'id, user_id, name, created_at, updated_at')
          .eq('id', projectPayload.id)
          .single());
      } else {
        error = insertError;
      }
    }

    if (error || !data) {
      throw error || new Error('Unable to create Shopping List.');
    }

    refreshProjectCount();
    return normalizeProjectRecord(data, currentUserId);
  }, [currentUserId, refreshProjectCount]);

  const loadProjects = useCallback(async () => {
    if (!currentUserId) return;

    setLoadingProjects(true);
    setProjectError('');

    let includeMembers = supportsProjectMembersRef.current;
    let { data, error } = await supabase
      .from('projects')
      .select(includeMembers
        ? 'id, user_id, name, created_at, updated_at, project_members(id, user_id, member_email, role, invited_by_user_id, created_at)'
        : 'id, user_id, name, created_at, updated_at')
      .eq('name', SHOPPING_PROJECT_NAME)
      .order('created_at', { ascending: true });

    if (error && includeMembers && isProjectRelationMissingError(error, 'project_members')) {
      supportsProjectMembersRef.current = false;
      includeMembers = false;
      ({ data, error } = await supabase
        .from('projects')
        .select('id, user_id, name, created_at, updated_at')
        .eq('name', SHOPPING_PROJECT_NAME)
        .order('created_at', { ascending: true }));
    }

    if (error) {
      setProjects([]);
      setProjectError(error.message || 'Unable to load Shopping List.');
      setLoadingProjects(false);
      return;
    }

    let nextProjects = (data || []).map((project) => normalizeProjectRecord(project, currentUserId));

    if (nextProjects.length === 0 && canCreateProject && !ensuringProjectRef.current) {
      ensuringProjectRef.current = true;
      try {
        const createdProject = await createShoppingProject();
        nextProjects = createdProject ? [createdProject] : [];
      } catch (createError) {
        setProjectError(createError.message || 'Unable to prepare Shopping List.');
      } finally {
        ensuringProjectRef.current = false;
      }
    } else if (nextProjects.length === 0 && !canCreateProject) {
      setProjectError(
        `Shopping List needs one project slot. Your ${limits.label} plan currently allows ${limits.maxProjects} project${limits.maxProjects === 1 ? '' : 's'}.`
      );
    }

    const defaultProject = nextProjects.find((project) => project.isOwned) || nextProjects[0] || null;

    setProjects(nextProjects);
    setSelectedProjectId((currentValue) => (
      currentValue && nextProjects.some((project) => project.id === currentValue)
        ? currentValue
        : (defaultProject?.id || '')
    ));
    setLoadingProjects(false);
  }, [canCreateProject, createShoppingProject, currentUserId, limits.label, limits.maxProjects]);

  const loadTodos = useCallback(async () => {
    if (!selectedProject?.id) {
      setTodos([]);
      return;
    }

    setLoadingTodos(true);
    setTodoError('');

    const { data, error } = await supabase
      .from('manual_todos')
      .select(MANUAL_TODO_SELECT)
      .eq('project_id', selectedProject.id)
      .order('status', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      if (isMissingTodoRelationError(error, 'manual_todos')) {
        setTodoError('Shopping items need the manual to-dos table enabled first.');
      } else {
        setTodoError(error.message || 'Unable to load grocery items.');
      }
      setTodos([]);
      setLoadingTodos(false);
      return;
    }

    setTodos(sortTodos((data || []).map(mapManualTodoRow)));
    setLoadingTodos(false);
  }, [selectedProject?.id]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    loadTodos();
  }, [loadTodos]);

  useEffect(() => {
    if (!selectedProject?.id) return undefined;

    const channel = supabase
      .channel(`shopping-list-${selectedProject.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'manual_todos',
          filter: `project_id=eq.${selectedProject.id}`,
        },
        () => {
          loadTodos();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadTodos, selectedProject?.id]);

  useEffect(() => {
    if (!selectedProject?.id || typeof window === 'undefined') return undefined;

    const pollIfVisible = () => {
      if (document.visibilityState === 'visible') {
        loadTodos();
      }
    };

    const intervalId = window.setInterval(pollIfVisible, SHOPPING_REFRESH_POLL_MS);
    document.addEventListener('visibilitychange', pollIfVisible);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', pollIfVisible);
    };
  }, [loadTodos, selectedProject?.id]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      if (voiceFinalizeTimeoutRef.current) {
        window.clearTimeout(voiceFinalizeTimeoutRef.current);
      }
      if (voiceRestartTimeoutRef.current) {
        window.clearTimeout(voiceRestartTimeoutRef.current);
      }
      if (completionTimeoutRef.current) {
        window.clearTimeout(completionTimeoutRef.current);
      }
      if (completionIntervalRef.current) {
        window.clearInterval(completionIntervalRef.current);
      }
    };
  }, []);

  const clearPendingCompletion = useCallback(() => {
    if (completionTimeoutRef.current) {
      window.clearTimeout(completionTimeoutRef.current);
      completionTimeoutRef.current = null;
    }
    if (completionIntervalRef.current) {
      window.clearInterval(completionIntervalRef.current);
      completionIntervalRef.current = null;
    }
    setPendingCompleteId('');
    setPendingCompleteSeconds(2);
  }, []);

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

  const addItems = useCallback(async (titles) => {
    const normalizedTitles = (titles || [])
      .map((title) => String(title || '').trim())
      .filter(Boolean);

    if (!selectedProject?.id || normalizedTitles.length === 0) return;

    setSavingItems(true);
    setTodoError('');

    const rows = normalizedTitles.map((title) => ({
      user_id: currentUserId,
      project_id: selectedProject.id,
      title,
      due_date: null,
      owner_text: '',
      assignee_user_id: currentUserId,
      status: 'Open',
      recurrence: null,
      completed_at: null,
    }));

    const { data, error } = await supabase
      .from('manual_todos')
      .insert(rows)
      .select(MANUAL_TODO_SELECT);

    if (error) {
      setTodoError(error.message || 'Unable to add groceries right now.');
      setSavingItems(false);
      return;
    }

    const savedItems = sortTodos((data || []).map(mapManualTodoRow));
    setTodos((previous) => sortTodos([...previous, ...savedItems]));
    setSavingItems(false);
  }, [currentUserId, selectedProject?.id]);

  const handleAddSubmit = useCallback(async (event) => {
    event.preventDefault();
    const items = splitVoiceTranscript(draftTitle);
    if (items.length === 0) return;
    await addItems(items);
    setDraftTitle('');
    setVoiceMessage(items.length === 1 ? `Added ${items[0]}.` : `Added ${items.length} groceries.`);
  }, [addItems, draftTitle]);

  const toggleTodoStatus = useCallback(async (todo) => {
    const nextStatus = todo.status === 'Done' ? 'Open' : 'Done';
    const completedAt = nextStatus === 'Done' ? new Date().toISOString() : null;

    const { data, error } = await supabase
      .from('manual_todos')
      .update({
        status: nextStatus,
        completed_at: completedAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', todo._id)
      .select(MANUAL_TODO_SELECT)
      .single();

    if (error) {
      setTodoError(error.message || 'Unable to update this grocery right now.');
      return;
    }

    setTodos((previous) => sortTodos(previous.map((item) => (
      item._id === todo._id ? mapManualTodoRow(data) : item
    ))));
  }, []);

  const handleToggleTodo = useCallback((todo) => {
    if (todo.status === 'Done' || !isMobile) {
      clearPendingCompletion();
      void toggleTodoStatus(todo);
      return;
    }

    if (pendingCompleteId === todo._id) {
      clearPendingCompletion();
      setVoiceMessage(`Kept ${todo.title} on the list.`);
      return;
    }

    clearPendingCompletion();
    setPendingCompleteId(todo._id);
    setPendingCompleteSeconds(2);
    setVoiceMessage(`Marking ${todo.title} as bought in 2 seconds. Tap again to cancel.`);

    completionIntervalRef.current = window.setInterval(() => {
      setPendingCompleteSeconds((value) => (value > 1 ? value - 1 : 1));
    }, 1000);

    completionTimeoutRef.current = window.setTimeout(() => {
      completionTimeoutRef.current = null;
      if (completionIntervalRef.current) {
        window.clearInterval(completionIntervalRef.current);
        completionIntervalRef.current = null;
      }
      const todoToComplete = todos.find((item) => item._id === todo._id);
      setPendingCompleteId('');
      setPendingCompleteSeconds(2);
      if (todoToComplete) {
        void toggleTodoStatus(todoToComplete);
      }
    }, 2000);
  }, [clearPendingCompletion, isMobile, pendingCompleteId, todos, toggleTodoStatus]);

  const deleteTodo = useCallback(async (todoId) => {
    if (pendingCompleteId === todoId) {
      clearPendingCompletion();
    }
    const previous = todos;
    setTodos((items) => items.filter((item) => item._id !== todoId));

    const { error } = await supabase
      .from('manual_todos')
      .delete()
      .eq('id', todoId);

    if (error) {
      setTodos(previous);
      setTodoError(error.message || 'Unable to remove this grocery right now.');
    }
  }, [clearPendingCompletion, pendingCompleteId, todos]);

  const handleVoiceItems = useCallback(async (transcript) => {
    const items = splitVoiceTranscript(transcript);
    if (items.length === 0) {
      setDraftTitle(transcript);
      setVoiceMessage('Voice captured. Review it and tap Add.');
      return;
    }

    await addItems(items);
    setVoiceMessage(items.length === 1 ? `Added ${items[0]}.` : `Added ${items.length} groceries.`);
  }, [addItems]);

  const finalizeVoiceCapture = useCallback(async () => {
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
  }, [clearVoiceTimers, handleVoiceItems, voiceMessage]);

  const scheduleVoiceFinalize = useCallback(() => {
    if (!voiceSessionActiveRef.current) return;
    if (voiceFinalizeTimeoutRef.current) {
      window.clearTimeout(voiceFinalizeTimeoutRef.current);
    }
    voiceFinalizeTimeoutRef.current = window.setTimeout(() => {
      void finalizeVoiceCapture();
    }, VOICE_GRACE_PERIOD_MS);
  }, [finalizeVoiceCapture]);

  const startRecognitionSession = useCallback(() => {
    const recognition = getSpeechRecognition();
    if (!recognition) return false;

    recognition.continuous = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onresult = (event) => {
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

      if (interim.trim()) {
        setInterimText(interim.trim());
      } else {
        setInterimText('');
      }

      if (finalTranscript.trim() || interim.trim()) {
        lastVoiceActivityAtRef.current = Date.now();
        voiceRestartCountRef.current = 0;
        scheduleVoiceFinalize();
      }
    };

    recognition.onerror = (event) => {
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
      recognitionRef.current = null;

      if (manualVoiceStopRef.current || !voiceSessionActiveRef.current) {
        void finalizeVoiceCapture();
        return;
      }

      const now = Date.now();
      const hasBufferedTranscript = pendingVoiceTranscriptRef.current.trim().length > 0;
      const hasRecentSpeech = now - lastVoiceActivityAtRef.current < VOICE_GRACE_PERIOD_MS;
      const isEarlySession = now - voiceSessionStartedAtRef.current < VOICE_EARLY_SESSION_MS;
      const canRestart = voiceRestartCountRef.current < VOICE_MAX_RESTARTS && (hasRecentSpeech || (!hasBufferedTranscript && isEarlySession));

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
  }, [finalizeVoiceCapture, scheduleVoiceFinalize]);

  const startListening = useCallback(() => {
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
  }, [clearVoiceTimers, startRecognitionSession]);

  const stopListening = useCallback(() => {
    manualVoiceStopRef.current = true;
    clearVoiceTimers();
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    } else {
      void finalizeVoiceCapture();
    }
    setVoiceMessage('Voice input stopped.');
  }, []);

  if (loadingProjects) {
    return (
      <div className="flex min-h-[360px] items-center justify-center px-4 py-10 text-sm font-medium text-slate-500">
        Preparing Shopping List...
      </div>
    );
  }

  return (
    <>
      <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)]">
            <aside className="order-2 lg:order-1 lg:sticky lg:top-6 lg:self-start">
              <div className="pm-workspace-panel rounded-[30px] p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="pm-kicker">Mini tool</p>
                    <div className="mt-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/80 bg-white/80 text-[var(--pm-accent)] shadow-sm">
                      <ShoppingBasket className="h-5 w-5" />
                    </div>
                    <h1 className="mt-4 text-[1.55rem] font-bold tracking-[-0.04em] text-slate-950">Shopping List</h1>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      Keep one simple grocery list shared with your partner, then add items by typing or voice.
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid gap-3">
                  <div className="pm-metric-card rounded-2xl px-4 py-3">
                    <div className="pm-kicker">Current list</div>
                    {projects.length > 1 ? (
                      <label className="mt-2 block">
                        <select
                          value={selectedProjectId}
                          onChange={(event) => setSelectedProjectId(event.target.value)}
                          className="pm-input w-full rounded-2xl px-3 py-2.5 text-sm text-slate-900"
                        >
                          {projects.map((project, index) => (
                            <option key={project.id} value={project.id}>
                              {describeShoppingProject(project, index)}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <>
                        <div className="mt-1 text-lg font-semibold text-slate-950">{selectedProject?.name || SHOPPING_PROJECT_NAME}</div>
                        <p className="mt-1 text-xs text-slate-500">
                          {selectedProject?.isOwned ? 'Owned by you' : 'Shared with you'}
                        </p>
                      </>
                    )}
                  </div>

                  <div className="pm-metric-card rounded-2xl px-4 py-3">
                    <div className="pm-kicker">Collaboration</div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-lg font-semibold text-slate-950">
                        {selectedProject?.project_members?.length ? 'Shared' : 'Private'}
                      </span>
                      <span className="text-xs text-slate-500">
                        {selectedProject?.project_members?.length ? 'partner access enabled' : 'ready to share'}
                      </span>
                    </div>
                    {canShareProject ? (
                      <button
                        type="button"
                        onClick={() => setShareOpen(true)}
                        className="pm-subtle-button mt-3 inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition"
                      >
                        <Share2 className="h-3.5 w-3.5" />
                        Share this list
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="pm-utility-card mt-5 rounded-[24px] p-4">
                  <p className="pm-kicker">Quick notes</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="pm-utility-chip rounded-full px-2.5 py-1 text-[11px] font-medium">Voice add</span>
                    <span className="pm-utility-chip rounded-full px-2.5 py-1 text-[11px] font-medium">Shared groceries</span>
                    <span className="pm-utility-chip rounded-full px-2.5 py-1 text-[11px] font-medium">Simple check-off</span>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-slate-500">
                    Voice works best with short phrases like “milk, eggs, bananas”.
                  </p>
                </div>

                {projectError ? (
                  <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {projectError}
                  </div>
                ) : null}
              </div>
            </aside>

            <main className="order-1 min-w-0 lg:order-2">
              <div className="pm-home-panel rounded-[30px] p-5 sm:p-6">
                <div className="mb-4 rounded-[24px] border border-slate-200 bg-white/80 px-4 py-4 shadow-sm lg:hidden">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="pm-kicker">Current list</p>
                      <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">
                        {selectedProject?.name || SHOPPING_PROJECT_NAME}
                      </h2>
                      <p className="mt-1 text-sm text-slate-500">
                        {selectedProject?.project_members?.length ? 'Shared with partner' : 'Private for now'}
                      </p>
                    </div>
                    {canShareProject ? (
                      <button
                        type="button"
                        onClick={() => setShareOpen(true)}
                        className="pm-subtle-button shrink-0 rounded-xl px-3 py-2 text-xs font-semibold transition"
                      >
                        Share
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                  <div>
                    <p className="pm-kicker">Groceries</p>
                    <h2 className="mt-2 text-2xl font-bold tracking-[-0.04em] text-slate-950 sm:text-3xl">Add what you need</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      Keep groceries easy to scan, easy to share, and fast to tick off together.
                    </p>
                  </div>
                  <div className="hidden items-center gap-2 text-xs text-slate-500 md:flex">
                    <Sparkles className="h-3.5 w-3.5 text-[var(--pm-accent)]" />
                    Shared project access powers this list.
                  </div>
                </div>

                <form
                  onSubmit={handleAddSubmit}
                  className="pm-surface-soft mt-5 rounded-[28px] p-4 sm:p-5"
                >
                  <div className="mb-4">
                    <p className="pm-kicker">Quick add</p>
                    <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">Add groceries by text or voice</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Type one item, or say a few items out loud and let the list split them for you.
                    </p>
                  </div>

                  <div className="flex flex-col gap-3 md:flex-row md:items-center">
                    <div className="min-w-0 flex-1">
                      <input
                        type="text"
                        value={draftTitle}
                        onChange={(event) => setDraftTitle(event.target.value)}
                        placeholder="Milk, eggs, tomatoes..."
                        className="pm-input w-full rounded-2xl px-4 py-3 text-base text-slate-900 placeholder-slate-400 sm:text-sm"
                        autoComplete="off"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={isListening ? stopListening : startListening}
                      disabled={!hasVoiceSupport()}
                      className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                        isListening
                          ? 'border-[var(--pm-accent)] bg-[var(--pm-accent-soft)] text-[var(--pm-accent-strong)]'
                          : 'pm-subtle-button'
                      } ${!hasVoiceSupport() ? 'cursor-not-allowed opacity-50' : ''}`}
                    >
                      <span className="inline-flex items-center gap-2">
                        {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                        {isListening ? 'Stop' : 'Voice'}
                      </span>
                    </button>
                    <button
                      type="submit"
                      disabled={savingItems || !draftTitle.trim() || !selectedProject}
                      className="pm-toolbar-primary rounded-2xl px-5 py-3 text-sm font-semibold text-white transition disabled:bg-slate-200 disabled:text-slate-400"
                    >
                      <span className="inline-flex items-center gap-2">
                        {savingItems ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        Add
                      </span>
                    </button>
                  </div>

                  <div className="mt-3 flex flex-col gap-1 text-xs text-slate-500">
                    <span>{interimText ? `Hearing: ${interimText}` : voiceMessage || 'Say “milk, eggs, bread” for a quick grocery add.'}</span>
                    {!hasVoiceSupport() ? (
                      <span>This browser does not expose speech recognition, so voice add is unavailable here.</span>
                    ) : null}
                  </div>
                </form>

                {todoError ? (
                  <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {todoError}
                  </div>
                ) : null}

                <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="pm-list-shell rounded-[28px] p-3 sm:p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="pm-kicker text-sm">Shopping items</h3>
                      <span className="text-xs text-slate-400">
                        {loadingTodos ? 'Loading...' : `${openTodos.length} open · ${completedTodos.length} bought`}
                      </span>
                    </div>

                    {loadingTodos ? (
                      <div className="pm-surface-card rounded-[24px] px-4 py-12 text-center shadow-sm">
                        <div className="inline-flex items-center gap-2 text-sm text-slate-500">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading groceries...
                        </div>
                      </div>
                    ) : todos.length === 0 ? (
                      <div className="pm-surface-card rounded-[24px] px-4 py-12 text-center shadow-sm">
                        <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-[var(--pm-accent)] shadow-sm">
                          <ShoppingBasket className="h-5 w-5" />
                        </div>
                        <p className="mt-4 text-sm font-semibold text-slate-900">Your shared grocery list is ready</p>
                        <p className="mt-2 text-sm leading-6 text-slate-500">
                          Add a few groceries above, or use voice to drop in a quick list for the week.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-5">
                        <section>
                          <div className="mb-3 flex items-center gap-2">
                            <ListChecks className="h-4 w-4 text-[var(--pm-accent)]" />
                            <h4 className="text-sm font-semibold text-slate-900">To buy</h4>
                          </div>
                          <div className="space-y-3">
                            {openTodos.length === 0 ? (
                              <div className="rounded-2xl border border-dashed border-slate-200 bg-white/80 px-4 py-4 text-sm text-slate-500">
                                Nothing open right now.
                              </div>
                            ) : openTodos.map((todo) => (
                              <div
                                key={todo._id}
                                className={`rounded-[22px] border bg-white px-4 py-4 shadow-sm transition ${
                                  pendingCompleteId === todo._id
                                    ? 'border-[var(--pm-accent)] bg-[var(--pm-accent-tint)]'
                                    : 'border-slate-200'
                                }`}
                              >
                                <div className="flex items-start gap-3 sm:items-center">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleTodo(todo)}
                                    className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition ${
                                      pendingCompleteId === todo._id
                                        ? 'border-[var(--pm-accent)] bg-white text-[var(--pm-accent)]'
                                        : 'border-slate-200 bg-white text-slate-400 hover:border-emerald-300 hover:text-emerald-600'
                                    }`}
                                    aria-label={`Mark ${todo.title} as bought`}
                                  >
                                    {pendingCompleteId === todo._id ? (
                                      <span className="text-sm font-bold">{pendingCompleteSeconds}</span>
                                    ) : (
                                      <Check className="h-4 w-4" />
                                    )}
                                  </button>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-base font-semibold leading-6 text-slate-900 sm:text-sm">{todo.title}</p>
                                    <p className={`mt-1 text-xs ${pendingCompleteId === todo._id ? 'text-[var(--pm-accent-strong)]' : 'text-slate-400'}`}>
                                      {pendingCompleteId === todo._id
                                        ? `Marking bought in ${pendingCompleteSeconds}s. Tap again to cancel.`
                                        : (isMobile ? 'Tap the circle and wait 2 seconds to complete.' : 'Tap the check to mark this item as bought.')}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => deleteTodo(todo._id)}
                                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-transparent text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                                    aria-label={`Delete ${todo.title}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </section>

                        <section>
                          <div className="mb-3 flex items-center gap-2">
                            <Check className="h-4 w-4 text-emerald-600" />
                            <h4 className="text-sm font-semibold text-slate-900">Bought</h4>
                          </div>
                          <div className="space-y-3">
                            {completedTodos.length === 0 ? (
                              <div className="rounded-2xl border border-dashed border-slate-200 bg-white/80 px-4 py-4 text-sm text-slate-500">
                                Bought groceries will collect here.
                              </div>
                            ) : completedTodos.map((todo) => (
                              <div key={todo._id} className="rounded-[22px] border border-slate-200 bg-white/90 px-4 py-4 shadow-sm">
                                <div className="flex items-start gap-3 sm:items-center">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleTodo(todo)}
                                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-600 transition hover:bg-emerald-100"
                                    aria-label={`Move ${todo.title} back to open`}
                                  >
                                    <Check className="h-4 w-4" />
                                  </button>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-base font-semibold leading-6 text-slate-400 line-through sm:text-sm">{todo.title}</p>
                                    <p className="mt-1 text-xs text-slate-400">Tap the check if you need to reopen it.</p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => deleteTodo(todo._id)}
                                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-transparent text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                                    aria-label={`Delete ${todo.title}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </section>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="pm-surface-soft rounded-[28px] p-5">
                      <p className="pm-kicker">How sharing works</p>
                      <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">One shared grocery list</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-500">
                        Share this Shopping List project once, then both people can add groceries and tick them off from the same list.
                      </p>
                      {canShareProject ? (
                        <button
                          type="button"
                          onClick={() => setShareOpen(true)}
                          className="pm-toolbar-primary mt-4 inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-white transition"
                        >
                          <Share2 className="h-4 w-4" />
                          Share with partner
                        </button>
                      ) : (
                        <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                          {selectedProject?.isOwned
                            ? 'Sharing is unavailable until project members are enabled.'
                            : 'You are currently viewing a shared shopping list.'}
                        </div>
                      )}
                    </div>

                    <div className="pm-surface-soft rounded-[28px] p-5">
                      <p className="pm-kicker">Voice add</p>
                      <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">Quick groceries</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-500">
                        Use the voice button for short bursts like “apples, pasta, olive oil” and the list will add them as separate items.
                      </p>
                      <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">
                        <Mic className="h-3.5 w-3.5 text-[var(--pm-accent)]" />
                        {hasVoiceSupport() ? 'Speech recognition available here' : 'Speech recognition not available in this browser'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </main>
          </div>
        </div>
      </div>

      <ProjectShareModal
        isOpen={shareOpen && Boolean(selectedProject)}
        project={selectedProject}
        onClose={() => setShareOpen(false)}
        onMembershipChanged={loadProjects}
      />
    </>
  );
}
