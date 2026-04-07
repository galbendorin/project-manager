import React from 'react';
import { formatDate } from '../utils/helpers';

const STATUS_OPTIONS = ['Open', 'Done'];

const MobileField = ({ label, children }) => (
  <label className="block">
    <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
      {label}
    </span>
    {children}
  </label>
);

const MobileValue = ({ children }) => (
  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] text-slate-700">
    {children}
  </div>
);

export default function MobileTodoDetailSheet({
  todo,
  canEdit,
  projectOptions,
  onClose,
  onDeleteTodo,
  onUpdateTodo,
  recurrenceOptions,
  recurrenceLabel,
  statusClass,
}) {
  if (!todo) return null;

  const isCompleted = todo.status === 'Done';

  return (
    <div className="fixed inset-0 z-[70] flex flex-col">
      <div className="absolute inset-0 bg-slate-950/45" onClick={onClose} />
      <div className="relative mt-12 flex-1 overflow-hidden rounded-t-[28px] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <button onClick={onClose} className="text-sm font-semibold text-indigo-600">
            Back
          </button>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Tasks
          </div>
          {!todo.isDerived && !isCompleted ? (
            <button
              onClick={() => {
                onDeleteTodo(todo._id);
                onClose();
              }}
              className="text-sm font-semibold text-rose-500"
            >
              Delete
            </button>
          ) : (
            <span className="w-12" />
          )}
        </div>

        <div className="h-full overflow-y-auto pb-16">
          <div className="space-y-4 px-4 py-4">
            <div className={`rounded-[24px] border p-4 ${isCompleted ? 'border-emerald-200 bg-emerald-50/80' : 'border-slate-200 bg-slate-50'}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600">
                  {todo.source || 'Manual'}
                </span>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusClass(todo.status)}`}>
                  {todo.status || 'Open'}
                </span>
              </div>

              <div className={`mt-3 text-base font-semibold leading-6 ${isCompleted ? 'text-slate-500 line-through' : 'text-slate-900'}`}>
                {todo.title || 'Untitled'}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600">
                  {todo.projectName || 'Other'}
                </span>
                {todo.owner ? (
                  <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600">
                    {todo.owner}
                  </span>
                ) : null}
                {todo.dueDate ? (
                  <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500">
                    {formatDate(todo.dueDate)}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white p-4 space-y-3">
              <MobileField label="Title">
                {canEdit ? (
                  <input
                    type="text"
                    value={todo.title || ''}
                    onChange={(e) => onUpdateTodo(todo._id, 'title', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[13px] text-slate-900 outline-none focus:border-indigo-300"
                  />
                ) : (
                  <MobileValue>{todo.title || 'Untitled'}</MobileValue>
                )}
              </MobileField>

              <MobileField label="Description">
                {canEdit ? (
                  <textarea
                    value={todo.description || ''}
                    onChange={(e) => onUpdateTodo(todo._id, 'description', e.target.value)}
                    rows={4}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[13px] text-slate-900 outline-none focus:border-indigo-300"
                    placeholder="Add more detail..."
                  />
                ) : (
                  <MobileValue>{todo.description || 'No description'}</MobileValue>
                )}
              </MobileField>

              <MobileField label="Project">
                {canEdit ? (
                  <select
                    value={todo.projectId || 'other'}
                    onChange={(e) => onUpdateTodo(todo._id, 'projectId', e.target.value === 'other' ? null : e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[13px] text-slate-900 outline-none focus:border-indigo-300"
                  >
                    <option value="other">Other</option>
                    {projectOptions.map((project) => (
                      <option key={project.id} value={project.id}>{project.name}</option>
                    ))}
                  </select>
                ) : (
                  <MobileValue>{todo.projectName || 'Other'}</MobileValue>
                )}
              </MobileField>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <MobileField label="Due Date">
                  {canEdit ? (
                    <input
                      type="date"
                      value={todo.dueDate || ''}
                      onChange={(e) => onUpdateTodo(todo._id, 'dueDate', e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[13px] text-slate-900 outline-none focus:border-indigo-300"
                    />
                  ) : (
                    <MobileValue>{todo.dueDate ? formatDate(todo.dueDate) : 'No deadline'}</MobileValue>
                  )}
                </MobileField>

                <MobileField label="Recurring">
                  {canEdit ? (
                    <select
                      value={todo.recurrence?.type || 'none'}
                      onChange={(e) => onUpdateTodo(
                        todo._id,
                        'recurrence',
                        e.target.value === 'none' ? null : { type: e.target.value, interval: 1 }
                      )}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[13px] text-slate-900 outline-none focus:border-indigo-300"
                    >
                      {recurrenceOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  ) : (
                    <MobileValue>{recurrenceLabel(todo.recurrence)}</MobileValue>
                  )}
                </MobileField>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <MobileField label="Owner">
                  {canEdit ? (
                    <input
                      type="text"
                      value={todo.owner || ''}
                      onChange={(e) => onUpdateTodo(todo._id, 'owner', e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[13px] text-slate-900 outline-none focus:border-indigo-300"
                    />
                  ) : (
                    <MobileValue>{todo.owner || 'Unassigned'}</MobileValue>
                  )}
                </MobileField>

                <MobileField label="Status">
                  {canEdit ? (
                    <select
                      value={todo.status || 'Open'}
                      onChange={(e) => onUpdateTodo(todo._id, 'status', e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[13px] text-slate-900 outline-none focus:border-indigo-300"
                    >
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  ) : (
                    <MobileValue>{todo.status || 'Open'}</MobileValue>
                  )}
                </MobileField>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
