import React, { useState, useCallback, lazy, Suspense } from 'react';
import { SCHEMAS } from './utils/constants';
import { useAuth } from './contexts/AuthContext';
import AuthPage from './components/AuthPage';
import ProjectSelector from './components/ProjectSelector';
import Header from './components/Header';
import Navigation from './components/Navigation';
import TaskModal from './components/TaskModal';
import DemoBenefitsModal from './components/DemoBenefitsModal';
import { useProjectData } from './hooks/useProjectData';
import {
  loadXLSX,
  parseScheduleSheet,
  parseRegisterSheet,
  findSheet,
  REGISTER_IMPORT_COLUMN_MAPS,
  REGISTER_IMPORT_SHEET_CANDIDATES
} from './utils/importParsers';
import { buildAiReportExportData } from './utils/aiReportExport';
import { calculateSchedule } from './utils/helpers';
import { loadAiSettings, isAiConfigured } from './utils/aiSettings';
import { generateAiContent } from './utils/aiClient';
import { buildReportPrompt, getReportSystemPrompt, buildPlanPrompt, getPlanSystemPrompt, buildEditPrompt, getEditSystemPrompt, buildEmailDigestPrompt, getEmailDigestSystemPrompt } from './utils/aiPrompts';

const ScheduleView = lazy(() => import('./components/ScheduleView'));
const RegisterView = lazy(() => import('./components/RegisterView'));
const TrackerView = lazy(() => import('./components/TrackerView'));
const StatusReportView = lazy(() => import('./components/StatusReportView'));
const TodoView = lazy(() => import('./components/TodoView'));
const AiAssistantPanel = lazy(() => import('./components/AiAssistantPanel'));
const AiSettingsModal = lazy(() => import('./components/AiSettingsModal'));

function App() {
  const { user, loading: authLoading } = useAuth();
  const [currentProject, setCurrentProject] = useState(null);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-gray-400 text-lg">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  if (!currentProject) {
    return <ProjectSelector onSelectProject={setCurrentProject} />;
  }

  return (
    <MainApp
      project={currentProject}
      currentUserId={user.id}
      onBackToProjects={() => setCurrentProject(null)}
    />
  );
}

