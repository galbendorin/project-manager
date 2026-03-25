import React, { useState, useCallback, useMemo, useEffect, lazy, Suspense } from 'react';
import { SCHEMAS } from './utils/constants';
import { useAuth } from './contexts/AuthContext';
import AuthPage from './components/AuthPage';
import LegalPage from './components/LegalPage';
import PublicPricingPage from './components/PublicPricingPage';
import ProjectSelector from './components/ProjectSelector';
import AuthenticatedFooter from './components/AuthenticatedFooter';
import Header from './components/Header';
import Navigation from './components/Navigation';
import TaskModal from './components/TaskModal';
import DemoBenefitsModal from './components/DemoBenefitsModal';
import BlurOverlay from './components/BlurOverlay';
import PricingPage from './components/PricingPage';
import BillingScreen from './components/BillingScreen';
import { TrialBanner, CancellationBanner, ReadOnlyBanner } from './components/UpgradeBanner';
import { useProjectData } from './hooks/useProjectData';
import { useCheckoutStatus, CheckoutToast } from './hooks/useCheckoutStatus.jsx';
import { useMediaQuery } from './hooks/useMediaQuery';
import { usePlan } from './contexts/PlanContext';
import {
  loadXLSX,
  parseScheduleSheet,
  parseTodoSheet,
  parseRegisterSheet,
  parseRaciSheet,
  findSheet,
  REGISTER_IMPORT_COLUMN_MAPS,
  REGISTER_IMPORT_SHEET_CANDIDATES,
  RACI_IMPORT_SHEET_CANDIDATES,
  TODO_IMPORT_SHEET_CANDIDATES
} from './utils/importParsers';
import { buildAiReportExportData } from './utils/aiReportExport';
import { loadAiSettings, isAiConfigured } from './utils/aiSettings';
import { generateAiContent } from './utils/aiClient';
import {
  buildReportPrompt,
  getReportSystemPrompt,
  buildEmailDigestPrompt,
  getEmailDigestSystemPrompt
} from './utils/aiPrompts';
import { openFeedbackEmail } from './utils/feedback';

const ScheduleView = lazy(() => import('./components/ScheduleView'));
const RegisterView = lazy(() => import('./components/RegisterView'));
const TrackerView = lazy(() => import('./components/TrackerView'));
const StatusReportView = lazy(() => import('./components/StatusReportView'));
const TodoView = lazy(() => import('./components/TodoView'));
const StakeholdersView = lazy(() => import('./components/StakeholdersView'));
const FinancialsView = lazy(() => import('./components/FinancialsView'));
const RACIView = lazy(() => import('./components/RACIView'));
const TimesheetView = lazy(() => import('./components/TimesheetView'));

const normalizeAppPath = (value = '/') => {
  const normalized = String(value || '/').replace(/\/+$/, '');
  return normalized || '/';
};

