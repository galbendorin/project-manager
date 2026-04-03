import React, { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { SCHEMAS } from '../utils/constants';
import { getCurrentDate } from '../utils/helpers';
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
} from '../utils/importParsers';
import { buildAiReportExportData } from '../utils/aiReportExport';
import { loadAiSettings, isAiConfigured } from '../utils/aiSettings';
import { generateAiContent } from '../utils/aiClient';
import {
  buildReportPrompt,
  getReportSystemPrompt,
  buildEmailDigestPrompt,
  getEmailDigestSystemPrompt
} from '../utils/aiPrompts';
import { openFeedbackEmail } from '../utils/feedback';
import AccentThemePicker from './AccentThemePicker';
import MobileQuickCapture from './MobileQuickCapture';

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

export function MainApp({ project, currentUserId, accentTheme, onAccentThemeChange, onBackToProjects, isOnline }) {
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
  const [isQuickCaptureOpen, setIsQuickCaptureOpen] = useState(false);
  const [quickCaptureMode, setQuickCaptureMode] = useState('task');
  const [quickCaptureText, setQuickCaptureText] = useState('');
  const [quickCaptureSaving, setQuickCaptureSaving] = useState(false);
  const [quickCaptureStatus, setQuickCaptureStatus] = useState('');

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
    offlinePendingSync,
    usingOfflineSnapshot,
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
    reorderTrackerItems,
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
    if (!quickCaptureStatus) return undefined;
    const timeoutId = window.setTimeout(() => setQuickCaptureStatus(''), 3200);
    return () => window.clearTimeout(timeoutId);
  }, [quickCaptureStatus]);

  const handleOpenQuickCapture = useCallback(() => {
    setQuickCaptureMode(activeTab === 'actions' ? 'action' : 'task');
    setQuickCaptureStatus('');
    setIsQuickCaptureOpen(true);
  }, [activeTab]);

  const handleCloseQuickCapture = useCallback(() => {
    if (quickCaptureSaving) return;
    setIsQuickCaptureOpen(false);
    setQuickCaptureText('');
  }, [quickCaptureSaving]);

  const handleSubmitQuickCapture = useCallback(async () => {
    const trimmedText = String(quickCaptureText || '').trim();
    if (!trimmedText || quickCaptureSaving) return;

    setQuickCaptureSaving(true);

    try {
      if (quickCaptureMode === 'action') {
        const today = getCurrentDate();
        const ts = new Date().toISOString();

        setRegisters((prev) => {
          const currentActions = Array.isArray(prev.actions) ? prev.actions : [];
          const nextNumber = currentActions.length + 1;
          return {
            ...prev,
            actions: [
              ...currentActions,
              {
                _id: `quick_action_${Date.now()}`,
                visible: true,
                public: true,
                rowColor: null,
                number: String(nextNumber),
                category: 'Quick capture',
                actionassignedto: '',
                description: trimmedText,
                currentstatus: 'Captured on mobile',
                status: 'Open',
                raised: today,
                target: '',
                update: today,
                completed: '',
                createdAt: ts,
                updatedAt: ts,
              }
            ]
          };
        });

        setQuickCaptureStatus(
          isOnline
            ? 'Action added to the project.'
            : 'Action saved offline. It will sync when your connection returns.'
        );
      } else {
        await addTodo({
          title: trimmedText,
          dueDate: '',
          owner: '',
          projectId: project.id,
        });
        setQuickCaptureStatus(
          isOnline
            ? 'Task added to the project.'
            : 'Task saved offline. It will sync when your connection returns.'
        );
      }

      setQuickCaptureText('');
      setIsQuickCaptureOpen(false);
    } finally {
      setQuickCaptureSaving(false);
    }
  }, [addTodo, isOnline, project.id, quickCaptureMode, quickCaptureSaving, quickCaptureText, setRegisters]);

  const activeModuleType = activeSubView || activeTab;
  const activeModuleCount = useMemo(() => {
    if (activeModuleType === 'schedule') return projectData.length;
    if (activeModuleType === 'todo') return todos.length;
    if (activeModuleType === 'tracker') return tracker.length;
    if (SCHEMAS[activeModuleType]) return (registers[activeModuleType] || []).length;
    return null;
  }, [activeModuleType, projectData.length, registers, todos.length, tracker.length]);

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

      const parseIntoRegister = (sheetCandidates, mapKey, targetKey) => {
        const sheet = findSheet(sheetNames, sheetCandidates);
        if (sheet) {
          newRegisters[targetKey] = parseRegisterSheet(
            XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { raw: false }),
            REGISTER_IMPORT_COLUMN_MAPS[mapKey]
          );
        }
      };

      parseIntoRegister(REGISTER_IMPORT_SHEET_CANDIDATES.risks, 'risks', 'risks');
      parseIntoRegister(REGISTER_IMPORT_SHEET_CANDIDATES.issues, 'issues', 'issues');
      parseIntoRegister(REGISTER_IMPORT_SHEET_CANDIDATES.actions, 'actions', 'actions');
      parseIntoRegister(REGISTER_IMPORT_SHEET_CANDIDATES.changes, 'changes', 'changes');
      parseIntoRegister(REGISTER_IMPORT_SHEET_CANDIDATES.minutes, 'minutes', 'minutes');
      parseIntoRegister(REGISTER_IMPORT_SHEET_CANDIDATES.costs, 'costs', 'costs');
      parseIntoRegister(REGISTER_IMPORT_SHEET_CANDIDATES.stakeholders, 'stakeholders', 'stakeholders');
      parseIntoRegister(REGISTER_IMPORT_SHEET_CANDIDATES.assumptions, 'assumptions', 'assumptions');
      parseIntoRegister(REGISTER_IMPORT_SHEET_CANDIDATES.decisions, 'decisions', 'decisions');
      parseIntoRegister(REGISTER_IMPORT_SHEET_CANDIDATES.lessons, 'lessons', 'lessons');

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

      const commsplanSheet = findSheet(sheetNames, ['Comms Plan', 'Communication Plan', 'Communications Plan']);
      if (commsplanSheet) {
        newRegisters.commsplan = parseRegisterSheet(
          XLSX.utils.sheet_to_json(workbook.Sheets[commsplanSheet], { raw: false }),
          REGISTER_IMPORT_COLUMN_MAPS.commsplan
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
      setRegisters((prev) => ({
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

  const handleExport = async () => {
    try {
      setImportStatus('Exporting...');
      const XLSX = await loadXLSX();
      const wb = XLSX.utils.book_new();

      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(projectData), 'Schedule');

      if (tracker.length > 0) {
        const trackerExport = tracker.map((item) => ({
          'Task Name': item.taskName,
          'Notes': item.notes,
          'Status': item.status,
          'RAG': item.rag,
          'Next Action': item.nextAction,
          'Owner': item.owner,
          'Date Added': item.dateAdded,
          'Last Updated': item.lastUpdated
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(trackerExport), 'Master Tracker');
      }

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
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(srExport), 'Status Report');
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

      Object.keys(registers).forEach((key) => {
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
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reportData.governanceContextRows), '05_GOVERNANCE_CONTEXT');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reportData.controlSignalRows), '06_CONTROL_SIGNALS');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reportData.projectContextRows), '07_PROJECT_CONTEXT');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reportData.additionalNotesRows), '08_ADDITIONAL_NOTES');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reportData.outputTemplateRows), '09_OUTPUT_TEMPLATE');

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
      return { ok: false, error: `You’ve reached your AI report limit (${limits.aiReportsPerMonth}/month) for your ${effectivePlan} plan. Upgrade for more reports.` };
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
      return { ok: false, error: `You’ve reached your AI report limit (${limits.aiReportsPerMonth}/month) for your ${effectivePlan} plan. Upgrade for more reports.` };
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
          ) : !isOnline && offlinePendingSync ? (
            <span className="shrink-0 text-amber-300 whitespace-nowrap">Offline changes queued</span>
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
        onAddRegisterItem={() => {
          if (activeTab === 'todo') {
            addTodo().then((createdTodo) => {
              if (createdTodo?._id) {
                setPendingTodoFocusId(createdTodo._id);
              }
            });
            return;
          }
          if (activeTab === 'raci' || activeTab === 'tracker' || activeTab === 'statusreport') return;
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

      {isMobile && !showPricing && !showBilling && !isModalOpen ? (
        <MobileQuickCapture
          isOpen={isQuickCaptureOpen}
          mode={quickCaptureMode}
          value={quickCaptureText}
          saving={quickCaptureSaving}
          isOnline={isOnline}
          projectName={project.name}
          statusMessage={quickCaptureStatus}
          onOpen={handleOpenQuickCapture}
          onClose={handleCloseQuickCapture}
          onModeChange={setQuickCaptureMode}
          onValueChange={setQuickCaptureText}
          onSubmit={handleSubmitQuickCapture}
        />
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
