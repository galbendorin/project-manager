import React, { useState, useCallback, useEffect, useMemo } from 'react';

const RACI_KEYS = ['R', 'A', 'C', 'I'];
const RACI_COLORS = {
  'R': 'bg-indigo-100 text-indigo-800 border-indigo-200',
  'A': 'bg-rose-100 text-rose-800 border-rose-200',
  'C': 'bg-amber-100 text-amber-800 border-amber-200',
  'I': 'bg-slate-100 text-slate-600 border-slate-200',
  '': 'bg-white text-slate-300 border-slate-100 hover:border-slate-300'
};
const RACI_LABELS = {
  'R': 'Responsible — does the work',
  'A': 'Accountable — owns the outcome',
  'C': 'Consulted — provides input',
  'I': 'Informed — kept in the loop'
};

const normalizeRaciValue = (value) => {
  const raw = String(value ?? '').toUpperCase();
  const selected = RACI_KEYS.filter((key) => raw.includes(key));
  return selected.join('/');
};

const splitRaciValue = (value) => normalizeRaciValue(value).split('/').filter(Boolean);

const getRaciColorClass = (value) => {
  const selected = splitRaciValue(value);
  if (selected.length === 0) return RACI_COLORS[''];
  if (selected.length === 1) return RACI_COLORS[selected[0]];
  return 'bg-indigo-50 text-indigo-700 border-indigo-200';
};

const getRaciTitle = (value) => {
  const selected = splitRaciValue(value);
  if (selected.length === 0) return 'Click to assign';
  return selected.map((key) => `${key}: ${RACI_LABELS[key]}`).join(' | ');
};

const DEFAULT_ROLES = [
  'Project Manager',
  'Technical Architect',
  'Delivery Lead',
  'PMO Lead',
  'Business Sponsor'
];

