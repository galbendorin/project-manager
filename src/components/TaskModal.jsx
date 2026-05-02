import React, { useState, useEffect, useRef } from 'react';
import { TASK_TYPES, DEP_TYPES, DEFAULT_TASK } from '../utils/constants';

const TaskModal = ({ 
  isOpen, 
  onClose, 
  onSave, 
  task = null,
  insertAfterId = null 
}) => {
  const [formData, setFormData] = useState(DEFAULT_TASK);
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (task) {
      setFormData(task);
    } else {
      setFormData({
        ...DEFAULT_TASK,
        parent: insertAfterId || null
      });
    }
  }, [task, insertAfterId]);

  const handleChange = (field, value) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      
      // Auto-set duration to 0 for milestones
      if (field === 'type' && value === 'Milestone') {
        updated.dur = 0;
      }
      
      return updated;
    });
  };

  const handleSubmit = () => {
    onSave(formData);
    onClose();
  };

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    const focusFrame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.cancelAnimationFrame(focusFrame);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 px-0 sm:items-center sm:px-4">
      <button
        type="button"
        className="absolute inset-0 w-full cursor-default"
        onClick={onClose}
        aria-label="Close task editor"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-modal-title"
        className="relative z-10 flex max-h-[calc(100dvh-16px)] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-3xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-100 bg-slate-50 px-4 py-4 sm:px-10 sm:py-6">
          <h3 id="task-modal-title" className="text-xl font-black tracking-tight text-slate-800">
            {task ? 'Edit Task' : 'New Task'}
          </h3>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-3xl leading-none text-slate-400 hover:text-slate-900"
            aria-label="Close task editor"
          >
            &times;
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:space-y-6 sm:p-10">
          {/* Task Name */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
              Description
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none transition-all focus:border-indigo-400"
              placeholder="Enter task name"
            />
          </div>

          {/* Type and Start Date */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                Type
              </label>
              <select
                value={formData.type}
                onChange={(e) => handleChange('type', e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none"
              >
                {TASK_TYPES.map(type => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                Start Date
              </label>
              <input
                type="date"
                value={formData.start}
                onChange={(e) => handleChange('start', e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none"
              />
            </div>
          </div>

          {/* Duration, Predecessor, Dependency Type */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-6">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                Dur (Days)
              </label>
              <input
                type="number"
                min="0"
                value={formData.dur}
                onChange={(e) => handleChange('dur', parseInt(e.target.value) || 0)}
                disabled={formData.type === 'Milestone'}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none disabled:bg-slate-100"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                Predecessor ID
              </label>
              <input
                type="number"
                value={formData.parent || ''}
                onChange={(e) => handleChange('parent', e.target.value ? parseInt(e.target.value) : null)}
                placeholder="None"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                Dep Logic
              </label>
              <select
                value={formData.depType}
                onChange={(e) => handleChange('depType', e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none"
              >
                {DEP_TYPES.map(type => (
                  <option key={type.value} value={type.value}>
                    {type.value}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Indent and Progress */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                Indent Level
              </label>
              <input
                type="number"
                min="0"
                value={formData.indent}
                onChange={(e) => handleChange('indent', parseInt(e.target.value) || 0)}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                Progress (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={formData.pct}
                onChange={(e) => handleChange('pct', parseInt(e.target.value) || 0)}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none"
              />
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-3 border-t border-slate-100 bg-slate-50 px-4 py-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] sm:flex-row sm:justify-end sm:px-10 sm:py-6">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl px-6 py-3 text-sm font-bold text-slate-500 transition-colors hover:bg-white hover:text-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="rounded-2xl bg-indigo-600 px-12 py-3 text-sm font-black text-white shadow-xl transition-all hover:bg-indigo-700"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default TaskModal;
