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
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { createOfflineTempId, isOfflineTempId, readLocalJson, readOfflineJson, writeLocalJson } from '../utils/offlineState';
import { enqueueCreate, enqueueDelete, enqueueUpdate, replaceQueuedTargetId } from '../utils/offlineQueue';
import { normalizeProjectRecord } from '../utils/projectSharing';
import {
  disablePushAlerts,
  enablePushAlerts,
  isPushNotificationsSupported,
  notifyShoppingListSubscribers,
  syncExistingPushSubscription,
} from '../utils/pushNotifications';
import MobileSyncCenter from './MobileSyncCenter';
import ProjectShareModal from './ProjectShareModal';

const SHOPPING_PROJECT_NAME = 'Shopping List';
const VOICE_GRACE_PERIOD_MS = 2000;
const VOICE_RESTART_DELAY_MS = 150;
const VOICE_EARLY_SESSION_MS = 6000;
const VOICE_MAX_RESTARTS = 4;
const MOBILE_COMPLETE_DELAY_MS = 1000;
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
const SHOPPING_OFFLINE_PREFIX = 'pmworkspace:shopping-offline:v1';

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

const ChevronDown = ({ className = '' }) => (
  <IconBase className={className}>
    <path d="m6 9 6 6 6-6" />
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
  recognition.lang = navigator.languages?.[0] || navigator.language || 'en-GB';
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
    const leftTime = new Date(left.createdAt || 0).getTime();
    const rightTime = new Date(right.createdAt || 0).getTime();
    return rightTime - leftTime;
  })
);

const mergeTodosById = (existingItems = [], incomingItems = []) => {
  const merged = new Map();

  for (const item of existingItems || []) {
    if (item?._id) merged.set(item._id, item);
  }

  for (const item of incomingItems || []) {
    if (!item?._id) continue;
    const current = merged.get(item._id) || {};
    merged.set(item._id, { ...current, ...item });
  }

  return sortTodos(Array.from(merged.values()));
};

