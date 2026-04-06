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
import { createOfflineTempId, readLocalJson, readOfflineJson, writeLocalJson } from '../utils/offlineState';
import { normalizeProjectRecord } from '../utils/projectSharing';
import MobileSyncCenter from './MobileSyncCenter';
import ShoppingListInfoPanels from './ShoppingListInfoPanels';
import ShoppingListItemsPanel from './ShoppingListItemsPanel';
import ShoppingListPageHeader from './ShoppingListPageHeader';
import ProjectShareModal from './ProjectShareModal';
import ShoppingListQuickAdd from './ShoppingListQuickAdd';
import ShoppingListSidebar from './ShoppingListSidebar';

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
            <ShoppingListSidebar
              canShareProject={canShareProject}
              describeShoppingProject={describeShoppingProject}
              handleDisablePushAlerts={handleDisablePushAlerts}
              handleEnablePushAlerts={handleEnablePushAlerts}
              onOpenShare={() => setShareOpen(true)}
              projectError={projectError}
              projects={projects}
              pushBusy={pushBusy}
              pushEnabled={pushEnabled}
              pushMessage={pushMessage}
              pushPermission={pushPermission}
              pushSupported={pushSupported}
              selectedProject={selectedProject}
              selectedProjectId={selectedProjectId}
              setSelectedProjectId={setSelectedProjectId}
              shoppingProjectName={SHOPPING_PROJECT_NAME}
              ShareIcon={Share2}
              ShoppingBasketIcon={ShoppingBasket}
            />

            <main className="order-1 min-w-0 lg:order-2">
              <div className="pm-home-panel rounded-[30px] p-5 sm:p-6">
                <ShoppingListPageHeader
                  canShareProject={canShareProject}
                  onOpenShare={() => setShareOpen(true)}
                  selectedProject={selectedProject}
                  shoppingProjectName={SHOPPING_PROJECT_NAME}
                  sparklesIcon={Sparkles}
                />

                <ShoppingListQuickAdd
                  AddIcon={Plus}
                  LoaderIcon={Loader2}
                  MicIcon={Mic}
                  MicOffIcon={MicOff}
                  draftTitle={draftTitle}
                  handleAddSubmit={handleAddSubmit}
                  interimText={interimText}
                  isListening={isListening}
                  isMobile={isMobile}
                  savingItems={savingItems}
                  selectedProject={selectedProject}
                  setDraftTitle={setDraftTitle}
                  startListening={startListening}
                  stopListening={stopListening}
                  voiceMessage={voiceMessage}
                  voiceSupported={voiceSupported}
                />

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
                  <ShoppingListItemsPanel
                    CheckIcon={Check}
                    ChevronDownIcon={ChevronDown}
                    ListChecksIcon={ListChecks}
                    LoaderIcon={Loader2}
                    ShoppingBasketIcon={ShoppingBasket}
                    TrashIcon={Trash2}
                    completedTodos={completedTodos}
                    deleteTodo={deleteTodo}
                    desktopCompact={desktopCompact}
                    failedTodoId={failedTodoId}
                    failedTodoMessage={failedTodoMessage}
                    handleToggleTodo={handleToggleTodo}
                    isCompactDesktop={isCompactDesktop}
                    isMobile={isMobile}
                    isOnline={isOnline}
                    loadingTodos={loadingTodos}
                    offlineQueue={offlineQueue}
                    openTodos={openTodos}
                    pendingCompleteId={pendingCompleteId}
                    pendingCompleteSeconds={pendingCompleteSeconds}
                    queuedTodoIds={queuedTodoIds}
                    retryTodoAction={retryTodoAction}
                    savingTodoAction={savingTodoAction}
                    savingTodoId={savingTodoId}
                    setDesktopCompact={setDesktopCompact}
                    shouldCollapseBought={shouldCollapseBought}
                    showBought={showBought}
                    setShowBought={setShowBought}
                    shoppingSyncSummary={shoppingSyncSummary}
                    syncingQueue={syncingQueue}
                    todos={todos}
                  />

                  <ShoppingListInfoPanels
                    canShareProject={canShareProject}
                    onOpenShare={() => setShareOpen(true)}
                    selectedProject={selectedProject}
                    shareIcon={Share2}
                    voiceIcon={Mic}
                    voiceSupported={voiceSupported}
                  />
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
