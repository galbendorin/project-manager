import React, { useState, useEffect } from 'react';
import { TASK_TYPES, DEP_TYPES, DEFAULT_TASK } from '../utils/constants';

const TaskModal = ({ 
  isOpen, 
  onClose, 
  onSave, 
  task = null,
  insertAfterId = null 
}) => {
  const [formData, setFormData] = useState(DEFAULT_TASK);

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-overlay">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden m-4 border border-slate-200">
        <div className="bg-slate-50 px-10 py-6 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-xl font-black text-slate-800 tracking-tight">
            {task ? 'Edit Task' : 'New Task'}
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-900 text-3xl"
          >
            &times;
          </button>
        </div>

        <div className="p-10 space-y-6">
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
          <div className="grid grid-cols-2 gap-6">
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
          <div className="grid grid-cols-3 gap-6">
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
          <div className="grid grid-cols-2 gap-6">
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

        <div className="bg-slate-50 px-10 py-6 border-t border-slate-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-3 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-12 py-3 text-sm font-black text-white bg-indigo-600 rounded-2xl hover:bg-indigo-700 shadow-xl transition-all"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default TaskModal;
