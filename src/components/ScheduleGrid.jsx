import React, { useState } from 'react';
import { getFinishDate } from '../utils/helpers';
import { ICONS } from '../utils/constants';

const ScheduleGrid = ({ 
  tasks, 
  onUpdateTask,
  onDeleteTask,
  onModifyHierarchy,
  onToggleTrack,
  onInsertTask
}) => {
  const [editingCell, setEditingCell] = useState(null);

  const handleCellEdit = (taskId, field, value) => {
    let processedValue = value;
    
    // Process value based on field type
    if (field === 'dur' || field === 'pct') {
      processedValue = value === "" ? 0 : parseInt(value) || 0;
    } else if (field === 'parent') {
      processedValue = value === "" ? null : parseInt(value) || null;
    }

    // Auto-set duration to 0 for milestones
    if (field === 'type' && value === 'Milestone') {
      onUpdateTask(taskId, { [field]: processedValue, dur: 0 });
    } else {
      onUpdateTask(taskId, { [field]: processedValue });
    }
    
    setEditingCell(null);
  };

  const EditableCell = ({ task, field, children, className = "" }) => {
    const isEditing = editingCell === `${task.id}-${field}`;
    
    const handleClick = () => {
      setEditingCell(`${task.id}-${field}`);
    };

    const handleBlur = (e) => {
      handleCellEdit(task.id, field, e.target.value);
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.target.blur();
      }
    };

    if (isEditing) {
      let input;
      if (field === 'type') {
        input = (
          <select
            autoFocus
            defaultValue={task[field]}
            onBlur={handleBlur}
            className="editing-input"
          >
            <option value="Task">Task</option>
            <option value="Milestone">Milestone</option>
          </select>
        );
      } else if (field === 'depType') {
        input = (
          <select
            autoFocus
            defaultValue={task[field]}
            onBlur={handleBlur}
            className="editing-input"
          >
            <option value="FS">FS</option>
            <option value="SS">SS</option>
            <option value="FF">FF</option>
            <option value="SF">SF</option>
          </select>
        );
      } else {
        input = (
          <input
            autoFocus
            type={field === 'start' ? 'date' : field === 'dur' || field === 'pct' ? 'number' : 'text'}
            defaultValue={task[field] ?? ''}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className="editing-input"
          />
        );
      }
      return <td className={className}>{input}</td>;
    }

    return (
      <td className={`${className} editable`} onClick={handleClick}>
        {children}
      </td>
    );
  };

  return (
    <div className="flex-grow overflow-auto custom-scrollbar" id="grid-scroll">
      <table className="w-full">
        <thead className="gantt-header">
          <tr>
            <th className="w-10 text-center">ID</th>
            <th className="w-64">Name</th>
            <th className="w-12 text-center">Dep</th>
            <th className="w-16 text-center">Typ</th>
            <th className="w-12 text-center">Dur</th>
            <th className="w-24">Start</th>
            <th className="w-24 text-slate-400">Finish</th>
            <th className="w-12 text-center">%</th>
            <th className="w-16 text-center">Track</th>
            <th className="w-32 text-center">Actions</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map(task => {
            const finishDate = getFinishDate(task.start, task.dur);
            const isMilestone = task.type === 'Milestone';

            return (
              <tr key={task.id} className="gantt-row group hover:bg-slate-50 transition-colors">
                <td className="text-center font-mono font-bold text-slate-300 border-r border-slate-100 text-[10px]">
                  {task.id}
                </td>
                
                <EditableCell task={task} field="name" className="border-r border-slate-100">
                  <div style={{ paddingLeft: `${(task.indent || 0) * 16}px` }} className="flex items-center gap-2">
                    <span className={`text-[10px] ${isMilestone ? 'text-amber-500 font-black' : 'text-slate-300'}`}>
                      {isMilestone ? '◆' : (task.indent > 0 ? '└' : '-')}
                    </span>
                    <span className="font-bold tracking-tight truncate">{task.name}</span>
                  </div>
                </EditableCell>

                <EditableCell task={task} field="parent" className="text-center font-mono text-slate-400 border-r border-slate-100">
                  {task.parent || '-'}
                </EditableCell>

                <EditableCell task={task} field="type" className="text-center text-[9px] uppercase font-black text-slate-400 border-r border-slate-100">
                  {task.type}
                </EditableCell>

                <EditableCell task={task} field="dur" className="text-center font-bold text-slate-500 border-r border-slate-100">
                  {task.dur}d
                </EditableCell>

                <EditableCell task={task} field="start" className="text-slate-500 font-mono text-[10px] border-r border-slate-100">
                  {task.start}
                </EditableCell>

                <td className="text-slate-400 font-mono text-[10px] border-r border-slate-100 bg-slate-50/30">
                  {finishDate}
                </td>

                <EditableCell task={task} field="pct" className="text-center font-bold text-indigo-600 border-r border-slate-100">
                  {task.pct}%
                </EditableCell>

                <td className="text-center border-r border-slate-100">
                  <input
                    type="checkbox"
                    checked={task.tracked || false}
                    onChange={(e) => onToggleTrack(task.id, e.target.checked)}
                    className="accent-indigo-600 cursor-pointer w-3.5 h-3.5"
                  />
                </td>

                <td className="text-center">
                  <div className="flex justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => onModifyHierarchy(task.id, -1)}
                      className="p-1 hover:text-indigo-600"
                      title="Outdent"
                    >
                      ←
                    </button>
                    <button
                      onClick={() => onModifyHierarchy(task.id, 1)}
                      className="p-1 hover:text-indigo-600"
                      title="Indent"
                    >
                      →
                    </button>
                    <button
                      onClick={() => onInsertTask(task.id)}
                      className="p-1 hover:text-emerald-600"
                      title="Insert Below"
                    >
                      <div dangerouslySetInnerHTML={{ __html: ICONS.plus }} />
                    </button>
                    <button
                      onClick={() => onDeleteTask(task.id)}
                      className="p-1 hover:text-rose-500"
                    >
                      <div dangerouslySetInnerHTML={{ __html: ICONS.trash }} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default ScheduleGrid;
