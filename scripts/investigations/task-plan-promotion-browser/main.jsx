import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MainApp } from '../../../src/components/AppWorkspaceShell';
import '../../../src/styles/index.css';
import { controls, getProject, userId } from './synthetic';
function Fixture() {
  const [project, setProject] = useState(getProject()); const [request, setRequest] = useState(null);
  const [lastTab, setLastTab] = useState('');
  return <div className="flex h-dvh flex-col"><aside className="relative z-[110] flex shrink-0 flex-wrap items-center gap-3 bg-amber-50 p-2 text-xs"><strong>Synthetic promotion · no hosted writes</strong><button onClick={() => { controls.failSave(); setLastTab('Next save will fail'); }}>Fail next save</button><button onClick={() => { controls.remoteChange(); setLastTab('Synthetic remote edit confirmed'); }}>Simulate remote change</button><span>{lastTab}</span></aside><MainApp project={project} currentUserId={userId} currentUserName="Synthetic owner" isOnline={true} onBackToProjects={() => setLastTab('Back remains usable')} onOpenSourceTodo={(todo, options) => { setRequest({ todo, mode: options?.mode || 'source', ownerId: userId, projectId: project.id, id: crypto.randomUUID() }); setProject(getProject()); return Promise.resolve(true); }} sourceNavigation={request} onSourceNavigationHandled={() => setRequest(null)} /></div>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