function App() {
  const { user, loading: authLoading, signOut } = useAuth();
  const checkoutStatus = useCheckoutStatus();
  const [currentProject, setCurrentProject] = useState(null);
  const [currentPath, setCurrentPath] = useState(() => (
    typeof window !== 'undefined' ? normalizeAppPath(window.location.pathname) : '/'
  ));

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handlePopState = () => {
      setCurrentPath(normalizeAppPath(window.location.pathname));
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateToPath = useCallback((path) => {
    const nextPath = normalizeAppPath(path);
    if (typeof window !== 'undefined' && normalizeAppPath(window.location.pathname) !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }
    setCurrentPath(nextPath);
  }, []);

  if (currentPath === '/privacy') {
    return <LegalPage page="privacy" />;
  }

  if (currentPath === '/terms') {
    return <LegalPage page="terms" />;
  }

  if (currentPath === '/cookie-storage-notice' || currentPath === '/cookies') {
    return <LegalPage page="cookies" />;
  }

  if (currentPath === '/privacy-requests') {
    return <LegalPage page="privacy-requests" />;
  }

  if (currentPath === '/subprocessors') {
    return <LegalPage page="subprocessors" />;
  }

  if (currentPath === '/pricing') {
    return <PublicPricingPage />;
  }

  if (authLoading) {
    return (
      <>
        <div className="min-h-screen bg-gray-900 flex items-center justify-center">
          <div className="text-gray-400 text-lg">Loading...</div>
        </div>
        <CheckoutToast status={checkoutStatus} />
      </>
    );
  }

  if (!user) {
    return (
      <>
        <AuthPage />
        <CheckoutToast status={checkoutStatus} />
      </>
    );
  }

  if (!currentProject) {
    return (
      <>
        {currentPath === '/track' ? (
          <AuthenticatedTrackShell
            currentUserId={user.id}
            userEmail={user.email}
            onGoToProjects={() => navigateToPath('/')}
            onSignOut={signOut}
          />
        ) : (
          <ProjectSelector
            onSelectProject={(project) => {
              setCurrentProject(project);
              navigateToPath('/');
            }}
            onOpenTrack={() => navigateToPath('/track')}
          />
        )}
        <CheckoutToast status={checkoutStatus} />
      </>
    );
  }

  return (
    <>
      <MainApp
        project={currentProject}
        currentUserId={user.id}
        onBackToProjects={() => {
          setCurrentProject(null);
          navigateToPath('/');
        }}
      />
      <CheckoutToast status={checkoutStatus} />
    </>
  );
}

function AuthenticatedTrackShell({ currentUserId, userEmail, onGoToProjects, onSignOut }) {
  return (
    <div className="min-h-screen bg-[#f6f2ea] flex flex-col">
      <div className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-sm font-bold text-white shadow-[0_18px_40px_-20px_rgba(15,23,42,0.7)]">
                T
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Track</p>
                <h1 className="truncate text-lg font-bold text-slate-950">Time tracking inside PM Workspace</h1>
              </div>
            </div>
            <p className="mt-2 text-sm text-slate-500">{userEmail}</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onGoToProjects}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
            >
              Projects
            </button>
            <button
              onClick={onSignOut}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <Suspense
          fallback={(
            <div className="flex h-full min-h-[320px] items-center justify-center px-4 py-10 text-sm font-medium text-slate-500">
              Loading Track...
            </div>
          )}
        >
          <TimesheetView currentUserId={currentUserId} />
        </Suspense>
      </div>

      <AuthenticatedFooter className="flex-none" />
    </div>
  );
}

