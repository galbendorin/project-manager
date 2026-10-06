import React, { useEffect, useRef, useState } from "react";
import { deadlineDescription, MATRIX_QUADRANTS, taskViewIdentity } from "../utils/todoEisenhower";
import TaskChecklistBadge from "./TaskChecklistBadge";
import { useTodoMatrixLayout } from '../hooks/useTodoMatrixLayout';
import TodoQuadrantPanel from './TodoQuadrantPanel';
import TaskPlanningControls from './TaskPlanningControls';

export default function TodoEisenhowerMatrix({
  matrix,
  currentUserId,
  today,
  isMobile,
  isExternalView,
  onOpenTodo,
  onUpdateTodo,
  onOpenSourceTodo,
  onNotice,
  planningDrafts,
  onPlanningDraftChange,
  deadlineSaves,
  handleCompleteTodo,
  getChecklistSummary,
  transientTodos = [],
}) {
  const dragged = useRef(null);
  const pointerDrag = useRef(null);
  const [draggingTitle, setDraggingTitle] = useState('');
  const [dropTarget, setDropTarget] = useState("");
  const sections = useRef(new Map());
  const moveControls = useRef(new Map());
  const layout = useTodoMatrixLayout(isExternalView ? null : currentUserId, isMobile);
  const cancelDrag = () => { dragged.current = null; pointerDrag.current = null; setDraggingTitle(''); setDropTarget(''); };
  useEffect(() => { dragged.current = null; pointerDrag.current = null; setDraggingTitle(''); setDropTarget(''); }, [currentUserId, isExternalView, matrix.offline]);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const cancel = (event) => { if (event.key === 'Escape') { dragged.current = null; pointerDrag.current = null; setDraggingTitle(''); setDropTarget(''); } };
    window.addEventListener('keydown', cancel); return () => window.removeEventListener('keydown', cancel);
  }, []);
  const moveTask = async (todo, quadrant) => {
    const latest = matrix.groups.flatMap((group) => group.cards).find((card) => taskViewIdentity(card.todo) === taskViewIdentity(todo));
    if (!latest?.reference || latest.quadrant === quadrant || latest.deadlinePriority || latest.completing || matrix.offline || isExternalView || matrix.pending[latest.reference.task_key]) return;
    if (await matrix.move(todo, quadrant))
      requestAnimationFrame(() =>
        { const control = moveControls.current.get(`${todo.projectId || "personal"}:${todo._id}`); control?.focus({ preventScroll: true }); control?.scrollIntoView({ block: 'nearest' }); },
      );
  };
  const pointerTarget = (event) => document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-matrix-quadrant]')?.getAttribute('data-matrix-quadrant') || '';
  const startPointerDrag = (event, todo) => {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerDrag.current = { pointerId: event.pointerId, todo, owner: currentUserId };
    setDraggingTitle(todo.title || 'Untitled');
  };
  const updatePointerDrag = (event) => {
    if (pointerDrag.current?.pointerId !== event.pointerId) return;
    event.preventDefault(); setDropTarget(pointerTarget(event));
  };
  const finishPointerDrag = (event) => {
    const active = pointerDrag.current;
    if (active?.pointerId !== event.pointerId) return;
    const target = pointerTarget(event);
    cancelDrag();
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (active.owner === currentUserId && target) void moveTask(active.todo, target);
  };
  if (!matrix.ready && !isExternalView)
    return (
      <div className="p-4" role="status">
        <p>
          {matrix.loading
            ? "Loading your priorities…"
            : matrix.error || "Loading your priorities…"}
        </p>
        <button
          type="button"
          disabled={matrix.loading || matrix.offline}
          onClick={matrix.reload}
          className="mt-3 min-h-11 rounded-xl border px-4"
        >
          Retry loading
        </button>
      </div>
    );
  return (
    <div className="space-y-4 p-3 sm:p-4">
      <div className="text-sm text-slate-500">
        {isExternalView
          ? "Read-only task overview. Due and overdue tasks are shown in Do now."
          : "Your personal priorities. Due and overdue tasks stay in Do now until completed or rescheduled."}
        {!isExternalView ? <span className="ml-1">Drag a card or its ⠿ handle to another quadrant, or use Move to.</span> : null}
        <button type="button" onClick={layout.reset} className="ml-2 min-h-11 px-2 text-xs underline">Reset sizes</button>
      </div>
      {matrix.offline ? (
        <p role="status" className="text-sm text-amber-700">
          Offline — reconnect to move tasks. Last confirmed priorities are
          shown.
        </p>
      ) : null}
      {matrix.error ? (
        <div
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm"
        >
          {matrix.error}
          <button
            type="button"
            disabled={
              matrix.loading ||
              matrix.offline ||
              Object.keys(matrix.pending).length > 0
            }
            onClick={matrix.reload}
            className="ml-2 min-h-11 px-3 font-semibold underline"
          >
            Reload priorities
          </button>
        </div>
      ) : null}
      {isMobile ? (
        <nav aria-label="Matrix quadrants" className="grid grid-cols-2 gap-2">
          {matrix.groups.map((q, index) => (
            <button
              key={q.id}
              data-matrix-quadrant={q.id}
              type="button"
              className={`min-h-11 rounded-xl border px-3 text-left text-sm ${dropTarget === q.id ? 'border-indigo-500 bg-indigo-50' : 'bg-white'}`}
              onClick={() =>
                sections.current
                  .get(q.id)
                  ?.scrollIntoView({ block: "start", behavior: "smooth" })
              }
            >
              Q{index + 1} · {q.title} ({q.cards.length})
            </button>
          ))}
        </nav>
      ) : null}
      <div className={`grid items-start gap-4 ${isMobile ? "grid-cols-1" : "grid-cols-2"}`}>
        {matrix.groups.map((q, index) => {
          const transient = transientTodos
            .filter((entry) => entry.bucketKey === `matrix:${q.id}`)
            .map((entry) => ({
              todo: entry.todo,
              quadrant: q.id,
              completing: true,
            }));
          return (
            <TodoQuadrantPanel
              data-matrix-quadrant={q.id}
              key={q.id}
              title={`Q${index + 1} · ${q.title}`}
              label={q.label}
              count={q.cards.length}
              height={layout.heights[q.id]}
              limits={layout.limits}
              onHeightChange={(height) => layout.setHeight(q.id, height)}
              isMobile={isMobile}
              panelRef={(element) => {
                if (element) sections.current.set(q.id, element);
                else sections.current.delete(q.id);
              }}
              onDragOver={(event) => {
                if (!dragged.current) return;
                event.preventDefault();
                setDropTarget(q.id);
              }}
              onDragLeave={() => setDropTarget("")}
              onDrop={(event) => {
                event.preventDefault();
                const todo = dragged.current;
                dragged.current = null;
                setDropTarget("");
                if (todo) void moveTask(todo, q.id);
              }}
              className={dropTarget === q.id ? "border-indigo-400 bg-indigo-50" : "border-slate-200 bg-slate-50"}
            >
              <div className="space-y-3">
                {[...q.cards, ...transient].map((card) => {
                  const {
                    todo,
                    reference,
                    overdue,
                    dueToday,
                    deadlinePriority,
                    automatic,
                    unclassified,
                    completing,
                  } = card;
                  const saving = Boolean(matrix.pending[reference?.task_key]);
                  const canMove =
                    !isExternalView &&
                    !matrix.offline &&
                    !deadlinePriority &&
                    !completing &&
                    Boolean(reference) &&
                    !saving;
                  return (
                    <article
                      key={`${todo.projectId || "personal"}:${todo._id}`}
                      className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
                      draggable={!isMobile && canMove}
                      onPointerDown={(event) => { if (!isMobile && canMove && !event.target.closest('button,input,select,textarea,a,summary')) startPointerDrag(event, todo); }}
                      onPointerMove={updatePointerDrag}
                      onPointerUp={finishPointerDrag}
                      onPointerCancel={cancelDrag}
                      onLostPointerCapture={cancelDrag}
                      onDragStart={(event) => { if (!canMove) { event.preventDefault(); return; } dragged.current = todo; event.dataTransfer.setData('text/plain', reference.task_key); event.dataTransfer.effectAllowed = 'move'; }}
                      onDragEnd={cancelDrag}
                    >
                      <div className="flex items-start gap-2">
                        {!isExternalView ? (
                          <button
                            type="button"
                            aria-label={
                              completing
                                ? `Undo completion for ${todo.title}`
                                : `Complete ${todo.title}`
                            }
                            onClick={() =>
                              handleCompleteTodo(todo, `matrix:${q.id}`, 0)
                            }
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border text-lg"
                          >
                            {completing ? "↶" : "✓"}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => onOpenTodo(todo)}
                          className="min-h-11 min-w-0 flex-1 text-left"
                        >
                          <span
                            className={`block break-words text-sm font-semibold ${completing ? "text-slate-400 line-through" : "text-slate-900"}`}
                          >
                            {todo.title || "Untitled"}
                          </span>
                          <span className="mt-1 block break-words text-xs text-slate-500">
                            {todo.projectName || "Other"} ·{" "}
                            {todo.source || "Manual"}
                          </span>
                        </button>
                        {canMove ? (
                          <button
                            type="button"
                            draggable={false}
                            style={{ touchAction: 'none' }}
                            onPointerDown={(event) => startPointerDrag(event, todo)}
                            onPointerMove={updatePointerDrag}
                            onPointerUp={finishPointerDrag}
                            onPointerCancel={cancelDrag}
                            onLostPointerCapture={cancelDrag}
                            aria-label={`Drag ${todo.title} to a quadrant`}
                            title="Drag to a quadrant"
                            className="min-h-11 min-w-11 cursor-grab select-none rounded-lg px-2 py-3 text-slate-400 focus:ring-2 focus:ring-indigo-400"
                          >
                            ⠿
                          </button>
                        ) : null}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                        {todo.owner ? (
                          <span className="break-words">{todo.owner}</span>
                        ) : null}
                        {todo.dueDate ? (
                          <span className={deadlinePriority ? 'font-medium text-rose-700' : ''}>{deadlineDescription(todo, today)}</span>
                        ) : null}
                        <TaskChecklistBadge
                          compact
                          summary={getChecklistSummary?.(todo)}
                        />
                        {automatic ? (
                          <span className="rounded-lg bg-rose-50 px-2 py-1 font-semibold text-rose-700">
                            Auto: {dueToday ? 'due today' : 'deadline passed'}
                          </span>
                          ) : deadlinePriority ? (
                          <span className="text-rose-700">{overdue ? 'Overdue' : 'Due today'}</span>
                        ) : unclassified ? (
                          <span>Not prioritised yet</span>
                        ) : null}
                      </div>
                      {!isExternalView && !completing ? (
                        <label className="mt-3 block text-xs text-slate-500">
                          <span>
                            {saving ? "Saving priority…" : "Move to…"}
                          </span>
                          <select
                            ref={(element) => {
                              const key = `${todo.projectId || "personal"}:${todo._id}`;
                              if (element)
                                moveControls.current.set(key, element);
                              else moveControls.current.delete(key);
                            }}
                            aria-label={`Move ${todo.title} to quadrant`}
                            disabled={!canMove}
                            value={card.quadrant}
                            onChange={(event) => {
                              void moveTask(todo, event.target.value);
                            }}
                            className="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 disabled:bg-slate-50"
                          >
                            {MATRIX_QUADRANTS.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          {overdue ? (
                            <span className="mt-1 block">
                              Due and overdue tasks stay here until completed or
                              rescheduled.
                            </span>
                          ) : !reference ? (
                            <span className="mt-1 block">
                              Save this task with a stable source ID before
                              setting its priority.
                            </span>
                          ) : null}
                        </label>
                      ) : null}
                      {!isExternalView && !completing ? <TaskPlanningControls compact todo={todo} matrix={matrix} today={today} deadlinePending={Boolean(deadlineSaves?.[todo._id])} draft={planningDrafts?.[taskViewIdentity(todo)]} onDraftChange={onPlanningDraftChange ? (field, value, expected) => onPlanningDraftChange(todo, field, value, expected) : undefined} onUpdateTodo={onUpdateTodo} onOpenSourceTodo={onOpenSourceTodo} onNotice={onNotice} /> : null}
                    </article>
                  );
                })}
                {!q.cards.length && !transient.length ? (
                  <p className="rounded-xl border border-dashed p-4 text-sm text-slate-500">
                    No tasks in this quadrant.
                  </p>
                ) : null}
              </div>
            </TodoQuadrantPanel>
          );
        })}
      </div>
      {draggingTitle ? <div className="fixed inset-x-3 bottom-3 z-[90] rounded-2xl border border-indigo-200 bg-white p-3 pb-[calc(.75rem+env(safe-area-inset-bottom))] shadow-2xl">
        <p role="status" className="mb-2 truncate text-sm font-medium">Drag “{draggingTitle}” to a quadrant, then release.</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{MATRIX_QUADRANTS.map((quadrant) => <div key={quadrant.id} data-matrix-quadrant={quadrant.id} className={`flex min-h-14 items-center justify-center rounded-xl border p-2 text-center text-sm font-semibold ${dropTarget === quadrant.id ? 'border-indigo-600 bg-indigo-100 text-indigo-900' : 'border-slate-200 bg-slate-50'}`}>{quadrant.title}</div>)}</div>
      </div> : null}
    </div>
  );
}
