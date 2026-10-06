import React, { useState } from 'react';
import { promotionEligibility } from '../utils/taskPlanPromotion';

export default function TaskPlanSourceControls({ todo, onMove, onOpen, onReturn, projects = [] }) {
  const [projectId, setProjectId] = useState('');
  const eligibility = promotionEligibility(todo);
  if (eligibility.link) return <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
    <button type="button" onClick={() => onOpen?.(todo)} className="min-h-11 rounded-lg border px-3 text-sm">Open in Project Plan</button>
    {onReturn && (todo.meta?.projectPlanLink || todo.planLink) ? <button type="button" onClick={() => onReturn(todo)} className="min-h-11 rounded-lg border px-3 text-sm">Return to source</button> : null}
    <p className="w-full text-xs text-slate-500">{todo.planLinkUnavailable ? 'The linked plan task could not be loaded. Reload the source project before editing or completing it.' : 'Project Plan controls the title, deadline and completion.'}</p>
  </div>;
  if (!eligibility.eligible) return <p className="mt-3 text-xs text-slate-500">{eligibility.reason}</p>;
  return <div className="mt-3 space-y-2 border-t pt-3">
    {!todo.projectId ? <>
      <label className="block text-sm">Destination project<select className="mt-1 min-h-11 w-full rounded-lg border bg-white px-3" value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Choose a project…</option>{projects.filter((project) => project.id && project.name?.trim().toLowerCase() !== 'shopping list').map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
      <p className="text-xs text-slate-500">Moving this personal task into a project makes it accessible to that project’s collaborators.</p>
    </> : null}
    <button type="button" disabled={!onMove || (!todo.projectId && !projectId)} onClick={() => onMove(todo, todo.projectId || projectId)} className="min-h-11 rounded-lg border border-indigo-200 px-3 text-sm font-semibold text-indigo-700 disabled:opacity-40">Move to Project Plan</button>
  </div>;
}
