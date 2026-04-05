import React, { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { SCHEMAS } from '../utils/constants';
import AuthenticatedFooter from './AuthenticatedFooter';
import Header from './Header';
import Navigation from './Navigation';
import TaskModal from './TaskModal';
import DemoBenefitsModal from './DemoBenefitsModal';
import BlurOverlay from './BlurOverlay';
import PricingPage from './PricingPage';
import BillingScreen from './BillingScreen';
import PmWorkspaceLogo from './PmWorkspaceLogo';
import { TrialBanner, CancellationBanner, ReadOnlyBanner } from './UpgradeBanner';
import { useProjectData } from '../hooks/useProjectData';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { usePlan } from '../contexts/PlanContext';
import { loadAiSettings, isAiConfigured } from '../utils/aiSettings';
import { openFeedbackEmail } from '../utils/feedback';
import AccentThemePicker from './AccentThemePicker';
import MobileQuickCapture from './MobileQuickCapture';
import MobileSyncCenter from './MobileSyncCenter';
import { useWorkspaceAiActions } from '../hooks/useWorkspaceAiActions';
import { useWorkspaceImportExport } from '../hooks/useWorkspaceImportExport';
import { useWorkspaceQuickCapture } from '../hooks/useWorkspaceQuickCapture';

const ScheduleView = lazy(() => import('./ScheduleView'));
const RegisterView = lazy(() => import('./RegisterView'));
const TrackerView = lazy(() => import('./TrackerView'));
const StatusReportView = lazy(() => import('./StatusReportView'));
const TodoView = lazy(() => import('./TodoView'));
const StakeholdersView = lazy(() => import('./StakeholdersView'));
const FinancialsView = lazy(() => import('./FinancialsView'));
const RACIView = lazy(() => import('./RACIView'));
const TimesheetView = lazy(() => import('./TimesheetView'));
const ShoppingListView = lazy(() => import('./ShoppingListView'));

const ViewFallback = ({ label }) => (
  <div className="flex h-full min-h-[320px] items-center justify-center px-4 py-10 text-sm font-medium text-slate-500">
    {label}
  </div>
);

export function AuthenticatedTrackShell({
  currentUserId,
  userEmail,
  onGoToProjects,
  onSignOut,
  accentTheme,
  onAccentThemeChange,
}) {
  return (
    <div className="pm-shell-bg pm-accent-scope min-h-screen flex flex-col">
      <div className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-start justify-between gap-3 px-4 py-3 sm:items-center sm:px-6 sm:py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <PmWorkspaceLogo iconOnly size="xs" />
              <div className="min-w-0">
                <h1 className="truncate text-base font-bold text-slate-950 sm:text-lg">Timesheet</h1>
              </div>
            </div>
            <p className="mt-1 text-xs text-slate-500 sm:text-sm">{userEmail}</p>
          </div>

          <div className="flex items-center gap-2">
            <AccentThemePicker value={accentTheme} onChange={onAccentThemeChange} />
            <button
              onClick={onGoToProjects}
              className="whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 sm:px-4 sm:text-sm"
            >
              Projects
            </button>
            <button
              onClick={onSignOut}
              className="whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 sm:px-4 sm:text-sm"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <Suspense fallback={<ViewFallback label="Loading Timesheet..." />}>
          <TimesheetView currentUserId={currentUserId} />
        </Suspense>
      </div>

      <AuthenticatedFooter className="flex-none" />
    </div>
  );
}

export function AuthenticatedShoppingShell({
  currentUserId,
  userEmail,
  onGoToProjects,
  onSignOut,
  accentTheme,
  onAccentThemeChange,
}) {
  return (
    <div className="pm-shell-bg pm-accent-scope min-h-screen flex flex-col">
      <div className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-start justify-between gap-3 px-4 py-3 sm:items-center sm:px-6 sm:py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <PmWorkspaceLogo iconOnly size="xs" />
              <div className="min-w-0">
                <h1 className="truncate text-base font-bold text-slate-950 sm:text-lg">Shopping List</h1>
              </div>
            </div>
            <p className="mt-1 text-xs text-slate-500 sm:text-sm">{userEmail}</p>
          </div>

          <div className="flex items-center gap-2">
            <AccentThemePicker value={accentTheme} onChange={onAccentThemeChange} />
            <button
              onClick={onGoToProjects}
              className="whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 sm:px-4 sm:text-sm"
            >
              Projects
            </button>
            <button
              onClick={onSignOut}
              className="whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 sm:px-4 sm:text-sm"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <Suspense fallback={<ViewFallback label="Loading Shopping List..." />}>
          <ShoppingListView currentUserId={currentUserId} />
        </Suspense>
      </div>

      <AuthenticatedFooter className="flex-none" />
    </div>
  );
}

export function MainApp({ project, currentUserId, currentUserName, accentTheme, onAccentThemeChange, onBackToProjects, isOnline, launchShortcut }) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const {
    canUseAiReport, aiReportsRemaining, incrementAiReports,
    limits, effectivePlan, isAdmin, isInTaskGrace, getTaskHardLimit,
    simulatedPlan, setSimulatedPlan, simulatorOptions,
  } = usePlan();

  const [activeTab, setActiveTab] = useState('schedule');
  const [activeSubView, setActiveSubView] = useState(null);
  const [viewMode, setViewMode] = useState('week');
  const [isExternalView, setIsExternalView] = useState(false);
  const [pendingTodoFocusId, setPendingTodoFocusId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [insertAfterId, setInsertAfterId] = useState(null);
  const [importStatus, setImportStatus] = useState(null);
  const [isBenefitsOpen, setIsBenefitsOpen] = useState(false);
  const [showPricing, setShowPricing] = useState(false);
  const [showBilling, setShowBilling] = useState(false);
  const [aiSettings, setAiSettings] = useState(() => loadAiSettings());
  const [undoAction, setUndoAction] = useState(null);

  const hasByok = isAiConfigured(aiSettings);
  const usePlatformKey = effectivePlan && limits.canUseAi && !hasByok;
  const aiReady = limits.canUseAi && (hasByok || usePlatformKey);

  const {
    projectData,
    registers,
    tracker,
    statusReport,
    todos,
    baseline,
    saving,
    lastSaved,
    loadingData,
    saveConflict,
    saveError,
    remoteUpdateAvailable,
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
    addManualTrackerItem,
    removeFromTracker,
    updateTrackerItem,
    reorderTrackerItems,
    isInTracker,
    updateStatusReport,
    addTodo,
    updateTodo,
    deleteTodo,
    completeTodoFromView,
    retryProjectSync,
    reloadProject,
    setProjectData,
    setRegisters,
    updateRaciData,
  } = useProjectData(project.id, currentUserId);

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

  const handleNavigateToSchedule = useCallback(() => {
    setActiveTab('schedule');
  }, []);

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

    const errorItem = saveError && pendingProjectSyncCount > 0 ? [{
      id: 'project-error',
      label: 'Project sync needs attention',
      detail: saveError,
      status: 'error',
      statusLabel: 'Error',
      actionLabel: saveConflict ? 'Reload latest' : 'Retry sync',
      onAction: saveConflict ? reloadProject : retryProjectSync,
    }] : [];

    return [...errorItem, ...queueItem];
  }, [isOnline, pendingProjectSyncCount, reloadProject, retryProjectSync, saveConflict, saveError, saving]);

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
    incrementAiReports,
    limits,
    project,
    projectData,
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

      <div className="bg-gray-800 border-b border-gray-700 px-3 sm:px-4 py-1.5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-1.5 text-xs">
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-x-2.5 gap-y-1 min-w-0">
          <button
            onClick={onBackToProjects}
            className="text-gray-400 hover:text-white transition-colors flex items-center gap-1"
          >
            ← Projects
          </button>
          <span className="hidden sm:inline text-gray-600">|</span>
          <span className="text-white font-medium truncate">{project.name}</span>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 -mb-1 lg:flex-wrap">
          {isAdmin && simulatorOptions.length > 0 && (
            <select
              value={simulatedPlan || ''}
              onChange={(e) => setSimulatedPlan(e.target.value || null)}
              className="shrink-0 text-[11px] px-1.5 py-0.5 bg-purple-900/60 border border-purple-500/50 text-purple-200 rounded cursor-pointer"
              title="Plan Simulator (admin only)"
            >
              {simulatorOptions.map((opt) => (
                <option key={opt.value || 'real'} value={opt.value || ''}>{opt.label}</option>
              ))}
            </select>
          )}
          {simulatedPlan && (
            <span className="shrink-0 text-[10px] px-1.5 py-0.5 bg-purple-600 text-white rounded-full font-medium animate-pulse">
              SIM: {simulatorOptions.find((o) => o.value === simulatedPlan)?.label}
            </span>
          )}
          <button
            onClick={handleOpenFeedback}
            className="shrink-0 text-xs px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors"
            title="Report a bug, request an improvement, or send feedback by email"
          >
            Send Feedback
          </button>
          {importStatus ? (
            <span className={`shrink-0 flex items-center gap-1 ${importStatus.startsWith('✓') ? 'text-emerald-400' : importStatus === 'Importing...' || importStatus === 'Exporting...' || importStatus === 'Exporting AI report...' ? 'text-blue-400' : 'text-amber-400'}`}>
              {importStatus}
            </span>
          ) : pendingProjectSyncCount > 0 && !isOnline ? (
            <span className="shrink-0 text-amber-300 whitespace-nowrap">
              {pendingProjectSyncCount} project change{pendingProjectSyncCount === 1 ? '' : 's'} queued
            </span>
          ) : saveConflict ? (
            <div className="shrink-0 flex items-center gap-2">
              <span className="text-rose-400 whitespace-nowrap">Save conflict detected</span>
              <button
                onClick={reloadProject}
                className="px-2 py-1 text-[11px] bg-rose-600 hover:bg-rose-700 text-white rounded transition-colors"
                title="Reload server version to resolve conflict"
              >
                Reload Latest
              </button>
            </div>
          ) : remoteUpdateAvailable ? (
            <div className="shrink-0 flex items-center gap-2">
              <span className="text-amber-400 whitespace-nowrap">Remote changes available</span>
              <button
                onClick={reloadProject}
                className="px-2 py-1 text-[11px] bg-amber-500 hover:bg-amber-600 text-slate-950 rounded transition-colors"
                title="Reload the latest server version before making more edits"
              >
                Reload Latest
              </button>
            </div>
          ) : pendingProjectSyncCount > 0 && isOnline && !saving && !saveError ? (
            <div className="shrink-0 flex items-center gap-2">
              <span className="text-sky-300 whitespace-nowrap">
                {pendingProjectSyncCount} project change{pendingProjectSyncCount === 1 ? '' : 's'} ready to sync
              </span>
              <button
                onClick={retryProjectSync}
                className="px-2 py-1 text-[11px] bg-sky-500 hover:bg-sky-600 text-slate-950 rounded transition-colors"
                title="Push the queued project changes now"
              >
                Retry sync
              </button>
            </div>
          ) : saveError && pendingProjectSyncCount > 0 ? (
            <div className="shrink-0 flex items-center gap-2">
              <span className="text-rose-400 whitespace-nowrap" title={saveError}>Project sync failed</span>
              {!saveConflict ? (
                <button
                  onClick={retryProjectSync}
                  className="px-2 py-1 text-[11px] bg-rose-600 hover:bg-rose-700 text-white rounded transition-colors"
                  title="Retry syncing your queued project changes"
                >
                  Retry sync
                </button>
              ) : null}
            </div>
          ) : saveError ? (
            <span className="shrink-0 text-rose-400 whitespace-nowrap" title={saveError}>Save failed</span>
          ) : !isOnline && usingOfflineSnapshot ? (
            <span className="shrink-0 text-amber-300 whitespace-nowrap">Offline snapshot loaded</span>
          ) : saving ? (
            <span className="shrink-0 text-yellow-400 flex items-center gap-1 whitespace-nowrap">
              <span className="animate-pulse">●</span> Saving...
            </span>
          ) : lastSaved ? (
            <span className="shrink-0 text-green-400 flex items-center gap-1 whitespace-nowrap">
              ✓ Saved {lastSaved.toLocaleTimeString()}
            </span>
          ) : (
            <span className="shrink-0 text-gray-500 whitespace-nowrap">Ready</span>
          )}
        </div>
      </div>

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

      <main className="relative flex-grow min-h-0 overflow-hidden">
        <Suspense fallback={<div className="h-full flex items-center justify-center text-sm text-slate-500">Loading view...</div>}>
          {activeTab === 'schedule' ? (
            <ScheduleView
              tasks={projectData}
              viewMode={viewMode}
              baseline={baseline}
              isMobile={isMobile}
              onUpdateTask={updateTask}
              onDeleteTask={deleteTask}
              onModifyHierarchy={modifyHierarchy}
              onToggleTrack={toggleTrackTask}
              onInsertTask={(taskId) => handleOpenModal(null, true, taskId)}
              onReorderTask={handleReorderTask}
              onSendToTracker={sendToTracker}
              onSendToActionLog={handleSendToActionLog}
              onRemoveFromActionLog={handleRemoveFromActionLog}
              onRemoveFromTracker={handleRemoveFromTracker}
              isInTracker={isInTracker}
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
              trackerItems={tracker}
              tasks={projectData}
              onUpdateItem={updateTrackerItem}
              onRemoveItem={removeFromTracker}
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
                todos={todos}
                projectData={projectData}
                registers={registers}
                tracker={tracker}
                currentProject={project}
                currentUserId={currentUserId}
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
                registerType={activeTab}
                items={registers[activeTab] || []}
                isExternalView={isExternalView}
                onUpdateItem={updateRegisterItem}
                onDeleteItem={handleDeleteRegisterItemWithUndo}
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
        shouldShow={isMobile && (pendingProjectSyncCount > 0 || (saveError && pendingProjectSyncCount > 0))}
        title="Project sync"
        summary={
          pendingProjectSyncCount > 0
            ? `${pendingProjectSyncCount} project change${pendingProjectSyncCount === 1 ? '' : 's'} waiting to sync.`
            : ''
        }
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

      {showPricing ? <PricingPage onClose={() => setShowPricing(false)} /> : null}
      {showBilling ? (
        <BillingScreen
          onClose={() => setShowBilling(false)}
          onOpenPricing={handleOpenPricing}
        />
      ) : null}
    </div>
  );
}
