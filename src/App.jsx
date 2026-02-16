import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import Header from './components/Header';
import Navigation from './components/Navigation';
import ScheduleView from './components/ScheduleView';
import RegisterView from './components/RegisterView';
import TaskModal from './components/TaskModal';
import { useProjectData } from './hooks/useProjectData';
import './styles/index.css';

function App() {
  const [activeTab, setActiveTab] = useState('schedule');
  const [viewMode, setViewMode] = useState('week');
  const [isExternalView, setIsExternalView] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [insertAfterId, setInsertAfterId] = useState(null);

  const {
    projectData,
    registers,
    addTask,
    updateTask,
    deleteTask,
    modifyHierarchy,
    toggleTrackTask,
    loadTemplate,
    addRegisterItem,
    updateRegisterItem,
    deleteRegisterItem,
    toggleItemPublic
  } = useProjectData();

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
    
    // Add schedule sheet
    XLSX.utils.book_append_sheet(
      wb, 
      XLSX.utils.json_to_sheet(projectData), 
      "Schedule"
    );

    // Add register sheets
    Object.keys(registers).forEach(key => {
      if (registers[key].length > 0) {
        const schema = require('./utils/constants').SCHEMAS[key];
        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.json_to_sheet(registers[key]),
          schema.title
        );
      }
    });

    // Download file
    const fileName = `Project_Plan_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Header
        taskCount={projectData.length}
        isExternalView={isExternalView}
        onToggleExternalView={() => setIsExternalView(!isExternalView)}
        onLoadTemplate={loadTemplate}
        onExport={handleExport}
        onNewTask={() => handleOpenModal()}
        onAddRegisterItem={() => addRegisterItem(activeTab)}
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
