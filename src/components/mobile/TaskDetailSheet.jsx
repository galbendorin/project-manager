import React, { useState, useEffect, useCallback } from 'react';

const RAG_OPTIONS = ['', 'green', 'amber', 'red'];
const TYPE_OPTIONS = ['Task', 'Milestone', 'Group'];

const ragStyle = (rag) => {
  if (rag === 'red') return { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', dot: 'bg-rose-500' };
  if (rag === 'amber') return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' };
  if (rag === 'green') return { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' };
  return { bg: 'bg-slate-50', text: 'text-slate-500', border: 'border-slate-200', dot: 'bg-slate-300' };
};

const formatDate = (d) => {
  if (!d) return '';
  try {
    const date = new Date(d);
    return date.toISOString().slice(0, 10);
  } catch {
    return d;
  }
};

const displayDate = (d) => {
  if (!d) return '–';
  try {
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
  } catch {
    return d;
  }
};

const TaskDetailSheet = ({ task, allTasks, onClose, onUpdateTask, onDeleteTask, onSendToTracker, onSendToActionLog }) => {
  const [editField, setEditField] = useState(null);
  const [tempValue, setTempValue] = useState('');

  const startEdit = (field, value) => {
    setEditField(field);
    setTempValue(value ?? '');
  };

  const saveField = useCallback((field, value) => {
    const idx = allTasks.findIndex(t => t.id === task.id);
    if (idx >= 0) {
      onUpdateTask(idx, field, value);
    }
    setEditField(null);
  }, [allTasks, task.id, onUpdateTask]);

  const handleDelete = () => {
    if (window.confirm(`Delete "${task.name}"?`)) {
      const idx = allTasks.findIndex(t => t.id === task.id);
      if (idx >= 0) onDeleteTask(idx);
      onClose();
    }
  };

  // Close on escape
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        if (editField) setEditField(null);
        else onClose();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [editField, onClose]);

  const rag = ragStyle(task.rag || '');
  const typeBg = task.type === 'Group' ? 'bg-indigo-100 text-indigo-700'
    : task.type === 'Milestone' ? 'bg-violet-100 text-violet-700'
    : 'bg-slate-100 text-slate-600';

  const children = allTasks.filter(t => t.parent === task.id);

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative mt-10 flex-1 bg-white rounded-t-2xl flex flex-col overflow-hidden"
        style={{ animation: 'mobileSlideUp 0.3s ease-out' }}>
        {/* Drag handle */}
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="w-10 h-1 rounded-full bg-slate-300" />
        </div>

        {/* Header */}
        <div className="px-4 pb-3 border-b border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <button onClick={onClose} className="text-sm font-semibold text-indigo-600 active:text-indigo-800">← Back</button>
            <span className="text-[10px] font-mono text-slate-400">#{task.id}</span>
            <button onClick={handleDelete} className="text-xs text-rose-400 active:text-rose-600 font-semibold">Delete</button>
          </div>
          {/* Task name — editable */}
          {editField === 'name' ? (
            <input
              autoFocus
              className="w-full text-lg font-bold text-slate-900 bg-indigo-50 rounded-lg px-2 py-1 outline-none ring-2 ring-indigo-300"
              value={tempValue}
              onChange={e => setTempValue(e.target.value)}
              onBlur={() => saveField('name', tempValue)}
              onKeyDown={e => e.key === 'Enter' && saveField('name', tempValue)}
            />
          ) : (
            <h2
              className="text-lg font-bold text-slate-900 leading-tight active:bg-slate-50 rounded-lg px-1 -mx-1 cursor-pointer"
              onClick={() => startEdit('name', task.name)}
            >
              {task.name || 'Untitled'}
            </h2>
          )}
          <div className="flex items-center gap-2 mt-2">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${rag.bg} ${rag.text} ${rag.border}`}>
              {(task.rag || 'none').toUpperCase()}
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${typeBg}`}>{task.type}</span>
            <span className="text-[10px] text-slate-400 font-medium">{task.dur}d</span>
          </div>
        </div>

        {/* Fields list */}
        <div className="flex-1 overflow-y-auto">
          {/* Progress — special treatment */}
          <div className="px-4 py-4 border-b border-slate-50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Progress</span>
              <span className={`text-lg font-black ${task.pct >= 100 ? 'text-emerald-600' : 'text-indigo-600'}`}>{task.pct || 0}%</span>
            </div>
            <input
              type="range" min={0} max={100} step={5}
              value={task.pct || 0}
              onChange={e => {
                const idx = allTasks.findIndex(t => t.id === task.id);
                if (idx >= 0) onUpdateTask(idx, 'pct', parseInt(e.target.value));
              }}
              className="w-full accent-indigo-600 h-2"
            />
            <div className="flex justify-between text-[9px] text-slate-400 mt-1">
              <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
            </div>
          </div>

          {/* Standard fields */}
          {[
            { key: 'type', label: 'Type', type: 'select', options: TYPE_OPTIONS },
            { key: 'start', label: 'Start Date', type: 'date' },
            { key: 'finish', label: 'Finish Date', type: 'date', editable: false },
            { key: 'dur', label: 'Duration (days)', type: 'number' },
            { key: 'owner', label: 'Owner', type: 'text' },
            { key: 'rag', label: 'RAG Status', type: 'rag' },
          ].map(f => {
            const val = task[f.key];
            const isEditing = editField === f.key;

            return (
              <div
                key={f.key}
                className={`flex items-center justify-between px-4 py-3.5 border-b border-slate-50 ${f.editable !== false ? 'active:bg-slate-50 cursor-pointer' : ''}`}
                onClick={() => f.editable !== false && !isEditing && startEdit(f.key, f.type === 'date' ? formatDate(val) : val)}
              >
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-28 flex-shrink-0">{f.label}</span>
                {isEditing && f.type === 'select' ? (
                  <div className="flex gap-1.5 flex-wrap justify-end">
                    {f.options.map(o => (
                      <button key={o} onClick={e => { e.stopPropagation(); saveField(f.key, o); }}
                        className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-all ${val === o ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 active:bg-slate-200'}`}
                      >{o}</button>
                    ))}
                  </div>
                ) : isEditing && f.type === 'rag' ? (
                  <div className="flex gap-1.5">
                    {RAG_OPTIONS.map(o => {
                      const rs = ragStyle(o);
                      return (
                        <button key={o || 'none'} onClick={e => { e.stopPropagation(); saveField('rag', o); }}
                          className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg capitalize transition-all ${val === o ? 'ring-2 ring-indigo-400 ' + rs.bg + ' ' + rs.text : 'bg-slate-100 text-slate-600'}`}
                        >{o || 'None'}</button>
                      );
                    })}
                  </div>
                ) : isEditing && f.type === 'date' ? (
                  <input autoFocus type="date" value={tempValue}
                    className="text-sm font-medium text-slate-900 bg-indigo-50 px-3 py-1.5 rounded-lg outline-none ring-2 ring-indigo-300"
                    onChange={e => setTempValue(e.target.value)}
                    onBlur={() => saveField(f.key, tempValue)}
                  />
                ) : isEditing && f.type === 'number' ? (
                  <input autoFocus type="number" min={0} value={tempValue}
                    className="w-20 text-sm font-medium text-slate-900 bg-indigo-50 px-3 py-1.5 rounded-lg outline-none ring-2 ring-indigo-300 text-right"
                    onChange={e => setTempValue(e.target.value)}
                    onBlur={() => saveField(f.key, parseInt(tempValue) || 0)}
                    onKeyDown={e => e.key === 'Enter' && saveField(f.key, parseInt(tempValue) || 0)}
                  />
                ) : isEditing ? (
                  <input autoFocus type="text" value={tempValue}
                    className="flex-1 text-sm font-medium text-slate-900 bg-indigo-50 px-3 py-1.5 rounded-lg outline-none ring-2 ring-indigo-300 text-right ml-2"
                    onChange={e => setTempValue(e.target.value)}
                    onBlur={() => saveField(f.key, tempValue)}
                    onKeyDown={e => e.key === 'Enter' && saveField(f.key, tempValue)}
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    {f.key === 'rag' ? (
                      <div className="flex items-center gap-1.5">
                        <div className={`w-2.5 h-2.5 rounded-full ${ragStyle(val).dot}`} />
                        <span className="text-sm font-medium text-slate-800 capitalize">{val || 'None'}</span>
                      </div>
                    ) : f.type === 'date' ? (
                      <span className="text-sm font-medium text-slate-800">{displayDate(val)}</span>
                    ) : (
                      <span className="text-sm font-medium text-slate-800">{val ?? '–'}</span>
                    )}
                    {f.editable !== false && <span className="text-slate-300 text-xs">✏️</span>}
                  </div>
                )}
              </div>
            );
          })}

          {/* Dependencies display */}
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-50">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-28">Dependencies</span>
            <span className="text-sm font-medium text-slate-800 font-mono">
              {task.dependencies?.length > 0
                ? task.dependencies.map(d => `${d}${task.depType || 'FS'}`).join(', ')
                : '–'}
            </span>
          </div>

          {/* Sub-tasks / children */}
          {children.length > 0 && (
            <div className="px-4 pt-4 pb-2">
              <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">Sub-tasks ({children.length})</h3>
              {children.map(c => {
                const cRag = ragStyle(c.rag || '');
                return (
                  <div key={c.id} className="flex items-center gap-3 py-2.5 border-b border-slate-50">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${c.pct >= 100 ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`}>
                      {c.pct >= 100 && <span className="text-white text-[9px]">✓</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-700 truncate">{c.name}</div>
                      <div className="text-[10px] text-slate-400">{c.owner || '–'} · {displayDate(c.start)}</div>
                    </div>
                    <div className={`w-2 h-2 rounded-full ${cRag.dot}`} />
                    <span className={`text-xs font-bold ${c.pct >= 100 ? 'text-emerald-600' : 'text-slate-500'}`}>{c.pct || 0}%</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Action buttons */}
          <div className="px-4 py-5 space-y-2.5">
            {onSendToTracker && (
              <button onClick={() => { onSendToTracker(task.id); onClose(); }}
                className="w-full py-2.5 rounded-xl bg-indigo-50 text-indigo-700 text-sm font-semibold active:bg-indigo-100 transition-colors">
                Send to Tracker
              </button>
            )}
            {onSendToActionLog && (
              <button onClick={() => { onSendToActionLog(task.id); onClose(); }}
                className="w-full py-2.5 rounded-xl bg-indigo-50 text-indigo-700 text-sm font-semibold active:bg-indigo-100 transition-colors">
                Send to Action Log
              </button>
            )}
          </div>

          {/* Bottom spacer for safe area */}
          <div className="h-8" />
        </div>
      </div>
    </div>
  );
};

export default TaskDetailSheet;
