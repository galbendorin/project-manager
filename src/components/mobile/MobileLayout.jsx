import React, { useState, useCallback, lazy, Suspense } from 'react';
import BottomNav from './BottomNav';
import MobileHeader from './MobileHeader';
import MobileHome from './MobileHome';
import MobilePlan from './MobilePlan';
import MobileTodo from './MobileTodo';
import MobileLogs from './MobileLogs';
import MobileMore from './MobileMore';
import TaskDetailSheet from './TaskDetailSheet';

const TrackerView = lazy(() => import('../TrackerView'));
const StatusReportView = lazy(() => import('../StatusReportView'));

const MobileLayout = ({
  // Project data
  project,
  projectData,
  registers,
  tracker,
  statusReport,
  todos,
  baseline,
  // Save state
  saving,
  lastSaved,
  saveConflict,
  // Data operations
  updateTask,
  deleteTask,
  addRegisterItem,
  updateRegisterItem,
  deleteRegisterItem,
  toggleItemPublic,
  sendToTracker,
  toggleTrackTask,
  removeFromTracker,
  updateTrackerItem,
  isInTracker,
  updateStatusReport,
  addTodo,
  updateTodo,
  deleteTodo,
  // Actions
  onBackToProjects,
  onExport,
  onImport,
  onLoadTemplate,
  onResetDemoData,
  onSetBaseline,
  onClearBaseline,
  onShowDemoBenefits,
  onOpenAiSettings,
  onNewTask,
  // AI
  onExportAiReport,
  onGenerateAiReport,
  onGenerateEmailDigest,
  aiConfigured,
  onAiSettingsChange,
  // Other
  currentUserId,
  isExternalView,
}) => {
  const [activeTab, setActiveTab] = useState('home');
  const [selectedTask, setSelectedTask] = useState(null);
  const [moreSubView, setMoreSubView] = useState(null); // 'tracker' | 'statusreport' | null

  const handleTaskTap = useCallback((task) => {
    setSelectedTask(task);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedTask(null);
  }, []);

  const handleAddRegisterItem = useCallback((registerType) => {
    addRegisterItem(registerType);
  }, [addRegisterItem]);

  const handleTabChange = useCallback((tab) => {
    setActiveTab(tab);
    setMoreSubView(null); // Reset sub-views when changing tabs
  }, []);

  const handleNavigateToTracker = useCallback((view) => {
    if (view === 'statusreport') {
      setActiveTab('more');
      setMoreSubView('statusreport');
    } else {
      setActiveTab('more');
      setMoreSubView('tracker');
    }
  }, []);

  const handleSendToTracker = useCallback((taskId) => {
    sendToTracker(taskId);
  }, [sendToTracker]);

  const handleSendToActionLog = useCallback((taskId) => {
    toggleTrackTask(taskId, true);
  }, [toggleTrackTask]);

  // Track item removal via the tracker view
  const handleRemoveFromTracker = useCallback((trackerId) => {
    removeFromTracker(trackerId);
  }, [removeFromTracker]);

  const renderContent = () => {
    // Sub-views from More tab
    if (activeTab === 'more' && moreSubView === 'tracker') {
      return (
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-2 px-4 py-3 bg-white border-b border-slate-100">
            <button onClick={() => setMoreSubView(null)} className="text-sm font-semibold text-indigo-600">← Back</button>
            <span className="text-sm font-bold text-slate-800">Master Tracker</span>
          </div>
          <div className="flex-1 overflow-auto">
            <Suspense fallback={<div className="p-4 text-sm text-slate-400">Loading...</div>}>
              <TrackerView
                trackerItems={tracker}
                tasks={projectData}
                onUpdateItem={updateTrackerItem}
                onRemoveItem={removeFromTracker}
                onNavigateToSchedule={() => { setActiveTab('plan'); setMoreSubView(null); }}
              />
            </Suspense>
          </div>
        </div>
      );
    }

    if (activeTab === 'more' && moreSubView === 'statusreport') {
      return (
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-2 px-4 py-3 bg-white border-b border-slate-100">
            <button onClick={() => setMoreSubView(null)} className="text-sm font-semibold text-indigo-600">← Back</button>
            <span className="text-sm font-bold text-slate-800">Status Report</span>
          </div>
          <div className="flex-1 overflow-auto">
            <Suspense fallback={<div className="p-4 text-sm text-slate-400">Loading...</div>}>
              <StatusReportView
                tasks={projectData}
                baseline={baseline}
                registers={registers}
                tracker={tracker}
                statusReport={statusReport}
                onUpdateStatusReport={updateStatusReport}
                onExportAiReport={onExportAiReport}
                onGenerateAiReport={onGenerateAiReport}
                onGenerateEmailDigest={onGenerateEmailDigest}
                aiConfigured={aiConfigured}
                onAiSettingsChange={onAiSettingsChange}
                projectName={project.name}
              />
            </Suspense>
          </div>
        </div>
      );
    }

    switch (activeTab) {
      case 'home':
        return (
          <div className="flex-1 overflow-y-auto bg-slate-50/50">
            <MobileHome
              tasks={projectData}
              registers={registers}
              statusReport={statusReport}
              onUpdateTask={updateTask}
            />
          </div>
        );
      case 'plan':
        return (
          <MobilePlan
            tasks={projectData}
            onTaskTap={handleTaskTap}
          />
        );
      case 'todo':
        return (
          <MobileTodo
            todos={todos}
            projectData={projectData}
            registers={registers}
            tracker={tracker}
            currentProject={project}
            currentUserId={currentUserId}
            onUpdateTodo={updateTodo}
            onDeleteTodo={deleteTodo}
          />
        );
      case 'logs':
        return (
          <MobileLogs
            registers={registers}
            isExternalView={isExternalView}
            onUpdateItem={updateRegisterItem}
            onDeleteItem={deleteRegisterItem}
            onTogglePublic={toggleItemPublic}
            onAddItem={handleAddRegisterItem}
          />
        );
      case 'more':
        return (
          <MobileMore
            onNavigateToTracker={handleNavigateToTracker}
            onExport={onExport}
            onImport={onImport}
            onLoadTemplate={onLoadTemplate}
            onResetDemoData={onResetDemoData}
            onSetBaseline={onSetBaseline}
            onClearBaseline={onClearBaseline}
            hasBaseline={!!baseline}
            onShowDemoBenefits={onShowDemoBenefits}
            onBackToProjects={onBackToProjects}
            isDemoProject={!!project?.is_demo}
            onOpenAiSettings={onOpenAiSettings}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-white">
      <MobileHeader
        projectName={project.name}
        taskCount={projectData.length}
        saving={saving}
        lastSaved={lastSaved}
        saveConflict={saveConflict}
        onNewTask={onNewTask}
        onBackToProjects={onBackToProjects}
      />

      <main className="flex-1 overflow-hidden flex flex-col">
        {renderContent()}
      </main>

      <BottomNav
        activeTab={activeTab}
        onTabChange={handleTabChange}
      />

      {/* Task detail sheet overlay */}
      {selectedTask && (
        <TaskDetailSheet
          task={selectedTask}
          allTasks={projectData}
          onClose={handleCloseDetail}
          onUpdateTask={updateTask}
          onDeleteTask={deleteTask}
          onSendToTracker={handleSendToTracker}
          onSendToActionLog={handleSendToActionLog}
        />
      )}
    </div>
  );
};

export default MobileLayout;
