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

const ScheduleView = lazy(() => import('./components/ScheduleView'));
const RegisterView = lazy(() => import('./components/RegisterView'));
const TrackerView = lazy(() => import('./components/TrackerView'));
const StatusReportView = lazy(() => import('./components/StatusReportView'));
const TodoView = lazy(() => import('./components/TodoView'));

let xlsxModulePromise = null;

async function loadXLSX() {
  if (!xlsxModulePromise) {
    xlsxModulePromise = import('xlsx').catch((err) => {
      xlsxModulePromise = null;
      throw err;
    });
  }
  const module = await xlsxModulePromise;
  return module.default?.utils ? module.default : module;
}

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

// ---------- Column name mapping helpers ----------

const COLUMN_MAP_SCHEDULE = {
  id: 'id', name: 'name', type: 'type', parent: 'parent',
  deptype: 'depType', depType: 'depType', dur: 'dur', start: 'start',
  pct: 'pct', indent: 'indent', tracked: 'tracked',
  'ID': 'id', 'Name': 'name', 'Type': 'type', 'Parent': 'parent',
  'Dependency Type': 'depType', 'Duration': 'dur', 'Start': 'start',
  '% Complete': 'pct', 'Indent Level': 'indent',
  'Start Date': 'start', 'Progress': 'pct',
  'Job Name': 'name', 'Task Name': 'name'
};

const COLUMN_MAP_RISKS = {
  'ID': 'number', 'Category': 'category', 'Risk Details': 'riskdetails',
  'Mitigating Action': 'mitigatingaction', 'Notes': 'notes',
  'Raised': 'raised', 'Owner': 'owner', 'Level': 'level', 'Internal': '_internal'
};

const COLUMN_MAP_ISSUES = {
  'ID': 'number', 'Category': 'category', 'Issue Assigned to': 'issueassignedto',
  'Description': 'description', 'Current Status': 'currentstatus',
  'Status': 'status', 'Raised': 'raised', 'Target': 'target',
  'Updated': 'updated', 'Completed': 'completed', 'Internal': '_internal'
};

const COLUMN_MAP_ACTIONS = {
  'ID': 'number', 'Description': 'description', 'Owner': 'actionassignedto',
  'Due Date': 'target', 'Status': 'status', 'Internal': '_internal',
  'Action Assigned to': 'actionassignedto', 'Current Status': 'currentstatus',
  'Raised': 'raised', 'Target': 'target', 'Completed': 'completed'
};

const COLUMN_MAP_CHANGES = {
  'ID': 'number', 'Description': 'description', 'Raised By': 'raisedby',
  'Cost': 'cost', 'Time Impact': 'timeimpact', 'Status': 'status', 'Internal': '_internal'
};

const COLUMN_MAP_COMMS = {
  'ID': 'number', 'Stakeholder': 'stakeholder', 'Info Required': 'inforequired',
  'Frequency': 'frequency', 'Method': 'method', 'Provider': 'provider', 'Internal': '_internal'
};

function mapRow(row, columnMap) {
  const mapped = {};
  Object.entries(row).forEach(([key, value]) => {
    const mappedKey = columnMap[key] || columnMap[key.trim()];
    if (mappedKey) {
      mapped[mappedKey] = value;
    }
  });
  return mapped;
}

function parseBooleanLike(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;

  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return false;
  if (['true', 'yes', 'y', '1', 'x', 'checked'].includes(normalized)) return true;
  if (['false', 'no', 'n', '0', 'off', 'unchecked'].includes(normalized)) return false;
  return false;
}

function parseScheduleSheet(rows) {
  return rows.map((row, idx) => {
    const mapped = mapRow(row, COLUMN_MAP_SCHEDULE);
    return {
      id: parseInt(mapped.id) || (idx + 1),
      name: String(mapped.name || `Task ${idx + 1}`),
      type: mapped.type === 'Milestone' ? 'Milestone' : 'Task',
      parent: mapped.parent ? parseInt(mapped.parent) : null,
      depType: mapped.depType || 'FS',
      dur: parseInt(mapped.dur) || 0,
      start: String(mapped.start || new Date().toISOString().split('T')[0]),
      pct: parseInt(mapped.pct) || 0,
      indent: parseInt(mapped.indent) || 0,
      tracked: parseBooleanLike(mapped.tracked)
    };
  }).filter(t => t.name && t.name.trim());
}

