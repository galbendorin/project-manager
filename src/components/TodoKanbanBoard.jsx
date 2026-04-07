import React, { useMemo, useState } from 'react';
import { formatDate } from '../utils/helpers';

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

const CardTickButton = ({ checked, onClick, label }) => (
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

const KanbanDropSlot = ({ active, onDragOver, onDrop }) => (
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

const KanbanCard = ({
  columnId,
  displayIndex,
  draggedTodoId,
  handleCompleteTodo,
  isExternalView,
  onDeleteTodo,
  onDragEnd,
  onDragStart,
  onOpenTodo,
  pendingCompletedTodos,
  showCompletionTick,
  statusClass,
  todo,
}) => {
  const isCompleted = todo.status === 'Done';
  const isPendingCompletion = Object.prototype.hasOwnProperty.call(pendingCompletedTodos, todo._id);

  return (
    <article
      draggable={!isExternalView && todo.status !== 'Done'}
      onDragStart={(event) => onDragStart(event, todo)}
      onDragEnd={onDragEnd}
      className={`group rounded-[14px] border px-2.5 py-2.5 shadow-[0_1px_0_rgba(9,30,66,0.08),0_1px_3px_rgba(9,30,66,0.14)] transition-all duration-150 ${
        isCompleted
          ? 'border-emerald-200 bg-emerald-50/90'
          : draggedTodoId === todo._id
            ? 'border-[var(--pm-accent)]/35 bg-white ring-2 ring-[var(--pm-accent)]/35'
            : 'border-white bg-white hover:bg-slate-50/60'
      }`}
      style={{ cursor: !isExternalView && todo.status !== 'Done' ? 'grab' : 'default' }}
      data-column-id={columnId}
      data-display-index={displayIndex}
    >
      <div className="flex items-start gap-2">
        {!isExternalView && todo.status !== 'Done' ? (
          <div
            className="select-none pt-1 text-slate-300 transition group-hover:text-slate-400"
            title="Drag card"
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
            <CardTickButton
              checked={isCompleted}
              onClick={() => handleCompleteTodo(todo, columnId, displayIndex)}
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
            </div>
          </button>
        </div>

        {!todo.isDerived && todo.status !== 'Done' ? (
          <button
            type="button"
            onClick={() => onDeleteTodo(todo._id)}
            className="rounded-md p-0.5 text-slate-300 opacity-0 transition hover:bg-rose-50 hover:text-rose-500 group-hover:opacity-100"
            title="Delete Task"
          >
            ×
          </button>
        ) : null}
      </div>
    </article>
  );
};

export default function TodoKanbanBoard({
  addColumn,
  columns,
  columnsLoading,
  createCardInColumn,
  handleCompleteTodo,
  isExternalView,
  kanbanAvailable,
  kanbanMessage,
  moveCardToColumn,
  onDeleteTodo,
  onOpenTodo,
  pendingCompletedTodos,
  renameColumn,
  showCompletionTick,
  statusClass,
}) {
  const [draftColumnTitle, setDraftColumnTitle] = useState('');
  const [draftCards, setDraftCards] = useState({});
  const [activeCardComposerColumnId, setActiveCardComposerColumnId] = useState(null);
  const [showAddColumnComposer, setShowAddColumnComposer] = useState(false);
  const [draggedTodo, setDraggedTodo] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [editingColumnId, setEditingColumnId] = useState(null);
  const [editingColumnTitle, setEditingColumnTitle] = useState('');

  const draggedTodoId = draggedTodo?._id || '';

  const activeColumns = useMemo(() => columns || [], [columns]);

  const handleCardDraftChange = (columnId, value) => {
    setDraftCards((prev) => ({ ...prev, [columnId]: value }));
  };

  const handleAddCard = async (columnId) => {
    const title = String(draftCards[columnId] || '').trim();
    if (!title) return;
    await createCardInColumn(columnId, title);
    setDraftCards((prev) => ({ ...prev, [columnId]: '' }));
    setActiveCardComposerColumnId(null);
  };

  const handleColumnRename = async (columnId) => {
    const nextTitle = String(editingColumnTitle || '').trim();
    if (!nextTitle) {
      setEditingColumnId(null);
      setEditingColumnTitle('');
      return;
    }
    await renameColumn(columnId, nextTitle);
    setEditingColumnId(null);
    setEditingColumnTitle('');
  };

  const handleDragStart = (event, todo) => {
    setDraggedTodo(todo);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', todo._id);
  };

  const handleDragOverColumn = (event, columnId, index) => {
    if (!draggedTodo) return;
    event.preventDefault();
    event.stopPropagation();
    setDropTarget({ columnId, index });
  };

  const handleDragOverCard = (event, columnId, displayIndex) => {
    if (!draggedTodo) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const midpoint = rect.top + (rect.height / 2);
    setDropTarget({
      columnId,
      index: event.clientY >= midpoint ? displayIndex + 1 : displayIndex,
    });
  };

  const handleDrop = async (event, columnId, index) => {
    if (!draggedTodo) return;
    event.preventDefault();
    event.stopPropagation();
    await moveCardToColumn(draggedTodo, columnId, index);
    setDraggedTodo(null);
    setDropTarget(null);
  };

  const handleColumnSurfaceDragOver = (event, columnId, fallbackIndex) => {
    if (!draggedTodo) return;
    event.preventDefault();

    if (event.target === event.currentTarget) {
      setDropTarget({ columnId, index: fallbackIndex });
    }
  };

  const handleColumnSurfaceDrop = async (event, columnId, fallbackIndex) => {
    if (!draggedTodo) return;
    event.preventDefault();
    event.stopPropagation();
    const resolvedIndex = dropTarget?.columnId === columnId
      ? dropTarget.index
      : fallbackIndex;
    await moveCardToColumn(draggedTodo, columnId, resolvedIndex);
    setDraggedTodo(null);
    setDropTarget(null);
  };

  const handleDragEnd = () => {
    setDraggedTodo(null);
    setDropTarget(null);
  };

  if (!kanbanAvailable) {
    return (
      <div className="px-5 py-8">
        <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-5 py-6 text-sm text-slate-600">
          Kanban works at the single-project level. Switch scope to `This Project + Other`, or open a specific project and use the Kanban view there.
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto px-5 py-4">
      {kanbanMessage ? (
        <div className="mb-4 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-700">
          {kanbanMessage}
        </div>
      ) : null}

      {columnsLoading ? (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
          Loading Kanban lists...
        </div>
      ) : null}

      <div className="grid min-w-max grid-flow-col auto-cols-[minmax(248px,280px)] gap-3 pb-3">
        {activeColumns.map((column) => (
          <section
            key={column.id}
            className="flex min-h-[440px] flex-col rounded-[16px] bg-[#f1f2f4] shadow-[0_1px_0_rgba(9,30,66,0.08)]"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-t-[16px] bg-[#f1f2f4] px-3 py-2.5">
              {editingColumnId === column.id ? (
                <input
                  autoFocus
                  type="text"
                  value={editingColumnTitle}
                  onChange={(event) => setEditingColumnTitle(event.target.value)}
                  onBlur={() => handleColumnRename(column.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void handleColumnRename(column.id);
                    }
                    if (event.key === 'Escape') {
                      setEditingColumnId(null);
                      setEditingColumnTitle('');
                    }
                  }}
                  className="w-full rounded-[10px] border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-indigo-300"
                />
              ) : (
                <button
                  type="button"
                  disabled={isExternalView}
                  onClick={() => {
                    if (isExternalView) return;
                    setEditingColumnId(column.id);
                    setEditingColumnTitle(column.title || '');
                  }}
                  className={`text-left text-[16px] font-semibold ${isExternalView ? 'cursor-default text-slate-800' : 'text-slate-800 hover:text-slate-900'}`}
                >
                  {column.title}
                </button>
              )}
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-medium text-slate-400">{column.cards.length}</span>
                <button
                  type="button"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-200/80 hover:text-slate-600"
                  title="List options"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <circle cx="5" cy="10" r="1.5" />
                    <circle cx="10" cy="10" r="1.5" />
                    <circle cx="15" cy="10" r="1.5" />
                  </svg>
                </button>
              </div>
            </div>

            <div
              className="flex-1 space-y-1.5 overflow-y-auto px-2 pb-2"
              onDragOver={(event) => handleColumnSurfaceDragOver(event, column.id, column.cards.length)}
              onDrop={(event) => handleColumnSurfaceDrop(event, column.id, column.cards.length)}
            >
              {column.cards.length === 0 ? (
                <div
                  onDragOver={(event) => handleDragOverColumn(event, column.id, 0)}
                  onDrop={(event) => handleDrop(event, column.id, 0)}
                  className="rounded-[12px] border border-dashed border-slate-300 bg-white px-4 py-5 text-sm text-slate-400 shadow-[0_1px_0_rgba(9,30,66,0.08)]"
                >
                  {draggedTodo ? 'Drop card here' : 'No cards yet'}
                </div>
              ) : (
                <>
                  {column.cards.map((todo, displayIndex) => (
                    <React.Fragment key={todo._id}>
                      <KanbanDropSlot
                        active={dropTarget?.columnId === column.id && dropTarget?.index === displayIndex && draggedTodoId !== todo._id}
                        onDragOver={(event) => handleDragOverColumn(event, column.id, displayIndex)}
                        onDrop={(event) => handleDrop(event, column.id, displayIndex)}
                      />
                      <div
                        onDragOver={(event) => handleDragOverCard(event, column.id, displayIndex)}
                        onDrop={(event) => handleDrop(
                          event,
                          column.id,
                          dropTarget?.columnId === column.id ? dropTarget.index : displayIndex
                        )}
                        className="rounded-[14px]"
                        style={dropTarget?.columnId === column.id && draggedTodoId !== todo._id
                          ? (
                              dropTarget.index === displayIndex
                                ? { boxShadow: 'inset 0 4px 0 var(--pm-accent)' }
                                : dropTarget.index === displayIndex + 1
                                  ? { boxShadow: 'inset 0 -4px 0 var(--pm-accent)' }
                                  : undefined
                            )
                          : undefined}
                      >
                        <KanbanCard
                          columnId={column.id}
                          displayIndex={displayIndex}
                          draggedTodoId={draggedTodoId}
                          handleCompleteTodo={handleCompleteTodo}
                          isExternalView={isExternalView}
                          onDeleteTodo={onDeleteTodo}
                          onDragEnd={handleDragEnd}
                          onDragStart={handleDragStart}
                          onOpenTodo={onOpenTodo}
                          pendingCompletedTodos={pendingCompletedTodos}
                          showCompletionTick={showCompletionTick}
                          statusClass={statusClass}
                          todo={todo}
                        />
                      </div>
                    </React.Fragment>
                  ))}
                  <KanbanDropSlot
                    active={dropTarget?.columnId === column.id && dropTarget?.index === column.cards.length}
                    onDragOver={(event) => handleDragOverColumn(event, column.id, column.cards.length)}
                    onDrop={(event) => handleDrop(event, column.id, column.cards.length)}
                  />
                </>
              )}
            </div>

            {!isExternalView ? (
              <div className="px-2.5 pb-2.5 pt-1">
                {activeCardComposerColumnId === column.id ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      autoFocus
                      value={draftCards[column.id] || ''}
                      onChange={(event) => handleCardDraftChange(column.id, event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void handleAddCard(column.id);
                        }
                        if (event.key === 'Escape') {
                          setActiveCardComposerColumnId(null);
                        }
                      }}
                      placeholder="Enter a title for this card..."
                      className="w-full rounded-[12px] border border-slate-300 bg-white px-3 py-2.5 text-[14px] text-slate-900 shadow-[0_1px_0_rgba(9,30,66,0.08)] outline-none focus:border-indigo-300"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleAddCard(column.id)}
                        className="rounded-[10px] bg-[var(--pm-accent)] px-3 py-2 text-[13px] font-semibold text-white transition hover:brightness-95"
                      >
                        Add card
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveCardComposerColumnId(null)}
                        className="rounded-[10px] px-2 py-2 text-[13px] font-medium text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setActiveCardComposerColumnId(column.id)}
                    className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2.5 text-left text-[14px] font-medium text-slate-600 transition hover:bg-slate-200/80 hover:text-slate-800"
                  >
                    <span className="text-[18px] leading-none">+</span>
                    <span>Add a card</span>
                  </button>
                )}
              </div>
            ) : null}
          </section>
        ))}

        {!isExternalView ? (
          <section className="flex min-h-[64px] flex-col rounded-[14px] bg-[#ffffff8a] p-2 shadow-[0_1px_0_rgba(9,30,66,0.08)]">
            {showAddColumnComposer ? (
              <div className="space-y-2">
                <input
                  type="text"
                  autoFocus
                  value={draftColumnTitle}
                  onChange={(event) => setDraftColumnTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      const title = String(draftColumnTitle || '').trim();
                      if (!title) return;
                      void addColumn(title).then(() => {
                        setDraftColumnTitle('');
                        setShowAddColumnComposer(false);
                      });
                    }
                    if (event.key === 'Escape') {
                      setShowAddColumnComposer(false);
                    }
                  }}
                  placeholder="Enter list title..."
                  className="w-full rounded-[12px] border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-300"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      const title = String(draftColumnTitle || '').trim();
                      if (!title) return;
                      await addColumn(title);
                      setDraftColumnTitle('');
                      setShowAddColumnComposer(false);
                    }}
                    className="rounded-[10px] bg-[var(--pm-accent)] px-3 py-2 text-[13px] font-semibold text-white transition hover:brightness-95"
                  >
                    Add list
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddColumnComposer(false)}
                    className="rounded-[10px] px-2 py-2 text-[13px] font-medium text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowAddColumnComposer(true)}
                className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2.5 text-left text-[14px] font-medium text-slate-600 transition hover:bg-slate-200/80 hover:text-slate-800"
              >
                <span className="text-[18px] leading-none">+</span>
                <span>Add another list</span>
              </button>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
