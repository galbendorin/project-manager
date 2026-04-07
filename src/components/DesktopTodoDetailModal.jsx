import React from 'react';
import { formatDate } from '../utils/helpers';

const STATUS_OPTIONS = ['Open', 'Done'];

const FieldLabel = ({ children }) => (
  <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
    {children}
  </span>
);

const ReadValue = ({ children }) => (
  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] text-slate-700">
    {children}
  </div>
);

export default function DesktopTodoDetailModal({
  todo,
  canEdit,
  projectOptions,
  onClose,
  onDeleteTodo,
  onUpdateTodo,
  recurrenceLabel,
  recurrenceOptions,
  statusClass,
}) {
  if (!todo) return null;

  const isCompleted = todo.status === 'Done';

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/50"
        onClick={onClose}
        aria-label="Close task details"
      />
      <div className="relative z-10 w-full max-w-5xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Task card</div>
            <div className="mt-1 text-sm text-slate-500">
              {todo.isDerived ? `Read-only source: ${todo.source || 'Derived item'}` : 'Editable manual task'}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {!todo.isDerived && !isCompleted ? (
              <button
                type="button"
                onClick={() => {
                  onDeleteTodo(todo._id);
                  onClose();
                }}
                className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-600"
              >
                Delete
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600"
            >
              Close
            </button>
          </div>
        </div>

        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="border-b border-slate-100 px-5 py-5 lg:border-b-0 lg:border-r">
            <div className={`rounded-[24px] border p-5 ${isCompleted ? 'border-emerald-200 bg-emerald-50/80' : 'border-slate-200 bg-slate-50/70'}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600">
                  {todo.source || 'Manual'}
                </span>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusClass(todo.status)}`}>
                  {todo.status || 'Open'}
                </span>
                {todo.dueDate ? (
                  <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-medium text-slate-500">
                    {formatDate(todo.dueDate)}
                  </span>
                ) : null}
              </div>

              <div className={`mt-4 text-3xl font-bold leading-tight tracking-[-0.04em] ${isCompleted ? 'text-slate-500 line-through' : 'text-slate-900'}`}>
                {todo.title || 'Untitled'}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600">
                  {todo.projectName || 'Other'}
                </span>
                <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600">
                  {todo.owner || 'Unassigned'}
                </span>
                <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500">
                  {recurrenceLabel(todo.recurrence)}
                </span>
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <FieldLabel>Title</FieldLabel>
                {canEdit ? (
                  <input
                    type="text"
                    value={todo.title || ''}
                    onChange={(event) => onUpdateTodo(todo._id, 'title', event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-300"
                  />
                ) : (
                  <ReadValue>{todo.title || 'Untitled'}</ReadValue>
                )}
              </label>

              <label className="block sm:col-span-2">
                <FieldLabel>Description</FieldLabel>
                {canEdit ? (
                  <textarea
                    value={todo.description || ''}
                    onChange={(event) => onUpdateTodo(todo._id, 'description', event.target.value)}
                    rows={4}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-300"
                    placeholder="Add more detail..."
                  />
                ) : (
                  <ReadValue>{todo.description || 'No description'}</ReadValue>
                )}
              </label>

              <label className="block">
                <FieldLabel>Project</FieldLabel>
                {canEdit ? (
                  <select
                    value={todo.projectId || 'other'}
                    onChange={(event) => onUpdateTodo(todo._id, 'projectId', event.target.value === 'other' ? null : event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-300"
                  >
                    <option value="other">Other</option>
                    {projectOptions.map((project) => (
                      <option key={project.id} value={project.id}>{project.name}</option>
                    ))}
                  </select>
                ) : (
                  <ReadValue>{todo.projectName || 'Other'}</ReadValue>
                )}
              </label>

              <label className="block">
                <FieldLabel>Due date</FieldLabel>
                {canEdit ? (
                  <input
                    type="date"
                    value={todo.dueDate || ''}
                    onChange={(event) => onUpdateTodo(todo._id, 'dueDate', event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-300"
                  />
                ) : (
                  <ReadValue>{todo.dueDate ? formatDate(todo.dueDate) : 'No deadline'}</ReadValue>
                )}
              </label>

              <label className="block">
                <FieldLabel>Members</FieldLabel>
                {canEdit ? (
                  <input
                    type="text"
                    value={todo.owner || ''}
                    onChange={(event) => onUpdateTodo(todo._id, 'owner', event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-300"
                  />
                ) : (
                  <ReadValue>{todo.owner || 'Unassigned'}</ReadValue>
                )}
              </label>

              <label className="block">
                <FieldLabel>Repeat</FieldLabel>
                {canEdit ? (
                  <select
                    value={todo.recurrence?.type || 'none'}
                    onChange={(event) => onUpdateTodo(
                      todo._id,
                      'recurrence',
                      event.target.value === 'none' ? null : { type: event.target.value, interval: 1 }
                    )}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-300"
                  >
                    {recurrenceOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                ) : (
                  <ReadValue>{recurrenceLabel(todo.recurrence)}</ReadValue>
                )}
              </label>

              <label className="block">
                <FieldLabel>Status</FieldLabel>
                {canEdit ? (
                  <select
                    value={todo.status || 'Open'}
                    onChange={(event) => onUpdateTodo(todo._id, 'status', event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-300"
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                ) : (
                  <ReadValue>{todo.status || 'Open'}</ReadValue>
                )}
              </label>
            </div>
          </div>

          <aside className="px-5 py-5">
            <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Board activity</div>
              <div className="mt-3 space-y-3 text-sm text-slate-600">
                <div>
                  <div className="font-semibold text-slate-900">Created</div>
                  <div>{todo.createdAt ? new Date(todo.createdAt).toLocaleString('en-GB') : 'Unknown'}</div>
                </div>
                <div>
                  <div className="font-semibold text-slate-900">Last updated</div>
                  <div>{todo.updatedAt ? new Date(todo.updatedAt).toLocaleString('en-GB') : 'Unknown'}</div>
                </div>
                {todo.completedAt ? (
                  <div>
                    <div className="font-semibold text-slate-900">Completed</div>
                    <div>{new Date(todo.completedAt).toLocaleString('en-GB')}</div>
                  </div>
                ) : null}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
