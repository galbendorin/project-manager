import React from 'react';
import { formatDate } from '../utils/helpers';
import { IconArrowDown, IconArrowUp, IconGrip, IconTrash } from './Icons';
import TaskChecklistBadge from './TaskChecklistBadge';

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

const ReorderHandle = ({ canDrag, onDragStart, onDragEnd }) => {
  if (!canDrag) return null;
  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="inline-flex h-8 w-8 cursor-grab items-center justify-center rounded-full text-slate-300 transition hover:bg-slate-100 hover:text-slate-500 active:cursor-grabbing"
      title="Drag to reorder"
      aria-label="Drag to reorder task"
    >
      <IconGrip />
    </button>
  );
};

const ReorderDropMarker = ({ active, onDragOver, onDrop }) => (
  <div
    onDragOver={onDragOver}
    onDrop={onDrop}
    className={`rounded-full transition-all ${
      active
        ? 'my-1.5 h-2 bg-[var(--pm-accent)]/25 ring-2 ring-[var(--pm-accent)]/25'
        : 'h-1 bg-transparent'
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

const MobileMoveIconButton = ({ children, disabled, label, onClick }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onClick={onClick}
    disabled={disabled}
    className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border transition ${
      disabled
        ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300'
        : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700'
    }`}
  >
    {children}
  </button>
);