function parseRegisterSheet(rows, columnMap) {
  return rows.map((row, idx) => {
    const mapped = mapRow(row, columnMap);
    const isInternal = mapped._internal;
    delete mapped._internal;
    return {
      _id: String(mapped.number || Date.now() + idx),
      number: parseInt(mapped.number) || (idx + 1),
      visible: true,
      public: !isInternal,
      ...mapped
    };
  });
}

function findSheet(sheetNames, candidates) {
  const lower = sheetNames.map(s => s.toLowerCase());
  for (const c of candidates) {
    const idx = lower.indexOf(c.toLowerCase());
    if (idx !== -1) return sheetNames[idx];
  }
  return null;
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

      const risksSheet = findSheet(sheetNames, ['Risks', 'Risk Log', 'Risk Register']);
      if (risksSheet) {
        newRegisters.risks = parseRegisterSheet(XLSX.utils.sheet_to_json(workbook.Sheets[risksSheet], { raw: false }), COLUMN_MAP_RISKS);
      }

      const issuesSheet = findSheet(sheetNames, ['Issues', 'Issue Log', 'Issue Register']);
      if (issuesSheet) {
        newRegisters.issues = parseRegisterSheet(XLSX.utils.sheet_to_json(workbook.Sheets[issuesSheet], { raw: false }), COLUMN_MAP_ISSUES);
      }

      const actionsSheet = findSheet(sheetNames, ['Actions', 'Action Log', 'Action Register']);
      if (actionsSheet) {
        newRegisters.actions = parseRegisterSheet(XLSX.utils.sheet_to_json(workbook.Sheets[actionsSheet], { raw: false }), COLUMN_MAP_ACTIONS);
      }

      const changesSheet = findSheet(sheetNames, ['Changes', 'Change Log', 'Change Register']);
      if (changesSheet) {
        newRegisters.changes = parseRegisterSheet(XLSX.utils.sheet_to_json(workbook.Sheets[changesSheet], { raw: false }), COLUMN_MAP_CHANGES);
      }

      const commsSheet = findSheet(sheetNames, ['Comms', 'Comms Plan', 'Communications']);
      if (commsSheet) {
        newRegisters.comms = parseRegisterSheet(XLSX.utils.sheet_to_json(workbook.Sheets[commsSheet], { raw: false }), COLUMN_MAP_COMMS);
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

  if (loadingData) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-gray-400 text-lg">Loading project...</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Save Status Bar */}
      <div className="bg-gray-800 border-b border-gray-700 px-3 sm:px-4 py-1.5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-1.5 text-xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={onBackToProjects}
            className="text-gray-400 hover:text-white transition-colors flex items-center gap-1"
          >
            ← Projects
          </button>
          <span className="text-gray-600">|</span>
          <span className="text-white font-medium truncate">{project.name}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={cleanupDuplicateDescriptions}
            className="text-xs px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded transition-colors"
            title="One-time cleanup of duplicate text in Action Log"
          >
            Clean Action Log
          </button>
          {importStatus ? (
            <span className={`flex items-center gap-1 ${importStatus.startsWith('✓') ? 'text-emerald-400' : importStatus === 'Importing...' ? 'text-blue-400' : 'text-amber-400'}`}>
              {importStatus}
            </span>
          ) : saveConflict ? (
            <div className="flex items-center gap-2">
              <span className="text-rose-400">Save conflict detected</span>
              <button
                onClick={reloadProject}
                className="px-2 py-1 text-[11px] bg-rose-600 hover:bg-rose-700 text-white rounded transition-colors"
                title="Reload server version to resolve conflict"
              >
                Reload Latest
              </button>
            </div>
          ) : saveError ? (
            <span className="text-rose-400" title={saveError}>Save failed</span>
          ) : saving ? (
            <span className="text-yellow-400 flex items-center gap-1">
              <span className="animate-pulse">●</span> Saving...
            </span>
          ) : lastSaved ? (
            <span className="text-green-400 flex items-center gap-1">
              ✓ Saved {lastSaved.toLocaleTimeString()}
            </span>
          ) : (
            <span className="text-gray-500">Ready</span>
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
    </div>
  );
}

export default App;