function MainApp({ project, currentUserId, onBackToProjects }) {
  const [activeTab, setActiveTab] = useState('schedule');
  const [viewMode, setViewMode] = useState('week');
  const [isExternalView, setIsExternalView] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [insertAfterId, setInsertAfterId] = useState(null);
  const [importStatus, setImportStatus] = useState(null);
  const [isBenefitsOpen, setIsBenefitsOpen] = useState(false);
  const [aiSettings, setAiSettings] = useState(() => loadAiSettings());
  const [showAiSettingsModal, setShowAiSettingsModal] = useState(false);
  const [showAiAssistant, setShowAiAssistant] = useState(false);

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
    removeFromTracker,
    updateTrackerItem,
    isInTracker,
    updateStatusReport,
    addTodo,
    updateTodo,
    deleteTodo,
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

  // ONE-TIME CLEANUP: Fix duplicate descriptions in Action Log
  const cleanupDuplicateDescriptions = useCallback(() => {
    setRegisters(prev => {
      const cleanedActions = prev.actions.map(action => {
        if (action.description) {
          // Remove duplicate text patterns like "Text\nText" or "Text Text"
          const cleaned = action.description
            .trim()
            .replace(/(.+)\n\1/g, '$1')  // Remove newline duplicates
            .replace(/^(.+?)\s+\1$/g, '$1');  // Remove space duplicates
          
          return {
            ...action,
            description: cleaned
          };
        }
        return action;
      });
      
      return {
        ...prev,
        actions: cleanedActions
      };
    });
    
    alert('Action Log descriptions have been cleaned! Check the Action Log tab.');
  }, [setRegisters]);

  const handleLoadDemoData = useCallback(() => {
    const proceed = window.confirm(
      'Load SD-WAN demo plan and fill all tabs with sample content? This will replace current demo content in this project.'
    );
    if (!proceed) return;
    loadDemoDataAllTabs();
    setImportStatus('✓ Demo data loaded across all tabs');
    setTimeout(() => setImportStatus(null), 4000);
  }, [loadDemoDataAllTabs]);

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

      const newRegisters = {
        risks: [], issues: [], actions: [],
        minutes: [], costs: [], changes: [], comms: []
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
        newRegisters.comms = parseRegisterSheet(
          XLSX.utils.sheet_to_json(workbook.Sheets[commsSheet], { raw: false }),
          REGISTER_IMPORT_COLUMN_MAPS.comms
        );
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
        newRegisters.comms.length > 0 ? `${newRegisters.comms.length} comms` : null,
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
    if (!isAiConfigured(aiSettings)) {
      return { ok: false, error: 'AI not configured. Please add your API key in settings.' };
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
        signal
      });

      return result;
    } catch (err) {
      return { ok: false, error: err?.message || 'AI generation failed' };
    }
  }, [project, projectData, registers, tracker, statusReport, todos, aiSettings]);

  const handleGenerateEmailDigest = useCallback(async ({ signal, onChunk }) => {
    if (!isAiConfigured(aiSettings)) {
      return { ok: false, error: 'AI not configured. Please add your API key in settings.' };
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
        signal
      });

      return result;
    } catch (err) {
      return { ok: false, error: err?.message || 'Email digest generation failed' };
    }
  }, [project, projectData, registers, tracker, statusReport, todos, aiSettings]);

  const handleAiSettingsChange = useCallback((newSettings) => {
    setAiSettings(newSettings);
  }, []);

  const handleAiAssistant = useCallback(async ({ instruction, currentTasks, signal, onChunk }) => {
    if (!isAiConfigured(aiSettings)) {
      return { ok: false, error: 'AI not configured. Please add your API key in settings.' };
    }

    try {
      const hasExistingPlan = currentTasks && currentTasks.length > 0;
      const systemPrompt = hasExistingPlan ? getEditSystemPrompt() : getPlanSystemPrompt();
      const userMessage = hasExistingPlan
        ? buildEditPrompt(currentTasks, instruction)
        : buildPlanPrompt(instruction);

      const result = await generateAiContent({
        provider: aiSettings.provider,
        apiKey: aiSettings.apiKey,
        model: aiSettings.model,
        systemPrompt,
        userMessage,
        maxTokens: 8192,
        onChunk,
        signal
      });

      return result;
    } catch (err) {
      return { ok: false, error: err?.message || 'AI assistant failed' };
    }
  }, [aiSettings]);

  const handleApplyAiTasks = useCallback((aiTasks) => {
    if (!aiTasks || !Array.isArray(aiTasks)) return;

    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    // Map AI output to proper task objects with required fields
    const normalizedTasks = aiTasks.map((task, idx) => ({
      id: task.id ?? idx + 1,
      name: task.name || 'Untitled',
      type: task.type || 'Task',
      indent: task.indent || 0,
      dur: task.dur ?? (task.type === 'Milestone' ? 0 : 1),
      start: task.start || today,
      parent: task.parent ?? null,
      depType: task.depType || 'FS',
      pct: task.pct || 0,
      owner: task.owner || '',
      tracked: false,
      dependencies: Array.isArray(task.dependencies) ? task.dependencies : [],
      createdAt: now,
      updatedAt: now
    }));

    setProjectData(calculateSchedule(normalizedTasks));
  }, [setProjectData]);

  if (loadingData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 flex items-center justify-center">
        <div className="flex items-center gap-2.5 text-slate-400 text-sm">
          <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading project...
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Top Bar */}
      <div className="bg-white border-b border-slate-200 px-3 sm:px-4 py-2 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={onBackToProjects}
            className="text-slate-400 hover:text-indigo-600 transition-colors flex items-center gap-1 text-[12px]"
          >
            ← Projects
          </button>
          <span className="text-slate-200">|</span>
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-lg flex items-center justify-center text-white font-bold text-[10px] flex-shrink-0">P</div>
            <span className="text-slate-800 font-semibold truncate text-[13px]">{project.name}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {importStatus ? (
            <span className={`flex items-center gap-1 text-[12px] ${importStatus.startsWith('✓') ? 'text-emerald-500' : importStatus === 'Importing...' ? 'text-blue-500' : 'text-amber-500'}`}>
              {importStatus}
            </span>
          ) : saveConflict ? (
            <div className="flex items-center gap-2">
              <span className="text-rose-500 text-[12px]">Save conflict</span>
              <button
                onClick={reloadProject}
                className="px-2 py-1 text-[11px] bg-rose-500 hover:bg-rose-600 text-white rounded-md transition-colors"
              >
                Reload
              </button>
            </div>
          ) : saveError ? (
            <span className="text-rose-500 text-[12px]" title={saveError}>Save failed</span>
          ) : saving ? (
            <span className="text-amber-500 text-[12px] flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              Saving
            </span>
          ) : lastSaved ? (
            <span className="text-emerald-500 text-[12px] flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Saved {lastSaved.toLocaleTimeString()}
            </span>
          ) : (
            <span className="text-slate-400 text-[12px] flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
              Ready
            </span>
          )}
        </div>
      </div>

      <Header
        taskCount={projectData.length}
        isExternalView={isExternalView}
        onToggleExternalView={() => setIsExternalView(!isExternalView)}
        onShowDemoBenefits={() => setIsBenefitsOpen(true)}
        onLoadTemplate={handleLoadDemoData}
        onResetDemoData={handleResetDemoData}
        onExport={handleExport}
        onImport={handleImport}
        onNewTask={() => handleOpenModal()}
        onAddRegisterItem={() => {
          if (activeTab === 'todo') {
            addTodo();
            return;
          }
          addRegisterItem(activeTab);
        }}
        addEntryLabel={activeTab === 'todo' ? 'Add ToDo' : 'Add Entry'}
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
        onTabChange={setActiveTab}
      />

      <main className="flex-grow overflow-hidden relative">
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
            />
          ) : activeTab === 'tracker' ? (
            <TrackerView
              trackerItems={tracker}
              tasks={projectData}
              onUpdateItem={updateTrackerItem}
              onRemoveItem={removeFromTracker}
              onNavigateToSchedule={handleNavigateToSchedule}
            />
          ) : activeTab === 'statusreport' ? (
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
              aiConfigured={isAiConfigured(aiSettings)}
              onAiSettingsChange={handleAiSettingsChange}
              projectName={project.name}
            />
          ) : activeTab === 'todo' ? (
            <TodoView
              todos={todos}
              projectData={projectData}
              registers={registers}
              tracker={tracker}
              currentProject={project}
              currentUserId={currentUserId}
              isExternalView={isExternalView}
              onUpdateTodo={updateTodo}
              onDeleteTodo={deleteTodo}
            />
          ) : (
            <RegisterView
              registerType={activeTab}
              items={registers[activeTab] || []}
              isExternalView={isExternalView}
              onUpdateItem={updateRegisterItem}
              onDeleteItem={deleteRegisterItem}
              onTogglePublic={toggleItemPublic}
            />
          )}
        </Suspense>
      </main>

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

      {/* AI Assistant floating button — visible on Project Plan tab */}
      {activeTab === 'schedule' && !showAiAssistant && (
        <button
          onClick={() => setShowAiAssistant(true)}
          className="fixed bottom-6 right-6 z-30 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full w-12 h-12 shadow-lg flex items-center justify-center transition-all hover:scale-105"
          title="AI Plan Assistant"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
          </svg>
        </button>
      )}

      {/* AI Assistant slide-out panel */}
      <Suspense fallback={null}>
        <AiAssistantPanel
          isOpen={showAiAssistant}
          onClose={() => setShowAiAssistant(false)}
          aiSettings={aiSettings}
          currentTasks={projectData}
          onApplyTasks={handleApplyAiTasks}
          onOpenSettings={() => setShowAiSettingsModal(true)}
        />
        {showAiSettingsModal && (
          <AiSettingsModal
            onClose={() => setShowAiSettingsModal(false)}
            onSettingsChange={handleAiSettingsChange}
          />
        )}
      </Suspense>
    </div>
  );
}

export default App;