const formatSharedActorLabel = (value = '') => {
  const email = String(value || '').trim().toLowerCase();
  const localPart = email.split('@')[0] || '';
  if (!localPart) return '';
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const resolveSharedActorLabel = (row = {}, project, currentUserId) => {
  const actorId = row.user_id || row.assignee_user_id || '';
  if (!actorId || actorId === currentUserId) return '';
  if (actorId === project?.user_id) return 'Owner';

  const matchingMember = (project?.project_members || []).find((member) => member?.user_id === actorId);
  const memberLabel = formatSharedActorLabel(matchingMember?.member_email);
  return memberLabel || 'Someone';
};

const isOfflineBrowser = () => (
  typeof navigator !== 'undefined' && navigator.onLine === false
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

  if (!cleaned) {
    return { items: [], confident: false, reviewText: '' };
  }

  const normalized = cleaned
    .replace(/\s+(and then|then|plus|also)\s+/gi, ', ')
    .replace(/\s+and\s+/gi, ', ')
    .replace(/\s*\n+\s*/g, ', ');
  const items = normalized
    .split(/\s*[,;]\s*/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (items.length > 1) {
    return { items, confident: true, reviewText: cleaned };
  }

  const bareTokens = normalized
    .split(/\s+/)
    .map((token) => token.trim().replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, ''))
    .filter(Boolean);
  const canFallbackSplitBySpaces = bareTokens.length >= 3
    && bareTokens.length <= 8
    && bareTokens.every((token) => /^[a-zA-Z][a-zA-Z'-]*$/.test(token) && !SPACE_SPLIT_STOPWORDS.has(token.toLowerCase()));

  if (canFallbackSplitBySpaces) {
    return { items: mergeKnownGroceryPhrases(bareTokens), confident: true, reviewText: cleaned };
  }

  const fallbackItem = items.length > 0 ? items[0] : cleaned;
  const looksLikeUncertainVoiceBlob = bareTokens.length >= 5 || fallbackItem.length > 32;

  return {
    items: [fallbackItem],
    confident: !looksLikeUncertainVoiceBlob,
    reviewText: cleaned,
  };
};

const splitTypedGroceries = (value = '') => (
  String(value || '')
    .split(/\s*[,;\n]\s*/)
    .map((item) => item.trim())
    .filter(Boolean)
);

const describeShoppingProject = (project, index) => {
  if (project.isOwned) return 'Your Shopping List';
  const createdAt = project.created_at ? new Date(project.created_at) : null;
  if (createdAt && !Number.isNaN(createdAt.getTime())) {
    return `Shared List · ${createdAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
  }
  return `Shared List ${index + 1}`;
};

const buildShoppingOfflineKey = (userId = 'anon') => `${SHOPPING_OFFLINE_PREFIX}:${userId}`;

const createEmptyShoppingOfflineState = () => ({
  projects: [],
  selectedProjectId: '',
  todosByProject: {},
  queue: [],
  lastSyncedAt: '',
});

const loadShoppingOfflineState = (userId) => (
  readLocalJson(buildShoppingOfflineKey(userId), createEmptyShoppingOfflineState())
);

const loadShoppingOfflineStateAsync = async (userId) => (
  readOfflineJson(buildShoppingOfflineKey(userId), createEmptyShoppingOfflineState())
);

const saveShoppingOfflineState = (userId, state) => {
  writeLocalJson(buildShoppingOfflineKey(userId), {
    ...createEmptyShoppingOfflineState(),
    ...(state || {}),
  });
};

const createOfflineShoppingTodo = ({ title, projectId, userId, status = 'Open', completedAt = '' }) => {
  const timestamp = new Date().toISOString();
  return {
    _id: createOfflineTempId('offline-todo'),
    projectId,
    title,
    dueDate: '',
    owner: '',
    assigneeUserId: userId,
    status,
    recurrence: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    completedAt,
  };
};

const formatSyncTimeLabel = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

export default function ShoppingListView({ currentUserId }) {
  const { canCreateProject, limits, refreshProjectCount } = usePlan();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const isOnline = useOnlineStatus();
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
  const [liveUpdateMessage, setLiveUpdateMessage] = useState('');
  const [pushSupported, setPushSupported] = useState(() => isPushNotificationsSupported());
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushPermission, setPushPermission] = useState(() => (
    typeof window !== 'undefined' && 'Notification' in window ? window.Notification.permission : 'default'
  ));
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMessage, setPushMessage] = useState('');
  const [pendingCompleteId, setPendingCompleteId] = useState('');
  const [pendingCompleteSeconds, setPendingCompleteSeconds] = useState(1);
  const [savingTodoId, setSavingTodoId] = useState('');
  const [savingTodoAction, setSavingTodoAction] = useState('');
  const [failedTodoId, setFailedTodoId] = useState('');
  const [failedTodoMessage, setFailedTodoMessage] = useState('');
  const [showBought, setShowBought] = useState(false);
  const [syncingQueue, setSyncingQueue] = useState(false);
  const [offlineQueue, setOfflineQueue] = useState(() => {
    const cachedState = loadShoppingOfflineState(currentUserId);
    return Array.isArray(cachedState.queue) ? cachedState.queue : [];
  });
  const [lastSyncedAt, setLastSyncedAt] = useState(() => {
    const cachedState = loadShoppingOfflineState(currentUserId);
    return cachedState.lastSyncedAt || '';
  });
  const supportsProjectMembersRef = useRef(true);
  const ensuringProjectRef = useRef(false);
  const syncingQueueRef = useRef(false);
  const shoppingRealtimeChannelRef = useRef(null);
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
  const persistOfflineState = useCallback((nextState) => {
    saveShoppingOfflineState(currentUserId, nextState);
    setOfflineQueue(Array.isArray(nextState.queue) ? nextState.queue : []);
    setLastSyncedAt(nextState.lastSyncedAt || '');
    return nextState;
  }, [currentUserId]);

  useEffect(() => {
    if (!isMobile) {
      setShowBought(true);
    }
  }, [isMobile]);

  useEffect(() => {
    if (!liveUpdateMessage) return undefined;
    const timeoutId = window.setTimeout(() => setLiveUpdateMessage(''), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [liveUpdateMessage]);

  useEffect(() => {
    if (!pushMessage) return undefined;
    const timeoutId = window.setTimeout(() => setPushMessage(''), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [pushMessage]);

  useEffect(() => {
    const cachedState = loadShoppingOfflineState(currentUserId);
    if (cachedState.projects?.length) {
      setProjects(cachedState.projects);
    }
    if (cachedState.selectedProjectId) {
      setSelectedProjectId((current) => current || cachedState.selectedProjectId);
    }
    setOfflineQueue(Array.isArray(cachedState.queue) ? cachedState.queue : []);
    setLastSyncedAt(cachedState.lastSyncedAt || '');

    let active = true;
    void loadShoppingOfflineStateAsync(currentUserId).then((preferredState) => {
      if (!active || !preferredState) return;
      if (preferredState.projects?.length) {
        setProjects(preferredState.projects);
      }
      if (preferredState.selectedProjectId) {
        setSelectedProjectId((current) => current || preferredState.selectedProjectId);
      }
      setOfflineQueue(Array.isArray(preferredState.queue) ? preferredState.queue : []);
      setLastSyncedAt(preferredState.lastSyncedAt || '');
    });

    return () => {
      active = false;
    };
  }, [currentUserId]);

  useEffect(() => {
    let active = true;

    if (!isPushNotificationsSupported()) {
      setPushSupported(false);
      setPushEnabled(false);
      return () => {
        active = false;
      };
    }

    setPushSupported(true);

    void syncExistingPushSubscription().then((result) => {
      if (!active || !result) return;
      setPushSupported(Boolean(result.supported));
      setPushEnabled(Boolean(result.enabled));
      setPushPermission(result.permission || window.Notification.permission);
    });

    return () => {
      active = false;
    };
  }, []);

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

    const cachedState = await loadShoppingOfflineStateAsync(currentUserId);
    if (cachedState.projects?.length) {
      setProjects(cachedState.projects);
      if (cachedState.selectedProjectId) {
        setSelectedProjectId((current) => current || cachedState.selectedProjectId);
      }
    }

    if (!isOnline) {
      if (!cachedState.projects?.length) {
        setProjectError('You are offline. Open Shopping List once online on this device to keep it available.');
      }
      setLoadingProjects(false);
      return;
    }

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
    persistOfflineState({
      ...cachedState,
      projects: nextProjects,
      selectedProjectId: defaultProject?.id || cachedState.selectedProjectId || '',
    });
  }, [canCreateProject, createShoppingProject, currentUserId, isOnline, limits.label, limits.maxProjects, persistOfflineState]);

  const loadTodos = useCallback(async () => {
    if (!selectedProject?.id) {
      setTodos([]);
      return;
    }

    setLoadingTodos(true);
    setTodoError('');

    const cachedState = await loadShoppingOfflineStateAsync(currentUserId);
    const cachedTodos = cachedState.todosByProject?.[selectedProject.id] || [];
    if (cachedTodos.length > 0) {
      setTodos(sortTodos(cachedTodos));
    }

    if (!isOnline) {
      if (!cachedTodos.length) {
        setTodoError('You are offline. Open this list once online on this device to cache it.');
      }
      setLoadingTodos(false);
      return;
    }

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

    const nextTodos = sortTodos((data || []).map(mapManualTodoRow));
    setTodos(nextTodos);
    persistOfflineState({
      ...cachedState,
      selectedProjectId: selectedProject.id,
      todosByProject: {
        ...(cachedState.todosByProject || {}),
        [selectedProject.id]: nextTodos,
      }
    });
    setLoadingTodos(false);
  }, [currentUserId, isOnline, persistOfflineState, selectedProject?.id]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    loadTodos();
  }, [loadTodos]);

  useEffect(() => {
    if (!selectedProject?.id || typeof window === 'undefined') return undefined;

    const handleForegroundRefresh = () => {
      if (document.visibilityState === 'visible') {
        void loadTodos();
      }
    };

    const handleWindowFocus = () => {
      void loadTodos();
    };

    const handleWorkerMessage = (event) => {
      const message = event?.data;
      if (!message || (message.type !== 'shopping-list-updated' && message.type !== 'shopping-list-open')) {
        return;
      }

      const messageProjectId = String(message.projectId || '').trim();
      if (messageProjectId && messageProjectId !== selectedProject.id) return;
      void loadTodos();
    };

    document.addEventListener('visibilitychange', handleForegroundRefresh);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('pageshow', handleWindowFocus);
    navigator.serviceWorker?.addEventListener?.('message', handleWorkerMessage);

    return () => {
      document.removeEventListener('visibilitychange', handleForegroundRefresh);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('pageshow', handleWindowFocus);
      navigator.serviceWorker?.removeEventListener?.('message', handleWorkerMessage);
    };
  }, [loadTodos, selectedProject?.id]);

  useEffect(() => {
    if (!selectedProject?.id || !isOnline) return undefined;

    const channel = supabase
      .channel(`shopping-list-live:${selectedProject.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'manual_todos',
          filter: `project_id=eq.${selectedProject.id}`,
        },
        (payload) => {
          const nextRow = payload?.new;
          if (!nextRow?.id) return;

          const incomingTodo = mapManualTodoRow(nextRow);
          const actorLabel = resolveSharedActorLabel(nextRow, selectedProject, currentUserId);
          const isFromSomeoneElse = Boolean(actorLabel);

          setTodos((previousItems) => {
            if (previousItems.some((item) => item._id === incomingTodo._id)) {
              return previousItems;
            }

            const nextTodos = mergeTodosById(previousItems, [incomingTodo]);
            const cachedState = loadShoppingOfflineState(currentUserId);
            persistOfflineState({
              ...cachedState,
              selectedProjectId: selectedProject.id,
              todosByProject: {
                ...(cachedState.todosByProject || {}),
                [selectedProject.id]: nextTodos,
              },
              lastSyncedAt: new Date().toISOString(),
            });

            return nextTodos;
          });

          if (isFromSomeoneElse) {
            const message = `${actorLabel} added ${incomingTodo.title}.`;
            setLiveUpdateMessage(message);

            if (
              typeof window !== 'undefined'
              && typeof document !== 'undefined'
              && document.visibilityState === 'hidden'
              && !pushEnabled
              && 'Notification' in window
              && window.Notification?.permission === 'granted'
            ) {
              void navigator.serviceWorker?.ready
                ?.then((registration) => registration?.showNotification?.('Shopping List updated', {
                  body: message,
                  icon: '/pmworkspace-icon-192.png',
                  badge: '/pmworkspace-icon-192.png',
                  tag: `shopping-live:${selectedProject.id}`,
                  data: { url: '/shopping', projectId: selectedProject.id, kind: 'shopping-list' },
                }))
                .catch(() => null);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'manual_todos',
          filter: `project_id=eq.${selectedProject.id}`,
        },
        (payload) => {
          const nextRow = payload?.new;
          const previousRow = payload?.old;
          if (!nextRow?.id) return;

          const incomingTodo = mapManualTodoRow(nextRow);
          const actorLabel = resolveSharedActorLabel(nextRow, selectedProject, currentUserId);
          const isFromSomeoneElse = Boolean(actorLabel);
          const becameDone = previousRow?.status !== 'Done' && nextRow?.status === 'Done';

          setTodos((previousItems) => {
            const nextTodos = sortTodos(previousItems.map((item) => (
              item._id === incomingTodo._id ? incomingTodo : item
            )));
            const cachedState = loadShoppingOfflineState(currentUserId);
            persistOfflineState({
              ...cachedState,
              selectedProjectId: selectedProject.id,
              todosByProject: {
                ...(cachedState.todosByProject || {}),
                [selectedProject.id]: nextTodos,
              },
              lastSyncedAt: new Date().toISOString(),
            });
            return nextTodos;
          });

          if (isFromSomeoneElse && becameDone) {
            const message = `${actorLabel} bought ${incomingTodo.title}.`;
            setLiveUpdateMessage(message);
          }
        }
      )
      .subscribe();

    shoppingRealtimeChannelRef.current = channel;

    return () => {
      if (shoppingRealtimeChannelRef.current) {
        void supabase.removeChannel(shoppingRealtimeChannelRef.current);
        shoppingRealtimeChannelRef.current = null;
      }
    };
  }, [currentUserId, isOnline, persistOfflineState, pushEnabled, selectedProject]);

  useEffect(() => {
    if (!currentUserId) return;
    const cachedState = loadShoppingOfflineState(currentUserId);
    persistOfflineState({
      ...cachedState,
      projects,
      selectedProjectId,
      todosByProject: selectedProjectId
        ? {
          ...(cachedState.todosByProject || {}),
          [selectedProjectId]: todos,
        }
        : (cachedState.todosByProject || {}),
    });
  }, [currentUserId, persistOfflineState, projects, selectedProjectId, todos]);

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
    setPendingCompleteSeconds(1);
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

    if (!isOnline) {
      const offlineItems = normalizedTitles.map((title) => createOfflineShoppingTodo({
        title,
        projectId: selectedProject.id,
        userId: currentUserId,
      }));
      const nextTodos = sortTodos([...todos, ...offlineItems]);
      const cachedState = loadShoppingOfflineState(currentUserId);
      const nextQueue = offlineItems.reduce((queue, todo) => enqueueCreate(queue, {
        localId: todo._id,
        projectId: todo.projectId,
        userId: todo.assigneeUserId,
        title: todo.title,
        status: todo.status,
        completedAt: todo.completedAt || null,
        createdAt: todo.createdAt,
        updatedAt: todo.updatedAt,
      }), cachedState.queue || []);

      setTodos(nextTodos);
      persistOfflineState({
        ...cachedState,
        selectedProjectId: selectedProject.id,
        todosByProject: {
          ...(cachedState.todosByProject || {}),
          [selectedProject.id]: nextTodos,
        },
        queue: nextQueue,
      });
      setSavingItems(false);
      return;
    }

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
    setTodos((previous) => {
      const nextTodos = mergeTodosById(previous, savedItems);
      const cachedState = loadShoppingOfflineState(currentUserId);
      persistOfflineState({
        ...cachedState,
        selectedProjectId: selectedProject.id,
        todosByProject: {
          ...(cachedState.todosByProject || {}),
          [selectedProject.id]: nextTodos,
        },
        lastSyncedAt: new Date().toISOString(),
      });
      return nextTodos;
    });
    await notifyShoppingListSubscribers({
      projectId: selectedProject.id,
      itemTitles: savedItems.map((item) => item.title),
    });
    setSavingItems(false);
  }, [currentUserId, isOnline, persistOfflineState, selectedProject?.id, todos]);

  const handleAddSubmit = useCallback(async (event) => {
    event.preventDefault();
    const items = splitTypedGroceries(draftTitle);
    if (items.length === 0) return;
    await addItems(items);
    setDraftTitle('');
    setVoiceMessage(items.length === 1 ? `Added ${items[0]}.` : `Added ${items.length} groceries.`);
  }, [addItems, draftTitle]);

  const toggleTodoStatus = useCallback(async (todo) => {
    const nextStatus = todo.status === 'Done' ? 'Open' : 'Done';
    const completedAt = nextStatus === 'Done' ? new Date().toISOString() : null;
    const actionLabel = nextStatus === 'Done' ? 'complete' : 'reopen';

    const previous = todos;
    setFailedTodoId('');
    setFailedTodoMessage('');
    setSavingTodoId(todo._id);
    setSavingTodoAction(actionLabel);
    const optimisticTodos = sortTodos(todos.map((item) => (
      item._id === todo._id
        ? {
          ...item,
          status: nextStatus,
          completedAt,
          updatedAt: new Date().toISOString(),
        }
        : item
    )));
    setTodos(optimisticTodos);

    if (!isOnline || isOfflineTempId(todo._id)) {
      const cachedState = loadShoppingOfflineState(currentUserId);
      const nextQueue = enqueueUpdate(cachedState.queue || [], todo._id, {
        status: nextStatus,
        completedAt,
        updatedAt: new Date().toISOString(),
      });
      persistOfflineState({
        ...cachedState,
        selectedProjectId: selectedProject?.id || cachedState.selectedProjectId,
        todosByProject: {
          ...(cachedState.todosByProject || {}),
          [selectedProject.id]: optimisticTodos,
        },
        queue: nextQueue,
      });
      setSavingTodoId('');
      setSavingTodoAction('');
      return;
    }

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
      setTodos(previous);
      setFailedTodoId(todo._id);
      setFailedTodoMessage(
        isOfflineBrowser()
          ? 'Your connection dropped before this grocery was saved. Please try again.'
          : (error.message || 'Unable to update this grocery right now.')
      );
      setSavingTodoId('');
      setSavingTodoAction('');
      return;
    }

    setTodos((previousItems) => {
      const nextTodos = sortTodos(previousItems.map((item) => (
      item._id === todo._id ? mapManualTodoRow(data) : item
      )));
      const cachedState = loadShoppingOfflineState(currentUserId);
      persistOfflineState({
        ...cachedState,
        selectedProjectId: selectedProject?.id || cachedState.selectedProjectId,
        todosByProject: {
          ...(cachedState.todosByProject || {}),
          [selectedProject.id]: nextTodos,
        },
        lastSyncedAt: new Date().toISOString(),
      });
      return nextTodos;
    });
    if (nextStatus === 'Done') {
      await notifyShoppingListSubscribers({
        projectId: selectedProject.id,
        itemTitles: [todo.title],
        eventType: 'bought',
      });
    }
    setSavingTodoId('');
    setSavingTodoAction('');
    setFailedTodoId('');
    setFailedTodoMessage('');
  }, [currentUserId, isOnline, persistOfflineState, selectedProject?.id, todos]);

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
    setPendingCompleteSeconds(1);
    setVoiceMessage(`Marking ${todo.title} as bought in 1 second. Tap again to cancel.`);

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
      setPendingCompleteSeconds(1);
      if (todoToComplete) {
        void toggleTodoStatus(todoToComplete);
      }
    }, MOBILE_COMPLETE_DELAY_MS);
  }, [clearPendingCompletion, isMobile, pendingCompleteId, todos, toggleTodoStatus]);

  const deleteTodo = useCallback(async (todoId) => {
    if (pendingCompleteId === todoId) {
      clearPendingCompletion();
    }
    if (failedTodoId === todoId) {
      setFailedTodoId('');
      setFailedTodoMessage('');
    }
    const previous = todos;
    const nextTodos = todos.filter((item) => item._id !== todoId);
    setTodos(nextTodos);

    if (!isOnline || isOfflineTempId(todoId)) {
      const cachedState = loadShoppingOfflineState(currentUserId);
      persistOfflineState({
        ...cachedState,
        selectedProjectId: selectedProject?.id || cachedState.selectedProjectId,
        todosByProject: {
          ...(cachedState.todosByProject || {}),
          [selectedProject.id]: nextTodos,
        },
        queue: enqueueDelete(cachedState.queue || [], todoId),
      });
      return;
    }

    const { error } = await supabase
      .from('manual_todos')
      .delete()
      .eq('id', todoId);

    if (error) {
      setTodos(previous);
      setTodoError(error.message || 'Unable to remove this grocery right now.');
      return;
    }

    const cachedState = loadShoppingOfflineState(currentUserId);
    persistOfflineState({
      ...cachedState,
      selectedProjectId: selectedProject?.id || cachedState.selectedProjectId,
      todosByProject: {
        ...(cachedState.todosByProject || {}),
        [selectedProject.id]: nextTodos,
      },
      lastSyncedAt: new Date().toISOString(),
    });
  }, [clearPendingCompletion, currentUserId, failedTodoId, isOnline, pendingCompleteId, persistOfflineState, selectedProject?.id, todos]);

  const retryTodoAction = useCallback((todo) => {
    setFailedTodoId('');
    setFailedTodoMessage('');
    clearPendingCompletion();
    void toggleTodoStatus(todo);
  }, [clearPendingCompletion, toggleTodoStatus]);

  const handleVoiceItems = useCallback(async (transcript) => {
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

  const syncOfflineQueue = useCallback(async () => {
    if (!currentUserId || !isOnline || syncingQueueRef.current) return;

    const cachedState = loadShoppingOfflineState(currentUserId);
    let queue = Array.isArray(cachedState.queue) ? [...cachedState.queue] : [];
    if (queue.length === 0) return;

    syncingQueueRef.current = true;
    setSyncingQueue(true);
    let todosByProject = { ...(cachedState.todosByProject || {}) };
    const createdTitlesByProject = new Map();

    while (queue.length > 0) {
      const op = queue[0];

      if (op.kind === 'create') {
        const { data, error } = await supabase
          .from('manual_todos')
          .insert({
            user_id: op.record.userId,
            project_id: op.record.projectId,
            title: op.record.title,
            due_date: null,
            owner_text: '',
            assignee_user_id: op.record.userId,
            status: op.record.status,
            recurrence: null,
            completed_at: op.record.completedAt || null,
          })
          .select(MANUAL_TODO_SELECT)
          .single();

        if (error || !data) break;

        const savedTodo = mapManualTodoRow(data);
        const projectTodos = todosByProject[op.record.projectId] || [];
        todosByProject[op.record.projectId] = sortTodos(projectTodos.map((item) => (
          item._id === op.targetId ? savedTodo : item
        )));
        const existingTitles = createdTitlesByProject.get(op.record.projectId) || [];
        createdTitlesByProject.set(op.record.projectId, [...existingTitles, savedTodo.title]);
        queue = replaceQueuedTargetId(queue.slice(1), op.targetId, savedTodo._id);
        continue;
      }

      if (op.kind === 'update') {
        const { error } = await supabase
          .from('manual_todos')
          .update({
            status: op.patch.status,
            completed_at: op.patch.completedAt || null,
            updated_at: op.patch.updatedAt || new Date().toISOString(),
          })
          .eq('id', op.targetId);

        if (error) break;
        queue = queue.slice(1);
        continue;
      }

      if (op.kind === 'delete') {
        const { error } = await supabase
          .from('manual_todos')
          .delete()
          .eq('id', op.targetId);

        if (error) break;
        queue = queue.slice(1);
      }
    }

    persistOfflineState({
      ...cachedState,
      todosByProject,
      queue,
      lastSyncedAt: queue.length === 0 ? new Date().toISOString() : cachedState.lastSyncedAt,
    });

    if (selectedProject?.id) {
      setTodos(sortTodos(todosByProject[selectedProject.id] || []));
    }

    for (const [projectId, itemTitles] of createdTitlesByProject.entries()) {
      await notifyShoppingListSubscribers({ projectId, itemTitles });
    }

    if (queue.length === 0) {
      setFailedTodoId('');
      setFailedTodoMessage('');
    }

    syncingQueueRef.current = false;
    setSyncingQueue(false);
  }, [currentUserId, isOnline, persistOfflineState, selectedProject?.id]);

  const handleEnablePushAlerts = useCallback(async () => {
    setPushBusy(true);
    const result = await enablePushAlerts();
    setPushSupported(Boolean(result.supported));
    setPushEnabled(Boolean(result.enabled));
    setPushPermission(result.permission || pushPermission);
    setPushMessage(result.message || 'Phone alert status updated.');
    setPushBusy(false);
  }, [pushPermission]);

  const handleDisablePushAlerts = useCallback(async () => {
    setPushBusy(true);
    const result = await disablePushAlerts();
    setPushSupported(Boolean(result.supported));
    setPushEnabled(Boolean(result.enabled));
    setPushPermission(result.permission || pushPermission);
    setPushMessage(result.message || 'Phone alert status updated.');
    setPushBusy(false);
  }, [pushPermission]);

  useEffect(() => {
    void syncOfflineQueue();
  }, [syncOfflineQueue]);

  const queuedTodoIds = useMemo(
    () => new Set((offlineQueue || []).map((item) => item.targetId)),
    [offlineQueue]
  );
  const shoppingSyncSummary = useMemo(() => {
    const queueCount = offlineQueue.length;
    if (syncingQueue && queueCount > 0) {
      return `Syncing ${queueCount} offline change${queueCount === 1 ? '' : 's'}...`;
    }
    if (queueCount > 0) {
      return isOnline
        ? `${queueCount} item change${queueCount === 1 ? '' : 's'} ready to sync`
        : `${queueCount} item change${queueCount === 1 ? '' : 's'} waiting for signal`;
    }
    const lastSyncLabel = formatSyncTimeLabel(lastSyncedAt);
    if (lastSyncLabel) {
      return `Last synced at ${lastSyncLabel}`;
    }
    return isOnline
      ? 'This list stays cached once it has loaded on this device.'
      : 'Using the last cached list on this device.';
  }, [isOnline, lastSyncedAt, offlineQueue.length, syncingQueue]);
  const syncCenterItems = useMemo(() => {
    const items = [
      {
        id: 'connection',
        label: isOnline ? 'Connection available' : 'Offline mode',
        detail: isOnline
          ? 'Queued grocery changes will sync now that the connection is back.'
          : 'You can keep adding and ticking off groceries from the cached list.',
        status: isOnline ? 'ok' : 'offline',
        statusLabel: isOnline ? 'Online' : 'Offline',
      },
    ];

    if (offlineQueue.length > 0) {
      items.push({
        id: 'queue',
        label: `${offlineQueue.length} grocery change${offlineQueue.length === 1 ? '' : 's'} waiting`,
        detail: syncingQueue
          ? 'Your queued grocery updates are being pushed to the shared list now.'
          : 'These grocery changes are safe on this phone and will sync automatically.',
        status: syncingQueue ? 'syncing' : 'queue',
        statusLabel: syncingQueue ? 'Syncing' : 'Queued',
      });
    }

    if (failedTodoId) {
      const failedTodo = todos.find((todo) => todo._id === failedTodoId);
      items.push({
        id: 'failed',
        label: failedTodo ? `Could not save ${failedTodo.title}` : 'One grocery needs attention',
        detail: failedTodoMessage || 'Retry this change when the connection settles.',
        status: 'error',
        statusLabel: 'Needs retry',
        actionLabel: failedTodo ? 'Retry item' : '',
        onAction: failedTodo ? () => retryTodoAction(failedTodo) : undefined,
      });
    }

    if (lastSyncedAt) {
      items.push({
        id: 'last-sync',
        label: 'Last successful sync',
        detail: formatSyncTimeLabel(lastSyncedAt),
        status: 'ok',
        statusLabel: 'Saved',
      });
    }

    return items;
  }, [failedTodoId, failedTodoMessage, isOnline, lastSyncedAt, offlineQueue.length, retryTodoAction, syncingQueue, todos]);

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
                      Keep one simple grocery list shared with your household, then add items by typing or voice.
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
                        {selectedProject?.project_members?.length ? 'shared access enabled' : 'ready to share'}
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

                  <div className="pm-metric-card rounded-2xl px-4 py-3">
                    <div className="pm-kicker">Phone alerts</div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-lg font-semibold text-slate-950">
                        {!pushSupported ? 'Unavailable' : pushEnabled ? 'Enabled' : pushPermission === 'denied' ? 'Blocked' : 'Off'}
                      </span>
                      <span className="text-xs text-slate-500">
                        {!pushSupported
                          ? 'browser support missing'
                          : pushEnabled
                            ? 'background alerts ready'
                            : pushPermission === 'denied'
                              ? 'allow notifications in settings'
                              : 'turn on for this device'}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      Get a device alert when someone adds groceries while this list is closed or in the background.
                    </p>
                    {pushMessage ? (
                      <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
                        {pushMessage}
                      </div>
                    ) : null}
                    {!pushSupported ? null : pushEnabled ? (
                      <button
                        type="button"
                        onClick={handleDisablePushAlerts}
                        disabled={pushBusy}
                        className="pm-subtle-button mt-3 inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {pushBusy ? 'Updating…' : 'Turn off alerts'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleEnablePushAlerts}
                        disabled={pushBusy || pushPermission === 'denied'}
                        className="pm-subtle-button mt-3 inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {pushBusy ? 'Updating…' : 'Enable phone alerts'}
                      </button>
                    )}
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
                        {selectedProject?.project_members?.length ? 'Shared with team' : 'Private for now'}
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
                    <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">
                      {isMobile ? 'Quick add groceries' : 'Add groceries by text or voice'}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {isMobile ? 'Type or say a few items for the live list.' : 'Type one item, or say a few items out loud and let the list split them for you.'}
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

                {liveUpdateMessage ? (
                  <div className="mt-5 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-700 shadow-sm">
                    {liveUpdateMessage}
                  </div>
                ) : null}

                <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="pm-list-shell rounded-[28px] p-3 sm:p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <h3 className="pm-kicker text-sm">Shopping items</h3>
                        <div className="mt-1 text-xs text-slate-500">
                          {shoppingSyncSummary}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-slate-400">
                          {loadingTodos ? 'Loading...' : `${openTodos.length} open · ${completedTodos.length} bought`}
                        </span>
                        {offlineQueue.length > 0 ? (
                          <div className="mt-1 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                            {offlineQueue.length} waiting
                          </div>
                        ) : null}
                      </div>
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
                                    : savingTodoId === todo._id
                                      ? 'border-emerald-200 bg-emerald-50/70'
                                      : 'border-slate-200'
                                }`}
                              >
                                {(() => {
                                  const syncState = queuedTodoIds.has(todo._id) || isOfflineTempId(todo._id)
                                    ? (syncingQueue && isOnline ? 'syncing' : 'offline')
                                    : '';
                                  return (
                                <div className="flex items-start gap-3 sm:items-center">
                                  {isMobile ? (
                                    <span
                                      className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border ${
                                        pendingCompleteId === todo._id
                                          ? 'border-[var(--pm-accent)] bg-white text-[var(--pm-accent)]'
                                          : savingTodoId === todo._id
                                            ? 'border-emerald-300 bg-white text-emerald-600'
                                            : 'border-slate-200 bg-white text-slate-400'
                                      }`}
                                      aria-hidden="true"
                                    >
                                      {savingTodoId === todo._id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : pendingCompleteId === todo._id ? (
                                        <span className="text-sm font-bold">{pendingCompleteSeconds}</span>
                                      ) : (
                                        <Check className="h-4 w-4" />
                                      )}
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleToggleTodo(todo)}
                                      disabled={savingTodoId === todo._id}
                                      className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition ${
                                        pendingCompleteId === todo._id
                                          ? 'border-[var(--pm-accent)] bg-white text-[var(--pm-accent)]'
                                          : savingTodoId === todo._id
                                            ? 'border-emerald-300 bg-white text-emerald-600'
                                            : 'border-slate-200 bg-white text-slate-400 hover:border-emerald-300 hover:text-emerald-600'
                                      }`}
                                      aria-label={`Mark ${todo.title} as bought`}
                                    >
                                      {savingTodoId === todo._id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : pendingCompleteId === todo._id ? (
                                        <span className="text-sm font-bold">{pendingCompleteSeconds}</span>
                                      ) : (
                                        <Check className="h-4 w-4" />
                                      )}
                                    </button>
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0 flex-1">
                                        <p className="text-base font-semibold leading-6 text-slate-900 sm:text-sm">{todo.title}</p>
                                      </div>
                                      <div className="flex shrink-0 flex-col items-end gap-1">
                                        {savingTodoId === todo._id ? (
                                          <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-700 shadow-sm">
                                            Saving...
                                          </span>
                                        ) : null}
                                        {syncState ? (
                                          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                                            syncState === 'syncing'
                                              ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                                              : 'border-amber-200 bg-amber-50 text-amber-700'
                                          }`}>
                                            {syncState === 'syncing' ? 'Syncing' : 'Saved offline'}
                                          </span>
                                        ) : null}
                                      </div>
                                    </div>
                                    <p className={`mt-1 text-xs ${
                                      pendingCompleteId === todo._id
                                        ? 'text-[var(--pm-accent-strong)]'
                                        : savingTodoId === todo._id
                                          ? 'text-emerald-700'
                                          : 'text-slate-400'
                                    }`}>
                                      {savingTodoId === todo._id
                                        ? (savingTodoAction === 'complete' ? `Saving ${todo.title} as bought...` : 'Saving...')
                                        : pendingCompleteId === todo._id
                                          ? `Marking bought in ${pendingCompleteSeconds}s. Tap again to cancel.`
                                          : (isMobile ? 'Tap Bought to move it off the live list.' : 'Tap the check to mark this item as bought.')}
                                    </p>
                                    {failedTodoId === todo._id ? (
                                      <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3">
                                        <p className="text-xs font-medium text-rose-700">{failedTodoMessage}</p>
                                        <button
                                          type="button"
                                          onClick={() => retryTodoAction(todo)}
                                          className="mt-2 inline-flex min-h-9 items-center rounded-full border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                                        >
                                          Retry
                                        </button>
                                      </div>
                                    ) : null}
                                    {isMobile ? (
                                      <div className="mt-3 flex flex-wrap gap-2">
                                        <button
                                          type="button"
                                          onClick={() => handleToggleTodo(todo)}
                                          disabled={savingTodoId === todo._id}
                                          className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition ${
                                            pendingCompleteId === todo._id
                                              ? 'border-[var(--pm-accent)] bg-white text-[var(--pm-accent-strong)]'
                                              : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                          }`}
                                        >
                                          <Check className="h-4 w-4" />
                                          {pendingCompleteId === todo._id ? `Bought in ${pendingCompleteSeconds}s` : 'Bought'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => deleteTodo(todo._id)}
                                          disabled={savingTodoId === todo._id}
                                          className="inline-flex min-h-10 items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                          Delete
                                        </button>
                                      </div>
                                    ) : null}
                                  </div>
                                  {!isMobile ? (
                                    <button
                                      type="button"
                                      onClick={() => deleteTodo(todo._id)}
                                      disabled={savingTodoId === todo._id}
                                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-transparent text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                                      aria-label={`Delete ${todo.title}`}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  ) : null}
                                </div>
                                  );
                                })()}
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
                            ) : null}
                            {completedTodos.length > 0 ? (
                              <div className="mb-3 flex items-center justify-between">
                                {isMobile ? (
                                  <button
                                    type="button"
                                    onClick={() => setShowBought((value) => !value)}
                                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                                  >
                                    {showBought ? 'Hide bought' : `Show bought (${completedTodos.length})`}
                                    <ChevronDown className={`h-3.5 w-3.5 transition ${showBought ? 'rotate-180' : ''}`} />
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                            {completedTodos.length > 0 && (!isMobile || showBought) ? completedTodos.map((todo) => (
                              <div key={todo._id} className="rounded-[22px] border border-slate-200 bg-white/90 px-4 py-4 shadow-sm">
                                {(() => {
                                  const syncState = queuedTodoIds.has(todo._id) || isOfflineTempId(todo._id)
                                    ? (syncingQueue && isOnline ? 'syncing' : 'offline')
                                    : '';
                                  return (
                                <div className="flex items-start gap-3 sm:items-center">
                                  {isMobile ? (
                                    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-600" aria-hidden="true">
                                      {savingTodoId === todo._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleToggleTodo(todo)}
                                      disabled={savingTodoId === todo._id}
                                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-600 transition hover:bg-emerald-100"
                                      aria-label={`Move ${todo.title} back to open`}
                                    >
                                      {savingTodoId === todo._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                    </button>
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-start justify-between gap-3">
                                      <p className="text-base font-semibold leading-6 text-slate-400 line-through sm:text-sm">{todo.title}</p>
                                      {syncState ? (
                                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                                          syncState === 'syncing'
                                            ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                                            : 'border-amber-200 bg-amber-50 text-amber-700'
                                        }`}>
                                          {syncState === 'syncing' ? 'Syncing' : 'Saved offline'}
                                        </span>
                                      ) : null}
                                    </div>
                                    <p className={`mt-1 text-xs ${savingTodoId === todo._id ? 'text-emerald-700' : 'text-slate-400'}`}>
                                      {savingTodoId === todo._id
                                        ? (savingTodoAction === 'reopen' ? `Saving ${todo.title}...` : 'Saving...')
                                        : (isMobile ? 'Use Undo if this needs to go back on the live list.' : 'Tap the check if you need to reopen it.')}
                                    </p>
                                    {failedTodoId === todo._id ? (
                                      <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3">
                                        <p className="text-xs font-medium text-rose-700">{failedTodoMessage}</p>
                                        <button
                                          type="button"
                                          onClick={() => retryTodoAction(todo)}
                                          className="mt-2 inline-flex min-h-9 items-center rounded-full border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                                        >
                                          Retry
                                        </button>
                                      </div>
                                    ) : null}
                                    {isMobile ? (
                                      <div className="mt-3 flex flex-wrap gap-2">
                                        <button
                                          type="button"
                                          onClick={() => handleToggleTodo(todo)}
                                          disabled={savingTodoId === todo._id}
                                          className="inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                                        >
                                          <Check className="h-4 w-4" />
                                          Undo
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => deleteTodo(todo._id)}
                                          disabled={savingTodoId === todo._id}
                                          className="inline-flex min-h-10 items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                          Delete
                                        </button>
                                      </div>
                                    ) : null}
                                  </div>
                                  {!isMobile ? (
                                    <button
                                      type="button"
                                      onClick={() => deleteTodo(todo._id)}
                                      disabled={savingTodoId === todo._id}
                                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-transparent text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                                      aria-label={`Delete ${todo.title}`}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  ) : null}
                                </div>
                                  );
                                })()}
                              </div>
                            )) : null}
                            {completedTodos.length > 0 && isMobile && !showBought ? (
                              <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-4 py-4 text-sm text-slate-500">
                                {completedTodos.length} bought item{completedTodos.length === 1 ? '' : 's'} hidden while you shop.
                              </div>
                            ) : null}
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
                          Share with household
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
      <MobileSyncCenter
        shouldShow={!isOnline || syncingQueue || offlineQueue.length > 0 || Boolean(failedTodoId)}
        title="Shopping sync"
        summary={shoppingSyncSummary}
        queueCount={offlineQueue.length}
        items={syncCenterItems}
      />
    </>
  );
}