const RACIView = ({ projectData, registers, setRegisters }) => {
  const raciData = useMemo(() => {
    const raw = registers?._raci?.[0];
    return {
      assignments: raw?.assignments || {},
      roles: raw?.roles || DEFAULT_ROLES
    };
  }, [registers]);

  const [newRole, setNewRole] = useState('');
  const [showAddRole, setShowAddRole] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskName, setNewTaskName] = useState('');
  const [editingRoleIndex, setEditingRoleIndex] = useState(null);
  const [editingRoleValue, setEditingRoleValue] = useState('');
  const [activeCell, setActiveCell] = useState(null);

  const raciTasks = useMemo(() => {
    const customTasks = (raciData.assignments?._customTasks || [])
      .map((name, i) => ({ id: `custom-${i}`, name, type: 'Task', source: 'custom' }));
    return customTasks;
  }, [raciData]);

  const { roles, assignments } = raciData;

  const saveRaci = useCallback((newAssignments, newRoles) => {
    setRegisters(prev => ({
      ...prev,
      _raci: [{ assignments: newAssignments, roles: newRoles, updatedAt: new Date().toISOString() }]
    }));
  }, [setRegisters]);

  const getKey = (taskId, role) => `${taskId}::${role}`;
  const getValue = (taskId, role) => normalizeRaciValue(assignments[getKey(taskId, role)] || '');

  const toggleValue = useCallback((taskId, role, valueKey) => {
    const key = getKey(taskId, role);
    const selected = new Set(splitRaciValue(assignments[key]));
    if (selected.has(valueKey)) {
      selected.delete(valueKey);
    } else {
      selected.add(valueKey);
    }
    const next = RACI_KEYS.filter((item) => selected.has(item)).join('/');
    const updated = { ...assignments };
    if (next) { updated[key] = next; } else { delete updated[key]; }
    saveRaci(updated, roles);
  }, [assignments, roles, saveRaci]);

  const clearCell = useCallback((taskId, role) => {
    const key = getKey(taskId, role);
    const updated = { ...assignments };
    delete updated[key];
    saveRaci(updated, roles);
  }, [assignments, roles, saveRaci]);

  const handleAddRole = () => {
    const t = newRole.trim();
    if (t && !roles.includes(t)) { saveRaci(assignments, [...roles, t]); setNewRole(''); setShowAddRole(false); }
  };

  const handleRemoveRole = (role) => {
    if (!window.confirm(`Remove "${role}" column?`)) return;
    const updated = { ...assignments };
    Object.keys(updated).forEach(k => { if (k.endsWith(`::${role}`)) delete updated[k]; });
    saveRaci(updated, roles.filter(r => r !== role));
  };

  const handleStartRoleEdit = (index) => {
    setEditingRoleIndex(index);
    setEditingRoleValue(roles[index] || '');
  };

  const handleCancelRoleEdit = useCallback(() => {
    setEditingRoleIndex(null);
    setEditingRoleValue('');
  }, []);

  const handleSaveRoleEdit = useCallback(() => {
    if (editingRoleIndex === null) return;

    const oldRole = roles[editingRoleIndex];
    if (!oldRole) {
      handleCancelRoleEdit();
      return;
    }

    const nextRole = editingRoleValue.trim();
    if (!nextRole || nextRole === oldRole) {
      handleCancelRoleEdit();
      return;
    }

    const duplicate = roles.some((role, idx) => idx !== editingRoleIndex && role.toLowerCase() === nextRole.toLowerCase());
    if (duplicate) {
      window.alert(`Role "${nextRole}" already exists.`);
      return;
    }

    const updatedRoles = roles.map((role, idx) => (idx === editingRoleIndex ? nextRole : role));
    const suffix = `::${oldRole}`;
    const updatedAssignments = {};

    Object.entries(assignments).forEach(([key, value]) => {
      if (key === '_customTasks') {
        updatedAssignments[key] = value;
        return;
      }
      if (key.endsWith(suffix)) {
        const taskKey = key.slice(0, key.length - suffix.length);
        updatedAssignments[`${taskKey}::${nextRole}`] = value;
        return;
      }
      updatedAssignments[key] = value;
    });

    saveRaci(updatedAssignments, updatedRoles);
    handleCancelRoleEdit();
  }, [assignments, editingRoleIndex, editingRoleValue, handleCancelRoleEdit, roles, saveRaci]);

  const handleAddTask = () => {
    const t = newTaskName.trim();
    if (!t) return;
    const existing = assignments._customTasks || [];
    saveRaci({ ...assignments, _customTasks: [...existing, t] }, roles);
    setNewTaskName(''); setShowAddTask(false);
  };

  const handleRemoveCustomTask = (index) => {
    const existing = assignments._customTasks || [];
    if (!window.confirm(`Remove "${existing[index]}"?`)) return;
    const updated = { ...assignments, _customTasks: existing.filter((_, i) => i !== index) };
    Object.keys(updated).forEach(k => { if (k.startsWith(`custom-${index}::`)) delete updated[k]; });
    saveRaci(updated, roles);
  };

  React.useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') setActiveCell(null);
    };
    const handleOutside = (e) => {
      if (!e.target.closest('[data-raci-editor="true"]')) {
        setActiveCell(null);
      }
    };
    document.addEventListener('keydown', handleEsc);
    document.addEventListener('mousedown', handleOutside);
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.removeEventListener('mousedown', handleOutside);
    };
  }, []);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-white">
      <div className="flex-none px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-[13px] font-bold text-slate-800">RACI Matrix</h2>
          <span className="text-[10px] text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full font-medium">
            {raciTasks.length} activities × {roles.length} roles
          </span>
        </div>
        <div className="flex items-center gap-2">
          {showAddTask ? (
            <div className="flex items-center gap-1">
              <input autoFocus type="text" value={newTaskName} onChange={(e) => setNewTaskName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddTask(); if (e.key === 'Escape') setShowAddTask(false); }}
                placeholder="Activity name..." className="text-[11px] border border-slate-200 rounded-lg px-2.5 py-1.5 w-44 outline-none focus:border-indigo-300" />
              <button onClick={handleAddTask} className="text-[10px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1.5 rounded-lg">Add</button>
              <button onClick={() => setShowAddTask(false)} className="text-[10px] text-slate-400 px-1">✕</button>
            </div>
          ) : (
            <button onClick={() => setShowAddTask(true)} className="text-[10px] font-medium text-emerald-700 border border-emerald-200 hover:bg-emerald-50 px-3 py-1.5 rounded-lg transition-all">+ Activity</button>
          )}
          {showAddRole ? (
            <div className="flex items-center gap-1">
              <input autoFocus type="text" value={newRole} onChange={(e) => setNewRole(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddRole(); if (e.key === 'Escape') setShowAddRole(false); }}
                placeholder="Role name..." className="text-[11px] border border-slate-200 rounded-lg px-2.5 py-1.5 w-40 outline-none focus:border-indigo-300" />
              <button onClick={handleAddRole} className="text-[10px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-2.5 py-1.5 rounded-lg">Add</button>
              <button onClick={() => setShowAddRole(false)} className="text-[10px] text-slate-400 px-1">✕</button>
            </div>
          ) : (
            <button onClick={() => setShowAddRole(true)} className="text-[10px] font-medium text-indigo-700 border border-indigo-200 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-all">+ Role</button>
          )}
        </div>
      </div>

      <div className="flex-none px-4 py-2 border-b border-slate-100 flex items-center gap-4 flex-wrap">
        {Object.entries(RACI_LABELS).map(([key, desc]) => (
          <span key={key} className="flex items-center gap-1.5">
            <span className={`w-6 h-5 flex items-center justify-center rounded text-[10px] font-black border ${RACI_COLORS[key]}`}>{key}</span>
            <span className="text-[10px] text-slate-500">{desc}</span>
          </span>
        ))}
        <span className="text-[10px] text-slate-400 ml-auto">Click a cell to pick one or more values (R, A, C, I)</span>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {raciTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 text-[12px] gap-2">
            <p>No activities yet.</p>
            <p className="text-[11px]">Click <strong>+ Activity</strong> to add items.</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-3 py-2.5 text-[9px] font-bold text-slate-400 uppercase tracking-wider sticky left-0 bg-slate-50 z-20 min-w-[300px] border-r border-slate-200">Activity / Deliverable</th>
                {roles.map((role, idx) => (
                  <th key={`${role}-${idx}`} className="px-1 py-2 text-center" style={{ minWidth: 90, maxWidth: 110 }}>
                    <div className="flex flex-col items-center gap-1">
                      {editingRoleIndex === idx ? (
                        <>
                          <input
                            autoFocus
                            type="text"
                            value={editingRoleValue}
                            onChange={(e) => setEditingRoleValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveRoleEdit();
                              if (e.key === 'Escape') handleCancelRoleEdit();
                            }}
                            className="w-full text-[9px] font-bold text-slate-700 border border-indigo-200 rounded px-1.5 py-1 text-center outline-none focus:border-indigo-400 bg-white"
                          />
                          <div className="flex items-center gap-2">
                            <button onClick={handleSaveRoleEdit} className="text-[8px] text-emerald-500 hover:text-emerald-700 transition-colors leading-none" title="Save role name">✓</button>
                            <button onClick={handleCancelRoleEdit} className="text-[8px] text-slate-300 hover:text-slate-500 transition-colors leading-none" title="Cancel rename">✕</button>
                          </div>
                        </>
                      ) : (
                        <>
                          <span className="text-[9px] font-bold text-slate-600 uppercase tracking-wider leading-tight text-center">{role}</span>
                          <div className="flex items-center gap-2">
                            <button onClick={() => handleStartRoleEdit(idx)} className="text-[8px] text-slate-300 hover:text-indigo-500 transition-colors leading-none" title="Rename role">✎</button>
                            <button onClick={() => handleRemoveRole(role)} className="text-[8px] text-slate-300 hover:text-rose-400 transition-colors leading-none" title="Remove role">✕</button>
                          </div>
                        </>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {raciTasks.map((task) => {
                const isPhase = task.source === 'plan' && task.type !== 'Milestone';
                const isMilestone = task.type === 'Milestone';
                const isCustom = task.source === 'custom';
                const customIdx = isCustom ? parseInt(task.id.split('-')[1]) : -1;
                return (
                  <tr key={task.id} className={`border-b border-slate-100 ${isPhase ? 'bg-indigo-50/40' : isMilestone ? 'bg-violet-50/30' : isCustom ? 'bg-emerald-50/20' : 'bg-white'} hover:bg-slate-50/50`}>
                    <td className="px-3 py-2.5 sticky left-0 bg-inherit z-10 border-r border-slate-100">
                      <div className="flex items-center gap-2">
                        {isCustom && <button onClick={() => handleRemoveCustomTask(customIdx)} className="text-[9px] text-slate-300 hover:text-rose-400 flex-none">✕</button>}
                        <span className={`text-[11px] leading-snug ${isPhase ? 'font-bold text-slate-800' : isMilestone ? 'font-semibold text-violet-700' : isCustom ? 'font-medium text-emerald-700' : 'text-slate-600'}`}>
                          {isMilestone && <span className="text-violet-400 mr-1">◆</span>}
                          {isCustom && <span className="text-emerald-400 mr-1">+</span>}
                          {task.name}
                        </span>
                      </div>
                    </td>
                    {roles.map(role => {
                      const val = getValue(task.id, role);
                      const cellKey = `${task.id}::${role}`;
                      const selectedValues = splitRaciValue(val);
                      const isActive = activeCell === cellKey;
                      return (
                        <td key={role} className="px-1 py-2 text-center relative">
                          <div data-raci-editor="true" className="inline-flex flex-col items-center">
                            <button
                              onClick={() => setActiveCell(isActive ? null : cellKey)}
                              className={`w-11 h-7 rounded border text-[11px] font-black transition-all cursor-pointer ${getRaciColorClass(val)}`}
                              title={getRaciTitle(val)}
                            >
                              {val || '·'}
                            </button>
                            {isActive && (
                              <div className="absolute top-full mt-1 z-20 bg-white border border-slate-200 rounded-md shadow-lg p-1.5 flex items-center gap-1">
                                {RACI_KEYS.map((valueKey) => {
                                  const selected = selectedValues.includes(valueKey);
                                  return (
                                    <button
                                      key={valueKey}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleValue(task.id, role, valueKey);
                                      }}
                                      className={`w-7 h-6 rounded border text-[10px] font-black transition-all ${
                                        selected ? RACI_COLORS[valueKey] : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                                      }`}
                                      title={RACI_LABELS[valueKey]}
                                    >
                                      {valueKey}
                                    </button>
                                  );
                                })}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    clearCell(task.id, role);
                                  }}
                                  className="px-1.5 h-6 rounded border border-slate-200 text-[10px] font-semibold text-slate-500 hover:text-slate-700 hover:border-slate-300"
                                  title="Clear values"
                                >
                                  Clear
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default RACIView;
