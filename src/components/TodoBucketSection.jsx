import React from 'react';
import { formatDate } from '../utils/helpers';
import { IconArrowDown, IconArrowUp } from './Icons';
import TaskChecklistBadge from './TaskChecklistBadge';

const CompletionTickButton = ({ checked, onClick, label }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    className={`inline-flex h-6 w-6 items-center justify-center rounded-full border transition-all ${
      checked
        ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm'
        : 'border-slate-300 bg-white text-transparent hover:border-slate-400 hover:bg-slate-50'
    } focus:outline-none focus:ring-2 focus:ring-indigo-400/30`}
  >
    {checked ? (
      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    ) : (
      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    )}
  </button>
);

const ReorderDropMarker = ({ active, onDragOver, onDrop }) => (
  <div
    onDragOver={onDragOver}
    onDrop={onDrop}
    className={`rounded-xl transition-all ${
      active
        ? 'my-2.5 h-2.5 bg-[var(--pm-accent)]/18 ring-2 ring-[var(--pm-accent)]/28'
        : 'my-2 h-2 bg-transparent'
    }`}
  />
);

const sourceAccentClass = (source) => {
  if (source === 'Manual') return 'bg-sky-400';
  if (source === 'Action Log') return 'bg-amber-400';
  if (source === 'Issue Log') return 'bg-rose-400';
  if (source === 'Change Log') return 'bg-violet-400';
  if (source === 'Master Tracker') return 'bg-emerald-400';
  if (source === 'Project Plan') return 'bg-slate-400';
  return 'bg-slate-300';
};

const ownerBadgeLabel = (owner) => {
  const text = String(owner || '').trim();
  if (!text) return '';
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return parts.slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase();
};

const MobileMoveButton = ({ children, disabled, icon, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-[10px] border px-2.5 py-1.5 text-[11px] font-semibold transition ${
      disabled
        ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300'
        : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700'
    }`}
  >
    {icon}
    {children}
  </button>
);

const TodoListCard = ({
  bucketKey,
  canMoveTodo,
  canReorderTodo,
  displayIndex,
  draggedTodoId,
  getChecklistSummary,
  handleCompleteTodo,
  isExternalView,
  onDeleteTodo,
  onDragEnd,
  onDragOverTodo,
  onDragStart,
  onDropTodo,
  onMoveTodo,
  onOpenTodo,
  pendingCompletedTodos,
  showCompletionTick,
  statusClass,
  todo,
}) => {
  const isCompleted = todo.status === 'Done';
  const isPendingCompletion = Object.prototype.hasOwnProperty.call(pendingCompletedTodos, todo._id);
  const canDelete = !isExternalView && !todo.isDerived && todo.status !== 'Done';
  const canDragTodo = !isExternalView && typeof canReorderTodo === 'function' && canReorderTodo(todo);
  const canMove = !isExternalView && todo.status !== 'Done';
  const canMoveUp = canDragTodo && canMoveTodo?.(todo, -1);
  const canMoveDown = canDragTodo && canMoveTodo?.(todo, 1);

  return (
    <article
      draggable={canDragTodo}
      onDragStart={canDragTodo ? onDragStart : undefined}
      onDragEnd={canDragTodo ? onDragEnd : undefined}
      onDragOver={onDragOverTodo}
      onDrop={onDropTodo}
      className={`group rounded-[14px] border px-2.5 py-2.5 shadow-[0_1px_0_rgba(9,30,66,0.08),0_1px_3px_rgba(9,30,66,0.14)] transition-all duration-150 ${
        isCompleted
          ? 'border-emerald-200 bg-emerald-50/90'
          : draggedTodoId === todo._id
            ? 'border-[var(--pm-accent)]/35 bg-white ring-2 ring-[var(--pm-accent)]/35'
            : 'border-white bg-white hover:bg-slate-50/60'
      }`}
      style={{ cursor: canDragTodo ? 'grab' : 'default' }}
    >
      <div className="flex items-start gap-2">
        {canDragTodo ? (
          <div
            className="select-none pt-1 text-slate-300 transition group-hover:text-slate-400"
            title="Drag task"
            aria-hidden="true"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="5" cy="4" r="1.1" />
              <circle cx="11" cy="4" r="1.1" />
              <circle cx="5" cy="8" r="1.1" />
              <circle cx="11" cy="8" r="1.1" />
              <circle cx="5" cy="12" r="1.1" />
              <circle cx="11" cy="12" r="1.1" />
            </svg>
          </div>
        ) : null}

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
            onClick={() => onOpenTodo?.(todo)}
            className="w-full min-w-0 text-left"
          >
            <div className="mb-1.5 flex items-center gap-1.5">
              <span className={`inline-flex h-1.5 min-w-8 rounded-full ${sourceAccentClass(todo.source)}`} />
            </div>

            <div className={`text-[12px] font-medium leading-[1.28] ${isCompleted ? 'line-through text-slate-400' : 'text-slate-800'}`}>
              {todo.title || 'Untitled'}
            </div>

            {todo.description ? (
              <div className="mt-1 line-clamp-2 text-[10px] leading-[1.3] text-slate-500">
                {todo.description}
              </div>
            ) : null}

            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {isPendingCompletion || (todo.status && todo.status !== 'Open') ? (
                <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[8px] font-semibold ${statusClass(todo.status)}`}>
                  {isPendingCompletion ? 'Completing...' : todo.status}
                </span>
              ) : null}
              {todo.owner ? (
                <span
                  className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-200 px-1.5 text-[8px] font-semibold text-slate-600"
                  title={todo.owner}
                >
                  {ownerBadgeLabel(todo.owner)}
                </span>
              ) : null}
              {todo.dueDate ? (
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[8px] font-medium text-slate-500">
                  {formatDate(todo.dueDate)}
                </span>
              ) : null}
              <TaskChecklistBadge compact summary={getChecklistSummary?.(todo)} />
            </div>
          </button>

          {canMove ? (
            <div className="mt-2 grid grid-cols-2 gap-1.5 sm:hidden">
              <MobileMoveButton
                disabled={!canMoveUp}
                icon={<IconArrowUp className="h-3 w-3" />}
                onClick={() => onMoveTodo?.(todo, bucketKey, displayIndex, -1)}
              >
                Up
              </MobileMoveButton>
              <MobileMoveButton
                disabled={!canMoveDown}
                icon={<IconArrowDown className="h-3 w-3" />}
                onClick={() => onMoveTodo?.(todo, bucketKey, displayIndex, 1)}
              >
                Down
              </MobileMoveButton>
            </div>
          ) : null}
        </div>

        {canDelete ? (
          <button
            type="button"
            onClick={() => onDeleteTodo(todo._id)}
            className="rounded-md p-0.5 text-slate-300 opacity-0 transition hover:bg-rose-50 hover:text-rose-500 group-hover:opacity-100"
            title="Delete Task"
          >
            x
          </button>
        ) : null}
      </div>
    </article>
  );
};

