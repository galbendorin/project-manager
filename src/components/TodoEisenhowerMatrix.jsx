import React, { useRef, useState } from "react";
import { MATRIX_QUADRANTS } from "../utils/todoEisenhower";
import TaskChecklistBadge from "./TaskChecklistBadge";
import { formatDate } from "../utils/helpers";

export default function TodoEisenhowerMatrix({
  matrix,
  isMobile,
  isExternalView,
  onOpenTodo,
  handleCompleteTodo,
  getChecklistSummary,
  transientTodos = [],
}) {
  const dragged = useRef(null);
  const [dropTarget, setDropTarget] = useState("");
  const sections = useRef(new Map());
  const moveControls = useRef(new Map());
  const moveTask = async (todo, quadrant) => {
    if (await matrix.move(todo, quadrant))
      requestAnimationFrame(() =>
        moveControls.current
          .get(`${todo.projectId || "personal"}:${todo._id}`)
          ?.focus(),
      );
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
          ? "Read-only task overview. Overdue tasks are shown in Do."
          : "Your personal priorities. Overdue tasks stay in Do until completed or rescheduled."}
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
              type="button"
              className="min-h-11 rounded-xl border bg-white px-3 text-left text-sm"
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
      <div className={`grid gap-4 ${isMobile ? "grid-cols-1" : "grid-cols-2"}`}>
        {matrix.groups.map((q, index) => {
          const transient = transientTodos
            .filter((entry) => entry.bucketKey === `matrix:${q.id}`)
            .map((entry) => ({
              todo: entry.todo,
              quadrant: q.id,
              completing: true,
            }));
          return (
            <section
              key={q.id}
              ref={(element) => {
                if (element) sections.current.set(q.id, element);
                else sections.current.delete(q.id);
              }}
              aria-label={q.label}
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
              className={`min-w-0 scroll-mt-4 rounded-2xl border p-3 sm:p-4 ${dropTarget === q.id ? "border-indigo-400 bg-indigo-50" : "border-slate-200 bg-slate-50"}`}
            >
              <header className="mb-3">
                <h3 className="text-base font-semibold text-slate-900">
                  Q{index + 1} · {q.title}{" "}
                  <span className="text-sm font-normal text-slate-500">
                    ({q.cards.length})
                  </span>
                </h3>
                <p className="mt-1 text-sm text-slate-600">{q.label}</p>
              </header>
              <div className="space-y-3">
                {[...q.cards, ...transient].map((card) => {
                  const {
                    todo,
                    reference,
                    overdue,
                    automatic,
                    unclassified,
                    completing,
                  } = card;
                  const saving = Boolean(matrix.pending[reference?.task_key]);
                  const canMove =
                    !isExternalView &&
                    !matrix.offline &&
                    !overdue &&
                    !completing &&
                    Boolean(reference) &&
                    !saving;
                  return (
                    <article
                      key={`${todo.projectId || "personal"}:${todo._id}`}
                      className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
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
                        {!isMobile && canMove ? (
                          <span
                            draggable
                            onDragStart={(event) => {
                              dragged.current = todo;
                              event.dataTransfer.setData(
                                "text/plain",
                                reference.task_key,
                              );
                              event.dataTransfer.effectAllowed = "move";
                            }}
                            onDragEnd={() => {
                              dragged.current = null;
                              setDropTarget("");
                            }}
                            aria-label={`Drag ${todo.title} to a quadrant`}
                            title="Drag to a quadrant"
                            className="cursor-grab px-2 py-3 text-slate-400"
                          >
                            ⠿
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                        {todo.owner ? (
                          <span className="break-words">{todo.owner}</span>
                        ) : null}
                        {todo.dueDate ? (
                          <span>Due {formatDate(todo.dueDate)}</span>
                        ) : null}
                        <TaskChecklistBadge
                          compact
                          summary={getChecklistSummary?.(todo)}
                        />
                        {automatic ? (
                          <span className="rounded-lg bg-rose-50 px-2 py-1 font-semibold text-rose-700">
                            Auto: deadline passed
                          </span>
                        ) : overdue ? (
                          <span className="text-rose-700">Overdue</span>
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
                              Overdue tasks stay here until completed or
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
                    </article>
                  );
                })}
                {!q.cards.length && !transient.length ? (
                  <p className="rounded-xl border border-dashed p-4 text-sm text-slate-500">
                    No tasks in this quadrant.
                  </p>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
