import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import TodoView from '../../../src/components/TodoView';
import '../../../src/styles/index.css';
import { mapManualTodoRow } from '../../../src/hooks/projectData/manualTodoUtils';
import { controls, getRows, project, updateSyntheticTodo, userId } from './synthetic';
localStorage.setItem('pmworkspace:todo-view-mode:v1', JSON.stringify({ mode: 'matrix' }));
function Fixture() {
  const [currentRows, setCurrentRows] = useState([]);
  const [writes, setWrites] = useState(0);
  const [source, setSource] = useState('');
  useEffect(() => { const update = () => { setWrites(controls.stats()); setCurrentRows(getRows().filter((row) => row.project_id === project.id).map(mapManualTodoRow)); }; window.addEventListener('synthetic-update', update); return () => window.removeEventListener('synthetic-update', update); }, []);
  return <><aside className="flex flex-wrap items-center gap-3 bg-amber-50 p-3 text-xs"><strong>Synthetic Today checks · no hosted writes</strong><button onClick={controls.failSave}>Fail next save</button><button onClick={controls.failLoad}>Fail next load</button><span>Confirmed synthetic saves: {writes}</span><span>{source}</span></aside><TodoView todos={currentRows} projectData={[]} registers={{}} tracker={[]} currentProject={project} currentUserId={userId} currentUserName="Test person" isExternalView={false} onCompleteTodo={async () => {}} onUpdateTodo={updateSyntheticTodo} onOpenSourceTodo={(todo) => setSource(`Source navigation requested: ${todo.source}`)} /></>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