export default function TodoBucketSection({
  bucket,
  canMoveTodo,
  canReorderTodo,
  displayItems,
  draggedTodoId,
  dropTarget,
  formatQuickAddDueHint,
  getChecklistSummary,
  handleCompleteTodo,
  handleQuickAddSubmit,
  isExternalView,
  isMobile,
  onDeleteTodo,
  onReorderDragEnd,
  onReorderDragOver,
  onReorderDragStart,
  onReorderDrop,
  onReorderMove,
  pendingCompletedTodos,
  quickAddValues,
  setQuickAddInputRef,
  setQuickAddValue,
  setSelectedMobileTodo,
  showCompletionTick,
  showQuickAdd,
  statusClass,
}) {
  const showReorderControls = !isExternalView && typeof canReorderTodo === 'function';

  const isActiveDropTarget = (index) => (
    Boolean(draggedTodoId)
    && dropTarget?.bucketKey === bucket.key
    && dropTarget?.index === index
  );

  const handleItemDragOver = (event, displayIndex) => {
    if (!draggedTodoId || !onReorderDragOver) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const midpoint = rect.top + (rect.height / 2);
    const nextIndex = event.clientY >= midpoint ? displayIndex + 1 : displayIndex;
    onReorderDragOver(event, bucket.key, nextIndex);
  };

  const handleItemDrop = (event, displayIndex) => {
    if (!draggedTodoId || !onReorderDrop) return;
    const resolvedIndex = dropTarget?.bucketKey === bucket.key ? dropTarget.index : displayIndex;
    onReorderDrop(event, bucket.key, resolvedIndex);
  };

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-slate-700">{bucket.label}</h3>
        <span className="text-[11px] text-slate-500">{displayItems.length}</span>
      </div>

      {displayItems.length === 0 ? (
        <div className="px-3 py-4 text-[12px] text-slate-400">No items yet</div>
      ) : (
        <div className="space-y-2 p-2.5 sm:p-3">
          {displayItems.map((todo, displayIndex) => (
            <React.Fragment key={todo._id || todo.id || `${bucket.key}-${displayIndex}`}>
              {showReorderControls ? (
                <ReorderDropMarker
                  active={isActiveDropTarget(displayIndex) && draggedTodoId !== todo._id}
                  onDragOver={(event) => onReorderDragOver?.(event, bucket.key, displayIndex)}
                  onDrop={(event) => onReorderDrop?.(event, bucket.key, displayIndex)}
                />
              ) : null}

              <TodoListCard
                bucketKey={bucket.key}
                canMoveTodo={canMoveTodo}
                canReorderTodo={canReorderTodo}
                displayIndex={displayIndex}
                draggedTodoId={draggedTodoId}
                getChecklistSummary={getChecklistSummary}
                handleCompleteTodo={handleCompleteTodo}
                isExternalView={isExternalView}
                onDeleteTodo={onDeleteTodo}
                onDragEnd={onReorderDragEnd}
                onDragOverTodo={(event) => handleItemDragOver(event, displayIndex)}
                onDragStart={(event) => onReorderDragStart?.(event, todo, bucket.key)}
                onDropTodo={(event) => handleItemDrop(event, displayIndex)}
                onMoveTodo={onReorderMove}
                onOpenTodo={setSelectedMobileTodo}
                pendingCompletedTodos={pendingCompletedTodos}
                showCompletionTick={showCompletionTick}
                statusClass={statusClass}
                todo={todo}
              />
            </React.Fragment>
          ))}
          {showReorderControls ? (
            <ReorderDropMarker
              active={isActiveDropTarget(displayItems.length)}
              onDragOver={(event) => onReorderDragOver?.(event, bucket.key, displayItems.length)}
              onDrop={(event) => onReorderDrop?.(event, bucket.key, displayItems.length)}
            />
          ) : null}
        </div>
      )}

      {showQuickAdd && (
        <div className="border-t border-slate-200 bg-slate-50/80 px-3 py-2.5">
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
              className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-base outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 sm:text-[12px]"
            />
            <div className={`${isMobile ? 'flex items-center justify-between gap-3' : ''}`}>
              <div className="whitespace-nowrap text-[11px] text-slate-500">
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