function MainApp({ project, currentUserId, onBackToProjects }) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const {
    canUseAiReport, aiReportsRemaining, incrementAiReports,
    limits, effectivePlan, isAdmin, isTrialActive,
    canUseAi, canUseAiAssistant, canExportAiReport, canBaseline,
    hasTabAccess, isReadOnly, isInTaskGrace, getTaskHardLimit,
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

  // AI is available to trial, pro, team, and admin users
  // Starter users have no AI access at all
  const hasByok = isAiConfigured(aiSettings);
  const usePlatformKey = canUseAi && !hasByok;
  const aiReady = canUseAi && (hasByok || usePlatformKey);

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
    updateRegisterItem,
    deleteRegisterItem,
    toggleItemPublic,
    sendToTracker,
    addManualTrackerItem,
    removeFromTracker,
    updateTrackerItem,
    isInTracker,
    updateStatusReport,
    addTodo,
    updateTodo,
    deleteTodo,
    completeTodoFromView,
    reloadProject,
    setProjectData,
    setRegisters
  } = useProjectData(project.id, currentUserId);

  // Remove from tracker by taskId (wrapper for removeFromTracker which expects trackerId)
  const handleRemoveFromTracker = useCallback((taskId) => {
    const trackerItem = tracker.find(t => t.taskId === taskId);
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

  // Reorder task by moving from one index to another
  const handleReorderTask = useCallback((fromIndex, toIndex) => {
    setProjectData(prev => {
      const newTasks = [...prev];
      const [moved] = newTasks.splice(fromIndex, 1);
      newTasks.splice(toIndex, 0, moved);
      return newTasks;
    });
  }, [setProjectData]);

  // Navigate to schedule tab (used by TrackerView link)
  const handleNavigateToSchedule = useCallback((taskId) => {
    setActiveTab('schedule');
  }, []);

  const handleOpenFeedback = useCallback(() => {
    openFeedbackEmail({
      projectName: project?.name,
      tab: activeTab,
      subView: activeSubView,
    });
  }, [project?.name, activeTab, activeSubView]);

  const activeModuleType = activeSubView || activeTab;
  const activeModuleCount = useMemo(() => {
    if (activeModuleType === 'schedule') return projectData.length;
    if (activeModuleType === 'todo') return todos.length;
    if (activeModuleType === 'tracker') return tracker.length;
    if (SCHEMAS[activeModuleType]) return (registers[activeModuleType] || []).length;
    return null;
  }, [activeModuleType, projectData.length, todos.length, tracker.length, registers]);

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

  // Modal handlers
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
    } else {
      // Enforce task limit on Starter
      const currentCount = projectData.length;
      const hardLimit = getTaskHardLimit();

      if (currentCount >= hardLimit) {
        alert(`Task limit reached (${hardLimit}). Upgrade to Pro for more tasks per project.`);
        handleOpenPricing();
        return;
      }

      if (isInTaskGrace(currentCount)) {
        // Still allowed but warn
        const soft = limits.maxTasksPerProject;
        const remaining = hardLimit - currentCount;
        alert(`You're over the ${soft}-task limit. ${remaining} task${remaining !== 1 ? 's' : ''} remaining before the hard cap.`);
      }

      addTask(taskData, insertAfterId);
    }
  };

  // Excel Import handler
  const handleImport = async (file) => {
    try {
      setImportStatus('Importing...');
      const XLSX = await loadXLSX();

      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array', cellDates: true });
      const sheetNames = workbook.SheetNames;

      const scheduleSheet = findSheet(sheetNames, ['Schedule', 'Tasks', 'Gantt', 'Sheet1']) || sheetNames[0];
      const scheduleRows = XLSX.utils.sheet_to_json(workbook.Sheets[scheduleSheet], { raw: false });
      
      if (scheduleRows.length === 0) {
        setImportStatus('No data found in file');
        setTimeout(() => setImportStatus(null), 3000);
        return;
      }

      const tasks = parseScheduleSheet(scheduleRows);
      let importedTodosCount = 0;

      const newRegisters = {
        risks: [], issues: [], actions: [],
        minutes: [], costs: [], changes: [],
        stakeholders: [], commsplan: [], assumptions: [],
        decisions: [], lessons: [], _raci: []
      };

      const risksSheet = findSheet(sheetNames, REGISTER_IMPORT_SHEET_CANDIDATES.risks);
      if (risksSheet) {
        newRegisters.risks = parseRegisterSheet(
          XLSX.utils.sheet_to_json(workbook.Sheets[risksSheet], { raw: false }),
          REGISTER_IMPORT_COLUMN_MAPS.risks
        );
      }

      const issuesSheet = findSheet(sheetNames, REGISTER_IMPORT_SHEET_CANDIDATES.issues);
      if (issuesSheet) {
        newRegisters.issues = parseRegisterSheet(
          XLSX.utils.sheet_to_json(workbook.Sheets[issuesSheet], { raw: false }),
          REGISTER_IMPORT_COLUMN_MAPS.issues
        );
      }

      const actionsSheet = findSheet(sheetNames, REGISTER_IMPORT_SHEET_CANDIDATES.actions);
      if (actionsSheet) {
        newRegisters.actions = parseRegisterSheet(
          XLSX.utils.sheet_to_json(workbook.Sheets[actionsSheet], { raw: false }),
          REGISTER_IMPORT_COLUMN_MAPS.actions
        );
      }

      const changesSheet = findSheet(sheetNames, REGISTER_IMPORT_SHEET_CANDIDATES.changes);
      if (changesSheet) {
        newRegisters.changes = parseRegisterSheet(
          XLSX.utils.sheet_to_json(workbook.Sheets[changesSheet], { raw: false }),
          REGISTER_IMPORT_COLUMN_MAPS.changes
        );
      }

      const commsSheet = findSheet(sheetNames, REGISTER_IMPORT_SHEET_CANDIDATES.comms);
      if (commsSheet) {
        const parsedLegacyComms = parseRegisterSheet(
          XLSX.utils.sheet_to_json(workbook.Sheets[commsSheet], { raw: false }),
          REGISTER_IMPORT_COLUMN_MAPS.comms
        );
        if (newRegisters.commsplan.length === 0) {
          newRegisters.commsplan = parsedLegacyComms;
        }
      }

      const minutesSheet = findSheet(sheetNames, REGISTER_IMPORT_SHEET_CANDIDATES.minutes);
      if (minutesSheet) {
        newRegisters.minutes = parseRegisterSheet(
          XLSX.utils.sheet_to_json(workbook.Sheets[minutesSheet], { raw: false }),
          REGISTER_IMPORT_COLUMN_MAPS.minutes
        );
      }

      const costsSheet = findSheet(sheetNames, REGISTER_IMPORT_SHEET_CANDIDATES.costs);
      if (costsSheet) {
        newRegisters.costs = parseRegisterSheet(
          XLSX.utils.sheet_to_json(workbook.Sheets[costsSheet], { raw: false }),
          REGISTER_IMPORT_COLUMN_MAPS.costs
        );
      }

      const stakeholdersSheet = findSheet(sheetNames, REGISTER_IMPORT_SHEET_CANDIDATES.stakeholders);
      if (stakeholdersSheet) {
        newRegisters.stakeholders = parseRegisterSheet(
          XLSX.utils.sheet_to_json(workbook.Sheets[stakeholdersSheet], { raw: false }),
          REGISTER_IMPORT_COLUMN_MAPS.stakeholders
        );
      }

      const commsplanSheet = findSheet(sheetNames, ['Comms Plan', 'Communication Plan', 'Communications Plan']);
      if (commsplanSheet) {
        newRegisters.commsplan = parseRegisterSheet(
          XLSX.utils.sheet_to_json(workbook.Sheets[commsplanSheet], { raw: false }),
          REGISTER_IMPORT_COLUMN_MAPS.commsplan
        );
      }

      const assumptionsSheet = findSheet(sheetNames, REGISTER_IMPORT_SHEET_CANDIDATES.assumptions);
      if (assumptionsSheet) {
        newRegisters.assumptions = parseRegisterSheet(
          XLSX.utils.sheet_to_json(workbook.Sheets[assumptionsSheet], { raw: false }),
          REGISTER_IMPORT_COLUMN_MAPS.assumptions
        );
      }

      const decisionsSheet = findSheet(sheetNames, REGISTER_IMPORT_SHEET_CANDIDATES.decisions);
      if (decisionsSheet) {
        newRegisters.decisions = parseRegisterSheet(
          XLSX.utils.sheet_to_json(workbook.Sheets[decisionsSheet], { raw: false }),
          REGISTER_IMPORT_COLUMN_MAPS.decisions
        );
      }

      const lessonsSheet = findSheet(sheetNames, REGISTER_IMPORT_SHEET_CANDIDATES.lessons);
      if (lessonsSheet) {
        newRegisters.lessons = parseRegisterSheet(
          XLSX.utils.sheet_to_json(workbook.Sheets[lessonsSheet], { raw: false }),
          REGISTER_IMPORT_COLUMN_MAPS.lessons
        );
      }

      const raciSheet = findSheet(sheetNames, RACI_IMPORT_SHEET_CANDIDATES);
      if (raciSheet) {
        const parsedRaci = parseRaciSheet(
          XLSX.utils.sheet_to_json(workbook.Sheets[raciSheet], { raw: false })
        );
        if (parsedRaci) {
          newRegisters._raci = [{
            ...parsedRaci,
            updatedAt: new Date().toISOString()
          }];
        }
      }

      const todoSheet = findSheet(sheetNames, TODO_IMPORT_SHEET_CANDIDATES);
      if (todoSheet) {
        const parsedTodos = parseTodoSheet(
          XLSX.utils.sheet_to_json(workbook.Sheets[todoSheet], { raw: false })
        );
        for (const todo of parsedTodos) {
          await addTodo(todo);
        }
        importedTodosCount = parsedTodos.length;
      }

      setProjectData(tasks);
      setRegisters(prev => ({
        ...prev,
        ...Object.fromEntries(
          Object.entries(newRegisters).map(([key, val]) => [key, val.length > 0 ? val : prev[key]])
        )
      }));

      const summary = [
        `${tasks.length} tasks`,
        newRegisters.risks.length > 0 ? `${newRegisters.risks.length} risks` : null,
        newRegisters.issues.length > 0 ? `${newRegisters.issues.length} issues` : null,
        newRegisters.actions.length > 0 ? `${newRegisters.actions.length} actions` : null,
        newRegisters.changes.length > 0 ? `${newRegisters.changes.length} changes` : null,
        newRegisters.minutes.length > 0 ? `${newRegisters.minutes.length} meeting log items` : null,
        newRegisters.costs.length > 0 ? `${newRegisters.costs.length} costs` : null,
        newRegisters.stakeholders?.length > 0 ? `${newRegisters.stakeholders.length} stakeholders` : null,
        newRegisters.commsplan?.length > 0 ? `${newRegisters.commsplan.length} comms items` : null,
        newRegisters.assumptions?.length > 0 ? `${newRegisters.assumptions.length} assumptions` : null,
        newRegisters.decisions?.length > 0 ? `${newRegisters.decisions.length} decisions` : null,
        newRegisters.lessons?.length > 0 ? `${newRegisters.lessons.length} lessons` : null,
        importedTodosCount > 0 ? `${importedTodosCount} todos` : null,
        newRegisters._raci?.[0]?.assignments?._customTasks?.length > 0
          ? `${newRegisters._raci[0].assignments._customTasks.length} RACI activities`
          : null,
      ].filter(Boolean).join(', ');

      setImportStatus(`✓ Imported: ${summary}`);
      setTimeout(() => setImportStatus(null), 5000);

    } catch (err) {
      console.error('Import error:', err);
      setImportStatus('Import failed — check file format');
      setTimeout(() => setImportStatus(null), 4000);
    }
  };

  // Export to Excel (includes tracker + status report)
  const handleExport = async () => {
    try {
      setImportStatus('Exporting...');
      const XLSX = await loadXLSX();

    const wb = XLSX.utils.book_new();
    
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(projectData), "Schedule");

    // Export tracker
    if (tracker.length > 0) {
      const trackerExport = tracker.map(item => ({
        'Task Name': item.taskName,
        'Notes': item.notes,
        'Status': item.status,
        'RAG': item.rag,
        'Next Action': item.nextAction,
        'Owner': item.owner,
        'Date Added': item.dateAdded,
        'Last Updated': item.lastUpdated
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(trackerExport), "Master Tracker");
    }

    // Export status report
    if (statusReport) {
      const srExport = [{
        'Overall RAG': statusReport.overallRag,
        'Overall Narrative': statusReport.overallNarrative,
        'Main Risks': statusReport.mainRisks,
        'Main Issues': statusReport.mainIssues,
        'Deliverables This Period': statusReport.deliverablesThisPeriod,
        'Deliverables Next Period': statusReport.deliverablesNextPeriod,
        'Additional Notes': statusReport.additionalNotes
      }];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(srExport), "Status Report");
    }

    const raciData = registers?._raci?.[0];
    const raciRoles = Array.isArray(raciData?.roles)
      ? raciData.roles.map((role) => String(role || '').trim()).filter(Boolean)
      : [];
    const raciTasks = Array.isArray(raciData?.assignments?._customTasks)
      ? raciData.assignments._customTasks
      : [];

    if (raciRoles.length > 0 && raciTasks.length > 0) {
      const raciExport = raciTasks.map((taskName, idx) => {
        const row = { Activity: taskName };
        raciRoles.forEach((role) => {
          row[role] = raciData.assignments?.[`custom-${idx}::${role}`] || '';
        });
        return row;
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(raciExport), 'RACI');
    }

    const manualTodosExport = (todos || [])
      .filter((item) => !item.isDerived && (item.projectId || null) === project.id)
      .map((item) => ({
        ID: item._id,
        Title: item.title,
        'Due Date': item.dueDate,
        Owner: item.owner,
        Status: item.status,
        Recurrence: item.recurrence?.type || ''
      }));

    if (manualTodosExport.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(manualTodosExport), 'ToDo');
    }

    Object.keys(registers).forEach(key => {
      if (registers[key].length > 0) {
        const schema = SCHEMAS[key];
        if (schema) {
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(registers[key]), schema.title);
        }
      }
    });

      const fileName = `${project.name}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, fileName);
      setImportStatus(`✓ Exported: ${fileName}`);
      setTimeout(() => setImportStatus(null), 3000);
    } catch (err) {
      console.error('Export error:', err);
      setImportStatus('Export failed');
      setTimeout(() => setImportStatus(null), 4000);
    }
  };

  const handleExportAiReport = useCallback(async ({ dateFrom, dateTo, userNotes }) => {
    try {
      setImportStatus('Exporting AI report...');
      const XLSX = await loadXLSX();
      const reportData = buildAiReportExportData({
        project,
        tasks: projectData,
        registers,
        tracker,
        statusReport,
        todos,
        userNotes,
        dateFrom,
        dateTo
      });

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(reportData.instructionsRows), '00_INSTRUCTIONS');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reportData.metadataRows), '01_METADATA');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reportData.thisPeriodCompletedRows), '02_THIS_PERIOD_COMPLETED');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reportData.keyDeliverablesNextPeriodRows), '03_NEXT_PERIOD_OPEN');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reportData.mainRisksAndIssuesRows), '04_RISK_SIGNALS');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reportData.additionalNotesRows), '05_ADDITIONAL_NOTES');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reportData.outputTemplateRows), '06_OUTPUT_TEMPLATE');

      const fileName = `${reportData.fileNameBase}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, fileName);
      setImportStatus(`✓ Exported: ${fileName}`);
      setTimeout(() => setImportStatus(null), 4000);
      return { ok: true, fileName };
    } catch (err) {
      console.error('AI report export error:', err);
      setImportStatus('AI report export failed');
      setTimeout(() => setImportStatus(null), 4000);
      return { ok: false, error: err?.message || 'Unknown export error' };
    }
  }, [project, projectData, registers, tracker, statusReport, todos]);

  const handleGenerateAiReport = useCallback(async ({ dateFrom, dateTo, userNotes, signal, onChunk }) => {
    if (!aiReady) {
      return { ok: false, error: 'AI not configured. Please add your API key in settings.' };
    }

    if (!canUseAiReport) {
      return { ok: false, error: `You\u2019ve reached your AI report limit (${limits.aiReportsPerMonth}/month) for your ${effectivePlan} plan. Upgrade for more reports.` };
    }

    try {
      const userMessage = buildReportPrompt({
        project,
        tasks: projectData,
        registers,
        tracker,
        statusReport,
        todos,
        userNotes,
        dateFrom,
        dateTo
      });

      const result = await generateAiContent({
        provider: aiSettings.provider,
        apiKey: aiSettings.apiKey,
        model: aiSettings.model,
        systemPrompt: getReportSystemPrompt(),
        userMessage,
        maxTokens: 4096,
        onChunk,
        signal,
        usePlatformKey
      });

      if (result?.ok) {
        await incrementAiReports();
      }

      return result;
    } catch (err) {
      return { ok: false, error: err?.message || 'AI generation failed' };
    }
  }, [project, projectData, registers, tracker, statusReport, todos, aiSettings, canUseAiReport, incrementAiReports, limits, effectivePlan, aiReady, usePlatformKey]);

  const handleGenerateEmailDigest = useCallback(async ({ signal, onChunk }) => {
    if (!aiReady) {
      return { ok: false, error: 'AI not configured. Please add your API key in settings.' };
    }

    if (!canUseAiReport) {
      return { ok: false, error: `You\u2019ve reached your AI report limit (${limits.aiReportsPerMonth}/month) for your ${effectivePlan} plan. Upgrade for more reports.` };
    }

    try {
      const userMessage = buildEmailDigestPrompt({
        project,
        tasks: projectData,
        registers,
        tracker,
        statusReport,
        todos,
        dateFrom: null,
        dateTo: null
      });

      const result = await generateAiContent({
        provider: aiSettings.provider,
        apiKey: aiSettings.apiKey,
        model: aiSettings.model,
        systemPrompt: getEmailDigestSystemPrompt(),
        userMessage,
        maxTokens: 2048,
        onChunk,
        signal,
        usePlatformKey
      });

      if (result?.ok) {
        await incrementAiReports();
      }

      return result;
    } catch (err) {
      return { ok: false, error: err?.message || 'Email digest generation failed' };
    }
  }, [project, projectData, registers, tracker, statusReport, todos, aiSettings, canUseAiReport, incrementAiReports, limits, effectivePlan, aiReady, usePlatformKey]);

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

  /* ───────────────────────────────────────────────
   * SINGLE RESPONSIVE LAYOUT (desktop + mobile)
   * On mobile: same layout, ScheduleView hides Gantt
   * ─────────────────────────────────────────────── */
  return (
    <div className="min-h-screen h-[100dvh] flex flex-col overflow-hidden bg-slate-50">
      {/* Plan banners */}
      <TrialBanner onUpgrade={handleOpenPricing} />
      <CancellationBanner onUpgrade={handleOpenPricing} />
      <ReadOnlyBanner onUpgrade={handleOpenPricing} />

      {/* Save Status Bar */}
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
          {/* Plan Simulator — admin only */}
          {isAdmin && simulatorOptions.length > 0 && (
            <select
              value={simulatedPlan || ''}
              onChange={(e) => setSimulatedPlan(e.target.value || null)}
              className="shrink-0 text-[11px] px-1.5 py-0.5 bg-purple-900/60 border border-purple-500/50 text-purple-200 rounded cursor-pointer"
              title="Plan Simulator (admin only)"
            >
              {simulatorOptions.map(opt => (
                <option key={opt.value || 'real'} value={opt.value || ''}>{opt.label}</option>
              ))}
            </select>
          )}
          {simulatedPlan && (
            <span className="shrink-0 text-[10px] px-1.5 py-0.5 bg-purple-600 text-white rounded-full font-medium animate-pulse">
              SIM: {simulatorOptions.find(o => o.value === simulatedPlan)?.label}
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
            <span className={`shrink-0 flex items-center gap-1 ${importStatus.startsWith('✓') ? 'text-emerald-400' : importStatus === 'Importing...' ? 'text-blue-400' : 'text-amber-400'}`}>
              {importStatus}
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
          ) : saveError ? (
            <span className="shrink-0 text-rose-400 whitespace-nowrap" title={saveError}>Save failed</span>
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
        projectName={activeTab === 'timesheets' ? 'Track' : project.name}
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
        onAddRegisterItem={() => {
          if (activeTab === 'todo') {
            addTodo().then((createdTodo) => {
              if (createdTodo?._id) {
                setPendingTodoFocusId(createdTodo._id);
              }
            });
            return;
          }
          if (activeTab === 'raci') return; // RACI has its own add role button
          // Use the active sub-view for composite tabs, or the tab itself
          const target = activeSubView || activeTab;
          addRegisterItem(target);
        }}
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
      />

      <Navigation
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          // Clear sub-view for non-composite tabs so Add Entry targets the tab itself
          if (tab !== 'financials' && tab !== 'stakeholdersmgmt') {
            setActiveSubView(null);
          }
        }}
      />

      <main className="relative flex-grow min-h-0 overflow-hidden">
        <Suspense
          fallback={
            <div className="h-full flex items-center justify-center text-sm text-slate-500">
              Loading view...
            </div>
          }
        >
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
                onDeleteItem={deleteRegisterItem}
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
                onDeleteItem={deleteRegisterItem}
                onTogglePublic={toggleItemPublic}
                onSubViewChange={setActiveSubView}
              />
            </BlurOverlay>
          ) : activeTab === 'raci' ? (
            <BlurOverlay tabId="raci" onUpgrade={handleOpenPricing}>
              <RACIView
                projectData={projectData}
                registers={registers}
                setRegisters={setRegisters}
              />
            </BlurOverlay>
          ) : (
            <BlurOverlay tabId={activeTab} onUpgrade={handleOpenPricing}>
              <RegisterView
                registerType={activeTab}
                items={registers[activeTab] || []}
                isExternalView={isExternalView}
                onUpdateItem={updateRegisterItem}
                onDeleteItem={deleteRegisterItem}
                onTogglePublic={toggleItemPublic}
              />
            </BlurOverlay>
          )}
        </Suspense>
      </main>

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

      {showPricing && (
        <PricingPage onClose={() => setShowPricing(false)} />
      )}
      {showBilling && (
        <BillingScreen
          onClose={() => setShowBilling(false)}
          onOpenPricing={handleOpenPricing}
        />
      )}
    </div>
  );
}

export default App;
