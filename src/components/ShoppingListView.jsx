import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePlan } from '../contexts/PlanContext';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { createEmptyProjectSnapshot } from '../hooks/projectData/defaults';
import {
  MANUAL_TODO_SELECT,
  isMissingRelationError as isMissingTodoRelationError,
  mapManualTodoRow,
} from '../hooks/projectData/manualTodoUtils';
import { useShoppingListActions } from '../hooks/useShoppingListActions';
import { useShoppingListData } from '../hooks/useShoppingListData';
import { useShoppingListLiveUpdates } from '../hooks/useShoppingListLiveUpdates';
import { useShoppingListOfflineSync } from '../hooks/useShoppingListOfflineSync';
import { useShoppingListVoiceCapture } from '../hooks/useShoppingListVoiceCapture';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { createOfflineTempId, isOfflineTempId, readLocalJson, readOfflineJson, writeLocalJson } from '../utils/offlineState';
import { normalizeProjectRecord } from '../utils/projectSharing';
import MobileSyncCenter from './MobileSyncCenter';
import ProjectShareModal from './ProjectShareModal';

const SHOPPING_PROJECT_NAME = 'Shopping List';
const SHOPPING_UI_PREFS_KEY = 'pmworkspace:shopping-ui:v1';
const MOBILE_COMPLETE_DELAY_MS = 1000;
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
  const [draftTitle, setDraftTitle] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const [showBought, setShowBought] = useState(false);
  const [desktopCompact, setDesktopCompact] = useState(() => {
    const prefs = readLocalJson(SHOPPING_UI_PREFS_KEY, {});
    return prefs?.desktopCompact ?? true;
  });
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
  const isCompactDesktop = !isMobile && desktopCompact;
  const shouldCollapseBought = isMobile || isCompactDesktop;
  const persistOfflineState = useCallback((nextState) => {
    saveShoppingOfflineState(currentUserId, nextState);
    setOfflineQueue(Array.isArray(nextState.queue) ? nextState.queue : []);
    setLastSyncedAt(nextState.lastSyncedAt || '');
    return nextState;
  }, [currentUserId]);

  const {
    loadProjects,
    loadTodos,
    loadingProjects,
    loadingTodos,
    projectError,
    projects,
    selectedProject,
    selectedProjectId,
    setSelectedProjectId,
    setTodoError,
    setTodos,
    todoError,
    todos,
  } = useShoppingListData({
    canCreateProject,
    createEmptyProjectSnapshot,
    currentUserId,
    generateProjectId,
    isMissingTodoRelationError: isMissingTodoRelationError,
    isOnline,
    isProjectRelationMissingError,
    isRowLevelSecurityError,
    limits,
    loadShoppingOfflineState,
    loadShoppingOfflineStateAsync,
    manualTodoSelect: MANUAL_TODO_SELECT,
    mapManualTodoRow,
    normalizeProjectRecord,
    persistOfflineState,
    refreshProjectCount,
    shoppingProjectName: SHOPPING_PROJECT_NAME,
    sortTodos,
    supportsProjectMembersRef,
    ensuringProjectRef,
  });
  const openTodos = useMemo(() => todos.filter((todo) => todo.status !== 'Done'), [todos]);
  const completedTodos = useMemo(() => todos.filter((todo) => todo.status === 'Done'), [todos]);
  const canShareProject = Boolean(selectedProject?.isOwned && supportsProjectMembersRef.current);
  useEffect(() => {
    if (!shouldCollapseBought) {
      setShowBought(true);
    }
  }, [shouldCollapseBought]);

  useEffect(() => {
    writeLocalJson(SHOPPING_UI_PREFS_KEY, { desktopCompact });
  }, [desktopCompact]);

  const {
    liveUpdateMessage,
    pushSupported,
    pushEnabled,
    pushPermission,
    pushBusy,
    pushMessage,
    handleEnablePushAlerts,
    handleDisablePushAlerts,
  } = useShoppingListLiveUpdates({
    currentUserId,
    isOnline,
    selectedProject,
    loadTodos,
    persistOfflineState,
    setTodos,
    loadShoppingOfflineState,
    mergeTodosById,
    sortTodos,
    resolveSharedActorLabel,
  });

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

  const {
    addItems,
    clearPendingCompletion,
    completionIntervalRef,
    completionTimeoutRef,
    deleteTodo,
    failedTodoId,
    failedTodoMessage,
    pendingCompleteId,
    pendingCompleteSeconds,
    retryTodoAction,
    savingItems,
    savingTodoAction,
    savingTodoId,
    setFailedTodoId,
    setFailedTodoMessage,
    setPendingCompleteId,
    setPendingCompleteSeconds,
    toggleTodoStatus,
  } = useShoppingListActions({
    currentUserId,
    isOnline,
    selectedProject,
    todos,
    setTodos,
    setTodoError,
    loadShoppingOfflineState,
    persistOfflineState,
    sortTodos,
    mergeTodosById,
    createOfflineShoppingTodo,
    mapManualTodoRow,
    manualTodoSelect: MANUAL_TODO_SELECT,
  });
  const {
    isListening,
    interimText,
    voiceMessage,
    setVoiceMessage,
    voiceSupported,
    startListening,
    stopListening,
  } = useShoppingListVoiceCapture({
    addItems,
    setDraftTitle,
  });

  const handleAddSubmit = useCallback(async (event) => {
    event.preventDefault();
    const items = splitTypedGroceries(draftTitle);
    if (items.length === 0) return;
    await addItems(items);
    setDraftTitle('');
    setVoiceMessage(items.length === 1 ? `Added ${items[0]}.` : `Added ${items.length} groceries.`);
  }, [addItems, draftTitle, setVoiceMessage]);

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
  }, [
    clearPendingCompletion,
    completionIntervalRef,
    completionTimeoutRef,
    isMobile,
    pendingCompleteId,
    setPendingCompleteId,
    setPendingCompleteSeconds,
    setVoiceMessage,
    todos,
    toggleTodoStatus,
  ]);

  const {
    syncingQueue,
    queuedTodoIds,
    shoppingSyncSummary,
    syncCenterItems,
  } = useShoppingListOfflineSync({
    currentUserId,
    isOnline,
    selectedProjectId: selectedProject?.id || '',
    loadShoppingOfflineState,
    persistOfflineState,
    setTodos,
    sortTodos,
    offlineQueue,
    lastSyncedAt,
    todos,
    failedTodoId,
    failedTodoMessage,
    setFailedTodoId,
    setFailedTodoMessage,
    retryTodoAction,
    formatSyncTimeLabel,
  });

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
                      disabled={!voiceSupported}
                      className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                        isListening
                          ? 'border-[var(--pm-accent)] bg-[var(--pm-accent-soft)] text-[var(--pm-accent-strong)]'
                          : 'pm-subtle-button'
                      } ${!voiceSupported ? 'cursor-not-allowed opacity-50' : ''}`}
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
                    {!voiceSupported ? (
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
                      <div className="flex flex-col items-end gap-2 text-right">
                        {!isMobile ? (
                          <button
                            type="button"
                            onClick={() => setDesktopCompact((value) => !value)}
                            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
                          >
                            {desktopCompact ? 'Comfortable list' : 'Compact list'}
                          </button>
                        ) : null}
                        <div>
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
                                className={`border bg-white shadow-sm transition ${
                                  isCompactDesktop ? 'rounded-[18px] px-3.5 py-3' : 'rounded-[22px] px-4 py-4'
                                } ${
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
                                <div className={`flex gap-3 ${isCompactDesktop ? 'items-center' : 'items-start sm:items-center'}`}>
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
                                      className={`inline-flex shrink-0 items-center justify-center rounded-full border transition ${
                                        isCompactDesktop ? 'h-9 w-9' : 'h-11 w-11'
                                      } ${
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
                                    <div className={`flex justify-between gap-3 ${isCompactDesktop ? 'items-center' : 'items-start'}`}>
                                      <div className="min-w-0 flex-1">
                                        <p className={`font-semibold text-slate-900 ${isCompactDesktop ? 'text-sm leading-5' : 'text-base leading-6 sm:text-sm'}`}>{todo.title}</p>
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
                                    {(isMobile || pendingCompleteId === todo._id || savingTodoId === todo._id || failedTodoId === todo._id || !isCompactDesktop) ? (
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
                                    ) : null}
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
                                      className={`inline-flex shrink-0 items-center justify-center rounded-full border border-transparent text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 ${
                                        isCompactDesktop ? 'h-9 w-9' : 'h-11 w-11'
                                      }`}
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
                                {shouldCollapseBought ? (
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
                            {completedTodos.length > 0 && (!shouldCollapseBought || showBought) ? completedTodos.map((todo) => (
                              <div key={todo._id} className={`border border-slate-200 bg-white/90 shadow-sm ${
                                isCompactDesktop ? 'rounded-[18px] px-3.5 py-3' : 'rounded-[22px] px-4 py-4'
                              }`}>
                                {(() => {
                                  const syncState = queuedTodoIds.has(todo._id) || isOfflineTempId(todo._id)
                                    ? (syncingQueue && isOnline ? 'syncing' : 'offline')
                                    : '';
                                  return (
                                <div className={`flex gap-3 ${isCompactDesktop ? 'items-center' : 'items-start sm:items-center'}`}>
                                  {isMobile ? (
                                    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-600" aria-hidden="true">
                                      {savingTodoId === todo._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleToggleTodo(todo)}
                                      disabled={savingTodoId === todo._id}
                                      className={`inline-flex shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-600 transition hover:bg-emerald-100 ${
                                        isCompactDesktop ? 'h-9 w-9' : 'h-11 w-11'
                                      }`}
                                      aria-label={`Move ${todo.title} back to open`}
                                    >
                                      {savingTodoId === todo._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                    </button>
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <div className={`flex justify-between gap-3 ${isCompactDesktop ? 'items-center' : 'items-start'}`}>
                                      <p className={`font-semibold text-slate-400 line-through ${isCompactDesktop ? 'text-sm leading-5' : 'text-base leading-6 sm:text-sm'}`}>{todo.title}</p>
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
                                    {(isMobile || savingTodoId === todo._id || failedTodoId === todo._id || !isCompactDesktop) ? (
                                      <p className={`mt-1 text-xs ${savingTodoId === todo._id ? 'text-emerald-700' : 'text-slate-400'}`}>
                                        {savingTodoId === todo._id
                                          ? (savingTodoAction === 'reopen' ? `Saving ${todo.title}...` : 'Saving...')
                                          : (isMobile ? 'Use Undo if this needs to go back on the live list.' : 'Tap the check if you need to reopen it.')}
                                      </p>
                                    ) : null}
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
                                      className={`inline-flex shrink-0 items-center justify-center rounded-full border border-transparent text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 ${
                                        isCompactDesktop ? 'h-9 w-9' : 'h-11 w-11'
                                      }`}
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
                            {completedTodos.length > 0 && shouldCollapseBought && !showBought ? (
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
                        {voiceSupported ? 'Speech recognition available here' : 'Speech recognition not available in this browser'}
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
