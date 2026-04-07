import React, { useMemo, useState } from 'react';
import { formatDate } from '../utils/helpers';

const CardTickButton = ({ checked, onClick, label }) => (
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

const KanbanDropSlot = ({ active, onDragOver, onDrop }) => (
  <div
    onDragOver={onDragOver}
    onDrop={onDrop}
    className={`rounded-xl transition-all ${
      active
        ? 'my-2 h-3 bg-[var(--pm-accent)]/25 ring-2 ring-[var(--pm-accent)]/35'
        : 'my-1 h-2 bg-transparent'
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
      className={`rounded-2xl border px-3.5 py-3 shadow-sm transition-all ${
        isCompleted
          ? 'border-emerald-200 bg-emerald-50/80'
          : draggedTodoId === todo._id
            ? 'border-indigo-300 bg-indigo-50/60'
            : 'border-slate-200 bg-white'
      }`}
      style={{ cursor: !isExternalView && todo.status !== 'Done' ? 'grab' : 'default' }}
      data-column-id={columnId}
      data-display-index={displayIndex}
    >
      <div className="flex items-start gap-3">
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
            <div className={`text-[15px] font-semibold leading-5 ${isCompleted ? 'line-through text-slate-400' : 'text-slate-900'}`}>
              {todo.title || 'Untitled'}
            </div>

            {todo.description ? (
              <div className="mt-2 line-clamp-3 text-[12px] leading-5 text-slate-500">
                {todo.description}
              </div>
            ) : null}

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-semibold ${statusClass(todo.status)}`}>
                {isPendingCompletion ? 'Completing...' : (todo.status || 'Open')}
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
        </div>

        {!todo.isDerived && todo.status !== 'Done' ? (
          <button
            type="button"
            onClick={() => onDeleteTodo(todo._id)}
            className="text-slate-300 transition hover:text-rose-500"
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

  const handleDrop = async (event, columnId, index) => {
    if (!draggedTodo) return;
    event.preventDefault();
    event.stopPropagation();
    await moveCardToColumn(draggedTodo, columnId, index);
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

      <div className="grid min-w-max grid-flow-col auto-cols-[minmax(300px,340px)] gap-4 pb-2">
        {activeColumns.map((column) => (
          <section
            key={column.id}
            className="flex min-h-[460px] flex-col rounded-[24px] border border-slate-200 bg-slate-50/80"
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
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
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-indigo-300"
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
                  className={`text-left text-[13px] font-semibold uppercase tracking-wide ${isExternalView ? 'cursor-default text-slate-700' : 'text-slate-700 hover:text-slate-900'}`}
                >
                  {column.title}
                </button>
              )}
              <span className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-slate-500 shadow-sm">
                {column.cards.length}
              </span>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
              {column.cards.length === 0 ? (
                <div
                  onDragOver={(event) => handleDragOverColumn(event, column.id, 0)}
                  onDrop={(event) => handleDrop(event, column.id, 0)}
                  className="rounded-2xl border border-dashed border-slate-200 bg-white/80 px-4 py-4 text-sm text-slate-400"
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
              <div className="border-t border-slate-200 bg-white/80 px-4 py-3">
                <input
                  type="text"
                  value={draftCards[column.id] || ''}
                  onChange={(event) => handleCardDraftChange(column.id, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void handleAddCard(column.id);
                    }
                  }}
                  placeholder={`Add a card to ${String(column.title || '').toLowerCase()}`}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[13px] text-slate-900 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10"
                />
              </div>
            ) : null}
          </section>
        ))}

        {!isExternalView ? (
          <section className="flex min-h-[460px] flex-col rounded-[24px] border border-dashed border-slate-200 bg-white/70 p-4">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">Add list</div>
            <div className="mt-3 flex flex-1 flex-col justify-between gap-3">
              <input
                type="text"
                value={draftColumnTitle}
                onChange={(event) => setDraftColumnTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    const title = String(draftColumnTitle || '').trim();
                    if (!title) return;
                    void addColumn(title).then(() => {
                      setDraftColumnTitle('');
                    });
                  }
                }}
                placeholder="New list name"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-300"
              />
              <button
                type="button"
                onClick={async () => {
                  const title = String(draftColumnTitle || '').trim();
                  if (!title) return;
                  await addColumn(title);
                  setDraftColumnTitle('');
                }}
                className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Add list
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
