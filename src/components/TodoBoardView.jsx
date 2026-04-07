import React from 'react';
import { formatDate } from '../utils/helpers';
import { IconTrash } from './Icons';

const CompletionTickButton = ({ checked, onClick, label }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    className={`inline-flex h-8 w-8 items-center justify-center rounded-full border transition-all ${
      checked
        ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm'
        : 'border-slate-300 bg-white text-transparent hover:border-indigo-400 hover:bg-indigo-50'
    } focus:outline-none focus:ring-2 focus:ring-indigo-400/30`}
  >
    {checked ? (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    ) : (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    )}
  </button>
);

const TodoBoardCard = ({
  bucketKey,
  displayIndex,
  onDeleteTodo,
  onOpenTodo,
  pendingCompletedTodos,
  showCompletionTick,
  statusClass,
  todo,
  handleCompleteTodo,
  isExternalView,
}) => {
  const isCompleted = todo.status === 'Done';
  const isPendingCompletion = Object.prototype.hasOwnProperty.call(pendingCompletedTodos, todo._id);
  const canDelete = !isExternalView && !todo.isDerived && todo.status !== 'Done';

  return (
    <article
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
              onClick={() => handleCompleteTodo(todo, bucketKey, displayIndex)}
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

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => onOpenTodo(todo)}
            className="min-w-0 text-left"
          >
            <div className={`text-[15px] font-semibold leading-5 ${isCompleted ? 'line-through text-slate-400' : 'text-slate-900'}`}>
              {todo.title || 'Untitled'}
            </div>

            {todo.description ? (
              <div className="mt-2 line-clamp-3 text-[12px] leading-5 text-slate-500">
                {todo.description}
              </div>
            ) : null}

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
          </button>

          {isPendingCompletion ? (
            <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700">
              Tap the tick again to undo before completion is applied.
            </div>
          ) : null}
        </div>

        {canDelete ? (
          <button
            type="button"
            onClick={() => onDeleteTodo(todo._id)}
            className="text-slate-300 transition hover:text-rose-500"
            title="Delete Task"
          >
            <IconTrash />
          </button>
        ) : null}
      </div>
    </article>
  );
};

export default function TodoBoardView({
  bucketSections,
  formatQuickAddDueHint,
  handleCompleteTodo,
  handleQuickAddSubmit,
  isExternalView,
  onDeleteTodo,
  onOpenTodo,
  pendingCompletedTodos,
  quickAddValues,
  setQuickAddInputRef,
  setQuickAddValue,
  showCompletionTick,
  showQuickAdd,
  statusClass,
}) {
  return (
    <div className="overflow-x-auto px-5 py-4">
      <div className="grid min-w-max grid-flow-col auto-cols-[minmax(280px,320px)] gap-4 pb-2">
        {bucketSections.map((bucket) => (
          <section
            key={bucket.key}
            className="flex min-h-[420px] flex-col rounded-[24px] border border-slate-200 bg-slate-50/80"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h3 className="text-[12px] font-semibold uppercase tracking-wide text-slate-700">{bucket.label}</h3>
              <span className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-slate-500 shadow-sm">
                {bucket.displayItems.length}
              </span>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
              {bucket.displayItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white/80 px-4 py-4 text-sm text-slate-400">
                  No items yet
                </div>
              ) : bucket.displayItems.map((todo, displayIndex) => (
                <TodoBoardCard
                  key={todo._id || todo.id || `${bucket.key}-${displayIndex}`}
                  bucketKey={bucket.key}
                  displayIndex={displayIndex}
                  handleCompleteTodo={handleCompleteTodo}
                  isExternalView={isExternalView}
                  onDeleteTodo={onDeleteTodo}
                  onOpenTodo={onOpenTodo}
                  pendingCompletedTodos={pendingCompletedTodos}
                  showCompletionTick={showCompletionTick}
                  statusClass={statusClass}
                  todo={todo}
                />
              ))}
            </div>

            {showQuickAdd ? (
              <div className="border-t border-slate-200 bg-white/80 px-4 py-3">
                <input
                  type="text"
                  ref={(element) => setQuickAddInputRef(bucket.key, element)}
                  value={quickAddValues[bucket.key] || ''}
                  onChange={(event) => setQuickAddValue(bucket.key, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleQuickAddSubmit(bucket.key);
                    }
                  }}
                  placeholder={`Add a task to ${bucket.label.toLowerCase()}`}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[13px] text-slate-900 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10"
                />
                <div className="mt-2 text-[11px] text-slate-500">
                  {formatQuickAddDueHint(bucket.key)}
                </div>
              </div>
            ) : null}
          </section>
        ))}
      </div>
    </div>
  );
}