export default function TodoBucketSection({
  bucket,
  canReorderTodo,
  canMoveTodo,
  displayItems,
  draggedTodoId,
  getDraftValue,
  handleCompleteTodo,
  handleQuickAddSubmit,
  isExternalView,
  isMobile,
  mobileEditingTitleTodoId,
  onDeleteTodo,
  onReorderDragEnd,
  onReorderDragOver,
  onReorderDragStart,
  onReorderDrop,
  onReorderMove,
  onUpdateTodo,
  pendingCompletedTodos,
  dropTarget,
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
  getChecklistSummary,
}) {
  const showReorderControls = !isExternalView && typeof canReorderTodo === 'function';
  const tableColumnCount = (showCompletionTick ? 1 : 0) + (showReorderControls ? 1 : 0) + 8;

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
            const canDragTodo = showReorderControls && canReorderTodo(todo);
            const canMoveUp = canDragTodo && canMoveTodo?.(todo, -1);
            const canMoveDown = canDragTodo && canMoveTodo?.(todo, 1);

            return (
              <React.Fragment key={todo._id || todo.id || `${bucket.key}-${displayIndex}`}>
                {showReorderControls ? (
                  <ReorderDropMarker
                    active={isActiveDropTarget(displayIndex) && draggedTodoId !== todo._id}
                    onDragOver={(event) => onReorderDragOver?.(event, bucket.key, displayIndex)}
                    onDrop={(event) => onReorderDrop?.(event, bucket.key, displayIndex)}
                  />
                ) : null}

                <article
                onDragOver={(event) => handleItemDragOver(event, displayIndex)}
                onDrop={(event) => handleItemDrop(event, displayIndex)}
                className={`rounded-[14px] border px-2.5 py-2.5 shadow-[0_1px_0_rgba(9,30,66,0.08),0_1px_3px_rgba(9,30,66,0.14)] transition-all ${
                  isCompleted
                    ? 'border-emerald-200 bg-emerald-50/90'
                    : draggedTodoId === todo._id
                      ? 'border-[var(--pm-accent)]/35 bg-white opacity-80 ring-2 ring-[var(--pm-accent)]/35'
                      : 'border-white bg-white'
                }`}
              >
                <div className="flex items-start gap-2">
                  <ReorderHandle
                    canDrag={canDragTodo}
                    onDragStart={(event) => onReorderDragStart?.(event, todo, bucket.key)}
                    onDragEnd={onReorderDragEnd}
                  />

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
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <span className={`inline-flex h-1.5 min-w-8 rounded-full ${sourceAccentClass(todo.source)}`} />
                    </div>

                    <div className={`text-[12px] font-medium leading-[1.28] ${isCompleted ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                      {todo.title || 'Untitled'}
                    </div>

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

                    {isPendingCompletion ? (
                      <div className="mt-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700">
                      Tap the tick again to undo before completion is applied.
                    </div>
                  ) : null}
                  </button>

                  {canDragTodo ? (
                    <div className="flex flex-shrink-0 flex-col gap-1 pt-0.5">
                      <MobileMoveIconButton
                        disabled={!canMoveUp}
                        label="Move task up"
                        onClick={() => onReorderMove?.(todo, bucket.key, displayIndex, -1)}
                      >
                        <IconArrowUp className="h-3 w-3" />
                      </MobileMoveIconButton>
                      <MobileMoveIconButton
                        disabled={!canMoveDown}
                        label="Move task down"
                        onClick={() => onReorderMove?.(todo, bucket.key, displayIndex, 1)}
                      >
                        <IconArrowDown className="h-3 w-3" />
                      </MobileMoveIconButton>
                    </div>
                  ) : (
                    <span className="flex-shrink-0 text-sm text-slate-300">›</span>
                  )}
                </div>
              </article>
              </React.Fragment>
            );
          })}
          {showReorderControls ? (
            <ReorderDropMarker
              active={isActiveDropTarget(displayItems.length)}
              onDragOver={(event) => onReorderDragOver?.(event, bucket.key, displayItems.length)}
              onDrop={(event) => onReorderDrop?.(event, bucket.key, displayItems.length)}
            />
          ) : null}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-white text-[10px] uppercase font-bold text-slate-400 border-b">
              <tr>
                {showReorderControls && (
                  <th className="px-3 py-3 border-b w-[4%] text-center" aria-label="Reorder" />
                )}
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
                const canDragTodo = showReorderControls && canReorderTodo(todo);
                const dropStyle = dropTarget?.bucketKey === bucket.key && draggedTodoId && draggedTodoId !== todo._id
                  ? (
                      dropTarget.index === displayIndex
                        ? { boxShadow: 'inset 0 3px 0 var(--pm-accent)' }
                        : dropTarget.index === displayIndex + 1
                          ? { boxShadow: 'inset 0 -3px 0 var(--pm-accent)' }
                          : undefined
                    )
                  : undefined;
                return (
                  <tr
                    key={todo._id}
                    onDragOver={(event) => handleItemDragOver(event, displayIndex)}
                    onDrop={(event) => handleItemDrop(event, displayIndex)}
                    className={`border-b border-slate-100 transition-all ${isCompleted ? 'bg-emerald-50/70' : 'hover:bg-slate-50'}`}
                    style={dropStyle}
                  >
                    {showReorderControls && (
                      <td className="px-3 py-2.5 align-top text-center">
                        <ReorderHandle
                          canDrag={canDragTodo}
                          onDragStart={(event) => onReorderDragStart?.(event, todo, bucket.key)}
                          onDragEnd={onReorderDragEnd}
                        />
                      </td>
                    )}
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
                      <div className="mt-1">
                        <TaskChecklistBadge summary={getChecklistSummary?.(todo)} />
                      </div>
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
              {showReorderControls && draggedTodoId ? (
                <tr
                  onDragOver={(event) => onReorderDragOver?.(event, bucket.key, displayItems.length)}
                  onDrop={(event) => onReorderDrop?.(event, bucket.key, displayItems.length)}
                >
                  <td colSpan={tableColumnCount} className="p-0">
                    <div className={`mx-3 rounded-full transition-all ${isActiveDropTarget(displayItems.length) ? 'my-1.5 h-2 bg-[var(--pm-accent)]/25 ring-2 ring-[var(--pm-accent)]/25' : 'h-1 bg-transparent'}`} />
                  </td>
                </tr>
              ) : null}
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
