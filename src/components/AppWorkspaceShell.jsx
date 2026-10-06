import React, { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { SCHEMAS } from '../utils/constants';
import AuthenticatedFooter from './AuthenticatedFooter';
import Header from './Header';
import Navigation from './Navigation';
import TaskModal from './TaskModal';
import ScheduleTaskSetup from './ScheduleTaskSetup';
import { planLinkForTodo, promotionReference, promotionTodoFromSource } from '../utils/taskPlanPromotion';
import { planTaskVisibleExternally, projectLinkedSource } from '../hooks/projectData/taskPlanTransactions';
import DemoBenefitsModal from './DemoBenefitsModal';
import BlurOverlay from './BlurOverlay';
import { TrialBanner, CancellationBanner, ReadOnlyBanner } from './UpgradeBanner';
import WorkspaceProjectStatusBar from './WorkspaceProjectStatusBar';
import ProjectFocusReadinessPanel from './ProjectFocusReadinessPanel';
import { useProjectData } from '../hooks/useProjectData';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { usePlan } from '../contexts/PlanContext';
import { loadAiSettings, isAiConfigured } from '../utils/aiSettings';
import { openFeedbackEmail } from '../utils/feedback';
import MobileQuickCapture from './MobileQuickCapture';
import MobileSyncCenter from './MobileSyncCenter';
import { useWorkspaceAiActions } from '../hooks/useWorkspaceAiActions';
import { useWorkspaceImportExport } from '../hooks/useWorkspaceImportExport';
import { useWorkspaceQuickCapture } from '../hooks/useWorkspaceQuickCapture';
import { getStoredProjectTab, saveStoredProjectTab } from '../utils/projectTabMemory';

const ScheduleView = lazy(() => import('./ScheduleView'));
const RegisterView = lazy(() => import('./RegisterView'));
const TrackerView = lazy(() => import('./TrackerView'));
const StatusReportView = lazy(() => import('./StatusReportView'));
const TodoView = lazy(() => import('./TodoView'));
const StakeholdersView = lazy(() => import('./StakeholdersView'));
const FinancialsView = lazy(() => import('./FinancialsView'));
const RACIView = lazy(() => import('./RACIView'));
const TimesheetView = lazy(() => import('./TimesheetView'));
const PricingPage = lazy(() => import('./PricingPage'));
const BillingScreen = lazy(() => import('./BillingScreen'));

export function MainApp({ project, currentUserId, currentUserName, accentTheme, onAccentThemeChange, onBackToProjects, isOnline, launchShortcut, sourceNavigation, onSourceNavigationHandled, onOpenSourceTodo }) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const {
    canUseAiReport, aiReportsRemaining, canUsePlatformAi,
    limits, effectivePlan, isAdmin, isInTaskGrace, getTaskHardLimit, isReadOnly,
    refreshProfile, simulatedPlan, setSimulatedPlan, simulatorOptions,
  } = usePlan();

  const [activeTab, setActiveTab] = useState(() => getStoredProjectTab(project?.id));
  const skipNextTabPersistRef = useRef(false);
  const [activeSubView, setActiveSubView] = useState(null);
  const [viewMode, setViewMode] = useState('week');
  const [isExternalView, setIsExternalView] = useState(false);
  const [pendingTodoFocusId, setPendingTodoFocusId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [planSetup, setPlanSetup] = useState(null);
  const [pendingScheduledTaskId, setPendingScheduledTaskId] = useState(null);
  const [scheduleFocusId, setScheduleFocusId] = useState(null);
  const [sourceFocus, setSourceFocus] = useState(null);
  const [sourceMessage, setSourceMessage] = useState('');
  const consumedSourceRequest = useRef(null);
  const sourceLeaveState = useRef({ active: true });
  useEffect(() => { sourceLeaveState.current.active = true; return () => { sourceLeaveState.current.active = false; }; }, []);
  const [insertAfterId, setInsertAfterId] = useState(null);
  const [importStatus, setImportStatus] = useState(null);
  const [isBenefitsOpen, setIsBenefitsOpen] = useState(false);
  const [showPricing, setShowPricing] = useState(false);
  const [showBilling, setShowBilling] = useState(false);
  const [aiSettings, setAiSettings] = useState(() => loadAiSettings());
  const [undoAction, setUndoAction] = useState(null);

  const hasByok = isAiConfigured(aiSettings);
  const usePlatformKey = effectivePlan && canUsePlatformAi && !hasByok;
  const aiReady = limits.canUseAi && (hasByok || usePlatformKey);

  useEffect(() => {
    skipNextTabPersistRef.current = true;
    setActiveTab(getStoredProjectTab(project?.id));
    setActiveSubView(null);
  }, [project?.id]);

  useEffect(() => {
    if (skipNextTabPersistRef.current) {
      skipNextTabPersistRef.current = false;
      return;
    }

    saveStoredProjectTab(project?.id, activeTab);
  }, [activeTab, project?.id]);

  const {
    projectData,
    registers,
    tracker,
    statusReport,
    todos,
    baseline,
    saving,
    planTransactionBusy,
    preparePlanPromotion,
    commitPlanPromotion,
    lastSaved,
    loadingData,
    readyProjectId,
    hasPendingProjectSave,
    saveConflict,
    saveError,
    remoteUpdateAvailable,
    offlinePendingSync,
    usingOfflineSnapshot,
    pendingProjectSyncCount,
    addTask,
    updateTask,
    deleteTask,
    modifyHierarchy,
    toggleTrackTask,
    loadDemoDataAllTabs,
    resetDemoData,
    setBaseline,
    clearBaseline,
    addRegisterItem,
    addRegisterItems,
    updateRegisterItem,
    deleteRegisterItem,
    restoreRegisterItem,
    toggleItemPublic,
    sendToTracker,
    sendToRiskLog,
    addManualTrackerItem,
    removeFromTracker,
    removeFromRiskLog,
    updateTrackerItem,
    reorderTrackerItems,
    isInTracker,
    getRiskLinkState,
    updateStatusReport,
    addTodo,
    updateTodo,
    deleteTodo,
    completeTodoFromView,
    retryProjectSync,
    reloadProject,
    setProjectData,
    setRegisters,
    setStatusReport,
    setTracker,
    updateRaciData,
  } = useProjectData(project.id, currentUserId);
  const projectedTracker = useMemo(() => tracker.map((item) => projectLinkedSource(item, 'tracker', projectData)), [tracker, projectData]);
  const projectedRegisters = useMemo(() => ({ ...registers, actions: (registers.actions || []).map((item) => projectLinkedSource(item, 'action', projectData)) }), [registers, projectData]);
  const externalPlanTasks = useMemo(() => projectData.filter((task) => planTaskVisibleExternally(task, registers, tracker)), [projectData, registers, tracker]);
  useEffect(() => {
    if (pendingScheduledTaskId == null) return;
    const task = projectData.find((item) => item.id === pendingScheduledTaskId);
    if (task) { setActiveTab('schedule'); setScheduleFocusId(task.id); setEditingTask(null); setIsModalOpen(false); setPendingScheduledTaskId(null); }
  }, [pendingScheduledTaskId, projectData]);

  const handleRemoveFromTracker = useCallback((taskId) => {
    const trackerItem = tracker.find((t) => t.taskId === taskId);
    if (trackerItem) {
      removeFromTracker(trackerItem._id);
    }
  }, [tracker, removeFromTracker]);

  const handleSendToActionLog = useCallback((taskId) => {
    toggleTrackTask(taskId, true);
  }, [toggleTrackTask]);

  const handleRemoveFromActionLog = useCallback((taskId) => {
    toggleTrackTask(taskId, false);
  }, [toggleTrackTask]);

  const handleReorderTask = useCallback((fromIndex, toIndex) => {
    setProjectData((prev) => {
      const newTasks = [...prev];
      const [moved] = newTasks.splice(fromIndex, 1);
      newTasks.splice(toIndex, 0, moved);
      return newTasks;
    });
  }, [setProjectData]);

  const handleNavigateToSchedule = useCallback((taskId) => {
    setActiveTab('schedule');
    setScheduleFocusId(taskId);
    const task = projectData.find((item) => item.id === taskId);
    if (task) { setEditingTask(task); setIsModalOpen(true); }
  }, [projectData]);
  const handleOpenSourceTodo = useCallback((todo, options = {}) => {
    const targetId = options.destinationProjectId || planLinkForTodo(todo)?.projectId || todo.projectId;
    if (targetId !== project.id && (readyProjectId !== project.id || hasPendingProjectSave || saving || planTransactionBusy || offlinePendingSync || pendingProjectSyncCount || saveError)) {
      setSourceMessage('Finish loading or saving this project before opening another project. Your current edits are retained; try again shortly.');
      return false;
    }
    setSourceMessage('');
    const originProjectId = project.id;
    return onOpenSourceTodo?.(todo, { ...options, mode: options.mode || (planLinkForTodo(todo) ? 'plan' : 'source'), canLeave: (targetId) => {
      const latest = sourceLeaveState.current;
      return latest.active && latest.owner === currentUserId && latest.projectId === originProjectId && (targetId === originProjectId || !latest.blocked);
    } });
  }, [project.id, currentUserId, readyProjectId, hasPendingProjectSave, saving, planTransactionBusy, offlinePendingSync, pendingProjectSyncCount, saveError, onOpenSourceTodo]);
  sourceLeaveState.current = { active: true, owner: currentUserId, projectId: project.id, blocked: readyProjectId !== project.id || hasPendingProjectSave || saving || planTransactionBusy || offlinePendingSync || pendingProjectSyncCount > 0 || Boolean(saveError) };
  const handleMoveToPlan = (todo, destinationProjectId) => !isExternalView && !isReadOnly && handleOpenSourceTodo(todo, { mode: 'promote', destinationProjectId });
  const handleReturnFromPlan = (todo) => !isExternalView && !isReadOnly && handleOpenSourceTodo(todo, { mode: 'return' });
  const handleOpenPlan = (todo) => handleOpenSourceTodo(todo, { mode: 'plan' });
  const handleDeletePlanTask = (taskId) => {
    const task = projectData.find((item) => item.id === taskId);
    if (!task?.originRef) { deleteTask(taskId); return; }
    const origin = task.originRef;
    const todo = origin.sourceKind === 'manual'
      ? { _id: origin.sourceId, title: task.name, projectId: project.id, meta: { projectPlanLink: origin } }
      : promotionTodoFromSource(origin.sourceKind, { _id: origin.sourceId, taskName: task.name, description: task.name, projectPlanLink: origin }, project.id);
    handleReturnFromPlan(todo);
  };

  useEffect(() => {
    if (!sourceNavigation || sourceNavigation.ownerId !== currentUserId || sourceNavigation.projectId !== project.id || readyProjectId !== project.id || loadingData || consumedSourceRequest.current === sourceNavigation.id) return;
    if (usingOfflineSnapshot || String(saveError || '').startsWith('Unable to load project:')) {
      setSourceMessage('Reconnect and reload this project. The requested source will open after its data loads successfully.');
      return;
    }
    setSourceMessage('');
    const todo = sourceNavigation.todo;
    if (['promote', 'return'].includes(sourceNavigation.mode)) {
      const reference = promotionReference(todo);
      if (reference && !isExternalView && !isReadOnly) { setActiveTab('schedule'); setIsModalOpen(false); setPlanSetup({ reference, title: todo.title, returning: sourceNavigation.mode === 'return', key: sourceNavigation.id }); }
      else setSourceMessage('This source cannot be scheduled from the current view.');
      consumedSourceRequest.current = sourceNavigation.id; onSourceNavigationHandled?.(); return;
    }
    // Do not consume a request against the previous project's still-loading arrays.
    const taskId = planLinkForTodo(todo)?.taskId ?? todo.originTaskId;
    const task = taskId != null ? projectData.find((item) => item.id === taskId) : null;
    const item = todo.originType === 'register' ? registers[todo.originRegisterType]?.find((entry) => entry._id === todo.originItemId) : tracker.find((entry) => entry._id === todo.originItemId);
    if (task) {
      setActiveTab('schedule'); setScheduleFocusId(task.id); setEditingTask(task); setInsertAfterId(null); setIsModalOpen(true);
    } else if (item) {
      const tab = todo.originType === 'register' ? todo.originRegisterType : 'tracker';
      setActiveTab(tab); setSourceFocus({ tab, itemId: todo.originItemId });
    } else {
      setSourceMessage('This source item is unavailable. Reload the project or check your access.');
    }
    consumedSourceRequest.current = sourceNavigation.id;
    onSourceNavigationHandled?.();
  }, [sourceNavigation, currentUserId, project.id, readyProjectId, loadingData, usingOfflineSnapshot, saveError, projectData, registers, tracker, onSourceNavigationHandled, isExternalView, isReadOnly]);

  const handleOpenFeedback = useCallback(() => {
    openFeedbackEmail({
      projectName: project?.name,
      tab: activeTab,
      subView: activeSubView,
    });
  }, [project?.name, activeSubView, activeTab]);

  useEffect(() => {
    if (!undoAction) return undefined;
    const timeoutId = window.setTimeout(() => setUndoAction(null), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [undoAction]);

  const {
    activeCaptureRoute,
    handleCloseQuickCapture,
    handleOpenQuickCapture,
    handleSubmitQuickCapture,
    isQuickCaptureOpen,
    quickCaptureMode,
    quickCaptureRouteBreakdown,
    quickCaptureSaving,
    quickCaptureStatus,
    quickCaptureSuggestion,
    quickCaptureText,
    setQuickCaptureMode,
    setQuickCaptureText,
  } = useWorkspaceQuickCapture({
    activeTab,
    currentUserName,
    isMobile,
    isOnline,
    launchShortcut,
    projectId: project.id,
    addTodo,
    addRegisterItems,
    deleteRegisterItem,
    deleteTodo,
    setUndoAction,
    setActiveTab,
    setActiveSubView,
  });

  const activeModuleType = activeSubView || activeTab;
  const activeModuleCount = useMemo(() => {
    if (activeModuleType === 'schedule') return projectData.length;
    if (activeModuleType === 'todo') return todos.length;
    if (activeModuleType === 'tracker') return tracker.length;
    if (SCHEMAS[activeModuleType]) return (registers[activeModuleType] || []).length;
    return null;
  }, [activeModuleType, projectData.length, registers, todos.length, tracker.length]);

  const handleAddRegisterEntry = useCallback(() => {
    if (activeTab === 'todo') {
      addTodo().then((createdTodo) => {
        if (createdTodo?._id) {
          setPendingTodoFocusId(createdTodo._id);
          setUndoAction({
            message: 'Task added.',
            actionLabel: 'Undo',
            onUndo: async () => {
              await deleteTodo(createdTodo._id);
              setUndoAction(null);
            },
          });
        }
      });
      return;
    }

    if (activeTab === 'raci' || activeTab === 'tracker' || activeTab === 'statusreport') return;
    const target = activeSubView || activeTab;
    const createdItem = addRegisterItem(target);
    if (createdItem?._id) {
      setUndoAction({
        message: `${SCHEMAS[target]?.title || 'Entry'} added.`,
        actionLabel: 'Undo',
        onUndo: () => {
          deleteRegisterItem(target, createdItem._id);
          setUndoAction(null);
        },
      });
    }
  }, [activeSubView, activeTab, addRegisterItem, addTodo, deleteRegisterItem, deleteTodo]);

  const handleDeleteRegisterItemWithUndo = useCallback((registerType, itemId) => {
    const deletedItem = deleteRegisterItem(registerType, itemId);
    if (!deletedItem) return;

    setUndoAction({
      message: `${SCHEMAS[registerType]?.title || 'Entry'} removed.`,
      actionLabel: 'Undo',
      onUndo: () => {
        restoreRegisterItem(registerType, deletedItem);
        setUndoAction(null);
      },
    });
  }, [deleteRegisterItem, restoreRegisterItem]);

  const mobileProjectSyncItems = useMemo(() => {
    const queueItem = pendingProjectSyncCount > 0 ? [{
      id: 'project-queue',
      label: `${pendingProjectSyncCount} project change${pendingProjectSyncCount === 1 ? '' : 's'} waiting`,
      detail: isOnline
        ? 'Your project edits will be pushed up as soon as the save completes.'
        : 'These project edits are stored on this phone and will sync when signal returns.',
      status: saving && isOnline ? 'syncing' : isOnline ? 'queue' : 'offline',
      statusLabel: saving && isOnline ? 'Syncing' : isOnline ? 'Queued' : 'Offline',
      actionLabel: isOnline && !saving ? 'Retry sync' : '',
      onAction: isOnline && !saving ? retryProjectSync : undefined,
    }] : [];

    const errorItem = saveError && (pendingProjectSyncCount > 0 || offlinePendingSync) ? [{
      id: 'project-error',
      label: 'Project sync needs attention',
      detail: saveError,
      status: 'error',
      statusLabel: 'Error',
      actionLabel: saveConflict ? 'Reload latest' : 'Retry sync',
      onAction: saveConflict ? reloadProject : retryProjectSync,
    }] : [];

    const offlineSnapshotItem = usingOfflineSnapshot ? [{
      id: 'project-offline-snapshot',
      label: 'Offline project copy loaded',
      detail: isOnline
        ? 'You are viewing a cached copy while the latest project data reloads.'
        : 'You are viewing the last copy saved on this device. Changes will sync when signal returns.',
      status: isOnline ? 'queue' : 'offline',
      statusLabel: isOnline ? 'Cached' : 'Offline',
      actionLabel: isOnline ? 'Reload latest' : '',
      onAction: isOnline ? reloadProject : undefined,
    }] : [];

    const queuedWorkspaceItem = offlinePendingSync && pendingProjectSyncCount === 0 ? [{
      id: 'workspace-offline-queue',
      label: 'Workspace changes waiting',
      detail: isOnline
        ? 'Some saved edits are queued on this device and will be pushed up shortly.'
        : 'Some saved edits are queued on this device until you are back online.',
      status: isOnline ? 'queue' : 'offline',
      statusLabel: isOnline ? 'Queued' : 'Offline',
    }] : [];

    return [...errorItem, ...queueItem, ...offlineSnapshotItem, ...queuedWorkspaceItem];
  }, [
    isOnline,
    offlinePendingSync,
    pendingProjectSyncCount,
    reloadProject,
    retryProjectSync,
    saveConflict,
    saveError,
    saving,
    usingOfflineSnapshot,
  ]);

  const mobileSyncSummary = useMemo(() => {
    if (saveError && (pendingProjectSyncCount > 0 || offlinePendingSync)) {
      return saveError;
    }
    if (pendingProjectSyncCount > 0) {
      return `${pendingProjectSyncCount} project change${pendingProjectSyncCount === 1 ? '' : 's'} waiting to sync.`;
    }
    if (offlinePendingSync) {
      return isOnline
        ? 'Saved workspace changes are queued on this device.'
        : 'Saved workspace changes will sync when signal returns.';
    }
    if (usingOfflineSnapshot) {
      return isOnline
        ? 'A cached project copy is visible while the latest data reloads.'
        : 'A cached project copy is available offline.';
    }
    return '';
  }, [isOnline, offlinePendingSync, pendingProjectSyncCount, saveError, usingOfflineSnapshot]);

  const handleLoadDemoData = useCallback(() => {
    const proceed = window.confirm(
      'Load the Network Transformation demo plan and fill all tabs with sample content? This will replace current demo content in this project.'
    );
    if (!proceed) return;
    loadDemoDataAllTabs({
      anchorDate: project?.created_at,
      startOffsetDays: 0
    });
    setImportStatus('✓ Demo data loaded across all tabs');
    setTimeout(() => setImportStatus(null), 4000);
  }, [loadDemoDataAllTabs, project?.created_at]);

  const handleResetDemoData = useCallback(() => {
    const proceed = window.confirm(
      'Reset this project to a blank state? This clears the Project Plan, tracker, registers, and baseline in this project.'
    );
    if (!proceed) return;
    resetDemoData();
    setImportStatus('Demo data reset');
    setTimeout(() => setImportStatus(null), 3000);
  }, [resetDemoData]);

  const {
    handleExportAiReport,
    handleGenerateAiReport,
    handleGenerateEmailDigest,
  } = useWorkspaceAiActions({
    aiReady,
    aiSettings,
    canUseAiReport,
    effectivePlan,
    limits,
    project,
    projectData,
    refreshProfile,
    registers,
    setImportStatus,
    statusReport,
    todos,
    tracker,
    usePlatformKey,
  });
  const { handleExport, handleImport } = useWorkspaceImportExport({
    addTodo,
    project,
    projectData,
    registers,
    setImportStatus,
    setProjectData,
    setRegisters,
    setStatusReport,
    setTracker,
    statusReport,
    todos,
    tracker,
  });

  const handleOpenModal = (task = null, isInsert = false, afterId = null) => {
    setEditingTask(task);
    setInsertAfterId(isInsert ? afterId : null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingTask(null);
    setInsertAfterId(null);
  };

  const handleSaveTask = (taskData) => {
    if (editingTask) {
      updateTask(editingTask.id, taskData);
      return;
    }

    const currentCount = projectData.length;
    const hardLimit = getTaskHardLimit();

    if (currentCount >= hardLimit) {
      alert(`Task limit reached (${hardLimit}). Upgrade to Pro for more tasks per project.`);
      handleOpenPricing();
      return;
    }

    if (isInTaskGrace(currentCount)) {
      const soft = limits.maxTasksPerProject;
      const remaining = hardLimit - currentCount;
      alert(`You're over the ${soft}-task limit. ${remaining} task${remaining !== 1 ? 's' : ''} remaining before the hard cap.`);
    }

    addTask(taskData, insertAfterId);
  };

  const handleAiSettingsChange = useCallback((newSettings) => {
    setAiSettings(newSettings);
  }, []);

  const handleOpenPricing = useCallback(() => {
    setShowBilling(false);
    setShowPricing(true);
  }, []);

  const handleOpenBilling = useCallback(() => {
    setShowPricing(false);
    setShowBilling(true);
  }, []);

  if (loadingData) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-gray-400 text-lg">Loading project...</div>
      </div>
    );
  }

  return (
    <div className="pm-shell-bg pm-accent-scope min-h-screen h-[100dvh] flex flex-col overflow-hidden">
      <TrialBanner onUpgrade={handleOpenPricing} />
      <CancellationBanner onUpgrade={handleOpenPricing} />
      <ReadOnlyBanner onUpgrade={handleOpenPricing} />

      <WorkspaceProjectStatusBar
        handleOpenFeedback={handleOpenFeedback}
        importStatus={importStatus}
        isAdmin={isAdmin}
        isOnline={isOnline}
        lastSaved={lastSaved}
        onBackToProjects={onBackToProjects}
        pendingProjectSyncCount={pendingProjectSyncCount}
        projectName={project.name}
        reloadProject={reloadProject}
        remoteUpdateAvailable={remoteUpdateAvailable}
        retryProjectSync={retryProjectSync}
        saveConflict={saveConflict}
        saveError={saveError}
        saving={saving}
        simulatedPlan={simulatedPlan}
        simulatorOptions={simulatorOptions}
        usingOfflineSnapshot={usingOfflineSnapshot}
        setSimulatedPlan={setSimulatedPlan}
      />

      <Header
        projectName={activeTab === 'timesheets' ? 'Timesheet' : project.name}
        moduleType={activeModuleType}
        moduleCount={activeModuleCount}
        isExternalView={isExternalView}
        onToggleExternalView={() => setIsExternalView(!isExternalView)}
        onShowDemoBenefits={() => setIsBenefitsOpen(true)}
        onLoadTemplate={handleLoadDemoData}
        onResetDemoData={handleResetDemoData}
        onExport={handleExport}
        onImport={handleImport}
        onNewTask={() => handleOpenModal()}
        onOpenPricing={handleOpenPricing}
        onOpenBilling={handleOpenBilling}
        onAddRegisterItem={handleAddRegisterEntry}
        addEntryLabel={
          activeTab === 'todo'
            ? 'Add Task'
            : activeTab === 'raci' || activeTab === 'tracker' || activeTab === 'statusreport'
              ? ''
              : 'Add Entry'
        }
        onSetBaseline={setBaseline}
        onClearBaseline={clearBaseline}
        hasBaseline={!!baseline}
        activeTab={activeTab}
        isDemoProject={!!project?.is_demo}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        accentTheme={accentTheme}
        onAccentThemeChange={onAccentThemeChange}
      />

      <Navigation
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          if (tab !== 'financials' && tab !== 'stakeholdersmgmt') {
            setActiveSubView(null);
          }
        }}
      />

      {isMobile && !isExternalView && !showPricing && !showBilling ? (
        <ProjectFocusReadinessPanel
          tasks={projectData}
          registers={registers}
          tracker={tracker}
          statusReport={statusReport}
          todos={todos}
        />
      ) : null}

      <main className="relative flex-grow min-h-0 overflow-hidden" inert={planTransactionBusy ? '' : undefined}>
        {sourceMessage ? <p role="alert" className="absolute left-3 right-3 top-3 z-[90] rounded-xl border bg-amber-50 p-3 text-sm">{sourceMessage}<button type="button" onClick={() => setSourceMessage('')} className="ml-3 underline">Dismiss</button></p> : null}
        <Suspense fallback={<div className="h-full flex items-center justify-center text-sm text-slate-500">Loading view...</div>}>
          {activeTab === 'schedule' ? (
            <ScheduleView
              focusTaskId={scheduleFocusId}
              onFocusTaskHandled={() => setScheduleFocusId(null)}
              tasks={isExternalView ? externalPlanTasks : projectData}
              viewMode={viewMode}
              baseline={baseline}
              isMobile={isMobile}
              onUpdateTask={updateTask}
              onDeleteTask={handleDeletePlanTask}
              onModifyHierarchy={modifyHierarchy}
              onToggleTrack={toggleTrackTask}
              onInsertTask={(taskId) => handleOpenModal(null, true, taskId)}
              onReorderTask={isExternalView ? undefined : handleReorderTask}
              onSendToTracker={sendToTracker}
              onSendToRiskLog={sendToRiskLog}
              onSendToActionLog={handleSendToActionLog}
              onRemoveFromActionLog={handleRemoveFromActionLog}
              onRemoveFromRiskLog={removeFromRiskLog}
              onRemoveFromTracker={handleRemoveFromTracker}
              isInTracker={isInTracker}
              getRiskLinkState={getRiskLinkState}
              aiSettings={aiSettings}
              onAiSettingsChange={handleAiSettingsChange}
              onApplyAiTasks={setProjectData}
              usePlatformKey={usePlatformKey}
            />
          ) : activeTab === 'timesheets' ? (
            <TimesheetView
              currentUserId={currentUserId}
              currentProject={project}
              onBackToProject={() => setActiveTab('schedule')}
            />
          ) : activeTab === 'tracker' ? (
            <TrackerView
              focusItemId={sourceFocus?.tab === 'tracker' ? sourceFocus.itemId : null}
              onFocusItemHandled={() => setSourceFocus(null)}
              trackerItems={projectedTracker}
              onMoveToPlan={isReadOnly || isExternalView ? undefined : (item) => handleMoveToPlan(promotionTodoFromSource('tracker', item, project.id), project.id)}
              onReturnFromPlan={isReadOnly || isExternalView ? undefined : (item) => handleReturnFromPlan(promotionTodoFromSource('tracker', item, project.id))}
              tasks={projectData}
              onUpdateItem={updateTrackerItem}
              onRemoveItem={(id) => { const item = tracker.find((entry) => entry._id === id); if (item?.projectPlanLink) handleReturnFromPlan(promotionTodoFromSource('tracker', item, project.id)); else removeFromTracker(id); }}
              onAddManualItem={addManualTrackerItem}
              onReorderItems={reorderTrackerItems}
              onNavigateToSchedule={handleNavigateToSchedule}
            />
          ) : activeTab === 'statusreport' ? (
            <BlurOverlay tabId="statusreport" onUpgrade={handleOpenPricing}>
              <StatusReportView
                tasks={projectData}
                baseline={baseline}
                registers={registers}
                tracker={tracker}
                statusReport={statusReport}
                onUpdateStatusReport={updateStatusReport}
                onExportAiReport={handleExportAiReport}
                onGenerateAiReport={handleGenerateAiReport}
                onGenerateEmailDigest={handleGenerateEmailDigest}
                aiConfigured={aiReady}
                onAiSettingsChange={handleAiSettingsChange}
                projectName={project.name}
                canUseAiReport={canUseAiReport}
                aiReportsRemaining={aiReportsRemaining}
                aiReportsLimit={limits.aiReportsPerMonth}
                usePlatformKey={usePlatformKey}
                isExternalView={isExternalView}
              />
            </BlurOverlay>
          ) : activeTab === 'todo' ? (
            <BlurOverlay tabId="todo" onUpgrade={handleOpenPricing}>
              <TodoView
                onMoveToPlan={isReadOnly || isExternalView ? undefined : handleMoveToPlan}
                onReturnFromPlan={isReadOnly || isExternalView ? undefined : handleReturnFromPlan}
                onOpenPlan={handleOpenPlan}
                onOpenSourceTodo={handleOpenSourceTodo}
                todos={todos}
                projectData={projectData}
                registers={registers}
                tracker={tracker}
                currentProject={project}
                currentUserId={currentUserId}
                currentUserName={currentUserName}
                isExternalView={isExternalView}
                pendingFocusTodoId={pendingTodoFocusId}
                onTodoFocusHandled={() => setPendingTodoFocusId(null)}
                onAddTodo={addTodo}
                onUpdateTodo={updateTodo}
                onDeleteTodo={deleteTodo}
                onCompleteTodo={completeTodoFromView}
              />
            </BlurOverlay>
          ) : activeTab === 'stakeholdersmgmt' ? (
            <BlurOverlay tabId="stakeholdersmgmt" onUpgrade={handleOpenPricing}>
              <StakeholdersView
                registers={registers}
                isExternalView={isExternalView}
                onUpdateItem={updateRegisterItem}
                onDeleteItem={handleDeleteRegisterItemWithUndo}
                onTogglePublic={toggleItemPublic}
                onSubViewChange={setActiveSubView}
              />
            </BlurOverlay>
          ) : activeTab === 'financials' ? (
            <BlurOverlay tabId="financials" onUpgrade={handleOpenPricing}>
              <FinancialsView
                registers={registers}
                isExternalView={isExternalView}
                onUpdateItem={updateRegisterItem}
                onDeleteItem={handleDeleteRegisterItemWithUndo}
                onTogglePublic={toggleItemPublic}
                onSubViewChange={setActiveSubView}
              />
            </BlurOverlay>
          ) : activeTab === 'raci' ? (
            <BlurOverlay tabId="raci" onUpgrade={handleOpenPricing}>
              <RACIView
                projectData={projectData}
                registers={registers}
                updateRaciData={updateRaciData}
              />
            </BlurOverlay>
          ) : (
            <BlurOverlay tabId={activeTab} onUpgrade={handleOpenPricing}>
              <RegisterView
                focusItemId={sourceFocus?.tab === activeTab ? sourceFocus.itemId : null}
                onFocusItemHandled={() => setSourceFocus(null)}
                registerType={activeTab}
                items={projectedRegisters[activeTab] || []}
                onMoveToPlan={activeTab === 'actions' && !isReadOnly && !isExternalView ? (item) => handleMoveToPlan(promotionTodoFromSource('action', item, project.id), project.id) : undefined}
                onOpenPlan={activeTab === 'actions' ? (item) => handleOpenPlan(promotionTodoFromSource('action', item, project.id)) : undefined}
                onReturnFromPlan={activeTab === 'actions' && !isReadOnly && !isExternalView ? (item) => handleReturnFromPlan(promotionTodoFromSource('action', item, project.id)) : undefined}
                isExternalView={isExternalView}
                onUpdateItem={updateRegisterItem}
                onDeleteItem={(type, id) => { const item = registers[type]?.find((entry) => entry._id === id); if (type === 'actions' && item?.projectPlanLink) handleReturnFromPlan(promotionTodoFromSource('action', item, project.id)); else handleDeleteRegisterItemWithUndo(type, id); }}
                onTogglePublic={toggleItemPublic}
              />
            </BlurOverlay>
          )}
        </Suspense>
      </main>

      {isMobile && !showPricing && !showBilling && !isModalOpen ? (
        <MobileQuickCapture
          isOpen={isQuickCaptureOpen}
          mode={quickCaptureMode}
          value={quickCaptureText}
          saving={quickCaptureSaving}
          isOnline={isOnline}
          projectName={project.name}
          statusMessage={quickCaptureStatus}
          routeLabel={activeCaptureRoute.meta.label}
          routeDestination={activeCaptureRoute.meta.destination}
          routeReason={quickCaptureMode === 'smart' ? quickCaptureSuggestion.reason : ''}
          routeBreakdown={quickCaptureRouteBreakdown}
          routeConfidenceLabel={quickCaptureMode === 'smart' ? activeCaptureRoute.confidenceMeta?.label : ''}
          routeDueDate={['task', 'action', 'issue'].includes(activeCaptureRoute.type) ? activeCaptureRoute.dueDate : ''}
          routeOwnerText={['task', 'action', 'issue', 'risk', 'decision'].includes(activeCaptureRoute.type) ? activeCaptureRoute.ownerText : ''}
          onOpen={handleOpenQuickCapture}
          onClose={handleCloseQuickCapture}
          onModeChange={setQuickCaptureMode}
          onValueChange={setQuickCaptureText}
          onSubmit={handleSubmitQuickCapture}
        />
      ) : null}

      <MobileSyncCenter
        shouldShow={isMobile && (offlinePendingSync || usingOfflineSnapshot || pendingProjectSyncCount > 0 || Boolean(saveError && (pendingProjectSyncCount > 0 || offlinePendingSync)))}
        title="Project sync"
        summary={mobileSyncSummary}
        queueCount={pendingProjectSyncCount}
        items={mobileProjectSyncItems}
      />

      {undoAction ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[75] flex justify-center px-4">
          <div className="pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-[0_24px_48px_-28px_rgba(15,23,42,0.4)] backdrop-blur">
            <div className="min-w-0 flex-1 text-sm text-slate-700">{undoAction.message}</div>
            <button
              type="button"
              onClick={undoAction.onUndo}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700"
            >
              {undoAction.actionLabel || 'Undo'}
            </button>
          </div>
        </div>
      ) : null}

      <AuthenticatedFooter className="flex-none" />

      <DemoBenefitsModal
        isOpen={isBenefitsOpen}
        onClose={() => setIsBenefitsOpen(false)}
      />

      <TaskModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSave={handleSaveTask}
        task={editingTask}
        insertAfterId={insertAfterId}
      />
      {planSetup ? <ScheduleTaskSetup key={`${currentUserId}:${project.id}:${planSetup.key}`} reference={planSetup.reference} title={planSetup.title} returning={planSetup.returning} onPrepare={preparePlanPromotion} onCommit={commitPlanPromotion} onClose={() => setPlanSetup(null)} onSaved={(ack) => { setPlanSetup(null); if (!planSetup.returning) setPendingScheduledTaskId(ack.task_id); }} /> : null}

      {showPricing ? (
        <Suspense fallback={null}>
          <PricingPage onClose={() => setShowPricing(false)} />
        </Suspense>
      ) : null}
      {showBilling ? (
        <Suspense fallback={null}>
          <BillingScreen
            onClose={() => setShowBilling(false)}
            onOpenPricing={handleOpenPricing}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
