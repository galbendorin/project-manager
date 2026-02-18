import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { SCHEMAS } from './utils/constants';
import { useAuth } from './contexts/AuthContext';
import AuthPage from './components/AuthPage';
import ProjectSelector from './components/ProjectSelector';
import Header from './components/Header';
import Navigation from './components/Navigation';
import ScheduleView from './components/ScheduleView';
import RegisterView from './components/RegisterView';
import TaskModal from './components/TaskModal';
import { useProjectData } from './hooks/useProjectData';

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
      onBackToProjects={() => setCurrentProject(null)}
    />
  );
}

function MainApp({ project, onBackToProjects }) {
  const [activeTab, setActiveTab] = useState('schedule');
  const [viewMode, setViewMode] = useState('week');
  const [isExternalView, setIsExternalView] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [insertAfterId, setInsertAfterId] = useState(null);

  const {
    projectData,
    registers,
    baseline,
    saving,
    lastSaved,
    loadingData,
    addTask,
    updateTask,
    deleteTask,
    modifyHierarchy,
    toggleTrackTask,
    loadTemplate,
    setBaseline,
    clearBaseline,
    addRegisterItem,
    updateRegisterItem,
    deleteRegisterItem,
    toggleItemPublic
  } = useProjectData(project.id);

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

  // Export to Excel
  const handleExport = () => {
    const wb = XLSX.utils.book_new();
    
    XLSX.utils.book_append_sheet(
      wb, 
      XLSX.utils.json_to_sheet(projectData), 
      "Schedule"
    );

    Object.keys(registers).forEach(key => {
      if (registers[key].length > 0) {
        const schema = SCHEMAS[key];
        if (schema) {
          XLSX.utils.book_append_sheet(
            wb,
            XLSX.utils.json_to_sheet(registers[key]),
            schema.title
          );
        }
      }
    });

    const fileName = `${project.name}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
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
      <div className="bg-gray-800 border-b border-gray-700 px-4 py-1.5 flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToProjects}
            className="text-gray-400 hover:text-white transition-colors flex items-center gap-1"
          >
            ← Projects
          </button>
          <span className="text-gray-600">|</span>
          <span className="text-white font-medium">{project.name}</span>
        </div>
        <div className="flex items-center gap-2">
          {saving ? (
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
        onLoadTemplate={loadTemplate}
        onExport={handleExport}
        onNewTask={() => handleOpenModal()}
        onAddRegisterItem={() => addRegisterItem(activeTab)}
        onSetBaseline={setBaseline}
        onClearBaseline={clearBaseline}
        hasBaseline={!!baseline}
        activeTab={activeTab}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      <Navigation
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      <main className="flex-grow overflow-hidden relative">
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
      </main>

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
