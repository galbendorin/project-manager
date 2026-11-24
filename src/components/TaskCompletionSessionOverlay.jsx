import React, { useEffect, useState } from 'react';
import { ensureRecurringManualTodoFollowUp } from '../hooks/projectData/recurringFollowUp';
import { supabase } from '../lib/supabase';

export default function TaskCompletionSessionOverlay({ session, userId }) {
  const [snapshot, setSnapshot] = useState(() => (
    session ? session.getSnapshot() : null
  ));

  useEffect(() => {
    if (!session) {
      setSnapshot(null);
      return undefined;
    }
    setSnapshot(session.getSnapshot());
    return session.subscribe(setSnapshot);
  }, [session]);

  if (!session || !snapshot || !userId || snapshot.userId !== userId || snapshot.todoViewMounted) {
    return null;
  }

  const pendingEntries = snapshot.pendingEntries.filter((entry) => entry.userId === userId);
  const recoveries = snapshot.recurringRecoveries || [];
  const alert = snapshot.alert || '';

  if (!pendingEntries.length && !recoveries.length && !alert) {
    return null;
  }

  const retryRecoveryRecord = async (record) => {
    if (!record?.id) return { ok: false };
    if (typeof record.retry === 'function') {
      return await record.retry();
    }

    const scopeToken = session.getScope();
    if (!scopeToken || !scopeToken.isCurrent() || scopeToken.userId !== userId) {
      return { ok: false, cancelled: true };
    }

    session.setRecurringRecoveryRetrying(record.id, true, scopeToken);

    try {
      let result;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        result = { ok: false, error: new Error('Reconnect to save the next recurring task.') };
      } else {
        result = await ensureRecurringManualTodoFollowUp({
          client: supabase,
          userId,
          followUpId: record.id,
          sourceTodo: record.sourceTodo,
          normalizedRecurrence: record.normalizedRecurrence,
          nextRecurringDueDate: record.nextRecurringDueDate,
          isCurrent: () => scopeToken.isCurrent(),
        });
      }

      if (!scopeToken.isCurrent() || result?.cancelled) {
        return { ok: false, cancelled: true };
      }

      if (!result?.ok) {
        session.setRecurringRecoveryRetrying(record.id, false, scopeToken);
        session.setAlert(
          result?.error?.message || `Could not save the next recurring task for “${record.title || 'Untitled'}”. Try again.`,
          scopeToken
        );
        return { ok: false, error: result?.error };
      }

      session.clearRecurringFollowUpId(record.parentTodoId);
      session.clearRecurringRecovery(record.id);
      session.clearAlert();
      if (result.followUpTodo) {
        session.notifyManualResult({ followUpTodo: result.followUpTodo }, scopeToken);
      }
      return { ok: true, followUpTodo: result.followUpTodo };
    } catch (error) {
      if (scopeToken.isCurrent()) {
        session.setRecurringRecoveryRetrying(record.id, false, scopeToken);
        session.setAlert(
          error?.message || `Could not save the next recurring task for “${record.title || 'Untitled'}”. Try again.`,
          scopeToken
        );
      }
      return { ok: false, error };
    }
  };

  return (
    <>
      {alert || recoveries.length ? (
        <div className="pm-task-dialog fixed inset-x-4 top-4 z-[85] mx-auto flex max-w-xl flex-col gap-2">
          {alert ? (
            <div role="alert" className="task-session-alert-banner flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-slate-900 shadow-lg">
              <span>{alert}</span>
              <button type="button" onClick={() => session.clearAlert()} className="min-h-11 shrink-0 px-3 font-semibold underline">
                Dismiss
              </button>
            </div>
          ) : null}
          {recoveries.map((record) => (
            <div key={record.id} role="alert" className="task-session-alert-banner flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-slate-900 shadow-lg">
              <span>{record.error}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={record.retrying}
                  onClick={() => { void retryRecoveryRecord(record); }}
                  className="min-h-11 rounded-lg border border-amber-300 bg-white px-3 font-semibold"
                >
                  {record.retrying ? 'Retrying…' : 'Retry next occurrence'}
                </button>
                <button
                  type="button"
                  disabled={record.retrying}
                  onClick={() => session.clearRecurringRecovery(record.id)}
                  className="min-h-11 px-3 font-semibold underline"
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {pendingEntries.length ? (
        <div role="status" aria-live="polite" className="pm-task-dialog task-matrix-undo-toast">
          {pendingEntries.map((entry) => (
            <div key={entry.key} className="task-matrix-undo-toast-row">
              <span className="truncate">
                {entry.committing
                  ? `Saving “${entry.todo.title || 'Untitled'}”…`
                  : `Completed “${entry.todo.title || 'Untitled'}”`}
              </span>
              {!entry.committing ? (
                <button
                  type="button"
                  aria-label={`Undo completion for ${entry.todo.title}`}
                  onClick={() => session.cancel(entry.key)}
                >
                  Undo
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
