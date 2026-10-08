import React from 'react';
import { getTodoCreationDueDate } from '../utils/todoCalendarSections';
import { MATRIX_QUADRANTS } from '../utils/todoEisenhower';

export default function TaskCreationFields({ draft, onChange, today, projects = [], showProject = true, matrix = false }) {
  const tomorrow = getTodoCreationDueDate('today', today, 'tomorrow');
  const friday = getTodoCreationDueDate('this_week', today);
  const changeDeadline = value => {
    const dueDate = value === 'none' ? '' : value;
    onChange({ dueDate, ...(!draft.workDayExplicit ? { workDay: dueDate || draft.fallbackDay || '' } : {}) });
  };
  return <div className="task-creation-fields">
    <label>Due date
      <select aria-label="Due date shortcut" value="" onChange={event => { if (event.target.value !== 'custom') changeDeadline(event.target.value); }}>
        <option value="">Choose date…</option><option value={today}>Today</option><option value={tomorrow}>Tomorrow</option><option value={friday}>Friday ({friday})</option><option value="custom">Choose a date below</option><option value="none">No deadline</option>
      </select>
      <input aria-label="Due date for new task" type="date" value={draft.dueDate || ''} onChange={event => changeDeadline(event.target.value)} />
    </label>
    {showProject ? <label>Project<select aria-label="Project for new task" value={draft.projectId || 'other'} onChange={event => onChange({ projectId: event.target.value === 'other' ? null : event.target.value })}><option value="other">Other / no project</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label> : null}
    <label>Repeat<select aria-label="Repeat for new task" value={draft.repeat || 'none'} onChange={event => onChange({ repeat: event.target.value })}>{[['none','One-time'],['weekdays','Weekdays'],['weekly','Weekly'],['monthly','Monthly'],['yearly','Yearly']].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    {matrix ? <>
      <label>Quadrant<select aria-label="Quadrant for new task" value={draft.quadrant} onChange={event => onChange({ quadrant: event.target.value })}>{MATRIX_QUADRANTS.map((quadrant,index) => <option key={quadrant.id} value={quadrant.id}>{`Q${index + 1} · ${quadrant.title}`}</option>)}</select></label>
      <label>Personal work day<input aria-label="Personal work day for new task" type="date" value={draft.workDay || ''} onChange={event => onChange({ workDay: event.target.value, workDayExplicit: true })} /></label>
      {draft.dueDate && draft.dueDate < today ? <p>An incomplete overdue task goes to Q1 · Do now.</p> : null}
    </> : null}
  </div>;
}
