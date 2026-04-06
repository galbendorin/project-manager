import React from 'react';
import { formatDate } from '../utils/helpers';
import { IconTrash } from './Icons';

const CompletionTickButton = ({ checked, disabled, onClick, label }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    className={`inline-flex h-7 w-7 items-center justify-center rounded-full border transition-all ${
      checked
        ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm'
        : 'border-slate-300 bg-white text-transparent hover:border-indigo-400 hover:bg-indigo-50'
    } ${disabled ? 'cursor-default opacity-80' : 'cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400/30'}`}
  >
    {checked && (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    )}
  </button>
);

export default function TodoBucketSection({
  bucket,
  displayItems,
  getDraftValue,
  handleCompleteTodo,
  handleQuickAddSubmit,
  isExternalView,
  isMobile,
  mobileEditingTitleTodoId,
  onDeleteTodo,
  onUpdateTodo,
  pendingCompletedTodos,
  projectOptions,
  quickAddValues,
  recurrenceLabel,
  recurrenceOptions,
  setDraftValue,
  setMobileEditingTitleTodoId,
  setSelectedMobileTodo,
  setQuickAddValue,
  setQuickAddInputRef,
  setTitleInputRef,
  showCompletionTick,
  showQuickAdd,
  statusClass,
  statusOptions,
  commitDraftValue,
  formatQuickAddDueHint,
}) {
  return (
    <section className="border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <h3 className="text-[12px] font-semibold text-slate-700 uppercase tracking-wide">{bucket.label}</h3>
        <span className="text-[11px] text-slate-500">{displayItems.length}</span>
      </div>

      {displayItems.length === 0 ? (
        <div className="px-4 py-5 text-[12px] text-slate-400">No items yet</div>
      ) : isMobile ? (
        <div className="space-y-3 p-3 sm:p-4">
          {displayItems.map((todo, displayIndex) => {
            const isCompleted = todo.status === 'Done';
            const isPendingCompletion = Object.prototype.hasOwnProperty.call(pendingCompletedTodos, todo._id);

            return (
              <article
                key={todo._id || todo.id || `${bucket.key}-${displayIndex}`}
                className={`rounded-2xl border px-3.5 py-3 shadow-sm transition-all ${
                  isCompleted
                    ? 'border-emerald-200 bg-emerald-50/80'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-start gap-3">
                  {showCompletionTick ? (
                    <div className="pt-0.5">
                      <CompletionTickButton
                        checked={isCompleted}
                        disabled={false}
                        onClick={() => handleCompleteTodo(todo, bucket.key, displayIndex)}
                        label={
                          isPendingCompletion
                            ? `Undo completion for ${todo.title || 'task'}`
                            : isCompleted
                              ? `${todo.title || 'Task'} completed`
                              : `Mark ${todo.title || 'task'} complete`
                        }
                      />
                    </div>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => setSelectedMobileTodo(todo)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className={`text-[15px] font-semibold leading-5 ${isCompleted ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                          {todo.title || 'Untitled'}
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-600">
                            {todo.source || 'Manual'}
                          </span>
                          <span className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-semibold ${statusClass(todo.status)}`}>
                            {isPendingCompletion ? 'Completing...' : (todo.status || 'Open')}
                          </span>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-600">
                            {todo.projectName || 'Other'}
                          </span>
                          {todo.owner ? (
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-500">
                              {todo.owner}
                            </span>
                          ) : null}
                          {todo.dueDate ? (
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-500">
                              {formatDate(todo.dueDate)}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <span className="text-slate-300 text-sm flex-shrink-0">›</span>
                    </div>

                    {isPendingCompletion ? (
                      <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700">
                        Tap the tick again to undo before completion is applied.
                      </div>
                    ) : null}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-white text-[10px] uppercase font-bold text-slate-400 border-b">
              <tr>
                {showCompletionTick && (
                  <th className="px-4 py-3 border-b w-[5%] text-center">Done</th>
                )}
                <th className="px-4 py-3 border-b w-[24%]">Title</th>
                <th className="px-4 py-3 border-b w-[14%]">Project</th>
                <th className="px-4 py-3 border-b w-[12%]">Due Date</th>
                <th className="px-4 py-3 border-b w-[14%]">Owner</th>
                <th className="px-4 py-3 border-b w-[12%]">Recurring</th>
                <th className="px-4 py-3 border-b w-[10%]">Source</th>
                <th className="px-4 py-3 border-b w-[8%]">Status</th>
                <th className="px-4 py-3 border-b w-[6%] text-center">Act</th>
              </tr>
            </thead>
            <tbody className="text-xs">
              {displayItems.map((todo, displayIndex) => {
                const canEditManualRow = !isExternalView && !todo.isDerived && todo.status !== 'Done';
                const isManualEditable = canEditManualRow && !isMobile;
                const isMobileTitleEditing = isMobile && mobileEditingTitleTodoId === todo._id && canEditManualRow;
                const isCompleted = todo.status === 'Done';
                const isPendingCompletion = Object.prototype.hasOwnProperty.call(pendingCompletedTodos, todo._id);
                return (
                  <tr
                    key={todo._id}
                    className={`border-b border-slate-100 transition-all ${isCompleted ? 'bg-emerald-50/70' : 'hover:bg-slate-50'}`}
                  >
                    {showCompletionTick && (
                      <td className="px-4 py-2.5 align-top text-center">
                        <CompletionTickButton
                          checked={isCompleted}
                          disabled={false}
                          onClick={() => handleCompleteTodo(todo, bucket.key, displayIndex)}
                          label={
                            isPendingCompletion
                              ? `Undo completion for ${todo.title || 'task'}`
                              : isCompleted
                                ? `${todo.title || 'Task'} completed`
                                : `Mark ${todo.title || 'task'} complete`
                          }
                        />
                      </td>
                    )}
                    <td className="px-4 py-2.5 align-top">
                      {isManualEditable || isMobileTitleEditing ? (
                        <input
                          type="text"
                          ref={(element) => setTitleInputRef(todo._id, element)}
                          value={getDraftValue(todo, 'title')}
                          onChange={(e) => setDraftValue(todo._id, 'title', e.target.value)}
                          onBlur={() => {
                            commitDraftValue(todo, 'title');
                            if (isMobile) {
                              setMobileEditingTitleTodoId((currentId) => (currentId === todo._id ? null : currentId));
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              commitDraftValue(todo, 'title');
                              if (isMobile) {
                                setMobileEditingTitleTodoId((currentId) => (currentId === todo._id ? null : currentId));
                              }
                              e.currentTarget.blur();
                            }
                          }}
                          className="w-full px-2.5 py-1.5 text-base sm:text-[12px] border border-slate-200 rounded-md outline-none focus:border-indigo-300"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            if (isMobile && !todo.isDerived && !isExternalView) {
                              setMobileEditingTitleTodoId(todo._id);
                            }
                          }}
                          className={`w-full text-left ${isMobile && !todo.isDerived && !isExternalView ? 'cursor-text' : 'cursor-default'} ${isCompleted ? 'line-through text-slate-400' : 'text-[12px] text-slate-700'}`}
                        >
                          {todo.title || 'Untitled'}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      {isManualEditable ? (
                        <select
                          value={todo.projectId || 'other'}
                          onChange={(e) => onUpdateTodo(todo._id, 'projectId', e.target.value === 'other' ? null : e.target.value)}
                          className="w-full px-2.5 py-1.5 text-base sm:text-[12px] border border-slate-200 rounded-md outline-none focus:border-indigo-300"
                        >
                          <option value="other">Other</option>
                          {projectOptions.map((project) => (
                            <option key={project.id} value={project.id}>{project.name}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-[12px] text-slate-600">{todo.projectName || 'Other'}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      {isManualEditable ? (
                        <input
                          type="date"
                          value={todo.dueDate || ''}
                          onChange={(e) => onUpdateTodo(todo._id, 'dueDate', e.target.value)}
                          className="w-full px-2.5 py-1.5 text-base sm:text-[12px] border border-slate-200 rounded-md outline-none focus:border-indigo-300"
                        />
                      ) : (
                        <span className="text-[12px] text-slate-600">{todo.dueDate ? formatDate(todo.dueDate) : 'No deadline'}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      {isManualEditable ? (
                        <input
                          type="text"
                          value={getDraftValue(todo, 'owner')}
                          onChange={(e) => setDraftValue(todo._id, 'owner', e.target.value)}
                          onBlur={() => commitDraftValue(todo, 'owner')}
                          className="w-full px-2.5 py-1.5 text-base sm:text-[12px] border border-slate-200 rounded-md outline-none focus:border-indigo-300"
                        />
                      ) : (
                        <span className="text-[12px] text-slate-600">{todo.owner || 'Unassigned'}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      {isManualEditable ? (
                        <select
                          value={todo.recurrence?.type || 'none'}
                          onChange={(e) => onUpdateTodo(
                            todo._id,
                            'recurrence',
                            e.target.value === 'none' ? null : { type: e.target.value, interval: 1 }
                          )}
                          className="w-full px-2.5 py-1.5 text-base sm:text-[12px] border border-slate-200 rounded-md outline-none focus:border-indigo-300"
                        >
                          {recurrenceOptions.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-[12px] text-slate-600">{recurrenceLabel(todo.recurrence)}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
                        {todo.source || 'Manual'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      {isManualEditable ? (
                        <select
                          value={todo.status || 'Open'}
                          onChange={(e) => onUpdateTodo(todo._id, 'status', e.target.value)}
                          className="w-full px-2.5 py-1.5 text-base sm:text-[12px] border border-slate-200 rounded-md outline-none focus:border-indigo-300"
                        >
                          {statusOptions.map((status) => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>
                      ) : (
                        <div className="space-y-1">
                          <span className={`inline-flex items-center px-2 py-1 rounded-md text-[11px] font-medium ${statusClass(todo.status)}`}>
                            {isPendingCompletion ? 'Completing...' : (todo.status || 'Open')}
                          </span>
                          {isPendingCompletion && (
                            <div className="text-[10px] text-slate-500">
                              Tap the tick again to undo
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center align-top">
                      {isManualEditable && (
                        <button
                          onClick={() => onDeleteTodo(todo._id)}
                          className="text-slate-300 hover:text-rose-500"
                          title="Delete Task"
                        >
                          <IconTrash />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showQuickAdd && (
        <div className="border-t border-slate-200 bg-slate-50/80 px-4 py-3">
          <div className={`flex ${isMobile ? 'flex-col items-stretch gap-2.5' : 'items-center gap-3'}`}>
            <input
              type="text"
              ref={(element) => setQuickAddInputRef(bucket.key, element)}
              value={quickAddValues[bucket.key] || ''}
              onChange={(e) => setQuickAddValue(bucket.key, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleQuickAddSubmit(bucket.key);
                }
              }}
              placeholder={isMobile ? `Quick add to ${bucket.label.toLowerCase()}` : `Add a task to ${bucket.label.toLowerCase()} and press Enter`}
              className="flex-1 px-3 py-2 text-base sm:text-[12px] border border-slate-200 rounded-lg bg-white outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10"
            />
            <div className={`${isMobile ? 'flex items-center justify-between gap-3' : ''}`}>
              <div className="text-[11px] text-slate-500 whitespace-nowrap">
                {formatQuickAddDueHint(bucket.key)}
              </div>
              {isMobile ? (
                <button
                  type="button"
                  onClick={() => handleQuickAddSubmit(bucket.key)}
                  className="rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800"
                >
                  Add task
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
